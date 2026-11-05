/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Agent de surveillance nocturne.
 *
 * Pour chaque lead joignable, re-match le marché du jour contre son dossier et
 * alerte sur WhatsApp uniquement s'il y a du neuf :
 *   - un bien qui n'était pas dans sa sélection hier et qui score haut,
 *   - une baisse de prix sur un bien déjà vu.
 *
 * Sans nouveauté, aucun message n'est envoyé. C'est la règle qui rend l'alerte
 * crédible : un investisseur qui reçoit un message par jour arrête de les lire.
 *
 * Déclenché par le cron Vercel (3 h 30 UTC) ou manuellement avec le secret.
 */

import { ask, assembleSystem, buildListingsBlock, buildProfileBlock, buildStableSystem, getClaude, hasClaude, MODEL, outputConfig, resolveAdvisor, textOf, type InvestorProfile } from '../lib/claude';
import { loadDossierContext } from '../lib/context';
import { listActiveLeads, upsertLead, type StoredLead } from '../lib/leadStore';
import { canMessageWhatsApp } from '../lib/consent';
import { isInsideServiceWindow, sendWhatsApp, sendWhatsAppTemplate } from '../lib/whatsapp';
import { checkDailyBudget, recordUsage } from '../lib/guard';
import type { ScoredListing } from '../lib/matchEngine';

/** Plafond par exécution : borne le coût et la durée de la fonction. */
const MAX_LEADS_PER_RUN = 25;
/** Un bien doit scorer au moins ça pour justifier de réveiller un prospect. */
const ALERT_SCORE_FLOOR = 62;
/** Baisse de prix minimale considérée comme une information. */
const PRICE_DROP_FLOOR_PCT = 3;
/** Anti-spam : pas plus d'une alerte tous les 3 jours par lead. */
const MIN_HOURS_BETWEEN_ALERTS = 72;

type WatchState = { prices: Record<string, number>; lastAlertAt?: string };

function readState(lead: StoredLead): WatchState {
  const raw = (lead.profile as any)?.__watch;
  return { prices: raw?.prices ?? {}, lastAlertAt: raw?.lastAlertAt };
}

function isAuthorized(req: any): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers?.authorization === `Bearer ${cronSecret}`) return true;
  const expected = process.env.COLLECTOR_SECRET;
  // Échouer FERMÉ : sans secret configuré, l'endpoint doit refuser, pas ouvrir.
  // L'ancien `return true` rendait cette route publique dès que COLLECTOR_SECRET
  // était absent — et elle déclenche des appels payants.
  if (!expected) return false;
  return (req.headers?.['x-collector-secret'] || req.query?.secret) === expected;
}

function hoursSince(iso?: string): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

type Change =
  | { kind: 'new'; listing: ScoredListing }
  | { kind: 'drop'; listing: ScoredListing; oldPrice: number; dropPct: number };

function detectChanges(listings: ScoredListing[], state: WatchState): Change[] {
  const changes: Change[] = [];
  for (const l of listings) {
    const known = state.prices[l.id];
    if (known === undefined) {
      if (l.matchScore >= ALERT_SCORE_FLOOR) changes.push({ kind: 'new', listing: l });
    } else if (l.price < known) {
      const dropPct = ((known - l.price) / known) * 100;
      if (dropPct >= PRICE_DROP_FLOOR_PCT) {
        changes.push({ kind: 'drop', listing: l, oldPrice: known, dropPct });
      }
    }
  }
  // Les baisses de prix passent avant les nouveautés : c'est l'information la plus actionnable.
  return changes.sort((a, b) => (a.kind === 'drop' ? -1 : 1) - (b.kind === 'drop' ? -1 : 1)).slice(0, 3);
}

function changeBrief(changes: Change[]): string {
  return changes.map(c => {
    if (c.kind === 'drop') {
      return `- BAISSE DE PRIX : ${c.listing.title} (${c.listing.location}) est passé de `
        + `${c.oldPrice.toLocaleString('fr-FR')} € à ${c.listing.price.toLocaleString('fr-FR')} €, `
        + `soit −${c.dropPct.toFixed(1)} %. Contrôle prix : ${c.listing.priceVerdict}. `
        + `Score d'adéquation ${c.listing.matchScore}/100.`;
    }
    return `- NOUVEAU BIEN : ${c.listing.title} (${c.listing.location}), `
      + `${c.listing.price.toLocaleString('fr-FR')} €, ${c.listing.beds} ch, ${c.listing.sqm} m², `
      + `rendement net estimé ${c.listing.netYield ?? '?'} %. Contrôle prix : ${c.listing.priceVerdict}. `
      + `Score d'adéquation ${c.listing.matchScore}/100.`;
  }).join('\n');
}

