/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Moteur de matching déterministe annonces ↔ profil investisseur.
 *
 * Volontairement sans LLM : le scoring doit être reproductible, auditable et gratuit.
 * Claude intervient ensuite pour *expliquer* et arbitrer, sur une liste déjà réduite
 * et déjà croisée avec les transactions DLD.
 */

import { checkPrice, netYield, type PriceCheck } from './priceCheck';
import type { Listing } from './listingsCollector';

export type MatchProfile = {
  totalBudget?: string | number;
  initialInvestment?: string | number;
  objective?: string;
  zonePreference?: string;
  riskLevel?: number;
  propertyStatus?: string;
  duration?: string | number;
  advisorId?: string;
};

export type ScoredListing = Listing & {
  matchScore: number;
  /** Raisons lisibles du score — sert la traçabilité des recommandations. */
  matchReasons: string[];
  priceCheck: PriceCheck;
  priceVerdict: string;
  netYield: number | null;
};

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(x) ? x : 0;
};

/** Quartiers regroupés par thèse d'investissement. */
const ZONE_BUCKETS: Record<string, string[]> = {
  high_yield: ['jvc', 'jumeirah village', 'jlt', 'lake towers', 'silicon oasis', 'dso', 'international city', 'discovery gardens'],
  capital_appreciation: ['downtown', 'creek harbour', 'mbr city', 'mohammed bin rashid', 'dubai hills'],
  premium_lifestyle: ['palm jumeirah', 'jbr', 'beach residence', 'dubai marina', 'bluewaters', 'la mer'],
  emerging: ['dubai south', 'al furjan', 'ras al khaimah', 'rak', 'dubailand', 'town square', 'damac hills'],
  balanced: ['business bay', 'dubai hills', 'downtown', 'al barsha', 'the greens', 'motor city'],
};

function inZone(location: string, zone?: string): boolean {
  if (!zone) return false;
  const keys = ZONE_BUCKETS[zone];
  if (!keys) return false;
  const l = (location || '').toLowerCase();
  return keys.some(k => l.includes(k));
}

/** Le budget total couvre le prix + DLD 4 % + agence 2 % + trustee. */
export function allInCost(priceEur: number): number {
  return Math.round(priceEur * 1.06 + 1100);
}

/**
 * Score 0-100. Les pondérations reflètent ce qui fait réellement échouer un dossier :
 * le budget d'abord (un bien hors budget vaut zéro), puis l'alignement de la thèse.
 */
