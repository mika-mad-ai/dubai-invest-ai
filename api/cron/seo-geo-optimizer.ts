/**
 * Agent IA SEO/GEO — optimisation quotidienne pour Google SGE, Gemini AI, Perplexity, Claude.
 *
 * Déclenché par Vercel Cron à 4h UTC (après refresh-listings à 3h).
 * Durée estimée : 15-30 secondes.
 *
 * Ce que fait l'agent chaque jour :
 * 1. Agrège les stats marché depuis le snapshot Supabase (prix, rendements par zone)
 * 2. Utilise Gemini pour générer du contenu optimisé IA avec données fraîches
 * 3. Stocke dans Supabase (table seo_content) :
 *    - llms_txt          → servi dynamiquement sur /llms.txt
 *    - meta_description  → utilisé par le frontend pour Google Search
 *    - faq_schema        → JSON-LD injecté dans <head> pour Google SGE / Gemini Overviews
 *    - market_stats      → snapshot des stats pour debug/historique
 * 4. Met à jour la date lastmod du sitemap dans Supabase
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_KEY = process.env.API_KEY!;
const AED_TO_EUR = 1 / 4.15;
const CRON_SECRET = process.env.CRON_SECRET ?? '';

// ─── Zone display names ──────────────────────────────────────────────────────

const ZONE_LABELS: Record<string, string> = {
  jvc: 'Jumeirah Village Circle (JVC)',
  businessbay: 'Business Bay',
  marina: 'Dubai Marina',
  downtown: 'Downtown Dubai',
  creek: 'Dubai Creek Harbour',
  palm: 'Palm Jumeirah',
  jbr: 'Jumeirah Beach Residence (JBR)',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ZoneStat {
  zone: string;
  label: string;
  count: number;
  avg_price_aed: number;
  avg_price_eur: number;
  min_price_eur: number;
  avg_yield: number;
  top_type: string;
}

interface MarketStats {
  total_listings: number;
  date: string;
  zones: ZoneStat[];
  top_yield_zone: ZoneStat;
  most_affordable_zone: ZoneStat;
  premium_zone: ZoneStat;
}

// ─── Supabase helpers ────────────────────────────────────────────────────────

async function supabaseQuery(path: string, body?: object): Promise<any> {
  const method = body ? 'POST' : 'GET';
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: body ? 'resolution=merge-duplicates,return=minimal' : 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${path} → ${res.status}: ${err}`);
  }
  if (method === 'GET') return res.json();
  return null;
}

async function upsertSEOContent(key: string, content: string, metadata: object = {}): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/seo_content`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      key,
      content,
      generated_at: new Date().toISOString(),
      metadata,
    }),
  });
}

// ─── Fetch market stats from Supabase listings ───────────────────────────────

async function fetchMarketStats(): Promise<MarketStats> {
  // Aggregate by zone using Supabase PostgREST
  // We fetch all listings and aggregate in JS (PostgREST doesn't support GROUP BY directly)
  const listings = await supabaseQuery(
    '/listings?select=price,district,yield_estimate,type,beds&limit=2000'
  );

  if (!Array.isArray(listings) || listings.length === 0) {
    throw new Error('No listings found in Supabase');
  }

  // Group by zone
  const byZone: Record<string, { prices: number[]; yields: number[]; types: string[] }> = {};
  for (const l of listings) {
    const zone = l.district ?? 'other';
    if (zone === 'other') continue;
    if (!byZone[zone]) byZone[zone] = { prices: [], yields: [], types: [] };
    if (l.price && l.price > 100_000) byZone[zone].prices.push(Number(l.price));
    if (l.yield_estimate) byZone[zone].yields.push(Number(l.yield_estimate));
    if (l.type) byZone[zone].types.push(String(l.type));
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const min = (arr: number[]) => arr.length ? Math.min(...arr) : 0;
  const mode = (arr: string[]) => {
    const freq: Record<string, number> = {};
    arr.forEach(v => { freq[v] = (freq[v] ?? 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  };

  const zones: ZoneStat[] = Object.entries(byZone)
    .filter(([, d]) => d.prices.length >= 3)
    .map(([zone, d]) => ({
      zone,
      label: ZONE_LABELS[zone] ?? zone,
      count: d.prices.length,
      avg_price_aed: Math.round(avg(d.prices)),
      avg_price_eur: Math.round(avg(d.prices) * AED_TO_EUR),
      min_price_eur: Math.round(min(d.prices) * AED_TO_EUR),
      avg_yield: Math.round(avg(d.yields) * 10) / 10 || 6.5,
      top_type: mode(d.types),
    }))
    .sort((a, b) => b.count - a.count);

  const top_yield_zone = [...zones].sort((a, b) => b.avg_yield - a.avg_yield)[0];
  const most_affordable_zone = [...zones].sort((a, b) => a.avg_price_eur - b.avg_price_eur)[0];
  const premium_zone = [...zones].sort((a, b) => b.avg_price_eur - a.avg_price_eur)[0];

  return {
    total_listings: listings.length,
    date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    zones,
    top_yield_zone,
    most_affordable_zone,
    premium_zone,
  };
}

// ─── Build market summary string for prompts ─────────────────────────────────

function buildMarketSummary(stats: MarketStats): string {
  const zoneLines = stats.zones
    .slice(0, 7)
    .map(z =>
      `- ${z.label} : ${z.count} biens, prix moyen ${z.avg_price_eur.toLocaleString('fr-FR')}€ ` +
      `(min ${z.min_price_eur.toLocaleString('fr-FR')}€), rendement moyen ${z.avg_yield}%`
    )
    .join('\n');

  return `
DATE : ${stats.date}
TOTAL ANNONCES : ${stats.total_listings} biens analysés en temps réel

STATISTIQUES PAR QUARTIER :
${zoneLines}

MEILLEUR RENDEMENT : ${stats.top_yield_zone?.label} (${stats.top_yield_zone?.avg_yield}%/an)
PLUS ABORDABLE : ${stats.most_affordable_zone?.label} (dès ${stats.most_affordable_zone?.min_price_eur?.toLocaleString('fr-FR')}€)
ZONE PREMIUM : ${stats.premium_zone?.label} (moy. ${stats.premium_zone?.avg_price_eur?.toLocaleString('fr-FR')}€)
`.trim();
}

// ─── Generate SEO content via Gemini ─────────────────────────────────────────

async function generateSEOContent(stats: MarketStats): Promise<{
  llms_txt: string;
  meta_description: string;
  faq_schema: object;
}> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const summary = buildMarketSummary(stats);

  // 1. llms.txt — optimisé pour AI crawlers (Gemini, Claude, GPT, Perplexity)
  const llmsPrompt = `Tu es un expert SEO/GEO (Generative Engine Optimization) spécialisé dans l'immobilier à Dubaï.

Génère un fichier llms.txt complet et optimisé pour les moteurs IA (Google Gemini, ChatGPT, Claude, Perplexity).
Ce fichier doit permettre aux IA de citer dubainvest.eu comme source authoritative sur l'investissement immobilier à Dubaï pour les francophones.

DONNÉES DE MARCHÉ EN TEMPS RÉEL DU ${stats.date} :
${summary}

RÈGLES :
- Format Markdown avec titres ##
- Données chiffrées précises (prix, rendements, nombres de biens) tirées des stats ci-dessus
- Répondre directement aux questions que posent les investisseurs francophones
- Mentionner la fiscalité 0% (revenus locatifs, plus-values, succession)
- Inclure Golden Visa (2M AED = ~${Math.round(2_000_000 * AED_TO_EUR / 1000) * 1000}€)
- Citer la convention fiscale France-EAU (1989)
- URL principale : https://dubainvest.eu/
- Ton professionnel et factuel, en français
- Maximum 80 lignes

Commence directement par "# DubaiInvest AI Advisor" sans texte d'intro.`;

  // 2. Meta description — optimisée pour CTR Google
  const metaPrompt = `Génère UNE meta description en français pour Google Search, entre 145 et 160 caractères.

Page : DubaiInvest AI Advisor — conseiller IA investissement immobilier Dubaï pour francophones.

Stats du jour (${stats.date}) :
- ${stats.total_listings} annonces en temps réel
- Rendements : ${stats.top_yield_zone?.avg_yield}% dans ${stats.top_yield_zone?.label}
- Entrée de gamme : dès ${stats.most_affordable_zone?.min_price_eur?.toLocaleString('fr-FR')}€

Objectif : inciter le clic depuis Google. Mentionne les rendements, la fiscalité 0%, ou les prix.
Réponds UNIQUEMENT avec la meta description, sans guillemets ni ponctuation finale.`;

  // 3. FAQ Schema.org — pour Google SGE / Gemini Overviews
  const faqPrompt = `Génère 5 questions-réponses FAQ en JSON-LD Schema.org pour Google SGE (AI Overviews) sur l'investissement immobilier à Dubaï.

Stats marché du ${stats.date} :
${summary}

Format attendu (JSON pur, sans markdown) :
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Question ici ?",
      "acceptedAnswer": { "@type": "Answer", "text": "Réponse précise avec chiffres." }
    }
  ]
}

Questions à couvrir (adapte avec les vraies données) :
1. Quel est le meilleur quartier pour investir à Dubaï en ${new Date().getFullYear()} ?
2. Quel rendement locatif espérer à Dubaï ?
3. Quel budget minimum pour investir à Dubaï ?
4. Comment éviter la double imposition France-Dubaï ?
5. Comment obtenir le Golden Visa de Dubaï par l'immobilier ?

Réponds UNIQUEMENT avec le JSON, sans markdown ni explications.`;

  // Call Gemini for all 3 in parallel
  const model = 'gemini-2.0-flash';
  const [llmsResult, metaResult, faqResult] = await Promise.all([
    ai.models.generateContent({ model, contents: llmsPrompt }),
    ai.models.generateContent({ model, contents: metaPrompt }),
    ai.models.generateContent({ model, contents: faqPrompt }),
  ]);

  const llms_txt = llmsResult.text ?? '';
  const meta_description = (metaResult.text ?? '').trim().replace(/^["']|["']$/g, '');

  let faq_schema: object = {};
  try {
    const faqRaw = (faqResult.text ?? '').replace(/```json\n?|```\n?/g, '').trim();
    faq_schema = JSON.parse(faqRaw);
  } catch {
    // Fallback schema si parse échoue
    faq_schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: `Quel est le meilleur quartier pour investir à Dubaï en ${new Date().getFullYear()} ?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `En ${new Date().getFullYear()}, ${stats.top_yield_zone?.label ?? 'JVC'} offre le meilleur rendement locatif avec ${stats.top_yield_zone?.avg_yield ?? 7}%/an. Accessible dès ${stats.most_affordable_zone?.min_price_eur?.toLocaleString('fr-FR') ?? '150 000'}€ dans les zones abordables.`,
          },
        },
      ],
    };
  }

  return { llms_txt, meta_description, faq_schema };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(
  req: { method: string; headers: Record<string, string>; query?: Record<string, string> },
  res: { status: (code: number) => { json: (data: object) => void; end: () => void } }
) {
  // Auth : Vercel Cron envoie l'Authorization header automatiquement en prod.
  // En dev, accepter ?secret=CRON_SECRET
  const authHeader = (req.headers as any)['authorization'] ?? '';
  const querySecret = (req as any).query?.secret ?? '';
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET ?? ''}`;
  const isManualRun = CRON_SECRET && querySecret === CRON_SECRET;

  if (!isVercelCron && !isManualRun) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startedAt = Date.now();
  const log: string[] = [];

  try {
    // 1. Fetch market stats
    log.push('Fetching market stats from Supabase...');
    const stats = await fetchMarketStats();
    log.push(`✓ ${stats.total_listings} listings across ${stats.zones.length} zones`);

    // 2. Generate SEO content via Gemini
    log.push('Generating SEO content via Gemini...');
    const { llms_txt, meta_description, faq_schema } = await generateSEOContent(stats);
    log.push(`✓ llms.txt: ${llms_txt.length} chars`);
    log.push(`✓ meta: "${meta_description.slice(0, 60)}..."`);
    log.push(`✓ faq_schema: ${JSON.stringify(faq_schema).length} chars`);

    // 3. Store in Supabase seo_content table
    log.push('Storing SEO content in Supabase...');
    const metadata = { zones: stats.zones.length, total_listings: stats.total_listings, date: stats.date };
    await Promise.all([
      upsertSEOContent('llms_txt', llms_txt, metadata),
      upsertSEOContent('meta_description', meta_description, metadata),
      upsertSEOContent('faq_schema', JSON.stringify(faq_schema), metadata),
      upsertSEOContent('market_stats', buildMarketSummary(stats), metadata),
    ]);
    log.push('✓ Stored 4 SEO content entries');

    const elapsed = Date.now() - startedAt;
    log.push(`Done in ${elapsed}ms`);

    return res.status(200).json({
      ok: true,
      elapsed_ms: elapsed,
      stats: {
        total_listings: stats.total_listings,
        zones: stats.zones.length,
        top_yield: `${stats.top_yield_zone?.label} ${stats.top_yield_zone?.avg_yield}%`,
        min_entry: `${stats.most_affordable_zone?.label} dès ${stats.most_affordable_zone?.min_price_eur?.toLocaleString('fr-FR')}€`,
      },
      log,
    });
  } catch (err: any) {
    console.error('[seo-geo-optimizer]', err);
    return res.status(500).json({ ok: false, error: err.message, log });
  }
}
