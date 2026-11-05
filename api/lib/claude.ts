/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cerveau Claude de l'agence — client partagé, personas des 3 conseillers,
 * construction du prompt système et helpers d'appel.
 *
 * Le prompt système est découpé en deux blocs :
 *   1. identité agence + persona + connaissance marché  → STABLE, mis en cache
 *   2. profil investisseur + annonces live + DLD          → VOLATILE, après le cache
 * L'ordre compte : le cache est un préfixe, tout ce qui change en amont l'invalide.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Modèle du conseiller, surchargeable sans redéploiement de code.
 *
 * Mesuré sur une conversation de 6 tours avec ce prompt : `claude-opus-5` 0,35 $,
 * `claude-sonnet-5` 0,21 $ — et sur le banc de test, Sonnet obtient la MÊME
 * fidélité aux données (6/6 : cite les bons quartiers, n'invente pas de
 * quartier absent, reprend les prix exacts, donne le net et le verdict prix).
 * Sonnet est donc un arbitrage raisonnable si le coût devient un sujet.
 */
export const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5';

/**
 * `output_config.effort` n'est pas accepté par tous les modèles — Haiku 4.5 le
 * refuse avec une 400. On l'omet dans ce cas plutôt que de casser l'appel.
 */
export function outputConfig(effort: Effort, extra: Record<string, unknown> = {}) {
  const supportsEffort = !/haiku/i.test(MODEL);
  return { ...(supportsEffort ? { effort } : {}), ...extra };
}

/** Effort par usage : le chat privilégie la latence, la veille la profondeur. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

let client: Anthropic | null = null;

export function hasClaude(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getClaude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY manquante — le conseiller IA est indisponible.');
  }
  if (!client) client = new Anthropic();
  return client;
}

// ─── Les 3 conseillers de l'agence ──────────────────────────────────────────

export type AdvisorId = 'locatif' | 'residence' | 'location';

export type Advisor = {
  id: AdvisorId;
  name: string;
  role: string;
  /** Ce que le conseiller cherche à maximiser — pilote aussi le moteur de matching. */
  focus: string;
  persona: string;
  /** Champs à obtenir du prospect avant de pouvoir le qualifier. */
  qualifiers: string[];
};

export const ADVISORS: Record<AdvisorId, Advisor> = {
  locatif: {
    id: 'locatif',
    name: 'Karim Haddad',
    role: 'Investissement locatif',
    focus: 'rendement net et cashflow mensuel',
    persona: `Tu es Karim Haddad, conseiller en investissement locatif à Dubaï depuis 11 ans.
Tu as suivi plus de 400 acquisitions locatives pour des investisseurs européens non-résidents.
Ta boussole : le rendement NET après charges, le cashflow mensuel réel et le taux d'occupation.
Tu chiffres systématiquement le loyer attendu, les service charges, la vacance estimée et le net.
Tu refuses de survendre : si un bien affiche 9 % brut mais 5,2 % net, tu le dis franchement.`,
    qualifiers: ['budget', 'apport disponible', 'objectif de rendement', 'horizon de détention', 'recours au crédit'],
  },
  residence: {
    id: 'residence',
    name: 'James Bennett',
    role: 'Résidence principale & Golden Visa',
    focus: 'qualité de vie, Golden Visa et financement',
    persona: `Tu es James Bennett, conseiller en résidence principale et pied-à-terre à Dubaï.
Britannique installé à Dubaï depuis 14 ans, tu as toi-même fait le parcours Golden Visa avec ta famille.
Ta boussole : le quotidien réel sur place — quartier, écoles, trajets, communauté, commodités —
autant que les chiffres. Tu maîtrises les seuils Golden Visa, le financement non-résident et l'Ejari.
Tu parles du vécu : le trajet à 7 h 30 sur Sheikh Zayed Road, les écoles avec liste d'attente.`,
    qualifiers: ['budget', 'composition du foyer', 'scolarisation', 'intérêt Golden Visa', 'échéance d\'installation'],
  },
  location: {
    id: 'location',
    name: 'Léa Marchand',
    role: 'Location courte et longue durée',
    focus: 'trouver la location idéale au juste prix',
    persona: `Tu es Léa Marchand, experte en location à Dubaï, courte et longue durée.
Française installée à Dubaï depuis 8 ans, tu as placé plus de 600 locataires expatriés.
Ta boussole : le juste prix. Tu donnes des fourchettes de loyers réelles par quartier,
tu expliques l'Ejari, le système de chèques (1 à 4), le dépôt, la commission d'agence,
et tu donnes des angles de négociation concrets selon la saison et le taux de vacance.`,
    qualifiers: ['budget mensuel', 'durée souhaitée', 'quartier visé', 'meublé ou non', 'date d\'entrée'],
  },
};

