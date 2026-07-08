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
 * 4. Stocke dans Supabase (table daily_posts) :
 *    - daily_post        → article de blog quotidien avec l'analyse du marché
 * 5. Met à jour la date lastmod du sitemap dans Supabase
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_KEY = process.env.API_KEY!;
const AED_TO_EUR = 1 / 4.24;
const CRON_SECRET = process.env.CRON_SECRET ?? '';

// Vignette d'article — génération d'image native Gemini (Imagen n'est pas
// disponible sur cette clé API). Réutilise le bucket public du social agent.
const IMAGE_MODEL = process.env.BLOG_IMAGE_MODEL ?? 'gemini-2.5-flash-image';
const STORAGE_BUCKET = process.env.SOCIAL_STORAGE_BUCKET ?? 'social-media';

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

interface BlogPost {
  title: string;
  slug: string;
  content: string;
}

interface SocialPosts {
  twitter: string;
  linkedin: string;
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

async function insertBlogPost(post: BlogPost, stats: MarketStats, imageUrl: string | null): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/daily_posts`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      title: post.title,
      slug: post.slug,
      content: post.content,
      market_stats: stats,
      image_url: imageUrl,
    }),
  });
}

// ─── Vignette d'article via Gemini image ─────────────────────────────────────
// Échec toléré : l'article est publié sans image si la génération ou le
// Storage échoue.

async function generateBlogThumbnail(ai: GoogleGenAI, post: BlogPost): Promise<string | null> {
  try {
    // Ne JAMAIS citer le titre dans le prompt : le modèle le dessine dans
    // l'image (avec des fautes). Scène pure, variée selon le jour du mois.
    const scenes = [
      'aerial drone view of Dubai Marina towers and yachts at golden hour',
      'Downtown Dubai skyline with Burj Khalifa at dusk, city lights turning on',
      'modern residential towers of Business Bay reflecting warm sunset light over the canal',
      'Palm Jumeirah aerial view with turquoise water and luxury villas',
      'Jumeirah Village Circle low-rise residential district under a deep blue evening sky',
      'Dubai Creek Harbour waterfront promenade with futuristic towers at sunrise',
    ];
    const scene = scenes[new Date().getDate() % scenes.length];
    const prompt = `Photorealistic cinematic editorial photograph: ${scene}. High-end financial magazine aesthetic, sharp architectural details, warm golden light with deep blue sky, 16:9 composition. Absolutely NO text, NO letters, NO words, NO typography, NO captions, NO watermarks, NO logos, NO signage anywhere in the image.`;
    const resp: any = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } },
    });
    const parts: any[] = resp?.candidates?.[0]?.content?.parts ?? [];
    const base64 = parts.find(p => p?.inlineData?.data)?.inlineData?.data;
    if (typeof base64 !== 'string' || !base64) return null;

    const path = `blog/${new Date().toISOString().slice(0, 10)}-${post.slug.slice(0, 80)}.png`;
    const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: Buffer.from(base64, 'base64'),
    });
    if (!upload.ok) {
      console.error('[seo-geo] thumbnail upload failed:', upload.status, await upload.text());
      return null;
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  } catch (e: any) {
    console.error('[seo-geo] thumbnail generation failed:', e?.message ?? e);
    return null;
  }
}

// ─── Fetch market stats from Supabase listings ───────────────────────────────

async function fetchMarketStats(): Promise<MarketStats> {
  // Aggregate by zone using Supabase PostgREST
  // We fetch all listings and aggregate in JS (PostgREST doesn't support GROUP BY directly)
  // Alias PostgREST vers le schéma réel de la table listings
  // (price_aed, district_id, yield_pct)
  const listings = await supabaseQuery(
    '/listings?select=price:price_aed,district:district_id,yield_estimate:yield_pct,type,beds&limit=2000'
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

// ─── Generate content via Gemini ───────────────────────────────────────────

async function generateDailyContent(stats: MarketStats): Promise<{
  llms_txt: string;
  meta_description: string;
  faq_schema: object;
  blogPost: BlogPost;
  socialPosts: SocialPosts;
}> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const summary = buildMarketSummary(stats);
  const year = new Date().getFullYear();

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
1. Quel est le meilleur quartier pour investir à Dubaï en ${year} ?
2. Quel rendement locatif espérer à Dubaï ?
3. Quel budget minimum pour investir à Dubaï ?
4. Comment éviter la double imposition France-Dubaï ?
5. Comment obtenir le Golden Visa de Dubaï par l'immobilier ?

Réponds UNIQUEMENT avec le JSON, sans markdown ni explications.`;

