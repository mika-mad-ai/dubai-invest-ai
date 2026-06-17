import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import fr, { Dict } from './fr';
import en from './en';
import es from './es';
import ru from './ru';
import zh from './zh';
import ar from './ar';
import af from './af';

export type Locale = 'fr' | 'en' | 'es' | 'ru' | 'zh' | 'ar' | 'af';

export const LOCALES: Locale[] = ['fr', 'en', 'es', 'ru', 'zh', 'ar', 'af'];
export const RTL_LOCALES: Locale[] = ['ar'];

const DICTS: Record<Locale, Dict> = { fr, en, es, ru, zh, ar, af };

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'FR', en: 'EN', es: 'ES', ru: 'RU', zh: '中文', ar: 'عربي', af: 'AF',
};

// Drapeau pour chaque locale (🇦🇪 pour l'arabe — site Dubaï ; 🇿🇦 pour l'afrikaans).
export const LOCALE_FLAGS: Record<Locale, string> = {
  fr: '🇫🇷', en: '🇬🇧', es: '🇪🇸', ru: '🇷🇺', zh: '🇨🇳', ar: '🇦🇪', af: '🇿🇦',
};

// Nom de la langue dans sa propre langue, pour le menu déroulant.
export const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Français', en: 'English', es: 'Español', ru: 'Русский', zh: '中文', ar: 'العربية', af: 'Afrikaans',
};

/**
 * Devise associée à chaque locale + taux de conversion approximatif depuis l'EUR.
 * Les montants du modèle de données sont stockés en EUR ; on convertit à l'affichage.
 * Taux indicatifs (AED aligné sur le widget EUR/AED du site = 4,24).
 */
export const LOCALE_CURRENCY: Record<Locale, { code: string; rate: number }> = {
  fr: { code: 'EUR', rate: 1 },
  en: { code: 'GBP', rate: 0.85 },
  es: { code: 'EUR', rate: 1 },
  ru: { code: 'RUB', rate: 100 },
  zh: { code: 'CNY', rate: 7.8 },
  ar: { code: 'AED', rate: 4.24 },
  af: { code: 'ZAR', rate: 20 },
};

const intlLocale = (l: Locale) => (l === 'zh' ? 'zh-CN' : l);

/** Formate un montant EUR dans la devise de la locale (conversion incluse). */
export function formatMoney(amountEur: number, locale: Locale, maximumFractionDigits = 0): string {
  const { code, rate } = LOCALE_CURRENCY[locale];
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: code,
    maximumFractionDigits,
  }).format(amountEur * rate);
}

/** Interpolation de {placeholders} dans une chaîne de traduction. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function detectLocale(pathname: string): Locale {
  const seg = pathname.split('/')[1] as Locale;
  return LOCALES.includes(seg) && seg !== 'fr' ? seg : 'fr';
}

/** Chemin d'accueil pour une locale ('/' pour fr, '/en' pour les autres). */
export function localePath(locale: Locale): string {
  return locale === 'fr' ? '/' : `/${locale}`;
}

interface I18nContextValue {
  locale: Locale;
  t: Dict;
  setLocale: (l: Locale) => void;
  /** Formate un montant EUR dans la devise de la locale courante. */
  money: (amountEur: number, maximumFractionDigits?: number) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'fr',
  t: fr,
  setLocale: () => {},
  money: (a) => formatMoney(a, 'fr'),
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() =>
    typeof window !== 'undefined' ? detectLocale(window.location.pathname) : 'fr'
  );

  const setLocale = (l: Locale) => {
    if (l === locale) return;
    window.history.pushState({}, '', localePath(l));
    setLocaleState(l);
  };

  // Navigation arrière/avant du navigateur
  useEffect(() => {
    const onPop = () => setLocaleState(detectLocale(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // <html lang/dir> + title/description/canonical par locale
  useEffect(() => {
    const t = DICTS[locale];
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale;
    document.documentElement.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
    document.title = t.meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', t.meta.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', t.meta.description);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://dubainvest.eu${localePath(locale)}`);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      t: DICTS[locale],
      setLocale,
      money: (amountEur: number, maximumFractionDigits = 0) => formatMoney(amountEur, locale, maximumFractionDigits),
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
