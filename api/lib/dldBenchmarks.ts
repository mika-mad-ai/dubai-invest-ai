/**
 * Grilles de référence AED/sqft issues de l'agrégation DLD (connecteur DXB
 * interact) — médianes des transactions de REVENTE des 12 derniers mois.
 * Le sur-plan est volontairement exclu : il gonfle les médianes (ex. Dubai
 * South : 1 664 toutes ventes vs 1 223 en revente réelle).
 *
 * ⚠️ Données figées à la date ci-dessous. À recaler périodiquement via le
 * connecteur (mode opératoire : mémoire projet `dxb-interact-mcp`).
 *
 * Chaque entrée porte la zone DLD officielle source et le volume de
 * transactions 12 mois : en dessous de ~100 transactions, la médiane est
 * fragile — en cas de doute, préférer le repli `other`.
 */

export const DLD_BENCHMARK_AS_OF = '2026-11-05';

export type BenchmarkEntry = {
  /** Médiane AED/sqft, revente, 12 mois glissants. */
  aedSqft: number;
  /** Zone DLD officielle d'où vient la médiane. */
  zone: string;
  /** Volume de transactions revente sur la fenêtre. */
  volume12m: number;
};

const E = (aedSqft: number, zone: string, volume12m: number): BenchmarkEntry => ({
  aedSqft,
  zone,
  volume12m,
});

/**
 * Appartements. Clés = noms marketing tels qu'ils apparaissent dans les
 * libellés Property Finder / Bayut (minuscules). Plusieurs alias peuvent
 * pointer vers la même zone DLD.
 */
export const APARTMENT_AED_SQFT: Record<string, BenchmarkEntry> = {
  'palm jumeirah': E(2796, 'Palm Jumeirah', 850),
  downtown: E(2705, 'Downtown Dubai', 2009),
  difc: E(2509, 'DIFC', 91),
  zaabeel: E(2672, 'Zaabeel Second', 136),
  "za'abeel": E(2672, 'Zaabeel Second', 136),
  'city walk': E(2806, 'Al Wasl', 516),
  'al wasl': E(2806, 'Al Wasl', 516),
  'madinat jumeirah living': E(2756, 'Um Suqaim Third', 232),
  'umm suqeim': E(2756, 'Um Suqaim Third', 232),
  'um suqaim': E(2756, 'Um Suqaim Third', 232),
  'creek harbour': E(2357, 'Dubai Creek Harbour', 1517),
  'dubai islands': E(2328, 'Dubai Islands', 94),
  'dubai hills': E(2295, 'Hadaeq Sheikh Mohammed Bin Rashid', 1376),
  'ras al khor': E(2282, 'Ras Al Khor', 152),
  'maritime city': E(2182, 'Madinat Dubai Almelaheyah', 312),
  'dubai marina': E(2115, 'Marsa Dubai', 3023),
  'hartland ii': E(2420, 'Bukadra', 252),
  'hartland 2': E(2420, 'Bukadra', 252),
  satwa: E(2029, 'Al Satwa', 29),
  'business bay': E(1993, 'Business Bay', 3240),
  'mbr city': E(1992, 'Al Merkadh', 2065),
  'mohammed bin rashid': E(1992, 'Al Merkadh', 2065),
  'sobha hartland': E(1992, 'Al Merkadh', 2065),
  'district one': E(1992, 'Al Merkadh', 2065),
  'al kifaf': E(1996, 'Al Kifaf', 140),
  wasl1: E(1996, 'Al Kifaf', 140),
  'the greens': E(1883, 'Al Thanyah Third', 508),
  'the views': E(1883, 'Al Thanyah Third', 508),
  jbr: E(1690, 'Jumeirah Beach Residence, Marsa Dubai', 444),
  'beach residence': E(1690, 'Jumeirah Beach Residence, Marsa Dubai', 444),
  jaddaf: E(1667, 'Al Jaddaf', 396),
  meydan: E(1536, 'Nad Al Sheba First', 161),
  'azizi riviera': E(1536, 'Nad Al Sheba First', 161),
  'nad al sheba': E(1536, 'Nad Al Sheba First', 161),
  jlt: E(1474, 'Al Thanyah Fifth', 1198),
  'lake towers': E(1474, 'Al Thanyah Fifth', 1198),
  'studio city': E(1418, 'Al Hebiah Second', 347),
  'jumeirah village triangle': E(1413, 'Al Barsha South Fifth', 562),
  jvt: E(1413, 'Al Barsha South Fifth', 562),
  arjan: E(1396, 'Al Barsha South Third', 1431),
  'town square': E(1336, 'Al Yelayiss 2', 900),
  'al furjan': E(1290, 'Al Furjan, Jabal Ali First', 843),
  'jumeirah village circle': E(1290, 'Al Barsha South Fourth', 4031),
  'jumeirah village': E(1290, 'Al Barsha South Fourth', 4031),
  jvc: E(1290, 'Al Barsha South Fourth', 4031),
  'damac hills 2': E(1109, 'Madinat Hind 4', 146),
  akoya: E(1109, 'Madinat Hind 4', 146),
  'damac hills': E(1353, 'Al Hebiah Third', 550),
  'dubai south': E(1223, 'Dubai South (Madinat Al Mataar)', 716),
  'expo city': E(1223, 'Dubai South (Madinat Al Mataar)', 716),
  liwan: E(1131, 'Wadi Al Safa 7', 83),
  mirdif: E(1107, 'Mirdif', 79),
  'production city': E(1068, "Me'Aisem First", 918),
  impz: E(1068, "Me'Aisem First", 918),
  'sports city': E(996, 'Al Hebiah Fourth', 1207),
  'silicon oasis': E(976, 'Nadd Hessa', 868),
  'motor city': E(973, 'Al Hebiah First', 563),
  'investment park': E(1000, 'Dubai Investment Park 1+2 (volumes faibles)', 183),
  'discovery gardens': E(920, 'Discovery Gardens, Jabal Ali First', 480),
  'international city': E(657, 'Al Warsan First', 1272),
  warsan: E(971, 'Warsan Fourth', 200),
  // Médiane Dubaï toutes zones, appartements revente 12 mois.
  other: E(1550, 'Dubaï (toutes zones)', 37521),
};