/** Dernier message reçu DU prospect — détermine si la fenêtre de 24 h est ouverte. */
function lastInboundAt(lead: StoredLead): string | undefined {
  for (let i = lead.transcript.length - 1; i >= 0; i--) {
    const t = lead.transcript[i];
    if (t.role === 'user') return t.at;
  }
  return undefined;
}

/**
 * Hors fenêtre de 24 h, WhatsApp n'accepte qu'un modèle pré-approuvé : Claude ne
 * rédige donc que les variables, pas la phrase. Le modèle attendu est de la forme
 *   « Bonjour {{1}}, du nouveau sur votre recherche à Dubaï : {{2}} {{3}} »
 */
const TEMPLATE_VARS_SCHEMA = {
  type: 'object',
  properties: {
    firstName: { type: 'string', description: 'Prénom du prospect, ou « bonjour » générique si inconnu. 40 caractères max.' },
    fact: { type: 'string', description: 'Le fait nouveau, chiffré, en une proposition sans ponctuation finale. Ex : « une baisse de 6 % sur un 2 pièces à Business Bay, désormais à 268 000 € ». 300 caractères max, une seule ligne.' },
    priceNote: { type: 'string', description: 'Le contrôle prix face aux transactions DLD, en une phrase courte terminée par un point. 250 caractères max, une seule ligne.' },
  },
  required: ['firstName', 'fact', 'priceNote'],
  additionalProperties: false,
} as const;

const TEMPLATE_MISSION = `═══ TA MISSION ═══
Tu prépares les variables d'un message WhatsApp modèle (le prospect est silencieux
depuis plusieurs jours : seul un modèle pré-approuvé peut lui être envoyé).

Tu ne rédiges donc pas une phrase complète, mais trois variables courtes, chacune
sur UNE seule ligne, sans saut de ligne ni markdown. N'invente aucun chiffre :
n'utilise que ceux listés ci-dessous.`;

const ALERT_MISSION = `═══ TA MISSION ═══
Tu envoies une alerte WhatsApp de veille. Le prospect n'attend pas ce message : il doit donc
comprendre en deux secondes pourquoi tu le dérandes, ou il ne lira pas les suivants.

Contraintes :
- 700 caractères maximum. Pas de markdown, pas de titres.
- Commence par le fait nouveau, chiffré. Pas de formule d'ouverture.
- Un seul bien mis en avant, celui qui compte le plus. Mentionne les autres en une ligne.
- Dis explicitement ce que vaut le prix face aux transactions enregistrées au DLD.
- Termine par une seule question fermée qui permet d'avancer (visite, dossier, appel).
- N'invente aucun chiffre : n'utilise que ceux listés ci-dessous.`;

