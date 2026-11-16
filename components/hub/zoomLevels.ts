/**
 * Logique pure de l'interface carte : quel niveau d'analyse correspond à quel
 * zoom, où placer la caméra pour chaque niveau, et quels quartiers afficher.
 * Aucune dépendance au navigateur : testé par `scripts/verify-hub.mjs`.
 */
import { APARTMENT_AED_SQFT, resolveBenchmark } from '../../api/lib/dldBenchmarks';
import { communityCentroid } from '../map3d/geocode';

export type HubLevel = 'city' | 'district' | 'building' | 'unit';

export const HUB_LEVELS: Array<{ id: HubLevel; label: string; hint: string; minZoom: number }> = [
  { id: 'city', label: 'Ville', hint: 'Le marché de Dubaï face à votre profil', minZoom: 0 },
  { id: 'district', label: 'Quartier', hint: 'Prix DLD et location dans la zone', minZoom: 11.8 },
  { id: 'building', label: 'Immeuble', hint: 'La tour, ses vues, son environnement', minZoom: 14.8 },
  { id: 'unit', label: 'Appartement', hint: 'Le bien : prix, trésorerie, frais', minZoom: 16.9 },
];

/** Niveau d'analyse affiché pour un zoom donné. */
export function levelForZoom(zoom: number): HubLevel {
  let current: HubLevel = 'city';
  for (const l of HUB_LEVELS) if (zoom >= l.minZoom) current = l.id;
  return current;
}

export type CameraPose = { center: [number, number]; zoom: number; pitch: number; bearing: number };

/** Vue d'ensemble : toute l'agglomération, de Jebel Ali à la Creek. */
export const CITY_POSE: CameraPose = { center: [55.235, 25.115], zoom: 10.3, pitch: 38, bearing: -18 };

/**
 * Pose de caméra pour un niveau, centrée sur un point (le bien ou un quartier).
 * `viewBearing` oriente la caméra vers la meilleure vue de l'unité aux niveaux
 * rapprochés ; à l'échelle du quartier on garde un cap fixe, plus lisible.
 */
export function cameraFor(
  level: HubLevel,
  point: { lat: number; lng: number; precision?: 'exact' | 'approx' } | null,
  viewBearing = 24
): CameraPose {
  if (level === 'city' || !point) return CITY_POSE;
  const center: [number, number] = [point.lng, point.lat];
  if (level === 'district') return { center, zoom: 13.4, pitch: 50, bearing: -12 };
  // Position approximative (centroïde de quartier) : zoomer sur un immeuble
  // pris au hasard serait trompeur, on reste un cran plus haut.
  const approx = point.precision === 'approx';
  if (level === 'building') return { center, zoom: approx ? 15 : 16.3, pitch: 64, bearing: viewBearing };
  return { center, zoom: approx ? 17 : 17.3, pitch: 66, bearing: viewBearing };
}

export type DistrictPoint = {
  /** Clé de la grille DLD (minuscules). */
  key: string;
  label: string;
  lat: number;
  lng: number;
  /** Médiane AED/sqft, revente appartements, 12 mois. */
  aedSqft: number;
  zone: string;
  volume12m: number;
};

const LABELS: Record<string, string> = {
  jvc: 'JVC',
  jvt: 'JVT',
  jlt: 'JLT',
  jbr: 'JBR',
  difc: 'DIFC',
  impz: 'IMPZ',
  'mbr city': 'MBR City',
};

export function districtLabel(key: string): string {
  return LABELS[key] ?? key.replace(/\b[a-z]/g, c => c.toUpperCase());
}

/**
 * Quartiers affichables sur la carte : entrées de la grille DLD appartements
 * dont on connaît le centroïde. Les alias d'une même zone (« jvc » et
 * « jumeirah village circle ») ne donnent qu'un point, au libellé le plus court.
 * Triés par volume de transactions décroissant : c'est l'ordre de priorité
 * d'affichage quand les étiquettes se chevauchent.
 */
export function districtPoints(): DistrictPoint[] {
  const byZone = new Map<string, DistrictPoint>();
  for (const [key, entry] of Object.entries(APARTMENT_AED_SQFT)) {
    if (key === 'other') continue;
    const c = communityCentroid(key);
    if (!c) continue;
    const point: DistrictPoint = {
      key,
      label: districtLabel(key),
      lat: c.lat,
      lng: c.lng,
      aedSqft: entry.aedSqft,
      zone: entry.zone,
      volume12m: entry.volume12m,
    };
    const prev = byZone.get(entry.zone);
    if (!prev || key.length < prev.key.length) byZone.set(entry.zone, point);
  }
  return [...byZone.values()].sort((a, b) => b.volume12m - a.volume12m);
}

