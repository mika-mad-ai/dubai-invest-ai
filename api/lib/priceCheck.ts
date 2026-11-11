/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Croisement prix demandé ↔ transactions réellement enregistrées.
 *
 * C'est le cœur de la promesse de l'agence : une annonce affiche un prix demandé,
 * le DLD enregistre des prix payés. L'écart entre les deux est l'information que
 * l'investisseur ne peut pas obtenir seul.
 *
 * Les grilles de référence vivent dans `dldBenchmarks.ts` : médianes DLD
 * revente 12 mois par quartier, appartements et villas séparés, avec correctif
 * par nombre de chambres.
 */

import { resolveBenchmark, bedroomFactor, DLD_BENCHMARK_AS_OF } from './dldBenchmarks';

/** 1 EUR ≈ 4,24 AED — aligné sur listingsCollector. */
export const EUR_TO_AED = 4.24;
const SQM_TO_SQFT = 10.7639;

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
  /** Date de recalage de la grille DLD (traçabilité dans le prompt et l'UI). */
  asOf: string;
  /** Zone DLD officielle derrière la référence, vide si repli `other`. */
  zone?: string;
};

/** Référence AED/sqft pour un libellé de quartier. `type` sélectionne la
 *  grille villa quand le bien est une villa/townhouse. */
export function benchmarkFor(
  location: string,
  type?: string | null
): { value: number; key: string; zone: string; matched: boolean } {
  const m = resolveBenchmark(location, type);
  return { value: m.value, key: m.key, zone: m.zone, matched: m.matched };
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
 * @param opts.beds  nombre de chambres (0 = studio) — affine la référence :
 *   un studio se paie ~14 % plus cher au sqft que la médiane de zone, un 3 ch.
 *   ~13 % moins cher. Appliqué aux appartements seulement.
 * @param opts.type  type de bien (« Villa », « Townhouse », « Appartement »…) —
 *   sélectionne la grille villa, dont le psf n'a rien à voir avec celui des
 *   appartements de la même zone (Palm : 7 061 vs 2 796).
 */
export function checkPrice(
  priceEur: number,
  sqm: number,
  location: string,
  districtAedSqft?: number | null,
  opts?: { beds?: number | null; type?: string | null }
): PriceCheck {
  if (!priceEur || !sqm || sqm < 5) {
    return {
      code: 'unknown',
      deltaPct: null,
      askingAedSqft: null,
      benchmarkAedSqft: null,
      label: LABELS.unknown(0),
      basis: 'none',
      asOf: DLD_BENCHMARK_AS_OF,
    };
  }

  const askingAedSqft = (priceEur * EUR_TO_AED) / (sqm * SQM_TO_SQFT);
  const bench = benchmarkFor(location, opts?.type);

  // Une vraie donnée DLD de quartier prime sur la grille interne. Le garde-fou
  // de vraisemblance évite qu'une valeur mal unitée (AED/m², AED total) passe.
  const useDld = !!districtAedSqft && districtAedSqft > 500 && districtAedSqft < 6000;
  const base = useDld ? districtAedSqft! : bench.value;

  // La médiane de zone (DLD ou grille) est toutes-chambres : on la corrige
  // selon le nombre de chambres quand on le connaît.
  const benchmarkAedSqft = Math.round(base * bedroomFactor(opts?.beds, opts?.type));

  const deltaPct = ((askingAedSqft - benchmarkAedSqft) / benchmarkAedSqft) * 100;
  const code = codeFor(deltaPct);

  return {
    code,
    deltaPct,
    askingAedSqft,
    benchmarkAedSqft,
    label: LABELS[code](deltaPct),
    basis: useDld ? 'dld' : 'benchmark',
    asOf: DLD_BENCHMARK_AS_OF,
    zone: bench.matched ? bench.zone : undefined,
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