export function scoreListing(listing: Listing, profile: MatchProfile): ScoredListing {
  const reasons: string[] = [];
  let score = 0;

  const budget = n(profile.totalBudget);
  const cost = allInCost(listing.price);

  // ── Budget : 40 points, éliminatoire au-delà de +10 % ─────────────────────
  if (!budget) {
    score += 20;
    reasons.push('budget non renseigné — score partiel');
  } else {
    const ratio = cost / budget;
    if (ratio > 1.1) {
      reasons.push(`hors budget : ${cost.toLocaleString('fr-FR')} € frais inclus vs ${budget.toLocaleString('fr-FR')} € disponibles`);
      // Pas de return : on garde l'annonce scorée bas pour pouvoir l'expliquer au prospect.
      score += 0;
    } else if (ratio > 1.0) {
      score += 22;
      reasons.push('légèrement au-dessus du budget, atteignable en négociant');
    } else if (ratio >= 0.75) {
      score += 40;
      reasons.push(`tient dans le budget frais inclus (${cost.toLocaleString('fr-FR')} €)`);
    } else if (ratio >= 0.5) {
      score += 33;
      reasons.push('bien en dessous du budget — laisse de la marge ou permet un second lot');
    } else {
      score += 24;
      reasons.push('très en dessous du budget — vérifier que le standing correspond aux attentes');
    }
  }

  // ── Contrôle prix vs marché : 20 points ──────────────────────────────────
  // On ne passe volontairement PAS `listing.marketPriceSqft` : c'est une valeur
  // interne du collecteur, à une maille grossière et d'unité incertaine. La
  // grille quartier de priceCheck est la référence, jusqu'à disposer d'une
  // agrégation DLD par quartier.
  const pc = checkPrice(listing.price, listing.sqm, listing.location, undefined, {
    beds: listing.beds,
    type: listing.type,
  });
  const priceWeights: Record<string, number> = {
    well_below: 20, below: 17, fair: 12, above: 5, well_above: 0, unknown: 8,
  };
  score += priceWeights[pc.code] ?? 8;
  if (pc.code === 'well_below' || pc.code === 'below') reasons.push(`prix ${pc.label}`);
  if (pc.code === 'above' || pc.code === 'well_above') reasons.push(`prix ${pc.label}`);

  // ── Objectif : 20 points ─────────────────────────────────────────────────
  const ny = netYield({
    priceEur: listing.price,
    grossYieldPct: listing.yield,
    sqm: listing.sqm,
    serviceChargesSqft: listing.serviceChargesSqft,
    occupancy: listing.liquidity === 'High' ? 0.94 : 0.9,
  });

  switch (profile.objective) {
    case 'rental_income':
      if (ny !== null && ny >= 6) { score += 20; reasons.push(`rendement net estimé ${ny}% — au-dessus de la cible locative`); }
      else if (ny !== null && ny >= 4.5) { score += 13; reasons.push(`rendement net estimé ${ny}%`); }
      else { score += 4; reasons.push(`rendement net faible pour un objectif de rente${ny !== null ? ` (${ny}%)` : ''}`); }
      break;
    case 'capital_gains':
      if (listing.completion !== 'Ready') { score += 16; reasons.push('off-plan — profil adapté à la plus-value pré-livraison'); }
      if (inZone(listing.location, 'capital_appreciation')) { score += 8; reasons.push('quartier à forte dynamique de valorisation'); }
      break;
    case 'secondary_residence':
      if (inZone(listing.location, 'premium_lifestyle')) { score += 18; reasons.push('quartier adapté à la location courte durée haut de gamme'); }
      else score += 7;
      break;
    case 'golden_visa':
      // Seuil Golden Visa : 2 M AED ≈ 472 000 €
      if (listing.price >= 472000) { score += 20; reasons.push('prix au-dessus du seuil Golden Visa (2 M AED)'); }
      else { score += 2; reasons.push(`sous le seuil Golden Visa — ${(472000 - listing.price).toLocaleString('fr-FR')} € manquants`); }
      break;
    case 'diversification':
      if (listing.liquidity === 'High') { score += 18; reasons.push('forte liquidité à la revente'); }
      else score += 9;
      break;
    default:
      score += 10;
  }

  // ── Zone souhaitée : 10 points ───────────────────────────────────────────
  if (inZone(listing.location, profile.zonePreference)) {
    score += 10;
    reasons.push('correspond à la préférence de quartier exprimée');
  } else if (profile.zonePreference) {
    score += 2;
  } else {
    score += 5;
  }

  // ── Risque ↔ nature du bien : 10 points ──────────────────────────────────
  const risk = n(profile.riskLevel) || 3;
  const isOffPlan = listing.completion !== 'Ready';
  if (isOffPlan && risk >= 4) { score += 10; reasons.push('off-plan cohérent avec un profil dynamique'); }
  else if (!isOffPlan && risk <= 2) { score += 10; reasons.push('bien livré, revenu immédiat — cohérent avec un profil prudent'); }
  else if (isOffPlan && risk <= 2) { score += 2; reasons.push('off-plan alors que le profil est prudent — risque de livraison à expliquer'); }
  else score += 6;

  return {
    ...listing,
    matchScore: Math.max(0, Math.min(100, Math.round(score))),
    matchReasons: reasons,
    priceCheck: pc,
    priceVerdict: pc.label,
    netYield: ny,
  };
}

/** Score, trie et tronque. `limit` borne ce qui part dans le contexte de Claude. */
export function matchListings(listings: Listing[], profile: MatchProfile, limit = 8): ScoredListing[] {
  return listings
    .map(l => scoreListing(l, profile))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}
