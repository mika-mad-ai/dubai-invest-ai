/**
 * Analyse de vue d'une unité : qu'est-ce qu'on voit depuis ce point de Dubaï ?
 *
 * Tout est calculé côté client à partir de coordonnées publiques (repères
 * urbains, tracé de côte approximé). Le ton reste factuel : une vue est
 * « probable » ou « possible » selon la distance et l'orientation — jamais
 * promise, puisqu'elle dépend de l'étage et de l'exposition du lot.
 */

export type ViewInsight = {
  /** Ce qu'on voit : « Mer (Golfe) », « Burj Khalifa »… */
  label: string;
  /** Direction cardinale depuis l'unité, en français (« NO », « SE »…). */
  direction: string;
  /** Azimut en degrés depuis l'unité (0 = nord). */
  bearing: number;
  distanceKm: number;
  /** probable = proche et dégagé ; possible = visible selon étage/orientation. */
  likelihood: 'probable' | 'possible';
  kind: 'sea' | 'landmark' | 'golf' | 'water';
};

const R = 6371; // km

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const Δλ = ((bLng - aLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export function compassFr(bearing: number): string {
  return DIRS[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}

/** Côte du Golfe, approximée du sud de JBR à la lagune de Jumeirah. */
const COASTLINE: Array<[number, number]> = [
  [24.95, 54.99],
  [25.01, 55.08],
  [25.065, 55.125],
  [25.09, 55.145],
  [25.13, 55.185],
  [25.175, 55.225],
  [25.21, 55.255],
  [25.245, 55.29],
  [25.285, 55.32],
];

type Landmark = {
  label: string;
  lat: number;
  lng: number;
  /** Distance max (km) à laquelle le repère compte encore comme « vue ». */
  reach: number;
  /** En dessous de cette distance, la vue passe de possible à probable. */
  near: number;
  kind: ViewInsight['kind'];
};

const LANDMARKS: Landmark[] = [
  { label: 'Burj Khalifa', lat: 25.1972, lng: 55.2744, reach: 8, near: 2.5, kind: 'landmark' },
  { label: 'Burj Al Arab', lat: 25.1412, lng: 55.1853, reach: 5, near: 2, kind: 'landmark' },
  { label: 'Ain Dubai (Bluewaters)', lat: 25.0789, lng: 55.119, reach: 4, near: 1.5, kind: 'landmark' },
  { label: 'Palm Jumeirah', lat: 25.1124, lng: 55.139, reach: 5, near: 2, kind: 'landmark' },
  { label: 'Marina (plan d’eau)', lat: 25.0772, lng: 55.1369, reach: 1.6, near: 0.7, kind: 'water' },
  { label: 'Dubai Creek', lat: 25.2  , lng: 55.33, reach: 2.5, near: 1.2, kind: 'water' },
  { label: 'Lagune de Ras Al Khor (flamants)', lat: 25.188, lng: 55.325, reach: 2.5, near: 1.2, kind: 'water' },
  { label: 'Golf Emirates GC', lat: 25.085, lng: 55.165, reach: 1.6, near: 0.8, kind: 'golf' },
  { label: 'Golf Dubai Hills', lat: 25.095, lng: 55.246, reach: 1.8, near: 0.9, kind: 'golf' },
  { label: 'Golf Jumeirah Golf Estates', lat: 25.002, lng: 55.175, reach: 1.8, near: 0.9, kind: 'golf' },
  { label: 'Golf The Track (Meydan)', lat: 25.155, lng: 55.3, reach: 1.6, near: 0.8, kind: 'golf' },
];

/** Vue mer : point de côte le plus proche + azimut vers celui-ci. */
function seaInsight(lat: number, lng: number): ViewInsight | null {
  let best: { d: number; b: number } | null = null;
  for (const [cLat, cLng] of COASTLINE) {
    const d = haversineKm(lat, lng, cLat, cLng);
    if (!best || d < best.d) best = { d, b: bearingDeg(lat, lng, cLat, cLng) };
  }
  if (!best || best.d > 3.5) return null;
  return {
    label: 'Mer (Golfe)',
    direction: compassFr(best.b),
    bearing: best.b,
    distanceKm: Math.round(best.d * 10) / 10,
    likelihood: best.d <= 1.2 ? 'probable' : 'possible',
    kind: 'sea',
  };
}

/**
 * Vues plausibles depuis une position, triées de la plus proche à la plus
 * lointaine, mer d'abord. 4 résultats max — au-delà, c'est du bruit.
 */
export function estimateViews(lat: number, lng: number): ViewInsight[] {
  const out: ViewInsight[] = [];
  const sea = seaInsight(lat, lng);
  if (sea) out.push(sea);

  for (const lm of LANDMARKS) {
    const d = haversineKm(lat, lng, lm.lat, lm.lng);
    if (d > lm.reach || d < 0.15) continue;
    const b = bearingDeg(lat, lng, lm.lat, lm.lng);
    out.push({
      label: lm.label,
      direction: compassFr(b),
      bearing: b,
      distanceKm: Math.round(d * 10) / 10,
      likelihood: d <= lm.near ? 'probable' : 'possible',
      kind: lm.kind,
    });
  }

  out.sort((a, b) => (a.kind === 'sea' ? -1 : b.kind === 'sea' ? 1 : a.distanceKm - b.distanceKm));
  return out.slice(0, 4);
}

/** ~3,1 m par niveau dans les tours résidentielles de Dubaï. */
export function floorsFromHeight(heightM: number): number {
  return Math.max(1, Math.round(heightM / 3.1));
}

/** Secteur de vue (polygone GeoJSON) depuis l'unité vers un azimut. */
export function viewCone(
  lat: number,
  lng: number,
  bearing: number,
  opts: { spreadDeg?: number; lengthKm?: number } = {}
): GeoJSON.Feature<GeoJSON.Polygon> {
  const spread = opts.spreadDeg ?? 26;
  const len = opts.lengthKm ?? 1.1;
  const pts: Array<[number, number]> = [[lng, lat]];
  for (let a = -spread; a <= spread; a += spread / 6) {
    const θ = ((bearing + a) * Math.PI) / 180;
    const dLat = (len / R) * Math.cos(θ) * (180 / Math.PI);
    const dLng = ((len / R) * Math.sin(θ) * (180 / Math.PI)) / Math.cos((lat * Math.PI) / 180);
    pts.push([lng + dLng, lat + dLat]);
  }
  pts.push([lng, lat]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}