  // 4. Daily Blog Post
  const blogPrompt = `Tu es un expert en immobilier et en rédaction d'articles de blog SEO. Rédige un article de blog informatif sur le marché immobilier de Dubaï pour les investisseurs francophones.

DONNÉES DE MARCHÉ EN TEMPS RÉEL DU ${stats.date} :
${summary}

RÈGLES :
- Le public cible sont les investisseurs francophones qui ne connaissent pas bien Dubaï.
- Ton engageant, informatif et professionnel.
- Format : Markdown.
- Structure :
  - Un titre accrocheur (H1)
  - Une introduction courte (1-2 paragraphes)
  - Une section "Les chiffres clés du jour" avec une liste à puces des stats les plus importantes.
  - Une analyse de 2-3 paragraphes sur les tendances (ex: le quartier avec le meilleur rendement, le plus accessible).
  - Une brève conclusion avec un appel à l'action (ex: "Contactez DubaiInvest AI pour une simulation personnalisée").
- Inclus des mots-clés SEO pertinents: "investissement immobilier Dubaï", "rendement locatif Dubaï", "prix immobilier Dubaï ${year}", "fiscalité Dubaï".
- Le slug doit être en minuscules, sans accents, avec des mots séparés par des tirets.

Format de sortie attendu (JSON pur, sans markdown autour) :
{
  "title": "Titre de l'article ici",
  "slug": "titre-de-l-article-ici",
  "content": "# Titre de l'article ici\\n\\nIntroduction...\\n\\n## Les chiffres clés du jour\\n\\n* Stat 1\\n* Stat 2\\n"
}

Réponds UNIQUEMENT avec le JSON.`;

  // 5. Social Media Posts
  const twitterPrompt = `Génère un tweet percutant (max 280 caractères) pour annoncer le nouveau rapport sur l'immobilier à Dubaï.

Stats du jour :
- Meilleur rendement : ${stats.top_yield_zone?.avg_yield}% à ${stats.top_yield_zone?.label}.
- Prix d'entrée : dès ${stats.most_affordable_zone?.min_price_eur?.toLocaleString('fr-FR')}€.

RÈGLES :
- Ton direct et engageant.
- Inclure 1-2 chiffres clés.
- Inclure les hashtags #Dubai #immobilier #investissement #rentabilité.
- Inclure un lien vers le blog (le lien sera ajouté plus tard, laisse un placeholder).
- Réponds uniquement avec le texte du tweet.`;

  const linkedinPrompt = `Génère un post LinkedIn professionnel pour partager l'analyse du marché immobilier de Dubaï.

Stats du jour :
${summary}

RÈGLES :
- Ton plus formel et analytique que pour Twitter.
- Commence par une accroche forte.
- Structure en 2-3 courts paragraphes.
- Mentionne 2-3 stats clés (rendement, prix, quartier en vogue).
- Termine par une question ouverte pour engager la discussion.
- Inclure les hashtags #DubaiRealEstate #InvestInDubai #ImmobilierNeuf #DubaiProperty #GoldenVisa.
- Réponds uniquement avec le texte du post.`;


