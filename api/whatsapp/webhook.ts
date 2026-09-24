/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Webhook WhatsApp entrant — boucle complète de l'agent de qualification.
 *
 * Message reçu → chargement du dossier → contexte marché → Claude qualifie et
 * répond → mise à jour du dossier et du score → envoi de la réponse → push CRM.
 *
 * GET  : vérification d'abonnement Meta / 360dialog (hub.challenge).
 * POST : message entrant.
 *
 * On répond toujours 200 : un webhook WhatsApp qui renvoie une erreur est
 * réessayé en boucle par le fournisseur, ce qui duplique les messages.
 */

import { hasClaude, type InvestorProfile } from '../lib/claude';
import { loadDossierContext } from '../lib/context';
import { pushLeadToCrm } from '../lib/crm';
import { scoreLead, type BuyingSignal } from '../lib/leadScore';
import { appendTurn, getLead, normalizeHandle, upsertLead } from '../lib/leadStore';
import { qualifyTurn } from '../lib/qualifier';
import { parseInbound, sendWhatsApp, verifyInbound } from '../lib/whatsapp';
import { checkDailyBudget, recordUsage } from '../lib/guard';

/** Déduplication : les fournisseurs renvoient le même message en cas de timeout. */
const seenMessages = new Map<string, number>();
const DEDUPE_TTL_MS = 10 * 60 * 1000;

function alreadyHandled(id?: string): boolean {
  if (!id) return false;
  const now = Date.now();
  for (const [k, t] of seenMessages) if (now - t > DEDUPE_TTL_MS) seenMessages.delete(k);
  if (seenMessages.has(id)) return true;
  seenMessages.set(id, now);
  return false;
}