/**
 * Villas / townhouses. Le psf villa n'a rien à voir avec le psf appartement
 * de la même zone (Palm : 7 061 vs 2 796) — d'où une grille séparée.
 */
export const VILLA_AED_SQFT: Record<string, BenchmarkEntry> = {
  'palm jumeirah': E(7061, 'Palm Jumeirah', 76),
  'emirates hills': E(3298, 'Emirates Living', 104),
  'emirates living': E(3298, 'Emirates Living', 104),
  'the springs': E(3298, 'Emirates Living', 104),
  'the meadows': E(3298, 'Emirates Living', 104),
  'the lakes': E(3298, 'Emirates Living', 104),
  'dubai hills': E(3016, 'Hadaeq Sheikh Mohammed Bin Rashid', 167),
  'district one': E(2887, 'Al Merkadh', 78),
  'mbr city': E(2887, 'Al Merkadh', 78),
  'palm jebel ali': E(2633, 'Palm Jebel Ali (reventes sur plan)', 65),
  'arabian ranches 2': E(1784, 'Wadi Al Safa 7', 148),
  'arabian ranches 3': E(1635, 'Wadi Al Safa 5', 249),
  'arabian ranches': E(2535, 'Wadi Al Safa 6', 130),
  'jumeirah golf estates': E(2446, "Me'Aisem First", 133),
  'jumeirah islands': E(2304, 'Al Thanyah Fifth', 190),
  'jumeirah park': E(2304, 'Al Thanyah Fifth', 190),
  'victory heights': E(2047, 'Al Hebiah Fourth', 379),
  'sports city': E(2047, 'Al Hebiah Fourth', 379),
  'nad al sheba': E(2030, 'Nad Al Sheba First', 124),
  meydan: E(2030, 'Nad Al Sheba First', 124),
  'tilal al ghaf': E(1799, "Me'Aisem Second", 86),
  villanova: E(1829, 'Wadi Al Safa 3', 144),
  'al furjan': E(1745, 'Jabal Ali First', 324),
  'damac hills 2': E(850, 'Madinat Hind 4', 409),
  akoya: E(850, 'Madinat Hind 4', 409),
  'damac hills': E(1745, 'Al Hebiah Third', 287),
  'damac lagoons': E(1715, 'Al Hebiah Sixth', 63),
  'dubai islands': E(1634, 'Dubai Islands', 44),
  'dubai south': E(1491, 'Dubai South (Madinat Al Mataar)', 85),
  'the valley': E(1187, 'Al Yufrah 1', 149),
  mira: E(1097, 'Al Yelayiss 1', 165),
  reem: E(1097, 'Al Yelayiss 1', 165),
  mudon: E(1249, 'Al Hebiah Fifth', 1066),
  remraam: E(1249, 'Al Hebiah Fifth', 1066),
  jvc: E(1120, 'Al Barsha South Fourth', 94),
  'jumeirah village circle': E(1120, 'Al Barsha South Fourth', 94),
  // Médiane pondérée approximative des zones villa ci-dessus.
  other: E(1600, 'Dubaï (zones villa agrégées)', 4700),
};

