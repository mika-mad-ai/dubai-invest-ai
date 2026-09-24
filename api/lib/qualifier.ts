/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Agent conversationnel de qualification (WhatsApp).
 *
 * Un seul appel Claude fait trois choses à la fois, via sortie structurée :
 *   1. rédige la réponse à envoyer au prospect,
 *   2. extrait les champs de profil mentionnés dans le message,
 *   3. détecte les signaux d'achat.
 * Un seul appel = une seule latence et un seul coût par message reçu, et les trois
 * sorties restent cohérentes entre elles.
 *
 * Les champs vides ("" ou 0) signifient « non encore connu » — c'est volontaire :
 * les schémas de sortie structurée exigent `required` sur toutes les clés, et gérer
 * l'absence par valeur vide évite d'avoir à modéliser des unions nullables partout.
 */

import {
  assembleSystem, buildListingsBlock, buildProfileBlock, buildStableSystem,
  getClaude, MODEL, outputConfig, resolveAdvisor, textOf, type InvestorProfile,
} from './claude';
import { nextQualifyingQuestion, type BuyingSignal } from './leadScore';
import type { UsageLike } from './guard';
import type { ScoredListing } from './matchEngine';

const SIGNAL_ENUM: BuyingSignal[] = [
  'budget_confirmed', 'financing_ready', 'visit_requested', 'timeline_under_3_months',
  'specific_property_interest', 'golden_visa_intent', 'second_purchase', 'contacted_bank',
];

const SCHEMA = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description: 'Message à envoyer au prospect sur WhatsApp. Court, 900 caractères maximum, ton de conseiller. Pas de markdown, pas de titres : du texte lisible sur mobile.',
    },
    extracted: {
      type: 'object',
      description: 'Champs de profil déduits du message. Chaîne vide ou 0 si non mentionné et non déductible.',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        budgetEur: { type: 'integer', description: 'Budget total en euros, 0 si inconnu. Convertis les AED et les dollars en euros.' },
        apportEur: { type: 'integer', description: 'Apport en fonds propres en euros, 0 si inconnu.' },
        objective: {
          type: 'string',
          enum: ['', 'rental_income', 'capital_gains', 'secondary_residence', 'golden_visa', 'diversification'],
        },
        zonePreference: {
          type: 'string',
          enum: ['', 'high_yield', 'capital_appreciation', 'premium_lifestyle', 'emerging', 'balanced'],
        },
        horizonMonths: { type: 'integer', description: 'Échéance d\'achat en mois, 0 si inconnue.' },
        notes: { type: 'string', description: 'Élément qualitatif utile au commercial, en une phrase. Vide si rien de notable.' },
      },
      required: ['name', 'email', 'budgetEur', 'apportEur', 'objective', 'zonePreference', 'horizonMonths', 'notes'],
      additionalProperties: false,
    },
    signals: {
      type: 'array',
      description: 'Signaux d\'achat réellement présents dans ce message. Tableau vide si aucun. N\'invente pas de signal.',
      items: { type: 'string', enum: SIGNAL_ENUM },
    },
    advisorId: {
      type: 'string',
      enum: ['locatif', 'residence', 'location'],
      description: 'Conseiller le plus adapté au besoin exprimé. Conserve le conseiller actuel sauf si le besoin a clairement changé.',
    },
    handoffReady: {
      type: 'boolean',
      description: 'true uniquement si le prospect a un budget, une échéance et demande explicitement un rendez-vous ou une mise en relation.',
    },
  },
  required: ['reply', 'extracted', 'signals', 'advisorId', 'handoffReady'],
  additionalProperties: false,
} as const;

export type QualifierResult = {
  reply: string;
  extracted: {
    name: string;
    email: string;
    budgetEur: number;
    apportEur: number;
    objective: string;
    zonePreference: string;
    horizonMonths: number;
    notes: string;
  };
  signals: BuyingSignal[];
  advisorId: string;
  handoffReady: boolean;
  /** Consommation réelle, pour le disjoncteur de budget. */
  usage?: UsageLike;
};

const MISSION = (missing: string[], nextQuestion: string | null) => `═══ TA MISSION SUR CE CANAL ═══
Tu échanges par WhatsApp. Contraintes du canal :
- 900 caractères maximum par message. Pas de markdown, pas de titres, pas de listes à puces
  numérotées lourdes. Des phrases courtes, éventuellement séparées par des sauts de ligne.
- UNE seule question par message. Jamais deux.
- Tu apportes toujours une information de valeur AVANT de poser ta question : un chiffre de
  marché, une fourchette de loyer, un nom de quartier. On ne fait pas remplir un formulaire.

Tu qualifies le dossier en autonomie. Informations encore manquantes : ${missing.length ? missing.join(', ') : 'aucune — le dossier est complet'}.
${nextQuestion ? `La question la plus utile à poser maintenant : « ${nextQuestion} » — reformule-la à ta manière.` : 'Le dossier est complet : propose une mise en relation avec un partenaire pour la suite.'}

Règles de fond :
- Ne promets jamais un rendement ou une disponibilité que les données ci-dessus ne soutiennent pas.
- Si le prospect demande quelque chose hors immobilier Dubaï, ramène-le à son projet en une phrase.
- Si le prospect veut arrêter d'être contacté, tu le confirmes simplement et tu n'insistes pas.`;

/**
 * Un tour de qualification. `history` est le transcript déjà stocké.
 */
export async function qualifyTurn(opts: {
  profile: InvestorProfile;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  incoming: string;
  listings?: ScoredListing[];
  missing: string[];
  language?: string;
}): Promise<QualifierResult> {
  const advisor = resolveAdvisor(opts.profile.advisorId);
  const language = opts.language || 'français';
  const nextQuestion = nextQualifyingQuestion(opts.missing);

  const system = assembleSystem(
    buildStableSystem(advisor, language),
    MISSION(opts.missing, nextQuestion),
    buildProfileBlock(opts.profile),
    buildListingsBlock(opts.listings ?? []),
  );

  const messages = [
    ...opts.history.slice(-16).map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: opts.incoming },
  ];

  const res = await getClaude().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages,
    output_config: outputConfig('medium', { format: { type: 'json_schema', schema: SCHEMA as any } }),
  });

  if (res.stop_reason === 'refusal') {
    return {
      reply: 'Je préfère rester sur votre projet immobilier à Dubaï. Dites-moi ce que vous cherchez et je vous oriente.',
      extracted: { name: '', email: '', budgetEur: 0, apportEur: 0, objective: '', zonePreference: '', horizonMonths: 0, notes: '' },
      signals: [],
      advisorId: advisor.id,
      handoffReady: false,
      usage: res.usage,
    };
  }

  try {
    const parsed = JSON.parse(textOf(res)) as QualifierResult;
    // Le schéma garantit la forme, pas la pertinence : on filtre les signaux inconnus.
    parsed.signals = (parsed.signals ?? []).filter(s => SIGNAL_ENUM.includes(s));
    parsed.usage = res.usage;
    return parsed;
  } catch {
    // Sortie structurée invalide : on renvoie un tour neutre plutôt que de casser la conversation.
    return {
      reply: 'Je n\'ai pas bien saisi. Pouvez-vous reformuler votre projet en une phrase ?',
      extracted: { name: '', email: '', budgetEur: 0, apportEur: 0, objective: '', zonePreference: '', horizonMonths: 0, notes: '' },
      signals: [],
      advisorId: advisor.id,
      handoffReady: false,
    };
  }
}
