/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Croisement prix demandé ↔ transactions réellement enregistrées.
 *
 * C'est le cœur de la promesse de l'agence : une annonce affiche un prix demandé,
 * le DLD enregistre des prix payés. L'écart entre les deux est l'information que
 * l'investisseur ne peut pas obtenir seul.
 */

/** 1 EUR ≈ 4,24 AED — aligné sur listingsCollector. */
const EUR_TO_AED = 4.24;
const SQM_TO_SQFT = 10.7639;

/**
 * Prix de vente moyens AED/sqft par quartier (appartements, marché 2025).
 *
 * ⚠️ Ces valeurs pilotent directement le verdict prix affiché à l'investisseur.
 * Une grille trop haute fait passer un bien surévalué pour une aubaine — c'est
 * le pire mode de défaillance de tout le système. À recaler périodiquement, et
 * à remplacer par une agrégation DLD par quartier dès qu'elle est disponible.
 *
 * Contrôle de vraisemblance : un studio de 45 m² (484 sqft) à JVC doit ressortir
 * autour de 630 000 AED, soit environ 148 000 € — c'est l'ordre de grandeur réel.
 */
const BENCHMARK_AED_SQFT: Record<string, number> = {
  'palm jumeirah': 3300,
  downtown: 2600,
  jbr: 2300,
  'dubai hills': 2100,
  'dubai marina': 2050,
  'creek harbour': 2050,
  'business bay': 1900,
  'mbr city': 1900,
  jlt: 1500,
  'al furjan': 1400,
  jvc: 1300,
  'silicon oasis': 1050,
  'dubai south': 1000,
  other: 1700,
};

export type PriceVerdictCode =
  | 'well_below'
  | 'below'
  | 'fair'
  | 'above'
  | 'well_above'
  | 'unknown';

export type PriceCheck = {
  code: PriceVerdictCode;
  /** Écart en % entre le prix demandé au sqft et la référence marché. */
  deltaPct: number | null;
  askingAedSqft: number | null;
  benchmarkAedSqft: number | null;
  /** Formulation prête à injecter dans le prompt du conseiller. */
  label: string;
  /** D'où vient la référence : transactions DLD ou grille interne. */
  basis: 'dld' | 'benchmark' | 'none';
};

export function benchmarkFor(location: string): { value: number; key: string } {
  const l = (location || '').toLowerCase();
  for (const [key, value] of Object.entries(BENCHMARK_AED_SQFT)) {
    if (key !== 'other' && l.includes(key)) return { value, key };
  }
  // Variantes de nommage fréquentes chez Property Finder
  if (l.includes('jumeirah village')) return { value: BENCHMARK_AED_SQFT.jvc, key: 'jvc' };
  if (l.includes('lake towers')) return { value: BENCHMARK_AED_SQFT.jlt, key: 'jlt' };
  if (l.includes('mohammed bin rashid')) return { value: BENCHMARK_AED_SQFT['mbr city'], key: 'mbr city' };
  if (l.includes('beach residence')) return { value: BENCHMARK_AED_SQFT.jbr, key: 'jbr' };
  return { value: BENCHMARK_AED_SQFT.other, key: 'other' };
}

const LABELS: Record<PriceVerdictCode, (d: number) => string> = {
  well_below: d => `nettement sous le marché (${d.toFixed(0)} % vs transactions comparables) — à vérifier : soit une vraie opportunité, soit un défaut (étage bas, vue bloquée, charges élevées)`,
  below: d => `sous le marché (${d.toFixed(0)} %) — marge de négociation déjà intégrée`,
  fair: d => `aligné sur le marché (${d >= 0 ? '+' : ''}${d.toFixed(0)} %)`,
  above: d => `au-dessus du marché (+${d.toFixed(0)} %) — négociation nécessaire`,
  well_above: d => `surévalué (+${d.toFixed(0)} %) — à écarter sauf justification solide`,
  unknown: () => 'non vérifiable (surface ou prix manquant)',
};

function codeFor(deltaPct: number): PriceVerdictCode {
  if (deltaPct <= -12) return 'well_below';
  if (deltaPct <= -4) return 'below';
  if (deltaPct < 4) return 'fair';
  if (deltaPct < 12) return 'above';
  return 'well_above';
}

/**
 * @param priceEur          prix demandé en EUR
 * @param sqm               surface en m²
 * @param location          libellé du quartier
 * @param districtAedSqft   prix moyen AED/sqft **au niveau du quartier**, issu
 *   des transactions DLD. Ne jamais passer une moyenne toutes-zones ici : une
 *   moyenne globale comparée à un bien de quartier produit un verdict faux.
 *   La moyenne DLD toutes-zones sert uniquement de contexte marché au conseiller
 *   (voir `buildMarketBlock`), pas de référence pour un bien précis.
 */
export function checkPrice(
  priceEur: number,
  sqm: number,
  location: string,
  districtAedSqft?: number | null
): PriceCheck {
  if (!priceEur || !sqm || sqm < 5) {
    return {
      code: 'unknown',
      deltaPct: null,
      askingAedSqft: null,
      benchmarkAedSqft: null,
      label: LABELS.unknown(0),
      basis: 'none',
    };
  }

  const askingAedSqft = (priceEur * EUR_TO_AED) / (sqm * SQM_TO_SQFT);
  const bench = benchmarkFor(location);

  // Une vraie donnée DLD de quartier prime sur la grille interne. Le garde-fou
  // de vraisemblance évite qu'une valeur mal unitée (AED/m², AED total) passe.
  const useDld = !!districtAedSqft && districtAedSqft > 500 && districtAedSqft < 6000;
  const benchmarkAedSqft = useDld ? districtAedSqft! : bench.value;

  const deltaPct = ((askingAedSqft - benchmarkAedSqft) / benchmarkAedSqft) * 100;
  const code = codeFor(deltaPct);

  return {
    code,
    deltaPct,
    askingAedSqft,
    benchmarkAedSqft,
    label: LABELS[code](deltaPct),
    basis: useDld ? 'dld' : 'benchmark',
  };
}

/** Rendement net après charges réelles — le chiffre que les annonces ne donnent jamais. */
export function netYield(opts: {
  priceEur: number;
  grossYieldPct: number;
  sqm: number;
  serviceChargesSqft: number;
  /** Taux d'occupation attendu (0-1). 0,92 = ~6 semaines de vacance par an. */
  occupancy?: number;
  /** Frais de gestion locative en % du loyer. */
  mgmtFeePct?: number;
}): number | null {
  const { priceEur, grossYieldPct, sqm, serviceChargesSqft } = opts;
  if (!priceEur || !grossYieldPct || !sqm) return null;

  const occupancy = opts.occupancy ?? 0.92;
  const mgmtFeePct = opts.mgmtFeePct ?? 5;

  const grossRent = priceEur * (grossYieldPct / 100);
  const collected = grossRent * occupancy;
  const serviceCharges = (sqm * SQM_TO_SQFT * (serviceChargesSqft || 15)) / EUR_TO_AED;
  const mgmt = collected * (mgmtFeePct / 100);

  const net = collected - serviceCharges - mgmt;
  const pct = (net / priceEur) * 100;
  return Math.round(pct * 10) / 10;
}
