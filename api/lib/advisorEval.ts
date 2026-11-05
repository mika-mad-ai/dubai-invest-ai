/**
 * Évaluation hors-ligne du conseiller : fidélité d'une réponse aux données
 * réellement injectées dans son prompt. Déterministe, sans LLM, sans clé API.
 *
 * Principe « chiffres sourcés > adjectifs » appliqué à la machine : tout prix,
 * rendement ou lien que le conseiller avance doit se retrouver dans le dossier,
 * les annonces scorées ou les constantes publiques connues. Ce n'est pas un
 * juge de style — c'est un détecteur d'hallucinations chiffrées et de
 * contradictions avec le contrôle prix DLD.
 *
 * Utilisable sur des réponses de référence (banc `scripts/eval-advisor.mjs`)
 * comme sur des réponses réelles enregistrées (transcripts `leads.transcript`).
 */
import type { ScoredListing } from './matchEngine';
import { allInCost } from './matchEngine';

export type EvalFinding = {
  kind: 'unsourced_price' | 'unsourced_percent' | 'unknown_listing_ref' | 'verdict_contradiction' | 'unsourced_url' | 'over_length';
  detail: string;
};

export type EvalContext = {
  listings: Array<Pick<ScoredListing, 'title' | 'location' | 'price' | 'yield' | 'netYield' | 'sourceUrl'> & {
    priceCheck?: { code: string; deltaPct: number | null };
  }>;
  /** Budget du dossier (EUR) et autres montants légitimes (apport, etc.). */
  budgetEur?: number;
  extraAmountsEur?: number[];
  /** URLs ramenées par la recherche web côté serveur (citations du tour). */
  citationUrls?: string[];
  /** Règle de style du prompt : 250 mots max. */
  maxWords?: number;
};

/**
 * Constantes publiques que le prompt stable autorise (fiscalité, frais).
 * Toute autre valeur en % doit venir d'une annonce.
 */
const KNOWN_PERCENTS = [0, 2, 4, 5, 6, 7, 8, 9, 10, 20, 30, 100];

/** « 520 000 € », « 520k€ », « 1,2 M€ », « €520,000 » → 520000. */
export function extractEurAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(?:€\s?)?(\d{1,3}(?:[\s  .,]\d{3})+|\d+(?:[.,]\d+)?)\s?(k|K|M|m|millions?)?\s?(?:€|EUR|euros?)(?![a-z])|€\s?(\d{1,3}(?:[\s  .,]\d{3})+|\d+(?:[.,]\d+)?)\s?(k|K|M|millions?)?/g;
  for (const m of text.matchAll(re)) {
    const raw = m[1] ?? m[3];
    const unit = (m[2] ?? m[4] ?? '').toLowerCase();
    if (!raw) continue;
    const hasGrouping = /\d[\s  .,]\d{3}(?!\d)/.test(raw) && !/[.,]\d{1,2}$/.test(raw);
    const num = hasGrouping ? Number(raw.replace(/[\s  .,]/g, '')) : Number(raw.replace(',', '.'));
    if (!Number.isFinite(num)) continue;
    const mult = unit === 'k' ? 1e3 : unit.startsWith('m') ? 1e6 : 1;
    out.push(Math.round(num * mult));
  }
  return out;
}