export default async function handler(req: any, res: any) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!hasClaude()) {
    res.status(200).json({ ok: false, reason: 'ANTHROPIC_API_KEY non configurée' });
    return;
  }

  const budget = await checkDailyBudget();
  if (!budget.ok) {
    res.status(200).json({
      ok: false,
      reason: `budget quotidien atteint (${budget.spent.toFixed(2)} / ${budget.budget} $) — veille suspendue`,
    });
    return;
  }

  const all = await listActiveLeads(200);

  // Éligibilité : joignable sur WhatsApp ET consentement explicite non retiré
  // (une alerte de veille est un message à notre initiative : RGPD art. 6.1.a),
  // budget connu, pas déjà alerté récemment.
  const eligible = all.filter(l => {
    if (!l.phone) return false;
    if (!canMessageWhatsApp(l.consent)) return false;
    if (!(l.profile as any)?.totalBudget) return false;
    if (l.tier === 'cold') return false;
    return hoursSince(readState(l).lastAlertAt) >= MIN_HOURS_BETWEEN_ALERTS;
  });

  const batch = eligible.slice(0, MAX_LEADS_PER_RUN);
  const skippedForCap = eligible.length - batch.length;

  const report: any[] = [];

  for (const lead of batch) {
    try {
      const profile = { ...(lead.profile as InvestorProfile), advisorId: lead.advisor_id };
      const state = readState(lead);
      const ctx = await loadDossierContext(profile as any, { limit: 10, pool: 40 });

      if (!ctx.listings.length) {
        report.push({ handle: lead.handle, status: 'aucune annonce disponible' });
        continue;
      }

      const changes = detectChanges(ctx.listings, state);
      // On mémorise l'état du marché même sans alerte, sinon tous les biens
      // paraîtraient « nouveaux » à la prochaine exécution.
      const prices: Record<string, number> = {};
      for (const l of ctx.listings) prices[l.id] = l.price;

      if (!changes.length) {
        await upsertLead({
          handle: lead.handle,
          profile: { ...(lead.profile as any), __watch: { prices, lastAlertAt: state.lastAlertAt } },
        });
        report.push({ handle: lead.handle, status: 'rien de neuf' });
        continue;
      }

      const advisor = resolveAdvisor(lead.advisor_id);
      const insideWindow = isInsideServiceWindow(lastInboundAt(lead));

      const system = assembleSystem(
        buildStableSystem(advisor, 'français'),
        insideWindow ? ALERT_MISSION : TEMPLATE_MISSION,
        buildProfileBlock(profile),
        buildListingsBlock(ctx.listings.slice(0, 5)),
      );

      const brief = `Voici ce qui a changé depuis ton dernier point sur ce dossier :\n\n${changeBrief(changes)}`;

      let sent;
      let messageForTranscript: string;

      if (insideWindow) {
        // Fenêtre de service ouverte : texte libre autorisé, plus riche.
        const { text, refused, usage } = await ask({
          system,
          messages: [{ role: 'user', content: `${brief}\n\nRédige l'alerte WhatsApp à envoyer maintenant.` }],
          maxTokens: 2000,
          effort: 'low',
        });
        if (refused || !text.trim()) {
          report.push({ handle: lead.handle, status: 'rédaction impossible' });
          continue;
        }
        void recordUsage('watch-freeform', usage, { leadHandle: lead.handle });
        messageForTranscript = text.trim();
        sent = await sendWhatsApp(lead.phone!, messageForTranscript);
      } else {
        // Hors fenêtre : modèle pré-approuvé, Claude ne fournit que les variables.
        const res = await getClaude().messages.create({
          model: MODEL,
          max_tokens: 1500,
          system,
          messages: [{ role: 'user', content: `${brief}\n\nProduis les variables du message modèle.` }],
          output_config: outputConfig('low', { format: { type: 'json_schema', schema: TEMPLATE_VARS_SCHEMA as any } }),
        });

        if (res.stop_reason === 'refusal') {
          report.push({ handle: lead.handle, status: 'rédaction impossible' });
          continue;
        }

        let vars: { firstName: string; fact: string; priceNote: string };
        try {
          vars = JSON.parse(textOf(res));
        } catch {
          report.push({ handle: lead.handle, status: 'variables de modèle invalides' });
          continue;
        }

        void recordUsage('watch-template', res.usage, { leadHandle: lead.handle });
        messageForTranscript = `[modèle] ${vars.firstName} · ${vars.fact} ${vars.priceNote}`;
        sent = await sendWhatsAppTemplate(lead.phone!, [vars.firstName, vars.fact, vars.priceNote]);
      }

      const text = messageForTranscript;

      await upsertLead({
        handle: lead.handle,
        profile: {
          ...(lead.profile as any),
          __watch: { prices, lastAlertAt: sent.ok ? new Date().toISOString() : state.lastAlertAt },
        },
        transcript: [
          ...lead.transcript,
          { role: 'assistant', content: text.trim(), at: new Date().toISOString(), channel: 'whatsapp-veille' },
        ],
      });

      report.push({
        handle: lead.handle,
        mode: insideWindow ? 'texte libre (fenêtre 24 h ouverte)' : 'modèle pré-approuvé',
        status: sent.ok ? 'alerte envoyée' : `envoi échoué : ${sent.reason}`,
        changes: changes.map(c => (c.kind === 'drop' ? `baisse ${c.dropPct.toFixed(1)}% sur ${c.listing.id}` : `nouveau ${c.listing.id}`)),
      });
    } catch (err: any) {
      report.push({ handle: lead.handle, status: `erreur : ${err?.message ?? err}` });
    }
  }

  res.status(200).json({
    ok: true,
    leadsTotal: all.length,
    eligible: eligible.length,
    processed: batch.length,
    // On log explicitement ce qui a été laissé de côté : un plafond silencieux
    // se lirait comme « tout le monde a été traité ».
    skippedForCap,
    alertsSent: report.filter(r => r.status === 'alerte envoyée').length,
    report,
  });
}