  // Call Gemini for all content in parallel
  const model = 'gemini-2.5-flash';
  const [llmsResult, metaResult, faqResult, blogResult, twitterResult, linkedinResult] = await Promise.all([
    ai.models.generateContent({ model, contents: llmsPrompt }),
    ai.models.generateContent({ model, contents: metaPrompt }),
    ai.models.generateContent({ model, contents: faqPrompt }),
    ai.models.generateContent({ model, contents: blogPrompt }),
    ai.models.generateContent({ model, contents: twitterPrompt }),
    ai.models.generateContent({ model, contents: linkedinPrompt }),
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
          name: `Quel est le meilleur quartier pour investir à Dubaï en ${year} ?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `En ${year}, ${stats.top_yield_zone?.label ?? 'JVC'} offre le meilleur rendement locatif avec ${stats.top_yield_zone?.avg_yield ?? 7}%/an. Accessible dès ${stats.most_affordable_zone?.min_price_eur?.toLocaleString('fr-FR') ?? '150 000'}€ dans les zones abordables.`,
          },
        },
      ],
    };
  }

  let blogPost: BlogPost = { title: '', slug: '', content: '' };
  try {
    const blogRaw = (blogResult.text ?? '').replace(/```json\n?|```\n?/g, '').trim();
    blogPost = JSON.parse(blogRaw);
  } catch (e) {
    console.error('Failed to parse blog post JSON:', e);
    blogPost = {
      title: `Analyse du marché immobilier de Dubaï - ${stats.date}`,
      slug: `analyse-marche-immobilier-dubai-${new Date().toISOString().slice(0, 10)}`,
      content: `# Analyse du marché immobilier de Dubaï - ${stats.date}\n\nVoici un résumé des dernières tendances du marché immobilier à Dubaï.\n\n${summary}`
    };
  }

  const socialPosts: SocialPosts = {
    twitter: (twitterResult.text ?? '').trim(),
    linkedin: (linkedinResult.text ?? '').trim(),
  };

  return { llms_txt, meta_description, faq_schema, blogPost, socialPosts };
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

    // 2. Generate content via Gemini
    log.push('Generating content via Gemini...');
    const { llms_txt, meta_description, faq_schema, blogPost, socialPosts } = await generateDailyContent(stats);
    log.push(`✓ llms.txt: ${llms_txt.length} chars`);
    log.push(`✓ meta: "${meta_description.slice(0, 60)}..."`);
    log.push(`✓ faq_schema: ${JSON.stringify(faq_schema).length} chars`);
    log.push(`✓ Blog Post: "${blogPost.title}"`);
    log.push(`✓ Twitter Post: ${socialPosts.twitter.slice(0, 60)}...`);
    log.push(`✓ LinkedIn Post: ${socialPosts.linkedin.slice(0, 60)}...`);

    // 2b. Vignette de l'article via Imagen (échec toléré → article sans image)
    log.push('Generating blog thumbnail via Imagen...');
    const thumbnailUrl = await generateBlogThumbnail(new GoogleGenAI({ apiKey: GEMINI_KEY }), blogPost);
    log.push(thumbnailUrl ? `✓ Thumbnail: ${thumbnailUrl}` : '⚠ Thumbnail skipped (Imagen/Storage unavailable)');

    // 3. Store in Supabase
    log.push('Storing content in Supabase...');
    const metadata = { zones: stats.zones.length, total_listings: stats.total_listings, date: stats.date };
    await Promise.all([
      upsertSEOContent('llms_txt', llms_txt, metadata),
      upsertSEOContent('meta_description', meta_description, metadata),
      upsertSEOContent('faq_schema', JSON.stringify(faq_schema), metadata),
      upsertSEOContent('market_stats', buildMarketSummary(stats), metadata),
      insertBlogPost(blogPost, stats, thumbnailUrl),
    ]);
    log.push('✓ Stored 4 SEO content entries and 1 blog post.');

    // TODO: Post to social media

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
      generated_content: {
        blog_title: blogPost.title,
        blog_slug: blogPost.slug,
        tweet: socialPosts.twitter,
        linkedin_post: socialPosts.linkedin,
      }
    });
  } catch (err: any) {
    console.error('[seo-geo-optimizer]', err);
    return res.status(500).json({ ok: false, error: err.message, log });
  }
}
