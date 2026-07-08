/**
 * Webhook HARO / SourceBottle / Qwoted — réception et traitement des opportunités presse.
 *
 * POST /api/haro-webhook
 *
 * INTÉGRATION :
 * Configurer un forwarding email via Zapier/Make/n8n :
 *   HARO (haro@helpareporter.com) → Email Parser → POST /api/haro-webhook
 *
 * OU utiliser Mailparser.io / Postmark Inbound avec ce webhook.
 *
 * Ce que fait le webhook :
 * 1. Reçoit l'email HARO parsé (sujet, corps)
 * 2. Extrait les opportunités pertinentes Dubai/immo/invest/expat FR
 * 3. Pour chaque opportunité : génère une réponse d'expert via Gemini
 * 4. Stocke dans seo_haro_opportunities
 * 5. Alerte Slack avec les drafts prêts à envoyer
 *
 * SECURITY : vérifie le header X-Webhook-Secret
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_KEY = process.env.API_KEY!;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL ?? '';
const WEBHOOK_SECRET = process.env.HARO_WEBHOOK_SECRET ?? '';

// ─── HARO opportunity detection ───────────────────────────────────────────────

interface HAROOpportunity {
  deadline: string;
  category: string;
  query: string;
  journalist_email: string;
  media_outlet: string;
  requirements: string;
}

function extractOpportunities(emailBody: string): HAROOpportunity[] {
  // HARO emails contain multiple queries separated by ---
  const sections = emailBody.split(/\n---+\n/);
  const opportunities: HAROOpportunity[] = [];

  const relevantKeywords = [
    'dubai', 'dubaï', 'emirats', 'émirats', 'uae', 'middle east',
    'real estate', 'immobilier', 'investissement', 'investment',
    'expatriate', 'expat', 'fiscal', 'tax', 'rendement', 'yield',
    'property', 'propriété', 'golden visa', 'résidence',
  ];

  for (const section of sections) {
    const lower = section.toLowerCase();
    const isRelevant = relevantKeywords.some(k => lower.includes(k));
    if (!isRelevant) continue;

    // Extract journalist email (HARO format: "anon-XXXX@haro.com" or similar)
    const emailMatch = section.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const journalist_email = emailMatch?.[0] ?? 'haro@helpareporter.com';

    // Extract deadline
    const deadlineMatch = section.match(/deadline[:\s]+([^\n]+)/i);
    const deadline = deadlineMatch?.[1]?.trim() ?? 'ASAP';

    // Extract media outlet
    const mediaMatch = section.match(/(?:outlet|publication|media)[:\s]+([^\n]+)/i);
    const media_outlet = mediaMatch?.[1]?.trim() ?? 'Unknown';

    // Category detection
    let category = 'general';
    if (lower.includes('real estate') || lower.includes('immobilier')) category = 'immobilier';
    if (lower.includes('invest') || lower.includes('financ')) category = 'investissement';
    if (lower.includes('expat') || lower.includes('visa')) category = 'expatriation';
    if (lower.includes('tax') || lower.includes('fiscal')) category = 'fiscalité';

    opportunities.push({
      deadline,
      category,
      query: section.trim().slice(0, 1000),
      journalist_email,
      media_outlet,
      requirements: section.slice(0, 200),
    });
  }

  return opportunities;
}

// ─── Score opportunity relevance ─────────────────────────────────────────────

function scoreOpportunity(opp: HAROOpportunity): number {
  const text = opp.query.toLowerCase();
  let score = 0;
  if (text.includes('dubai') || text.includes('dubaï')) score += 40;
  if (text.includes('immobilier') || text.includes('real estate')) score += 20;
  if (text.includes('invest')) score += 15;
  if (text.includes('expat') || text.includes('francoph')) score += 15;
  if (text.includes('fiscalité') || text.includes('tax') || text.includes('impôt')) score += 10;
  if (opp.media_outlet.toLowerCase().includes('france') ||
      opp.media_outlet.toLowerCase().includes('capital') ||
      opp.media_outlet.toLowerCase().includes('figaro')) score += 20;
  return score;
}

// ─── Generate expert response via Gemini ─────────────────────────────────────

async function generateExpertResponse(opp: HAROOpportunity): Promise<{ subject: string; body: string }> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  const prompt = `Tu es Mickaël, fondateur de DubaiInvest AI Advisor (dubainvest.eu), expert en investissement immobilier à Dubaï pour les investisseurs francophones.

Rédige une réponse professionnelle à cette demande de journaliste/blogueur :

DEMANDE :
${opp.query}

DEADLINE : ${opp.deadline}
MÉDIA : ${opp.media_outlet}
CATÉGORIE : ${opp.category}

RÉPONSE REQUISE :
1. Objet de l'email (sujet accrocheur, <80 chars)
2. Corps de la réponse (200-400 mots) :
   - Présentation courte (1 phrase : qui tu es, quelle expertise)
   - Réponse experte avec données précises (rendements 6-9%, fiscalité 0%, prix m², Golden Visa)
   - 2-3 citations utilisables par le journaliste
   - Bio courte à la fin + mention dubainvest.eu
   - Ton : professionnel, factuel, pas commercial

Format de réponse (JSON) :
{"subject": "...", "body": "..."}

Réponds UNIQUEMENT avec le JSON.`;

  try {
    const result = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    const raw = (result.text ?? '').replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(raw);
  } catch {
    return {
      subject: `Expert Dubai Real Estate — Réponse à votre demande`,
      body: `Bonjour,\n\nJe suis Mickaël, fondateur de DubaiInvest AI Advisor (dubainvest.eu), plateforme IA d'analyse immobilière à Dubaï pour les investisseurs francophones.\n\n[Réponse à générer manuellement pour : ${opp.category}]\n\nCordialement,\nMickaël — dubainvest.eu`,
    };
  }
}

// ─── Store opportunity in Supabase ────────────────────────────────────────────

async function storeOpportunity(opp: HAROOpportunity & { score: number; subject: string; response_draft: string }): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/seo_haro_opportunities`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      journalist_email: opp.journalist_email,
      media_outlet: opp.media_outlet,
      category: opp.category,
      deadline: opp.deadline,
      query_preview: opp.query.slice(0, 500),
      relevance_score: opp.score,
      email_subject: opp.subject,
      response_draft: opp.response_draft,
      status: 'draft',
      received_at: new Date().toISOString(),
    }),
  });
}

// ─── Slack alert ─────────────────────────────────────────────────────────────

async function sendSlackAlert(opportunities: any[]): Promise<void> {
  if (!SLACK_WEBHOOK || opportunities.length === 0) return;

  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `📰 *${opportunities.length} opportunité(s) presse HARO détectée(s)*`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `📰 ${opportunities.length} opportunité(s) presse à saisir` } },
        ...opportunities.slice(0, 3).map((o: any) => ({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${o.media_outlet}* · ${o.category} · Score: ${o.score}/100\n*Deadline:* ${o.deadline}\n*Sujet draft:* ${o.subject}`,
          },
        })),
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '_Drafts complets dans Supabase → table seo_haro_opportunities_' },
        },
      ],
    }),
  }).catch(() => {});
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(
  req: { method: string; headers: Record<string, string>; body?: any },
  res: { status: (code: number) => { json: (d: object) => void } }
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Security check
  const secret = (req.headers as any)['x-webhook-secret'] ?? '';
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const body = req.body ?? {};
  const emailBody: string = body.text ?? body.body ?? body.content ?? '';
  const emailSubject: string = body.subject ?? '';

  if (!emailBody) return res.status(400).json({ error: 'Empty email body' });

  // Extract relevant opportunities
  const raw = extractOpportunities(emailBody);
  const scored = raw
    .map(o => ({ ...o, score: scoreOpportunity(o) }))
    .filter(o => o.score >= 30) // Only high-relevance
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Max 5 per email

  if (scored.length === 0) {
    return res.status(200).json({ ok: true, opportunities: 0, message: 'No relevant opportunities found' });
  }

  // Generate responses
  const processed = [];
  for (const opp of scored) {
    const { subject, body: responseDraft } = await generateExpertResponse(opp);
    await storeOpportunity({ ...opp, subject, response_draft: responseDraft });
    processed.push({ ...opp, subject, response_draft: responseDraft });
  }

  await sendSlackAlert(processed);

  return res.status(200).json({
    ok: true,
    opportunities: processed.length,
    top_score: processed[0]?.score ?? 0,
    email_subject: emailSubject,
  });
}