export default async function handler(req: any, res: any) {
  // Vérification d'abonnement (Meta Cloud API / 360dialog)
  if (req.method === 'GET') {
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.status(403).json({ error: 'Verify token invalide' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Authenticité AVANT tout traitement : ce webhook déclenche un appel payant.
  const auth = verifyInbound(req);
  if (!auth.ok) {
    console.warn('[whatsapp/webhook] entrant refusé :', auth.reason);
    res.status(401).json({ ok: false, reason: auth.reason });
    return;
  }

  const budget = await checkDailyBudget();
  if (!budget.ok) {
    console.warn(`[whatsapp/webhook] budget quotidien atteint : ${budget.spent.toFixed(2)} / ${budget.budget} $`);
    res.status(200).json({ ok: false, reason: 'budget quotidien atteint' });
    return;
  }

  const body = typeof req.body === 'string' ? tryParse(req.body) : req.body;
  const inbound = parseInbound(body);

  if (!inbound) {
    // Accusé de lecture, statut de livraison, type non textuel : rien à faire.
    res.status(200).json({ ok: true, skipped: 'aucun message texte' });
    return;
  }

  if (alreadyHandled(inbound.providerMessageId)) {
    res.status(200).json({ ok: true, skipped: 'message déjà traité' });
    return;
  }

  if (!hasClaude()) {
    res.status(200).json({ ok: false, reason: 'ANTHROPIC_API_KEY non configurée' });
    return;
  }

  const handle = normalizeHandle({ phone: inbound.from });

  try {
    const existing = await getLead(handle);

    const profile: InvestorProfile = {
      ...(existing?.profile ?? {}),
      name: existing?.name || inbound.name,
      phone: inbound.from,
      advisorId: existing?.advisor_id || 'locatif',
    };

    // Score courant → ce qui manque pilote la question que l'agent va poser.
    const current = scoreLead({
      name: profile.name,
      email: profile.email,
      phone: inbound.from,
      totalBudget: profile.totalBudget,
      initialInvestment: profile.initialInvestment,
      objective: profile.objective,
      roiDelay: profile.roiDelay,
      messageCount: existing?.transcript?.length ?? 0,
      viewedListings: existing?.viewed_listings,
      signals: existing?.signals,
    });

    // Contexte marché : on ne le charge que si on connaît déjà un budget, sinon
    // l'agent n'a rien de pertinent à proposer et l'appel serait du gaspillage.
    const ctx = profile.totalBudget
      ? await loadDossierContext(profile as any, { limit: 4, pool: 30 })
      : { listings: [], market: undefined, sources: { listings: 'budget inconnu', market: 'non chargé' } };

    const turn = await qualifyTurn({
      profile,
      history: (existing?.transcript ?? []).map(t => ({ role: t.role, content: t.content })),
      incoming: inbound.text,
      listings: ctx.listings,
      missing: current.missing,
    });

    if (turn.usage) void recordUsage('whatsapp-qualifier', turn.usage);

    // ── Fusion des champs extraits dans le dossier ──────────────────────────
    const e = turn.extracted;
    const mergedProfile: InvestorProfile = { ...profile };
    if (e.name && !mergedProfile.name) mergedProfile.name = e.name;
    if (e.email) mergedProfile.email = e.email;
    if (e.budgetEur > 0) mergedProfile.totalBudget = e.budgetEur;
    if (e.apportEur > 0) mergedProfile.initialInvestment = e.apportEur;
    if (e.objective) mergedProfile.objective = e.objective;
    if (e.zonePreference) mergedProfile.zonePreference = e.zonePreference;
    if (e.horizonMonths > 0) mergedProfile.roiDelay = String(e.horizonMonths);
    if (e.notes) {
      mergedProfile.notes = { ...(mergedProfile.notes ?? {}), [new Date().toISOString().slice(0, 10)]: e.notes };
    }

    const signals = Array.from(new Set([...(existing?.signals ?? []), ...turn.signals])) as BuyingSignal[];
    const transcriptLen = (existing?.transcript?.length ?? 0) + 2;

    const updated = scoreLead({
      name: mergedProfile.name,
      email: mergedProfile.email,
      phone: inbound.from,
      totalBudget: mergedProfile.totalBudget,
      initialInvestment: mergedProfile.initialInvestment,
      objective: mergedProfile.objective,
      roiDelay: mergedProfile.roiDelay,
      messageCount: transcriptLen,
      viewedListings: existing?.viewed_listings,
      signals,
    });

    // ── Persistance ────────────────────────────────────────────────────────
    await appendTurn(handle, { role: 'user', content: inbound.text, channel: 'whatsapp' });
    await appendTurn(handle, { role: 'assistant', content: turn.reply, channel: 'whatsapp' });
    const lead = await upsertLead({
      handle,
      name: mergedProfile.name,
      email: mergedProfile.email,
      phone: inbound.from,
      advisor_id: turn.advisorId,
      profile: mergedProfile as any,
      signals,
      score: updated.score,
      tier: updated.tier,
    });

    // ── Réponse au prospect ────────────────────────────────────────────────
    const sent = await sendWhatsApp(inbound.from, turn.reply);

    // ── CRM : à chaque interaction, comme spécifié ──────────────────────────
    const crm = await pushLeadToCrm({
      name: mergedProfile.name,
      email: mergedProfile.email,
      phone: inbound.from,
      advisorId: turn.advisorId,
      score: updated.score,
      tier: updated.tier,
      estimatedValueEur: updated.estimatedValueEur,
      budget: mergedProfile.totalBudget,
      objective: mergedProfile.objective,
      signals,
      viewedListings: lead.viewed_listings,
      lastMessage: inbound.text,
      channel: 'whatsapp',
      transcriptExcerpt: lead.transcript.slice(-6).map(t => `${t.role === 'user' ? 'Prospect' : 'Conseiller'}: ${t.content}`).join('\n'),
    });

    if (crm.ok && crm.id && crm.id !== lead.crm_id) {
      await upsertLead({ handle, crm_id: crm.id });
    }

    // ── Alerte interne si le lead est prêt à être transmis ─────────────────
    if (turn.handoffReady && updated.tier === 'qualified' && process.env.SALES_ALERT_WHATSAPP) {
      await sendWhatsApp(
        process.env.SALES_ALERT_WHATSAPP,
        `Lead qualifié à transmettre\n${mergedProfile.name || inbound.from}\n`
        + `Score ${updated.score}/100 · valeur estimée ${updated.estimatedValueEur[0]}–${updated.estimatedValueEur[1]} €\n`
        + `Budget ${mergedProfile.totalBudget || 'n/c'} · objectif ${mergedProfile.objective || 'n/c'}\n`
        + `Conseiller ${turn.advisorId}\nTéléphone ${inbound.from}`
      );
    }

    res.status(200).json({
      ok: true,
      handle,
      score: updated.score,
      tier: updated.tier,
      handoffReady: turn.handoffReady,
      sent: sent.ok ? sent.provider : sent.reason,
      crm: crm.ok ? crm.backend : crm.reason,
    });
  } catch (err: any) {
    console.error('[whatsapp/webhook]', err?.message ?? err);
    // 200 volontaire : éviter la boucle de réessai du fournisseur.
    res.status(200).json({ ok: false, error: err?.message ?? 'erreur inconnue' });
  }
}

function tryParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    // Twilio poste en form-urlencoded : certains runtimes le laissent en chaîne brute.
    const params = new URLSearchParams(s);
    const out: Record<string, string> = {};
    for (const [k, v] of params) out[k] = v;
    return out;
  }
}