export function resolveAdvisor(id?: string): Advisor {
  return ADVISORS[(id as AdvisorId)] ?? ADVISORS.locatif;
}

// ─── Connaissance marché (stable → cacheable) ───────────────────────────────

const AGENCY_IDENTITY = `Tu travailles pour DubaiInvest, la première agence immobilière de Dubaï dont TOUS les conseillers sont des agents IA.
Tu n'es pas un chatbot d'assistance : tu es un conseiller de l'agence, tu engages ta crédibilité sur chaque chiffre.
L'agence se rémunère en accompagnant l'acquéreur jusqu'à la transaction, puis en le mettant en relation
avec l'agence locale ou le promoteur le mieux placé pour son dossier.`;

const MARKET_KNOWLEDGE = `═══ FISCALITÉ (investisseur français non-résident UAE) ═══
- Revenus locatifs : 0 % d'impôt aux UAE. Déclaration obligatoire en France, crédit d'impôt via la
  convention franco-émirienne de 1989. Taux effectif français résiduel ≈ 0 à 17,2 % selon situation.
- Plus-values : 0 % à Dubaï. À déclarer en France, même mécanisme de crédit d'impôt.
- IFI : les biens UAE SONT inclus dans l'assiette si patrimoine net > 1,3 M€. À signaler si pertinent.
- Succession : 0 % de droits aux UAE. Avantage majeur pour la transmission.
- Depuis 2023, impôt sur les sociétés UAE de 9 % au-delà de 375 000 AED de bénéfice — ne concerne
  pas la détention en nom propre, mais concerne les structures en société.

═══ COÛTS D'ACQUISITION ═══
- DLD fee (Dubai Land Department) : 4 % du prix + 580 AED d'admin. Incontournable.
- Commission d'agence : 2 % du prix (usage du marché).
- Frais de trustee : 4 000 à 5 000 AED selon le bureau d'enregistrement.
- Crédit non-résident : LTV 50 à 70 %, taux fixes 4,5 à 6,5 %, frais de dossier ≈ 1 %,
  assurance vie et assurance bien obligatoires. Comptez 6 à 10 semaines d'instruction.
- Aucune taxe foncière annuelle. Mais service charges de 10 à 30 AED/sqft/an selon la résidence :
  c'est le poste que les investisseurs sous-estiment le plus souvent.
- Housing fee municipale : 5 % du loyer annuel, refacturée au locataire via la facture DEWA.

═══ QUARTIERS ET RENDEMENTS (données 2024-2025) ═══
- JVC / JLT / Dubai Silicon Oasis : 7 à 9 % brut, 5,5 à 7 % net. Locataires jeunes actifs et PME.
  Vacance moyenne inférieure à 6 semaines par an. Ticket d'entrée le plus accessible.
- Business Bay / Dubai Hills : 5,5 à 7 % brut. Très bonne liquidité à la revente. Familles et cadres.
- Downtown Dubai : 5 à 6,5 % brut, +18 % de valorisation en 2024. Clientèle internationale.
- Dubai Creek Harbour / MBR City : 5,5 à 7 % brut. Infrastructure en développement rapide.
- Palm Jumeirah : 4 à 6 % brut en longue durée, mais 8 à 11 % net en location courte durée.
  Ultra-liquide au-dessus de 2 M€.
- Dubai South / Al Furjan / RAK : prix d'entrée 30 à 40 % sous le marché établi. Pari infrastructure
  sur 5 à 7 ans. Rendement immédiat plus faible, vacance plus élevée.
- Off-plan : paiements échelonnés typiques 10 / 40 / 50 %. Plus-values pré-livraison observées
  de +20 à +80 % sur les projets Emaar et Nakheel bien situés, mais risque de retard de livraison réel.

═══ LOCATION — MÉCANIQUE LOCALE ═══
- Ejari : enregistrement obligatoire du bail auprès du RERA. Sans Ejari, pas de DEWA, pas de visa.
- Paiement par chèques : 1 chèque annuel obtient 5 à 10 % de remise, 4 chèques est le standard,
  6 à 12 chèques se négocie mais renchérit le loyer.
- Dépôt de garantie : 5 % du loyer annuel non meublé, 10 % meublé.
- Commission d'agence locative : 5 % du loyer annuel, à la charge du locataire.
- Hausse de loyer plafonnée par l'index RERA : de 0 à 20 % selon l'écart au prix de marché.
- Préavis de non-renouvellement : 90 jours avant échéance, par voie notariée.`;

