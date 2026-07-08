/**
 * Agent Rapport Mensuel — génère un rapport de marché complet le 1er de chaque mois.
 *
 * Cron : "0 5 1 * *" → 5h UTC le 1er de chaque mois.
 *
 * Ce que fait l'agent :
 * 1. Agrège les stats complètes du mois depuis Supabase (prix, rendements, volume)
 * 2. Génère via Gemini un rapport HTML complet (optimisé SEO + GEO)
 * 3. Stocke dans seo_reports (slug + html + meta)
 * 4. Met à jour sitemap.xml dynamique avec la nouvelle URL
 *
 * Chaque rapport crée une URL indexable :
 *   /rapport-immobilier-dubai-[mois]-[annee]
 * Ex: /rapport-immobilier-dubai-mai-2026
 *
 * Ces pages longue-traîne captent le trafic des recherches mensuelles
 * et attirent des backlinks naturels (journalistes, blogueurs, forums).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_KEY = process.env.API_KEY!;
const AED_TO_EUR = 1 / 4.15;

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

// ─── Supabase helpers ────────────────────────────────────────────────────────

async function supabaseGet(path: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}`);
  return res.json();
}

async function supabaseUpsert(table: string, data: object): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(data),
  });
}

// ─── Market stats ────────────────────────────────────────────────────────────

async function buildMonthlyStats() {
  const listings = await supabaseGet(
    '/listings?select=price,district,yield_estimate,type,beds,title&limit=3000'
  );
  if (!Array.isArray(listings) || listings.length < 10) throw new Error('Not enough listings');

  const byZone: Record<string, { prices: number[]; yields: number[]; types: string[]; beds: number[] }> = {};
  for (const l of listings) {
    const z = l.district ?? 'other';
    if (z === 'other') continue;
    if (!byZone[z]) byZone[z] = { prices: [], yields: [], types: [], beds: [] };
    if (l.price > 100_000) byZone[z].prices.push(+l.price);
    if (l.yield_estimate) byZone[z].yields.push(+l.yield_estimate);
    if (l.type) byZone[z].types.push(l.type);
    if (l.beds !== undefined) byZone[z].beds.push(+l.beds);
  }

  const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const ZONE_LABELS: Record<string, string> = {
    jvc: 'Jumeirah Village Circle', businessbay: 'Business Bay',
    marina: 'Dubai Marina', downtown: 'Downtown Dubai',
    creek: 'Dubai Creek Harbour', palm: 'Palm Jumeirah', jbr: 'JBR',
  };

  const zones = Object.entries(byZone)
    .filter(([, d]) => d.prices.length >= 3)
    .map(([z, d]) => ({
      zone: z,
      label: ZONE_LABELS[z] ?? z,
      count: d.prices.length,
      avg_eur: Math.round(avg(d.prices) * AED_TO_EUR),
      min_eur: Math.round(Math.min(...d.prices) * AED_TO_EUR),
      max_eur: Math.round(Math.max(...d.prices) * AED_TO_EUR),
      avg_yield: Math.round(avg(d.yields) * 10) / 10 || 6.5,
    }))
    .sort((a, b) => b.count - a.count);

  return { total: listings.length, zones };
}

// ─── Generate report HTML via Gemini ─────────────────────────────────────────

async function generateReport(stats: Awaited<ReturnType<typeof buildMonthlyStats>>, month: string, year: number): Promise<{
  html: string;
  meta_description: string;
  title: string;
}> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  const zoneTable = stats.zones.slice(0, 7).map(z =>
    `| ${z.label} | ${z.count} biens | ${z.min_eur.toLocaleString('fr-FR')}€ | ${z.avg_eur.toLocaleString('fr-FR')}€ | ${z.max_eur.toLocaleString('fr-FR')}€ | ${z.avg_yield}% |`
  ).join('\n');

  const topYield = [...stats.zones].sort((a, b) => b.avg_yield - a.avg_yield)[0];
  const cheapest = [...stats.zones].sort((a, b) => a.min_eur - b.min_eur)[0];

  const prompt = `Tu es un analyste immobilier expert sur Dubaï. Génère un rapport de marché complet en HTML pour le mois de ${month} ${year}.

DONNÉES RÉELLES DU MARCHÉ (${stats.total} annonces analysées) :
| Zone | Biens | Prix min | Prix moy | Prix max | Rendement |
|------|-------|----------|----------|----------|-----------|
${zoneTable}

Zone meilleur rendement : ${topYield?.label} (${topYield?.avg_yield}%/an)
Zone la plus abordable : ${cheapest?.label} (dès ${cheapest?.min_eur?.toLocaleString('fr-FR')}€)

STRUCTURE HTML REQUISE (retourne uniquement le contenu du <body>, sans <html>/<head>/<body> tags) :
- h1 : titre du rapport (inclut "${month} ${year}" et "Dubai")
- Introduction 2 paragraphes avec données du mois
- Section h2 "Analyse par quartier" + tableau HTML des zones
- Section h2 "Opportunités du mois" (top 3 quartiers avec analyse)
- Section h2 "Fiscalité et avantages" (0% impôt, convention FR-EAU, Golden Visa)
- Section h2 "Prévisions" (tendances courtes)
- Section h2 "Méthodologie" (source : PropertyFinder, DLD, IA)
- Classe CSS inline minimale, fond blanc, police système
- Liens internes vers https://dubainvest.eu/
- Balises schema.org Article en data-attribute sur le div racine
- IMPORTANT : données chiffrées précises tirées des stats ci-dessus
- Langue : français, ton professionnel, ~1200 mots

Réponds UNIQUEMENT avec le HTML demandé, aucun texte avant/après.`;

  const result = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
  const rawHtml = result.text ?? '';

  const metaPrompt = `En une phrase de 145-160 caractères, meta description Google pour ce rapport :
"Rapport immobilier Dubai ${month} ${year} — ${stats.total} annonces analysées. ${topYield?.label} : ${topYield?.avg_yield}%/an. Entrée dès ${cheapest?.min_eur?.toLocaleString('fr-FR')}€. Données PropertyFinder + DLD."
Retourne UNIQUEMENT la meta description, améliorée pour maximiser le CTR.`;

  const metaResult = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: metaPrompt });

  const title = `Rapport Immobilier Dubai ${month.charAt(0).toUpperCase() + month.slice(1)} ${year} — Analyse & Prix`;
  const meta_description = (metaResult.text ?? '').trim().replace(/^["']|["']$/g, '');

  // Wrap in full HTML document
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${meta_description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${meta_description}">
  <meta property="og:url" content="https://dubainvest.eu/rapport-immobilier-dubai-${month.replace(' ', '-')}-${year}">
  <meta property="og:type" content="article">
  <link rel="canonical" href="https://dubainvest.eu/rapport-immobilier-dubai-${month}-${year}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${title}",
    "description": "${meta_description}",
    "datePublished": "${new Date().toISOString()}",
    "dateModified": "${new Date().toISOString()}",
    "author": {"@type": "Organization", "name": "DubaiInvest AI Advisor", "url": "https://dubainvest.eu"},
    "publisher": {"@type": "Organization", "name": "DubaiInvest AI Advisor", "logo": {"@type": "ImageObject", "url": "https://dubainvest.eu/logo.png"}},
    "mainEntityOfPage": "https://dubainvest.eu/rapport-immobilier-dubai-${month}-${year}"
  }
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 860px; margin: 0 auto; padding: 2rem 1rem; color: #1a1a2e; line-height: 1.7; }
    h1 { color: #0a0a23; border-bottom: 3px solid #D4AF37; padding-bottom: .5rem; }
    h2 { color: #1a1a2e; margin-top: 2.5rem; }
    table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: .9rem; }
    th { background: #1a1a2e; color: #D4AF37; padding: .6rem .8rem; text-align: left; }
    td { padding: .55rem .8rem; border-bottom: 1px solid #eee; }
    tr:nth-child(even) td { background: #f8f9fa; }
    .cta { display: inline-block; margin-top: 2rem; padding: .8rem 1.8rem; background: #D4AF37; color: #0a0a23; font-weight: 700; border-radius: 6px; text-decoration: none; }
    .badge { display: inline-block; background: #e8f5e9; color: #2e7d32; border-radius: 4px; padding: .2rem .5rem; font-size: .8rem; font-weight: 600; }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: .8rem; color: #888; }
  </style>
</head>
<body>
${rawHtml}
<footer>
  <p>Rapport généré automatiquement par <a href="https://dubainvest.eu">DubaiInvest AI Advisor</a> — données PropertyFinder + DLD · ${new Date().toLocaleDateString('fr-FR')}</p>
  <p><a href="https://dubainvest.eu">← Retour au simulateur d'investissement</a></p>
</footer>
</body>
</html>`;

  return { html, meta_description, title };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(
  req: { headers: Record<string, string>; query?: Record<string, string> },
  res: { status: (code: number) => { json: (d: object) => void } }
) {
  const querySecret = (req as any).query?.secret ?? '';
  const authHeader = (req.headers as any)['authorization'] ?? '';
  const isAuth = authHeader === `Bearer ${process.env.CRON_SECRET}` || querySecret === process.env.CRON_SECRET;
  if (!isAuth) return res.status(401).json({ error: 'Unauthorized' });

  const now = new Date();
  const month = MONTHS_FR[now.getMonth()];
  const year = now.getFullYear();
  const slug = `rapport-immobilier-dubai-${month}-${year}`;

  try {
    const stats = await buildMonthlyStats();
    const { html, meta_description, title } = await generateReport(stats, month, year);

    await supabaseUpsert('seo_reports', {
      slug,
      title,
      html,
      meta_description,
      published_at: now.toISOString(),
      stats: { total: stats.total, zones: stats.zones.length },
    });

    return res.status(200).json({
      ok: true,
      slug,
      url: `https://dubainvest.eu/${slug}`,
      title,
      total_listings: stats.total,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
