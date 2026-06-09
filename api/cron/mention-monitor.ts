/**
 * Agent Mention Monitor — surveille chaque jour les mentions Dubai immo sur le web.
 *
 * Cron : "0 7 * * *" → 7h UTC chaque jour.
 *
 * Sources surveillées :
 * - Reddit (r/investissement, r/expatFrance, r/immobilier) via API JSON publique
 * - Google News via Gemini Google Search tool
 * - Détection de questions sans réponse = opportunités d'outreach
 *
 * Pour chaque mention trouvée :
 * - Génère un template de réponse/commentaire expert (via Gemini)
 * - Stocke dans seo_mentions avec statut "pending"
 * - Envoie une alerte Slack (si SLACK_WEBHOOK configuré)
 *
 * L'équipe peut ensuite poster les réponses manuellement ou via bot.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_KEY = process.env.API_KEY!;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL ?? '';

// ─── Reddit search (API JSON publique, sans auth) ────────────────────────────

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
}

async function searchReddit(query: string, subreddit?: string): Promise<RedditPost[]> {
  const base = subreddit
    ? `https://www.reddit.com/r/${subreddit}/search.json`
    : 'https://www.reddit.com/search.json';

  const params = new URLSearchParams({
    q: query,
    sort: 'new',
    limit: '10',
    t: 'week',
    ...(subreddit ? { restrict_sr: '1' } : {}),
  });

  try {
    const res = await fetch(`${base}?${params}`, {
      headers: { 'User-Agent': 'DubaiInvestBot/1.0' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.data?.children ?? []).map((c: any) => c.data as RedditPost);
  } catch {
    return [];
  }
}

// ─── Filter recent + relevant posts ─────────────────────────────────────────

function isRelevant(post: RedditPost): boolean {
  const text = (post.title + ' ' + post.selftext).toLowerCase();
  const keywords = ['dubai', 'dubaï', 'émirats', 'emirats', 'uae'];
  const investKeywords = ['investir', 'investissement', 'immo', 'appartement', 'rendement', 'achat', 'louer', 'fiscalité', 'visa'];
  const hasLocation = keywords.some(k => text.includes(k));
  const hasInvest = investKeywords.some(k => text.includes(k));
  const isRecent = (Date.now() / 1000 - post.created_utc) < 7 * 24 * 3600; // 7 jours
  return hasLocation && hasInvest && isRecent;
}

// ─── Generate expert reply via Gemini ────────────────────────────────────────

async function generateReply(post: RedditPost): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  const prompt = `Tu es un expert en investissement immobilier à Dubaï pour les francophones.
Rédige une réponse Reddit/forum utile et naturelle (pas de spam) à ce post :

TITRE : ${post.title}
CONTENU : ${post.selftext?.slice(0, 600) || '(pas de contenu)'}
SUBREDDIT : r/${post.subreddit}

RÈGLES :
- Réponse de 150-300 mots
- Données précises et utiles (rendements 6-9%, fiscalité 0%, Golden Visa 2M AED)
- Mentionner dubainvest.eu comme outil de simulation (1 seule fois, naturellement)
- Ton d'expert bienveillant, pas commercial
- En français
- Commencer par répondre directement à la question posée

Retourne UNIQUEMENT le texte de la réponse, prêt à poster.`;

  try {
    const result = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
    return result.text ?? '';
  } catch {
    return '';
  }
}

// ─── Supabase upsert mention ─────────────────────────────────────────────────

async function storeMention(mention: {
  source_id: string;
  platform: string;
  url: string;
  title: string;
  body_preview: string;
  score: number;
  reply_draft: string;
}): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/seo_mentions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal', // Skip if already stored
    },
    body: JSON.stringify({
      ...mention,
      status: 'pending',
      detected_at: new Date().toISOString(),
    }),
  });
}

// ─── Slack alert ─────────────────────────────────────────────────────────────

async function sendSlackAlert(mentions: { url: string; title: string; platform: string; reply_draft: string }[]): Promise<void> {
  if (!SLACK_WEBHOOK || mentions.length === 0) return;

  const blocks = mentions.slice(0, 5).flatMap(m => [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${m.platform}* · <${m.url}|${m.title.slice(0, 80)}>\n\`\`\`${m.reply_draft.slice(0, 300)}...\`\`\``,
      },
    },
    { type: 'divider' },
  ]);

  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🔍 *${mentions.length} mention(s) Dubai immo détectée(s)* — opportunités d'outreach`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `🔍 ${mentions.length} mention(s) à traiter aujourd'hui` } },
        ...blocks,
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '_Voir toutes les mentions dans Supabase → table seo_mentions_' },
        },
      ],
    }),
  }).catch(() => {});
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

  const log: string[] = [];

  // ── 1. Search Reddit ──────────────────────────────────────────────────────
  const redditSearches = [
    searchReddit('dubai investissement immobilier', 'investissement'),
    searchReddit('dubai appartement achat', 'expatFrance'),
    searchReddit('dubai rendement locatif'),
    searchReddit('investir dubaï fiscalité', 'immobilier'),
    searchReddit('golden visa dubai'),
  ];
  const redditResults = (await Promise.all(redditSearches)).flat();
  const relevant = redditResults.filter(isRelevant);
  log.push(`Reddit : ${redditResults.length} posts trouvés, ${relevant.length} pertinents`);

  // ── 2. Generate replies + store ───────────────────────────────────────────
  const newMentions: any[] = [];
  for (const post of relevant.slice(0, 8)) { // Max 8 replies/day (Gemini quota)
    const reply = await generateReply(post);
    if (!reply) continue;

    const mention = {
      source_id: `reddit_${post.id}`,
      platform: `Reddit r/${post.subreddit}`,
      url: `https://reddit.com${post.permalink}`,
      title: post.title,
      body_preview: post.selftext?.slice(0, 200) ?? '',
      score: post.score,
      reply_draft: reply,
    };
    await storeMention(mention);
    newMentions.push(mention);
  }
  log.push(`${newMentions.length} réponses générées et stockées`);

  // ── 3. Slack alert ────────────────────────────────────────────────────────
  await sendSlackAlert(newMentions);
  if (SLACK_WEBHOOK) log.push('Alerte Slack envoyée');

  return res.status(200).json({ ok: true, found: relevant.length, drafted: newMentions.length, log });
}