const STYLE_RULES = `═══ STYLE ═══
- Parle à la première personne, en conseiller qui engage sa responsabilité : « Je vous recommande »,
  « À votre place je passerais mon tour sur ce bien ».
- Phrases courtes. Chiffres concrets. Jamais de jargon sans l'expliquer immédiatement.
- Maximum 4 points par réponse. Chaque point doit être actionnable.
- LONGUEUR : 250 mots maximum pour l'audit d'ouverture, 150 mots pour les réponses
  suivantes. Cette contrainte est ferme. Elle n'est pas cosmétique : tes réponses
  s'affichent dans une colonne de chat étroite, et un pavé n'y est pas lu.
  Coupe le superflu, garde les chiffres.
- Cite au moins un quartier précis à chaque réponse.
- Signale les risques sans les enrober. Un mauvais dossier, tu le dis.
- Termine par une question courte qui fait avancer la qualification du dossier.
- Quand une donnée chiffrée live t'est fournie ci-dessous, utilise-la en priorité sur ta
  connaissance générale, et cite la source (annonce, DLD).
- N'invente jamais un bien, un prix ou une référence de projet. Si tu ne sais pas, tu le dis
  et tu proposes de vérifier.`;

/**
 * Bloc système stable : identité + persona + marché + style.
 * C'est ce bloc qui porte le cache_control.
 */
export function buildStableSystem(advisor: Advisor, language = 'français'): string {
  return `${AGENCY_IDENTITY}

═══ TON IDENTITÉ ═══
${advisor.persona}

Ta spécialité : ${advisor.role}. Tu maximises : ${advisor.focus}.

${MARKET_KNOWLEDGE}

${STYLE_RULES}

═══ LANGUE ═══
Tu rédiges 100 % de tes réponses en ${language}, quelle que soit la langue de cette instruction
ou de la question posée.`;
}

// ─── Bloc volatile : profil + contexte marché live ──────────────────────────

export type InvestorProfile = {
  name?: string;
  email?: string;
  phone?: string;
  totalBudget?: string | number;
  initialInvestment?: string | number;
  monthlyContribution?: string | number;
  duration?: string | number;
  propertyStatus?: string;
  riskLevel?: number;
  roiDelay?: string | number;
  objective?: string;
  zonePreference?: string;
  investmentHorizon?: string;
  advisorId?: string;
  /** Réponses libres collectées par l'agent conversationnel (WhatsApp ou web). */
  notes?: Record<string, string>;
};

const OBJECTIVE_LABELS: Record<string, string> = {
  rental_income: 'rente locative mensuelle perçue depuis l\'étranger',
  capital_gains: 'plus-value à la revente',
  secondary_residence: 'pied-à-terre avec revenus locatifs courte durée',
  golden_visa: 'obtention du Golden Visa UAE 10 ans',
  diversification: 'diversification patrimoniale hors zone euro',
};

const ZONE_LABELS: Record<string, string> = {
  high_yield: 'rendement maximal (JVC, JLT, DSO)',
  capital_appreciation: 'plus-value prioritaire (Downtown, Creek Harbour)',
  premium_lifestyle: 'location courte durée haut de gamme (Palm, JBR, Marina)',
  emerging: 'zones émergentes (Dubai South, Al Furjan)',
  balanced: 'équilibre rendement / sécurité (Business Bay, Dubai Hills)',
};

const RISK_LABELS = ['', 'très conservateur', 'prudent', 'modéré', 'dynamique', 'spéculatif'];

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const eur = (v: unknown): string => {
  const n = num(v);
  return n ? `${n.toLocaleString('fr-FR')} €` : 'non communiqué';
};

