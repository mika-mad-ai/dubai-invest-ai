/**
 * Résolution de coordonnées pour une annonce — tout gratuit et public :
 *   1. lat/lng déjà portés par l'annonce (JSON-LD Property Finder)
 *   2. Géocodage Nominatim (OSM) du nom d'immeuble, mis en cache localStorage
 *   3. Centroïde du quartier (table interne) — précision quartier, assumée
 */

export type ResolvedPoint = {
  lat: number;
  lng: number;
  /** exact = immeuble localisé ; approx = centroïde de quartier. */
  precision: 'exact' | 'approx';
  /** Libellé de ce qui a été localisé (immeuble ou quartier). */
  label: string;
};

/** Centroïdes approximatifs des communautés couvertes par la grille DLD. */
const COMMUNITY_CENTROIDS: Record<string, [number, number]> = {
  'palm jumeirah': [25.112, 55.139],
  downtown: [25.193, 55.279],
  difc: [25.211, 55.28],
  'business bay': [25.185, 55.265],
  'city walk': [25.205, 55.262],
  'creek harbour': [25.2, 55.348],
  'dubai hills': [25.11, 55.25],
  'dubai marina': [25.077, 55.137],
  jbr: [25.078, 55.133],
  'beach residence': [25.078, 55.133],
  jlt: [25.069, 55.141],
  'lake towers': [25.069, 55.141],
  'the greens': [25.098, 55.174],
  'the views': [25.095, 55.172],
  'mbr city': [25.173, 55.295],
  'sobha hartland': [25.173, 55.295],
  'district one': [25.17, 55.29],
  meydan: [25.155, 55.3],
  'azizi riviera': [25.175, 55.31],
  'al jaddaf': [25.218, 55.332],
  jvc: [25.06, 55.21],
  'jumeirah village circle': [25.06, 55.21],
  'jumeirah village triangle': [25.047, 55.188],
  jvt: [25.047, 55.188],
  arjan: [25.062, 55.242],
  'town square': [25.0, 55.27],
  'al furjan': [25.027, 55.148],
  'discovery gardens': [25.038, 55.145],
  'dubai south': [24.886, 55.148],
  'expo city': [24.961, 55.151],
  'silicon oasis': [25.121, 55.38],
  'sports city': [25.039, 55.22],
  'motor city': [25.045, 55.238],
  'studio city': [25.036, 55.26],
  'production city': [25.035, 55.192],
  impz: [25.035, 55.192],
  'international city': [25.165, 55.408],
  'damac hills 2': [25.025, 55.395],
  akoya: [25.025, 55.395],
  'damac hills': [25.025, 55.255],
  mudon: [25.025, 55.285],
  remraam: [25.01, 55.24],
  mirdif: [25.22, 55.42],
  'the valley': [25.03, 55.51],
  'tilal al ghaf': [25.02, 55.2],
  'arabian ranches': [25.045, 55.27],
  'emirates hills': [25.07, 55.17],
  'the springs': [25.062, 55.175],
  'the meadows': [25.068, 55.168],
  'jumeirah golf estates': [25.002, 55.175],
  'jumeirah islands': [25.052, 55.152],
  'jumeirah park': [25.045, 55.16],
  'maritime city': [25.277, 55.275],
  'dubai islands': [25.303, 55.3],
  'ras al khor': [25.176, 55.332],
  'umm suqeim': [25.147, 55.198],
  satwa: [25.228, 55.272],
  zaabeel: [25.21, 55.29],
};

function communityCentroid(location: string): ResolvedPoint | null {
  const l = location.toLowerCase();
  const keys = Object.keys(COMMUNITY_CENTROIDS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (l.includes(key)) {
      const [lat, lng] = COMMUNITY_CENTROIDS[key];
      return { lat, lng, precision: 'approx', label: key };
    }
  }
  return null;
}

/**
 * « 2 BR in Binghatti Corner, JVC, Dubai » → « Binghatti Corner » :
 * le segment après « in » est presque toujours l'immeuble chez PF/Bayut.
 */
export function buildingNameFrom(title: string, location: string): string | null {
  const m = title.match(/\b(?:in|à|at)\s+([^,|–-]{3,60})/i);
  const candidate = (m?.[1] ?? location.split(',')[0] ?? '').trim();
  if (!candidate || candidate.length < 3) return null;
  if (/^\d+\s*(br|bed|ch)/i.test(candidate)) return null;
  return candidate;
}

const CACHE_KEY = 'map3d-geocode-v1';

function readCache(): Record<string, ResolvedPoint | null> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, ResolvedPoint | null>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* stockage indisponible : on vit sans cache */
  }
}

/** Géocodage Nominatim (politique d'usage : volume faible, 1 req à la fois). */
async function nominatim(query: string): Promise<ResolvedPoint | null> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ae&q=' +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const r = rows?.[0];
  if (!r) return null;
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  // Garde-fou : le résultat doit rester dans l'agglomération de Dubaï.
  if (!(lat > 24.6 && lat < 25.5 && lng > 54.8 && lng < 55.7)) return null;
  return { lat, lng, precision: 'exact', label: query };
}

/**
 * Résout la position d'une annonce. Jamais d'exception : au pire `null`
 * (et l'appelant n'affiche pas la carte).
 */
export async function resolveCoords(listing: {
  lat?: number | null;
  lng?: number | null;
  title: string;
  location: string;
}): Promise<ResolvedPoint | null> {
  if (listing.lat && listing.lng) {
    return { lat: listing.lat, lng: listing.lng, precision: 'exact', label: listing.title };
  }

  const building = buildingNameFrom(listing.title, listing.location);
  const community = listing.location.split(',')[0]?.trim() || listing.location;
  const query = building ? `${building}, ${community}, Dubai` : `${community}, Dubai`;

  const cache = readCache();
  if (query in cache) {
    const hit = cache[query];
    if (hit) return hit;
    // négatif en cache → centroïde direct
  } else {
    try {
      const geo = await nominatim(query);
      cache[query] = geo;
      writeCache(cache);
      if (geo) return geo;
    } catch {
      /* réseau indisponible → centroïde */
    }
  }

  return communityCentroid(listing.location) ?? communityCentroid(listing.title);
}
