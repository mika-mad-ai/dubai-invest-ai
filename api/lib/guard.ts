/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Garde-fous de coût sur les endpoints qui appellent Claude.
 *
 * Le risque n'est pas l'usage légitime — une conversation coûte 0,19 $ — mais
 * l'abus : `/api/agent-chat` est public et le client contrôle le tableau
 * `messages`. Sans borne, une seule requête peut remplir la fenêtre de contexte
 * (192 000 tokens en écriture de cache) et coûter 1,44 $.
 *
 * Trois lignes de défense indépendantes, de la plus locale à la plus globale :
 *   1. bornes de taille sur l'entrée      → plafonne le coût d'UNE requête
 *   2. limite de débit par IP             → plafonne la cadence d'un attaquant
 *   3. disjoncteur de budget quotidien    → plafonne la perte totale d'une journée
 *
 * Aucune de ces trois n'est un plafond dur au sens facturation : le seul vrai
 * plafond est la limite de dépense configurée dans la console Anthropic. Ces
 * garde-fous servent à ne jamais l'atteindre.
 */

import { MODEL } from './claude';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USAGE_TABLE = process.env.SUPABASE_USAGE_TABLE || 'usage_daily';

// ─── 1. Bornes sur l'entrée ─────────────────────────────────────────────────

/** Une conversation réelle dépasse rarement 20 tours. */
export const MAX_MESSAGES = 40;
/** ~30 000 caractères ≈ 8 500 tokens : large pour un échange honnête, 20× moins
 *  que la fenêtre de contexte, donc le coût d'une requête reste sous 0,10 $. */
export const MAX_TOTAL_CHARS = 30_000;
/** Un seul message ne devrait jamais faire ça. */
export const MAX_SINGLE_CHARS = 8_000;

export type SizeVerdict = { ok: true } | { ok: false; reason: string };

export function checkInputSize(messages: Array<{ role: string; content: string }>): SizeVerdict {
  if (!Array.isArray(messages)) return { ok: false, reason: 'messages doit être un tableau' };
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, reason: `Conversation trop longue (${messages.length} messages, maximum ${MAX_MESSAGES}).` };
  }
  let total = 0;
  for (const m of messages) {
    const len = typeof m?.content === 'string' ? m.content.length : 0;
    if (len > MAX_SINGLE_CHARS) {
      return { ok: false, reason: `Message trop long (${len} caractères, maximum ${MAX_SINGLE_CHARS}).` };
    }
    total += len;
  }
  if (total > MAX_TOTAL_CHARS) {
    return { ok: false, reason: `Conversation trop volumineuse (${total} caractères, maximum ${MAX_TOTAL_CHARS}).` };
  }
  return { ok: true };
}

// ─── 2. Limite de débit par IP ──────────────────────────────────────────────

/**
 * Fenêtre glissante en mémoire du process.
 *
 * ⚠️ Limite connue : la mémoire est propre à chaque instance serverless, donc un
 * attaquant réparti sur plusieurs instances contourne partiellement le compteur.
 * C'est un ralentisseur, pas une barrière — la barrière est le disjoncteur de
 * budget ci-dessous, qui est global.
 */
const hits = new Map<string, number[]>();

export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX_PER_WINDOW = 8;
export const RATE_MAX_PER_HOUR = 40;

export function clientIp(req: any): string {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim();
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'inconnue';
}

export function rateLimit(ip: string): { ok: true } | { ok: false; retryAfterS: number } {
  const now = Date.now();
  const prev = hits.get(ip) ?? [];
  // On ne garde qu'une heure d'historique, et on purge les IP inactives pour
  // éviter que la Map grossisse indéfiniment sur une instance longue-vécue.
  const recent = prev.filter(t => now - t < 3_600_000);
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (!v.some(t => now - t < 3_600_000)) hits.delete(k);
  }

  const inWindow = recent.filter(t => now - t < RATE_WINDOW_MS).length;
  if (inWindow >= RATE_MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return { ok: false, retryAfterS: Math.ceil(RATE_WINDOW_MS / 1000) };
  }
  if (recent.length >= RATE_MAX_PER_HOUR) {
    hits.set(ip, recent);
    return { ok: false, retryAfterS: 900 };
  }

  recent.push(now);
  hits.set(ip, recent);
  return { ok: true };
}

// ─── 3. Disjoncteur de budget quotidien ─────────────────────────────────────