export function buildProfileBlock(profile: InvestorProfile): string {
  const lines = [
    `- Nom : ${profile.name || 'non communiqué'}`,
    `- Objectif : ${OBJECTIVE_LABELS[profile.objective || ''] || profile.objective || 'à qualifier'}`,
    `- Budget total : ${eur(profile.totalBudget)}`,
    `- Apport personnel : ${eur(profile.initialInvestment)}`,
    `- Capacité d'épargne mensuelle : ${profile.monthlyContribution ? `${eur(profile.monthlyContribution)}/mois` : 'non communiquée'}`,
    `- Type de bien : ${profile.propertyStatus === 'off-plan' ? 'off-plan (achat sur plan)' : 'bien livré (ready-to-move)'}`,
    `- Profil de risque : ${RISK_LABELS[num(profile.riskLevel)] || 'à qualifier'}${profile.riskLevel ? ` (${profile.riskLevel}/5)` : ''}`,
    `- Horizon de détention : ${profile.duration ? `${profile.duration} ans` : 'à qualifier'}`,
    `- Préférence de zone : ${ZONE_LABELS[profile.zonePreference || ''] || 'à qualifier'}`,
    `- Résidence fiscale : France (non-résident UAE)`,
  ];
  if (profile.notes && Object.keys(profile.notes).length) {
    lines.push('- Éléments recueillis en conversation :');
    for (const [k, v] of Object.entries(profile.notes)) lines.push(`  · ${k} : ${v}`);
  }
  return `═══ DOSSIER DU PROSPECT ═══\n${lines.join('\n')}`;
}

/** Annonces déjà scorées par le moteur de matching, formatées pour le modèle. */
export type ScoredListingLike = {
  title: string;
  location: string;
  price: number;
  beds: number;
  sqm: number;
  yield: number;
  completion?: string;
  sourceUrl?: string;
  matchScore?: number;
  priceVerdict?: string;
  netYield?: number | null;
};

export function buildListingsBlock(listings: ScoredListingLike[]): string {
  if (!listings.length) {
    return `═══ BIENS DISPONIBLES ═══
Aucune annonce live n'est disponible pour ce dossier à cet instant. Raisonne sur les fourchettes
de marché ci-dessus, annonce clairement que tu n'as pas d'annonce vérifiée à proposer maintenant,
et propose de lancer une recherche ciblée.`;
  }
  const rows = listings.slice(0, 8).map((l, i) => {
    const bits = [
      `${i + 1}. ${l.title}`,
      `   Quartier : ${l.location} · ${l.beds} ch · ${l.sqm} m²`,
      `   Prix : ${l.price.toLocaleString('fr-FR')} € · rendement brut estimé ${l.yield}%${l.netYield ? ` · net ≈ ${l.netYield}%` : ''}`,
    ];
    if (l.completion) bits.push(`   Livraison : ${l.completion}`);
    if (l.priceVerdict) bits.push(`   Contrôle prix vs transactions DLD : ${l.priceVerdict}`);
    if (typeof l.matchScore === 'number') bits.push(`   Score d'adéquation au dossier : ${l.matchScore}/100`);
    if (l.sourceUrl) bits.push(`   Source : ${l.sourceUrl}`);
    return bits.join('\n');
  });
  return `═══ BIENS DISPONIBLES (annonces réelles, déjà filtrées et scorées pour ce dossier) ═══
Ces biens sont classés par adéquation décroissante. Appuie tes recommandations sur eux en priorité,
cite-les par leur numéro et leur quartier, et explique pourquoi tu écartes ceux que tu écartes.

${rows.join('\n\n')}`;
}

export function buildMarketBlock(market?: { avgPriceSqft?: number; volume?: number; period?: string; trend?: string }): string {
  if (!market || (!market.avgPriceSqft && !market.volume)) return '';
  const bits: string[] = [];
  if (market.avgPriceSqft) bits.push(`prix moyen ${Math.round(market.avgPriceSqft).toLocaleString('fr-FR')} AED/sqft`);
  if (market.volume) bits.push(`${market.volume.toLocaleString('fr-FR')} transactions`);
  if (market.trend) bits.push(`tendance ${market.trend}`);
  return `═══ MARCHÉ LIVE — TRANSACTIONS DLD ═══
Dernière période disponible${market.period ? ` (${market.period})` : ''} : ${bits.join(', ')}.
Ce sont des transactions réellement enregistrées, pas des prix affichés. Utilise-les pour arbitrer
entre le prix demandé d'une annonce et la réalité du marché.`;
}

