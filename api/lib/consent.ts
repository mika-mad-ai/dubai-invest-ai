/**
 * Consentements RGPD d'un prospect — logique pure, testée par verify-consent.
 *
 * Deux finalités DISTINCTES, jamais pré-cochées, jamais liées l'une à l'autre
 * (RGPD art. 7 : consentement libre, spécifique, éclairé, univoque) :
 *   · whatsapp : être recontacté par le conseiller et recevoir les alertes de
 *                la veille (nouvelles offres, baisses de prix)
 *   · partners : transmission du dossier à des agences/promoteurs partenaires
 *                — c'est la revente du lead, elle exige son propre accord
 *
 * Chaque décision est horodatée et porte la version du texte affiché : il
 * faut pouvoir DÉMONTRER le consentement (art. 7.1), pas seulement le stocker.
 * Le retrait (STOP) est aussi simple que l'accord et prime sur tout.
 */

/** Incrémenter quand la formulation affichée change (i18n `consent*`). */
export const CONSENT_TEXT_VERSION = '2026-11-05.fr-v1';

export type ConsentPurpose = 'whatsapp' | 'partners';
export type ConsentSource = 'web_form' | 'lead_modal' | 'whatsapp_inbound' | 'whatsapp_stop';

export type ConsentRecord = {
  granted: boolean;
  /** ISO 8601 — moment de la décision (accord OU refus OU retrait). */
  at: string;
  source: ConsentSource;
  textVersion: string;
};

export type LeadConsent = Partial<Record<ConsentPurpose, ConsentRecord>>;

/**
 * Fusionne une nouvelle décision dans le consentement existant. Seules les
 * finalités explicitement fournies (`true` ou `false`) sont mises à jour :
 * un formulaire qui ne pose pas la question ne retire pas un accord donné
 * ailleurs, et ne vaut jamais accord.
 */
export function applyConsent(
  prev: LeadConsent | null | undefined,
  decision: Partial<Record<ConsentPurpose, boolean | undefined>>,
  source: ConsentSource,
  now: Date = new Date()
): LeadConsent {
  const next: LeadConsent = { ...(prev ?? {}) };
  for (const purpose of ['whatsapp', 'partners'] as const) {
    const v = decision[purpose];
    if (typeof v !== 'boolean') continue;
    next[purpose] = { granted: v, at: now.toISOString(), source, textVersion: CONSENT_TEXT_VERSION };
  }
  return next;
}

/**
 * Peut-on écrire à ce prospect sur WhatsApp à notre initiative (premier
 * contact, alertes de veille) ? Uniquement sur accord explicite et non retiré.
 * Répondre à un message entrant dans la fenêtre de 24 h reste possible : c'est
 * le prospect qui a ouvert la conversation (voir webhook).
 */
export function canMessageWhatsApp(consent: LeadConsent | null | undefined): boolean {
  return consent?.whatsapp?.granted === true;
}

/** Le dossier peut-il être transmis (vendu) à une agence partenaire ? */
export function canSharePartners(consent: LeadConsent | null | undefined): boolean {
  return consent?.partners?.granted === true;
}

/**
 * Mots d'arrêt reconnus (message entier, insensible à la casse et aux
 * accents) : STOP, ARRET, ARRÊT, STOPP, UNSUBSCRIBE, DÉSINSCRIRE, «stop svp»…
 * On ne cherche PAS le mot au milieu d'une phrase (« je ne veux pas que ça
 * s'arrête ») : faux positif coûteux pour un lead chaud.
 */
export function isOptOutMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(stop|stopp|arret|arreter|unsubscribe|desinscrire|desinscription|desabonner|cancel|end|quit)( (svp|stp|please|merci|moi|tout))?$/.test(t);
}

/** Retrait total à réception d'un STOP : WhatsApp ET transmission partenaires. */
export function withdrawAll(prev: LeadConsent | null | undefined, now: Date = new Date()): LeadConsent {
  return applyConsent(prev, { whatsapp: false, partners: false }, 'whatsapp_stop', now);
}

export const OPT_OUT_CONFIRMATION =
  'C’est noté : vous ne recevrez plus de message de DubaiInvest et votre dossier ne sera transmis à aucun partenaire. ' +
  'Écrivez-nous à nouveau si vous changez d’avis.';