/**
 * Correctif par nombre de chambres (appartements uniquement), relatif à la
 * médiane toutes-chambres de la zone. Mesuré sur JVC et Business Bay
 * (revente 12 mois), cohérents entre eux à ±3 points :
 *   studio  JVC 1 490/1 290 = 1,16   BB 2 230/1 993 = 1,12
 *   1 ch.   JVC 1 250/1 290 = 0,97   BB 2 020/1 993 = 1,01
 *   2 ch.   JVC 1 170/1 290 = 0,91   BB 1 780/1 993 = 0,89
 *   3 ch.   JVC 1 130/1 290 = 0,88   BB 1 720/1 993 = 0,86
 */
export const BEDROOM_FACTOR: Record<number, number> = {
  0: 1.14,
  1: 0.99,
  2: 0.9,
  3: 0.87,
};
/** Au-delà de 3 chambres, même décote qu'un 3 ch. (échantillon trop mince). */
export const BEDROOM_FACTOR_4PLUS = 0.87;

/** Clés triées de la plus longue à la plus courte : le plus spécifique gagne
 *  (« damac hills 2 » avant « damac hills », « jumeirah village triangle »
 *  avant « jumeirah village »). */
function sortedKeys(grid: Record<string, BenchmarkEntry>): string[] {
  return Object.keys(grid)
    .filter(k => k !== 'other')
    .sort((a, b) => b.length - a.length);
}

const APARTMENT_KEYS = sortedKeys(APARTMENT_AED_SQFT);
const VILLA_KEYS = sortedKeys(VILLA_AED_SQFT);

export type BenchmarkMatch = {
  value: number;
  key: string;
  zone: string;
  volume12m: number;
  grid: 'apartment' | 'villa';
  /** false = repli `other`, la zone n'a pas été reconnue. */
  matched: boolean;
};

function lookup(
  grid: Record<string, BenchmarkEntry>,
  keys: string[],
  l: string
): { key: string; entry: BenchmarkEntry } | null {
  for (const key of keys) {
    if (l.includes(key)) return { key, entry: grid[key] };
  }
  return null;
}

function isVillaType(type?: string | null): boolean {
  const t = (type || '').toLowerCase();
  return t.includes('villa') || t.includes('townhouse') || t.includes('town house');
}

/**
 * Résout la référence AED/sqft pour une annonce : grille villa ou appartement
 * selon le type, zone la plus spécifique d'abord, repli `other` sinon.
 * Une villa dans une zone sans donnée villa retombe sur la médiane appartement
 * de la zone (signal de localisation > repli ville).
 */
export function resolveBenchmark(location: string, type?: string | null): BenchmarkMatch {
  const l = (location || '').toLowerCase();

  if (isVillaType(type)) {
    const hit = lookup(VILLA_AED_SQFT, VILLA_KEYS, l);
    if (hit) {
      return { value: hit.entry.aedSqft, key: hit.key, zone: hit.entry.zone, volume12m: hit.entry.volume12m, grid: 'villa', matched: true };
    }
    const apt = lookup(APARTMENT_AED_SQFT, APARTMENT_KEYS, l);
    if (apt) {
      return { value: apt.entry.aedSqft, key: apt.key, zone: apt.entry.zone, volume12m: apt.entry.volume12m, grid: 'apartment', matched: true };
    }
    const o = VILLA_AED_SQFT.other;
    return { value: o.aedSqft, key: 'other', zone: o.zone, volume12m: o.volume12m, grid: 'villa', matched: false };
  }

  const hit = lookup(APARTMENT_AED_SQFT, APARTMENT_KEYS, l);
  if (hit) {
    return { value: hit.entry.aedSqft, key: hit.key, zone: hit.entry.zone, volume12m: hit.entry.volume12m, grid: 'apartment', matched: true };
  }
  const o = APARTMENT_AED_SQFT.other;
  return { value: o.aedSqft, key: 'other', zone: o.zone, volume12m: o.volume12m, grid: 'apartment', matched: false };
}

/**
 * Correctif chambre, appliqué uniquement aux appartements et studios : la
 * médiane de zone est toutes-chambres, or un studio se paie ~14 % plus cher
 * au sqft et un 3 ch. ~13 % moins cher. Penthouses exclus (prime non modélisée),
 * villas exclues (le psf villa dépend peu du nombre de chambres).
 */
export function bedroomFactor(beds?: number | null, type?: string | null): number {
  const t = (type || '').toLowerCase();
  if (isVillaType(type) || t.includes('penthouse')) return 1;
  if (beds == null || !Number.isFinite(beds) || beds < 0) return 1;
  if (beds >= 4) return BEDROOM_FACTOR_4PLUS;
  return BEDROOM_FACTOR[Math.round(beds)] ?? 1;
}