/** « 7,6 % », « 6.8% » → [7.6, 6.8]. */
export function extractPercents(text: string): number[] {
  return [...text.matchAll(/([+−-]?\d+(?:[.,]\d+)?)\s?%/g)].map(m => Math.abs(Number(m[1].replace(',', '.').replace('−', '-'))));
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

const POSITIVE_PRICE = /(sous le march|en dessous du march|bonne affaire|aubaine|décote|prix attractif|bien plac[ée] en prix)/i;
const NEGATIVE_PRICE = /(surévalu|au-dessus du march|trop cher|au-dessus des transactions)/i;

export function auditReply(reply: string, ctx: EvalContext): { ok: boolean; findings: EvalFinding[] } {
  const findings: EvalFinding[] = [];
  const L = ctx.listings;

  // 1. Montants en euros : prix d'annonce, coût frais inclus, budget, extras.
  const allowedEur = [
    ...L.map(l => l.price),
    ...L.map(l => allInCost(l.price)),
    ...(ctx.budgetEur ? [ctx.budgetEur] : []),
    ...(ctx.extraAmountsEur ?? []),
  ];
  for (const amt of extractEurAmounts(reply)) {
    if (amt < 1000) continue; // loyers/charges unitaires : hors périmètre de ce contrôle
    const ok = allowedEur.some(a => near(amt, a, Math.max(1000, a * 0.01)));
    if (!ok) findings.push({ kind: 'unsourced_price', detail: `${amt.toLocaleString('fr-FR')} € absent des données injectées` });
  }

  // 2. Pourcentages : rendements bruts/nets et écarts DLD des annonces.
  const allowedPct = [
    ...L.map(l => l.yield),
    ...L.map(l => l.netYield ?? NaN),
    ...L.map(l => (l.priceCheck?.deltaPct != null ? Math.abs(l.priceCheck.deltaPct) : NaN)),
    ...KNOWN_PERCENTS,
  ].filter(Number.isFinite);
  for (const p of extractPercents(reply)) {
    if (!allowedPct.some(a => near(p, a, 0.55))) findings.push({ kind: 'unsourced_percent', detail: `${p} % absent des données injectées` });
  }

  // 3. Références « bien n°X » / « option X » hors liste.
  for (const m of reply.matchAll(/\b(?:bien|option|annonce)\s*(?:n[°o]\s*)?(\d{1,2})\b/gi)) {
    const k = Number(m[1]);
    if (k < 1 || k > L.length) findings.push({ kind: 'unknown_listing_ref', detail: `référence au bien ${k} alors que ${L.length} biens ont été fournis` });
  }

  // 4. Verdict prix contredit : phrase qui nomme un bien et le qualifie à
  //    l'inverse du contrôle DLD injecté.
  const sentences = reply.split(/(?<=[.!?\n])\s+/);
  L.forEach((l, i) => {
    const code = l.priceCheck?.code;
    if (!code) return;
    const key = l.title.toLowerCase().split(/[,|–-]/)[0].trim().slice(0, 28);
    const refRe = new RegExp(`(?:\\b(?:bien|option|annonce)\\s*(?:n[°o]\\s*)?${i + 1}\\b)`, 'i');
    for (const s of sentences) {
      const mentions = (key.length >= 6 && s.toLowerCase().includes(key)) || refRe.test(s);
      if (!mentions) continue;
      if (POSITIVE_PRICE.test(s) && (code === 'above' || code === 'well_above')) {
        findings.push({ kind: 'verdict_contradiction', detail: `« ${l.title} » présenté comme bien placé en prix alors que le DLD le dit ${code}` });
      }
      if (NEGATIVE_PRICE.test(s) && (code === 'below' || code === 'well_below')) {
        findings.push({ kind: 'verdict_contradiction', detail: `« ${l.title} » présenté comme cher alors que le DLD le dit ${code}` });
      }
    }
  });

  // 5. Liens : uniquement ceux des annonces ou des citations web du tour.
  const allowedUrls = new Set([...L.map(l => l.sourceUrl).filter(Boolean), ...(ctx.citationUrls ?? [])] as string[]);
  for (const m of reply.matchAll(/https?:\/\/[^\s)\]>"']+/g)) {
    const url = m[0].replace(/[.,;:]+$/, '');
    if (![...allowedUrls].some(u => url === u || url.startsWith(u))) findings.push({ kind: 'unsourced_url', detail: url });
  }

  // 6. Longueur : la règle de 250 mots plafonne le coût et la lisibilité.
  const words = reply.trim().split(/\s+/).filter(Boolean).length;
  const max = ctx.maxWords ?? 250;
  if (words > max * 1.2) findings.push({ kind: 'over_length', detail: `${words} mots (règle : ${max})` });

  return { ok: findings.length === 0, findings };
}
