import React from 'react';
import { useI18n, fmt } from '../i18n';

/**
 * Consentements RGPD : deux finalités distinctes, deux cases jamais
 * pré-cochées, aucune n'est requise pour obtenir l'analyse (consentement
 * libre — RGPD art. 7.4). Le serveur horodate et versionne la décision
 * (api/lib/consent.ts).
 */
export type ConsentChoice = { whatsapp: boolean; partners: boolean };

export const EMPTY_CONSENT: ConsentChoice = { whatsapp: false, partners: false };

/** Contact pour l'exercice des droits — configurable, jamais inventé. */
const PRIVACY_CONTACT = (import.meta.env.VITE_PRIVACY_CONTACT as string | undefined)?.trim();

const ConsentFields: React.FC<{
  value: ConsentChoice;
  onChange: (v: ConsentChoice) => void;
  /** Masque la case WhatsApp quand le formulaire ne collecte pas de numéro. */
  showWhatsApp?: boolean;
  accent?: string;
}> = ({ value, onChange, showWhatsApp = true, accent = '#14b8a6' }) => {
  const { t } = useI18n();
  const row = (key: keyof ConsentChoice, label: string) => (
    <label key={key} className="flex items-start gap-2.5 cursor-pointer text-left" style={{ fontSize: '0.72rem', lineHeight: 1.5, color: 'rgba(240,235,224,0.78)' }}>
      <input
        type="checkbox"
        checked={value[key]}
        onChange={e => onChange({ ...value, [key]: e.target.checked })}
        className="mt-0.5 shrink-0"
        style={{ accentColor: accent, width: 16, height: 16 }}
      />
      <span>{label}</span>
    </label>
  );
  return (
    <fieldset className="space-y-2.5" style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend className="sr-only">Consentements</legend>
      {showWhatsApp && row('whatsapp', t.consent.whatsapp)}
      {row('partners', t.consent.partners)}
      <p style={{ fontSize: '0.66rem', lineHeight: 1.55, color: 'rgba(240,235,224,0.62)', margin: '4px 0 0' }}>
        {t.consent.note}
        {PRIVACY_CONTACT ? fmt(t.consent.noteContact, { email: PRIVACY_CONTACT }) : ''}.{' '}
        <a href="/confidentialite" target="_blank" rel="noopener" style={{ color: '#D4AF37', textDecoration: 'underline' }}>
          {t.consent.privacyLink}
        </a>
      </p>
    </fieldset>
  );
};

export default ConsentFields;
