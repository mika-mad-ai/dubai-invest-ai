/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Qualification et valorisation d'un lead.
 *
 * Le modèle économique de l'agence est la revente de leads qualifiés aux agences
 * et promoteurs de Dubaï (500 à 2000 € selon la qualité). Ce fichier est donc la
 * pièce qui transforme une conversation en actif : il doit être déterministe,
 * explicable, et ne jamais gonfler artificiellement un dossier.
 */

export type BuyingSignal =
  | 'budget_confirmed'
  | 'financing_ready'
  | 'visit_requested'
  | 'timeline_under_3_months'
  | 'specific_property_interest'
  | 'golden_visa_intent'
  | 'second_purchase'
  | 'contacted_bank';

export const SIGNAL_LABELS: Record<BuyingSignal, string> = {
  budget_confirmed: 'budget confirmé et disponible',
  financing_ready: 'financement déjà cadré',
  visit_requested: 'demande de visite ou de rendez-vous',
  timeline_under_3_months: 'échéance d\'achat sous 3 mois',
  specific_property_interest: 'intérêt sur un bien précis',
  golden_visa_intent: 'objectif Golden Visa explicite',
  second_purchase: 'déjà propriétaire, achat supplémentaire',
  contacted_bank: 'banque déjà contactée',
};

const SIGNAL_WEIGHTS: Record<BuyingSignal, number> = {
  budget_confirmed: 8,
  financing_ready: 7,
  visit_requested: 10,
  timeline_under_3_months: 9,
  specific_property_interest: 6,
  golden_visa_intent: 4,
  second_purchase: 5,
  contacted_bank: 6,
};

export type LeadInput = {
  name?: string;
  email?: string;
  phone?: string;
  totalBudget?: string | number;
  initialInvestment?: string | number;
  objective?: string;
  investmentHorizon?: string;
  roiDelay?: string | number;
  advisorId?: string;
  /** Nombre de messages échangés avec le conseiller, tous canaux confondus. */
  messageCount?: number;
  /** Biens consultés (ids). */
  viewedListings?: string[];
  signals?: BuyingSignal[];
};

export type LeadTier = 'cold' | 'warm' | 'hot' | 'qualified';

export type LeadScore = {
  score: number;
  tier: LeadTier;
  /** Fourchette de revente estimée, en euros. */
  estimatedValueEur: [number, number];
  /** Ce qui manque pour monter d'un cran — pilote les questions de l'agent. */
  missing: string[];
  breakdown: Array<{ label: string; points: number }>;
};

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(x) ? x : 0;
};

/** Fourchettes de prix par palier, alignées sur ce que paie le marché à Dubaï. */
const VALUE_BY_TIER: Record<LeadTier, [number, number]> = {
  cold: [0, 0],
  warm: [500, 800],
  hot: [800, 1400],
  qualified: [1400, 2000],
};

export function scoreLead(input: LeadInput): LeadScore {
  const breakdown: Array<{ label: string; points: number }> = [];
  const missing: string[] = [];
  let score = 0;

  const add = (label: string, points: number) => {
    if (points > 0) breakdown.push({ label, points });
    score += points;
  };

  // ── Joignabilité : sans canal de contact, le lead ne vaut rien ─────────────
  if (input.email) add('email fourni', 10);
  else missing.push('adresse email');

  if (input.phone) add('téléphone / WhatsApp fourni', 15);
  else missing.push('numéro WhatsApp');

  if (input.name) add('identité connue', 5);
  else missing.push('nom');

  // ── Capacité financière : 25 points ───────────────────────────────────────
  const budget = n(input.totalBudget);
  if (!budget) {
    missing.push('budget');
  } else if (budget >= 1_500_000) add('budget supérieur à 1,5 M€', 25);
  else if (budget >= 700_000) add('budget 700 k€ – 1,5 M€', 22);
  else if (budget >= 400_000) add('budget 400 – 700 k€', 18);
  else if (budget >= 200_000) add('budget 200 – 400 k€', 13);
  else add('budget inférieur à 200 k€', 7);

  const apport = n(input.initialInvestment);
  if (apport && budget && apport / budget >= 0.3) add('apport supérieur à 30 % du budget', 6);
  else if (!apport) missing.push('apport disponible');

  // ── Urgence : 12 points ──────────────────────────────────────────────────
  const delay = n(input.roiDelay);
  if (input.investmentHorizon === 'short' || (delay && delay <= 3)) add('échéance courte', 12);
  else if (delay && delay <= 12) add('échéance sous 12 mois', 7);
  else if (!input.investmentHorizon && !delay) missing.push('échéance d\'achat');

  // ── Engagement : 12 points ───────────────────────────────────────────────
  const msgs = n(input.messageCount);
  if (msgs >= 12) add('conversation approfondie', 12);
  else if (msgs >= 6) add('conversation engagée', 8);
  else if (msgs >= 3) add('premiers échanges', 4);

  const viewed = input.viewedListings?.length ?? 0;
  if (viewed >= 3) add(`${viewed} biens consultés`, 5);
  else if (viewed >= 1) add(`${viewed} bien consulté`, 2);

  // ── Signaux d'achat détectés ─────────────────────────────────────────────
  for (const s of input.signals ?? []) {
    const w = SIGNAL_WEIGHTS[s];
    if (w) add(SIGNAL_LABELS[s], w);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Un lead sans aucun moyen de contact reste froid quel que soit son score.
  const reachable = !!(input.email || input.phone);
  let tier: LeadTier;
  if (!reachable) tier = 'cold';
  else if (score >= 75) tier = 'qualified';
  else if (score >= 55) tier = 'hot';
  else if (score >= 32) tier = 'warm';
  else tier = 'cold';

  return { score, tier, estimatedValueEur: VALUE_BY_TIER[tier], missing, breakdown };
}

/** Prochaine question la plus rentable à poser, d'après ce qui manque. */
export function nextQualifyingQuestion(missing: string[]): string | null {
  const priority = ['budget', 'numéro WhatsApp', 'échéance d\'achat', 'apport disponible', 'adresse email', 'nom'];
  const target = priority.find(p => missing.includes(p));
  if (!target) return null;
  const questions: Record<string, string> = {
    'budget': 'Quelle enveloppe totale envisagez-vous, frais inclus ?',
    'numéro WhatsApp': 'Sur quel numéro WhatsApp puis-je vous envoyer les biens qui correspondent ?',
    'échéance d\'achat': 'À quelle échéance souhaitez-vous concrétiser ?',
    'apport disponible': 'Quelle part financez-vous sur fonds propres ?',
    'adresse email': 'À quelle adresse email puis-je vous envoyer le dossier complet ?',
    'nom': 'Comment vous appelez-vous ?',
  };
  return questions[target] ?? null;
}