/**
 * Tarifs officiels par modèle, USD par million de tokens.
 * Source : https://platform.claude.com/docs/en/about-claude/pricing
 *
 * ⚠️ Le disjoncteur doit utiliser les tarifs DU modèle réellement appelé. Coder
 * en dur ceux d'Opus surestimait la dépense de 2,5× sur Sonnet, et le budget se
 * serait coupé à 2 $ réels pour un plafond de 5 $.
 *
 * Sonnet 5 bénéficie d'un tarif d'introduction (2 $/10 $) jusqu'au 31 août 2026,
 * puis passe à 3 $/15 $. On retient volontairement le tarif STANDARD : pour un
 * garde-fou de budget, surestimer légèrement est le sens sûr, et la valeur
 * devient exacte après la bascule sans intervention.
 */
type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };

const PRICES: Array<{ match: RegExp; price: Price }> = [
  { match: /haiku/i,  price: { input: 1, output: 5,  cacheWrite: 1.25, cacheRead: 0.10 } },
  { match: /sonnet/i, price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 } },
  { match: /opus/i,   price: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.50 } },
  { match: /fable|mythos/i, price: { input: 10, output: 50, cacheWrite: 12.50, cacheRead: 1.00 } },
];

/** Modèle inconnu → tarif le plus élevé, pour ne jamais sous-estimer la dépense. */
const FALLBACK: Price = { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 };

export function priceFor(model: string): Price {
  return PRICES.find(p => p.match.test(model))?.price ?? FALLBACK;
}

/** L'`Usage` du SDK renvoie `null` (et non `undefined`) pour les champs de cache. */
export type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** @param model modèle réellement appelé ; défaut = celui configuré. */
export function costUsd(u: UsageLike, model: string = MODEL): number {
  const p = priceFor(model);
  return (
    (u.input_tokens ?? 0) * p.input +
    (u.output_tokens ?? 0) * p.output +
    (u.cache_creation_input_tokens ?? 0) * p.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * p.cacheRead
  ) / 1e6;
}

/** Budget quotidien en USD. 0 ou absent → disjoncteur désactivé. */
export function dailyBudgetUsd(): number {
  const v = Number(process.env.DAILY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function headers() {
  return {
    apikey: SUPABASE_KEY as string,
    Authorization: `Bearer ${SUPABASE_KEY as string}`,
    'Content-Type': 'application/json',
  };
}

/** Repli quand Supabase n'est pas configuré : compteur par instance. */
let memoryDay = today();
let memorySpend = 0;

export async function spentToday(): Promise<number> {
  if (memoryDay !== today()) { memoryDay = today(); memorySpend = 0; }

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/${USAGE_TABLE}?day=eq.${today()}&select=cost_usd&limit=1`;
      const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(3_000) });
      if (res.ok) {
        const rows = (await res.json()) as Array<{ cost_usd: number }>;
        if (rows?.length) return Number(rows[0].cost_usd) || 0;
        return 0;
      }
    } catch {
      // Supabase muet : on ne bloque pas le service, on retombe sur le compteur
      // local. Un disjoncteur qui casse le produit quand la base tousse serait pire.
    }
  }
  return memorySpend;
}

/**
 * Vérifie le budget AVANT d'appeler Claude.
 * Renvoie `ok: false` seulement si un budget est configuré et déjà dépassé.
 */
export async function checkDailyBudget(): Promise<{ ok: true } | { ok: false; spent: number; budget: number }> {
  const budget = dailyBudgetUsd();
  if (!budget) return { ok: true };
  const spent = await spentToday();
  return spent >= budget ? { ok: false, spent, budget } : { ok: true };
}

/**
 * Enregistre la consommation APRÈS l'appel. À appeler sans `await` bloquant :
 * une erreur de comptabilité ne doit pas dégrader la réponse au prospect.
 */
export async function recordUsage(endpoint: string, usage: UsageLike): Promise<void> {
  const cost = costUsd(usage);
  if (memoryDay !== today()) { memoryDay = today(); memorySpend = 0; }
  memorySpend += cost;

  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  try {
    // Incrément atomique côté Postgres via une fonction RPC : deux requêtes
    // simultanées ne doivent pas s'écraser l'une l'autre.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bump_usage_daily`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        p_day: today(),
        p_endpoint: endpoint,
        p_input: usage.input_tokens ?? 0,
        p_output: usage.output_tokens ?? 0,
        p_cache_write: usage.cache_creation_input_tokens ?? 0,
        p_cache_read: usage.cache_read_input_tokens ?? 0,
        p_cost: cost,
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) console.error('[guard] bump_usage_daily', res.status, await res.text());
  } catch (err: any) {
    console.error('[guard] recordUsage', err?.message ?? err);
  }
}