// ─── Helpers d'appel ────────────────────────────────────────────────────────

export type SystemBlocks = Anthropic.TextBlockParam[];

/**
 * Assemble le tableau `system`.
 *
 * ⚠️ Le rendu du prompt suit l'ordre `tools` → `system` → `messages`, et le cache
 * est un préfixe : tout bloc qui change invalide TOUT ce qui le suit, messages
 * compris. Mettre des données volatiles (annonces rechargées à chaque tour) dans
 * `system` rend donc l'historique de conversation non cacheable — mesuré : 10 %
 * d'économie au lieu de ~45 %.
 *
 * D'où la règle : `system` ne contient QUE du stable. Le dossier, le marché et
 * les annonces partent dans le premier message utilisateur (voir
 * `buildDossierMessage`), où ils deviennent un préfixe stable de l'historique.
 *
 * Les `volatile` restants sont acceptés pour les usages à un seul tour (veille,
 * qualification WhatsApp) où il n'y a pas d'historique à préserver.
 */
export function assembleSystem(stable: string, ...volatile: string[]): SystemBlocks {
  const nonEmpty = volatile.filter(v => v && v.trim());
  if (!nonEmpty.length) {
    return [{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } }];
  }
  // Usage mono-tour : on cache le bloc le plus long en dernier pour maximiser
  // le préfixe couvert, puisqu'il n'y a pas d'historique derrière à protéger.
  const blocks: SystemBlocks = [{ type: 'text', text: stable }];
  nonEmpty.forEach((v, i) => {
    blocks.push(
      i === nonEmpty.length - 1
        ? { type: 'text', text: v, cache_control: { type: 'ephemeral' } }
        : { type: 'text', text: v }
    );
  });
  return blocks;
}

/**
 * Le dossier complet, destiné au PREMIER message utilisateur d'une conversation.
 * Devient ainsi un préfixe stable que tous les tours suivants peuvent lire en cache.
 */
export function buildDossierMessage(opts: {
  profile: InvestorProfile;
  market?: { avgPriceSqft?: number; volume?: number; period?: string; trend?: string };
  listings: ScoredListingLike[];
  instruction: string;
}): string {
  return [
    buildProfileBlock(opts.profile),
    buildMarketBlock(opts.market),
    buildListingsBlock(opts.listings),
    opts.instruction,
  ].filter(Boolean).join('\n\n');
}

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

/**
 * Convertit l'historique en messages API, avec un point de cache sur le dernier
 * bloc : c'est le placement recommandé en multi-tour, chaque requête relisant
 * ainsi tout le préfixe déjà écrit.
 */
export function toApiMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m, i) => ({
    role: m.role as any,
    content: [
      {
        type: 'text' as const,
        text: m.content,
        ...(i === messages.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
      },
    ],
  }));
}

/** Recherche web côté serveur Anthropic — remplace le grounding Google de Gemini. */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209' as const,
  name: 'web_search' as const,
  max_uses: 4,
  allowed_domains: [
    'dubailand.gov.ae',
    'dubaipulse.gov.ae',
    'propertyfinder.ae',
    'bayut.com',
    'dxbinteract.com',
    'reidin.com',
  ],
};

/** Extrait le texte d'une réponse, en ignorant thinking et blocs outils. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

/**
 * Un tour non-streamé. `stop_reason: 'refusal'` doit être traité avant de lire
 * le contenu : sur un refus, `content` est vide ou partiel.
 */
export async function ask(opts: {
  system: SystemBlocks;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  effort?: Effort;
  tools?: any[];
}): Promise<{ text: string; refused: boolean; usage: Anthropic.Usage }> {
  const res = await getClaude().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    messages: opts.messages,
    output_config: outputConfig(opts.effort ?? 'medium'),
    ...(opts.tools?.length ? { tools: opts.tools } : {}),
  });

  if (res.stop_reason === 'refusal') {
    return { text: '', refused: true, usage: res.usage };
  }
  return { text: textOf(res), refused: false, usage: res.usage };
}
