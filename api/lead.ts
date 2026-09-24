/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Capture d'un lead depuis le web (fin du parcours de qualification).
 *
 * Scoring → persistance → CRM → premier message WhatsApp si un numéro est fourni.
 * Chaque étape est indépendante : un CRM non configuré n'empêche pas la capture,
 * un WhatsApp non configuré n'empêche pas le push CRM.
 *
 * POST { profile, advisorId?, viewedListings?, messageCount?, consentWhatsApp? }
 */

import { pushLeadToCrm } from './lib/crm';
import { scoreLead, type BuyingSignal } from './lib/leadScore';
import { normalizeHandle, upsertLead } from './lib/leadStore';
import { ADVISORS, resolveAdvisor, type InvestorProfile } from './lib/claude';
import { sendWhatsApp, normalizePhone } from './lib/whatsapp';

/** Signaux déductibles du seul parcours web, sans LLM. */
function inferSignals(profile: InvestorProfile, viewed: string[]): BuyingSignal[] {
  const out: BuyingSignal[] = [];
  const budget = Number(profile.totalBudget) || 0;
  const apport = Number(profile.initialInvestment) || 0;
  const delay = Number(profile.roiDelay) || 0;

  if (budget > 0 && apport > 0 && apport / budget >= 0.25) out.push('budget_confirmed');
  if (profile.investmentHorizon === 'short' || (delay > 0 && delay <= 3)) out.push('timeline_under_3_months');
  if (profile.objective === 'golden_visa') out.push('golden_visa_intent');
  if (viewed.length >= 2) out.push('specific_property_interest');
  return out;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const profile: InvestorProfile = body.profile || {};
  const advisor = resolveAdvisor(body.advisorId || profile.advisorId);
  const viewedListings: string[] = Array.isArray(body.viewedListings) ? body.viewedListings : [];
  const messageCount: number = Number(body.messageCount) || 0;

  if (!profile.email && !profile.phone) {
    res.status(400).json({ ok: false, reason: 'email ou téléphone requis' });
    return;
  }

  const phone = profile.phone ? normalizePhone(profile.phone) : undefined;
  const handle = normalizeHandle({ phone, email: profile.email });
  const signals = inferSignals(profile, viewedListings);

  const score = scoreLead({
    name: profile.name,
    email: profile.email,
    phone,
    totalBudget: profile.totalBudget,
    initialInvestment: profile.initialInvestment,
    objective: profile.objective,
    investmentHorizon: profile.investmentHorizon,
    roiDelay: profile.roiDelay,
    advisorId: advisor.id,
    messageCount,
    viewedListings,
    signals,
  });

  const lead = await upsertLead({
    handle,
    name: profile.name,
    email: profile.email,
    phone,
    advisor_id: advisor.id,
    profile: { ...profile, phone, advisorId: advisor.id } as any,
    signals,
    viewed_listings: viewedListings,
    score: score.score,
    tier: score.tier,
  });

  const crm = await pushLeadToCrm({
    name: profile.name,
    email: profile.email,
    phone,
    advisorId: advisor.id,
    score: score.score,
    tier: score.tier,
    estimatedValueEur: score.estimatedValueEur,
    budget: profile.totalBudget,
    objective: profile.objective,
    signals,
    viewedListings,
    channel: 'web',
  });

  if (crm.ok && crm.id) await upsertLead({ handle, crm_id: crm.id });

  // Premier contact WhatsApp : bascule la conversation sur le canal où l'agent
  // de qualification peut travailler en autonomie. Uniquement avec consentement.
  let whatsapp: string | undefined;
  if (phone && body.consentWhatsApp) {
    const firstName = (profile.name || '').split(' ')[0];
    const sent = await sendWhatsApp(
      phone,
      `${firstName ? `${firstName}, ` : ''}c'est ${advisor.name} de DubaiInvest.\n\n`
      + `J'ai reçu votre dossier : ${advisor.role.toLowerCase()}, `
      + `budget ${Number(profile.totalBudget) ? `${Number(profile.totalBudget).toLocaleString('fr-FR')} €` : 'à préciser'}.\n\n`
      + `Je regarde les biens qui correspondent et je vous reviens avec une sélection vérifiée `
      + `en prix contre les transactions réellement enregistrées au Dubai Land Department.\n\n`
      + `Une question en attendant : qu'est-ce qui compte le plus pour vous, le rendement immédiat `
      + `ou la prise de valeur à la revente ?`
    );
    whatsapp = sent.ok ? sent.provider : sent.reason;
    if (sent.ok) {
      await upsertLead({
        handle,
        transcript: [
          ...lead.transcript,
          { role: 'assistant', content: '[premier contact WhatsApp envoyé]', at: new Date().toISOString(), channel: 'whatsapp' },
        ],
      });
    }
  }

  res.status(200).json({
    ok: true,
    handle,
    advisor: { id: advisor.id, name: advisor.name, role: advisor.role },
    score: score.score,
    tier: score.tier,
    estimatedValueEur: score.estimatedValueEur,
    missing: score.missing,
    breakdown: score.breakdown,
    crm: crm.ok ? { backend: crm.backend, id: crm.id } : { backend: crm.backend, error: crm.reason },
    whatsapp,
    advisors: Object.keys(ADVISORS),
  });
}
