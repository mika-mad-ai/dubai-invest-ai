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

/**
 * Côte du Golfe, de Jebel Ali à Port Rashid (approximation à ~150 m près,
 * hors fronds de Palm Jumeirah). Les vues sont toujours dites « probable /
 * possible », jamais garanties.
 */
const COASTLINE: Array<[number, number]> = [
  [24.985, 55.025],
  [25.03, 55.06],
  [25.06, 55.105],
  [25.079, 55.13],
  [25.09, 55.142],
  [25.1, 55.15],
  [25.12, 55.168],
  [25.14, 55.182],
  [25.158, 55.2],
  [25.18, 55.22],
  [25.205, 55.238],
  [25.23, 55.252],
  [25.255, 55.262],
  [25.275, 55.285],
];

/**
 * Point le plus proche sur une polyligne (projection plane locale — exacte à
 * l'échelle d'une ville). Les sommets seuls ne suffisent pas : avec des
 * sommets espacés de 2-3 km, l'azimut vers le sommet le plus proche peut
 * pointer à 90° de la vraie direction de la mer.
 */
export function nearestOnPolyline(
  lat: number,
  lng: number,
  line: Array<[number, number]>
): { lat: number; lng: number; km: number; seaward: boolean } {
  const kx = Math.cos((lat * Math.PI) / 180);
  let best = { lat: line[0][0], lng: line[0][1], km: Infinity, seaward: false };
  for (let i = 0; i < line.length - 1; i++) {
    const [aLat, aLng] = line[i];
    const [bLat, bLng] = line[i + 1];
    const ax = (aLng - lng) * kx, ay = aLat - lat;
    const bx = (bLng - lng) * kx, by = bLat - lat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const pLat = aLat + t * (bLat - aLat);
    const pLng = aLng + t * (bLng - aLng);
    const km = haversineKm(lat, lng, pLat, pLng);
    // Côte orientée SO→NE : le Golfe est à gauche du segment (produit vectoriel > 0).
    // Le point est à l'origine du repère local, d'où -ax / -ay.
    const seaward = dx * -ay - dy * -ax > 0;
    if (km < best.km) best = { lat: pLat, lng: pLng, km, seaward };
  }
  return best;
}

type Ring = Array<[number, number] | number[]>;

/** Ray casting — anneau en [lng, lat]. */
export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

type Geom =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] }
  | { type: string; coordinates?: unknown };

export function geometryContains(geom: Geom, lng: number, lat: number): boolean {
  const polys: Ring[][] =
    geom.type === 'Polygon'
      ? [(geom as { coordinates: Ring[] }).coordinates]
      : geom.type === 'MultiPolygon'
        ? (geom as { coordinates: Ring[][] }).coordinates
        : [];
  return polys.some(
    ([outer, ...holes]) => !!outer && pointInRing(lng, lat, outer) && !holes.some(h => pointInRing(lng, lat, h))
  );
}

/**
 * L'immeuble de l'annonce parmi les empreintes OSM des tuiles : celui dont
 * l'empreinte contient le point ; à défaut le plus proche à moins de ~35 m
 * (géocodage tombé sur le trottoir). Ne PAS utiliser le pixel écran : en vue
 * inclinée, une tour au premier plan masque la cible et serait choisie.
 */
export function pickBuilding<F extends { geometry: Geom; properties?: Record<string, unknown> | null }>(
  features: F[],
  lat: number,
  lng: number,
  maxKm = 0.035
): F | null {
  const containing = features.filter(f => geometryContains(f.geometry, lng, lat));
  if (containing.length) {
    // Plusieurs parties (socle + tour) : la plus haute porte le nom et la hauteur.
    return containing.sort(
      (a, b) => (Number(b.properties?.render_height) || 0) - (Number(a.properties?.render_height) || 0)
    )[0];
  }
  let best: F | null = null;
  let bestKm = maxKm;
  for (const f of features) {
    const rings =
      f.geometry.type === 'Polygon'
        ? [(f.geometry as { coordinates: Ring[] }).coordinates[0]]
        : f.geometry.type === 'MultiPolygon'
          ? (f.geometry as { coordinates: Ring[][] }).coordinates.map(p => p[0])
          : [];
    for (const ring of rings) {
      if (!ring?.length) continue;
      const cx = ring.reduce((s, p) => s + Number(p[0]), 0) / ring.length;
      const cy = ring.reduce((s, p) => s + Number(p[1]), 0) / ring.length;
      const km = haversineKm(lat, lng, cy, cx);
      if (km < bestKm) {
        bestKm = km;
        best = f;
      }
    }
  }
  return best;
}

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
  const p = nearestOnPolyline(lat, lng, COASTLINE);
  if (p.seaward) {
    // Île (Palm, Bluewaters, Dubai Islands) : la mer est tout autour, et le
    // large est à l'opposé de la côte continentale.
    const b = (bearingDeg(lat, lng, p.lat, p.lng) + 180) % 360;
    return { label: 'Mer (Golfe)', direction: compassFr(b), bearing: b, distanceKm: 0.1, likelihood: 'probable', kind: 'sea' };
  }
  const best = { d: p.km, b: bearingDeg(lat, lng, p.lat, p.lng) };
  if (best.d > 3.5) return null;
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

/** Cercle (polygone GeoJSON) de rayon `km` — halo « position approximative ». */
export function circlePolygon(lat: number, lng: number, km: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const θ = (i / steps) * 2 * Math.PI;
    const dLat = (km / R) * Math.cos(θ) * (180 / Math.PI);
    const dLng = ((km / R) * Math.sin(θ) * (180 / Math.PI)) / Math.cos((lat * Math.PI) / 180);
    pts.push([lng + dLng, lat + dLat]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}

/**
 * Agrandit légèrement une empreinte autour de son centre (facteur 1,015 ≈
 * +30 cm sur une tour de 40 m) : l'extrusion dorée passe devant les murs de
 * la tour d'origine même quand les tuiles ne portent pas d'identifiant.
 */
export function inflateGeometry<G extends { type: string; coordinates: unknown }>(geom: G, factor = 1.015): G {
  const scaleRing = (ring: number[][]) => {
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return ring.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
  };
  if (geom.type === 'Polygon') {
    return { ...geom, coordinates: (geom.coordinates as number[][][]).map(scaleRing) };
  }
  if (geom.type === 'MultiPolygon') {
    return { ...geom, coordinates: (geom.coordinates as number[][][][]).map(p => p.map(scaleRing)) };
  }
  return geom;
}