/** Quartier (point de la carte) auquel appartient une annonce, s'il est connu. */
export function districtOf(location: string, type?: string | null, points = districtPoints()): DistrictPoint | null {
  const m = resolveBenchmark(location, type);
  if (!m.matched) return null;
  return points.find(p => p.zone === m.zone) ?? null;
}

/** Rang de prix d'un quartier : part des quartiers affichés moins chers que lui (0-100). */
export function pricePercentile(d: DistrictPoint, points = districtPoints()): number {
  if (points.length < 2) return 50;
  const cheaper = points.filter(p => p.aedSqft < d.aedSqft).length;
  return Math.round((cheaper / (points.length - 1)) * 100);
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * Anti-chevauchement des étiquettes : parcourt les boîtes dans l'ordre de
 * priorité et ne garde que celles qui ne recouvrent aucune boîte déjà gardée.
 * Renvoie les index conservés.
 */
export function placeWithoutOverlap(boxes: Array<Box | null>, gap = 4): Set<number> {
  const kept: Box[] = [];
  const out = new Set<number>();
  boxes.forEach((b, i) => {
    if (!b) return;
    const hit = kept.some(
      k => b.x < k.x + k.w + gap && b.x + b.w + gap > k.x && b.y < k.y + k.h + gap && b.y + b.h + gap > k.y
    );
    if (!hit) {
      kept.push(b);
      out.add(i);
    }
  });
  return out;
}

// ── L'appartement dans la tour ────────────────────────────────────────────

export type FloorGuess = {
  floor: number;
  /** 'listing' : l'annonce donne l'étage ; 'hint' : elle dit « étage élevé / bas » ; 'unknown' : rien. */
  source: 'listing' | 'hint' | 'unknown';
};

/**
 * Étage de l'appartement d'après le titre de l'annonce. Sans indication, on
 * part du milieu de la tour et l'interface dit clairement que c'est au
 * visiteur de le régler : on n'invente pas un étage.
 */
export function floorFromListing(title: string, floors: number): FloorGuess {
  const clamp = (n: number) => Math.min(Math.max(1, Math.round(n)), Math.max(1, floors));
  const t = title.toLowerCase();
  const exact =
    t.match(/(\d{1,3})\s*(?:st|nd|rd|th|e|er|ème|eme)?\s*(?:floor|étage|etage)\b/) ?? t.match(/(?:floor|étage|etage)\s*(?:n°|no\.?|#)?\s*(\d{1,3})\b/);
  if (exact) {
    const n = Number(exact[1]);
    if (n >= 1 && n <= 200) return { floor: clamp(n), source: 'listing' };
  }
  if (/penthouse|top floor|dernier étage/.test(t)) return { floor: clamp(floors), source: 'hint' };
  if (/high(?:er)? floor|étage élevé|etage eleve/.test(t)) return { floor: clamp(floors * 0.8), source: 'hint' };
  if (/mid(?:dle)? floor|étage intermédiaire/.test(t)) return { floor: clamp(floors * 0.5), source: 'hint' };
  if (/low(?:er)? floor|étage bas|ground floor|rez-de-chaussée/.test(t)) return { floor: clamp(floors * 0.15), source: 'hint' };
  return { floor: clamp(floors * 0.5), source: 'unknown' };
}

/** Altitudes (m) du plancher et du plafond d'un étage, pour une tour de hauteur connue. */
export function floorSpan(floor: number, floors: number, heightM: number, baseM = 0): { bottom: number; top: number } {
  const n = Math.max(1, floors);
  const per = Math.max(0, heightM - baseM) / n;
  const f = Math.min(Math.max(1, floor), n);
  return { bottom: baseM + (f - 1) * per, top: baseM + f * per };
}

/** Part (0-100) des immeubles voisins dont le sommet est sous une altitude donnée. */
export function dominance(altitudeM: number, neighbourHeights: number[]): number | null {
  if (neighbourHeights.length < 5) return null;
  const below = neighbourHeights.filter(h => h < altitudeM).length;
  return Math.round((below / neighbourHeights.length) * 100);
}
