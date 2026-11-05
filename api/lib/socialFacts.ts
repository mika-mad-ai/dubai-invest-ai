/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Faits du jour pour le post social — ce qui a CHANGÉ sur le marché.
 *
 * Remplace les agrégats sur toute la table (meilleur rendement, ticket le plus
 * bas, quartier premium) qui produisaient un carrousel identique jour après
 * jour : entre le 16 et le 19 septembre 2026, la seule variation visible était
 * un prix moyen passant de 258 716 € à 259 644 €.
 *
 * Trois garanties de nouveauté, dans cet ordre :
 *   1. les faits portent sur les dernières 24 h (annonces inédites, baisses de
 *      prix), pas sur l'historique complet ;
 *   2. tout ce qui a déjà été publié est exclu via `social_published` — annonces
 *      et photos comprises ;
 *   3. l'angle éditorial tourne, donc deux jours de suite n'ont pas la même
 *      structure même si le marché est calme.
 *
 * Les visuels viennent des photos réelles des annonces, pas d'une banque de
 * stock : il y en a près de 10 000 et elles se renouvellent chaque nuit.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

const AED_TO_EUR = 1 / 4.24;
/** Au-delà, on considère que l'historique est trop vieux pour un diff utile. */
import { screenListings, originalVariant } from './watermark';

const SNAPSHOT_KEEP_DAYS = 14;
/** Une baisse doit atteindre ce seuil pour mériter une slide. */
const DROP_FLOOR_PCT = 4;
/** Nombre de jours d'exclusion : on ne republie pas une annonce vue récemment. */
const EXCLUDE_WINDOW_DAYS = 30;

export type FactKind = 'fresh_supply' | 'best_new' | 'price_drop' | 'entry_ticket' | 'premium_new' | 'zone_surge';

export interface Fact {
  kind: FactKind;
  /** Sur-titre de la slide. */
  kicker: string;
  /** Ligne principale (quartier, nom du quartier…). */
  headline: string;
  /** Chiffre héros. */
  value: string;
  /** 1 à 2 lignes de contexte. */
  context: string[];
  /** Photo réelle illustrant le fait. */
  photoUrl?: string;
  /** Annonce d'origine, pour l'exclusion future. */
  listingId?: string;
  /** Sert au tri : plus c'est haut, plus le fait est saillant. */
  weight: number;
}

export interface DayFacts {
  date: string;
  newLast24h: number;
  totalListings: number;
  facts: Fact[];
  coverPhotoUrl?: string;
  listingIds: string[];
  photoUrls: string[];
  angle: string;
}

// ─── Accès Supabase ─────────────────────────────────────────────────────────

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

export function hasStore(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_KEY;
}

async function sb(path: string, init?: RequestInit): Promise<{ ok: boolean; rows: any[]; range: string | null }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(12_000),
  });
  const range = res.headers.get('content-range');
  if (!res.ok) {
    console.error('[socialFacts]', path.slice(0, 60), res.status, (await res.text()).slice(0, 160));
    return { ok: false, rows: [], range };
  }
  const text = await res.text();
  return { ok: true, rows: text ? JSON.parse(text) : [], range };
}

/** `fr-FR` groupe les milliers avec U+202F, absent des polices embarquees :
 *  rendu tel quel, satori dessine un tofu. On normalise vers l'espace ASCII. */
export const num = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/\p{Zs}/gu, ' ');
const eur = (n: number) => `${num(n)} €`;
const today = () => new Date().toISOString().slice(0, 10);
/** Une part notable du stock est en studio, et « 0 ch » se lit comme un bug. */
const rooms = (n: number) => (n > 0 ? `${n} ch` : 'studio');

/** Première photo exploitable d'une annonce. */
function photoOf(row: any): string | undefined {
  let url: string | undefined;
  if (Array.isArray(row?.images) && row.images.length) {
    url = row.images.find((u: any) => typeof u === 'string' && u.startsWith('http'));
  }
  if (!url && typeof row?.image === 'string' && row.image.startsWith('http')) url = row.image;
  // `original.jpg` : plus grand que la vignette 668 px servie par défaut, et
  // exempt du filigrane que le CDN incruste sur les variantes redimensionnées.
  return url ? originalVariant(url) : undefined;
}

/** Toutes les photos d'un bien, pour l'analyse de filigrane. */
function photosOf(row: any): string[] {
  const all = Array.isArray(row?.images) ? row.images : [];
  return all.filter((u: any) => typeof u === 'string' && u.startsWith('http'));
}

// ─── Historique : exclusions et prix de la veille ───────────────────────────

/** Annonces et photos déjà publiées sur les 30 derniers jours. */
async function loadExclusions(): Promise<{ listingIds: Set<string>; photoUrls: Set<string>; lastAngles: string[] }> {
  const since = new Date(Date.now() - EXCLUDE_WINDOW_DAYS * 864e5).toISOString();
  const { rows } = await sb(`social_published?select=angle,listing_ids,photo_urls&created_at=gte.${since}&order=created_at.desc`);
  const listingIds = new Set<string>();
  const photoUrls = new Set<string>();
  const lastAngles: string[] = [];
  for (const r of rows) {
    for (const id of r.listing_ids ?? []) listingIds.add(String(id));
    for (const u of r.photo_urls ?? []) photoUrls.add(String(u));
    if (r.angle) lastAngles.push(String(r.angle));
  }
  return { listingIds, photoUrls, lastAngles };
}

/** Carte id → prix de la photographie la plus récente antérieure à aujourd'hui. */
async function loadPreviousPrices(): Promise<Record<string, number>> {
  const { rows } = await sb(`social_price_snapshots?select=day,prices&day=lt.${today()}&order=day.desc&limit=1`);
  return rows[0]?.prices ?? {};
}

/**
 * Enregistre la photographie du jour pour que DEMAIN puisse détecter les baisses.
 * Sans elle, la slide « baisse de prix » ne sortira jamais.
 */
async function savePriceSnapshot(prices: Record<string, number>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/social_price_snapshots`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ day: today(), prices, listing_n: Object.keys(prices).length }]),
    signal: AbortSignal.timeout(15_000),
  }).catch(err => console.error('[socialFacts] snapshot', err?.message));

  // Purge : l'historique au-delà de 14 jours ne sert à rien et pèse en base.
  const cutoff = new Date(Date.now() - SNAPSHOT_KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  await fetch(`${SUPABASE_URL}/rest/v1/social_price_snapshots?day=lt.${cutoff}`, {
    method: 'DELETE', headers: headers(), signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

// ─── Chargement des annonces ────────────────────────────────────────────────

/**
 * Pagination explicite : PostgREST plafonne les réponses, et l'ancien
 * `limit=2000` sans tri calculait les statistiques sur un tiers arbitraire de
 * la table. On parcourt tout, par tranches, dans un ordre déterministe.
 */
async function loadAllListings(): Promise<any[]> {
  const cols = 'id,location,district_id,price_eur,yield_pct,beds,sqm,completion,image,images,scraped_at,updated_at';
  const out: any[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 20_000; offset += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/listings?select=${cols}&order=id.asc&offset=${offset}&limit=${PAGE}`, {
      headers: headers(), signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) break;
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// ─── Construction des faits ─────────────────────────────────────────────────

const ZONE_CLEAN = (loc: string) =>
  (loc || '').split(',').map(s => s.trim()).filter(Boolean).slice(-2, -1)[0]
  || (loc || '').split(',')[0]?.trim()
  || 'Dubaï';

/**
 * Candidats proposés par chaque famille, tous sur des quartiers distincts.
 *
 * Dimensionné par le taux de rejet du contrôle de filigrane : environ quatre
 * photos d'annonce sur cinq portent une marque d'agence. Avec 4 candidats, deux
 * slides sur trois sortaient sans photo ; à 16, la probabilité qu'une famille
 * n'ait aucun candidat illustrable tombe sous 3 %.
 */
const CANDIDATES_PER_FAMILY = 16;

/** Angles éditoriaux, tournés pour que la structure ne se répète pas. */
const ANGLES = ['arrivages', 'bonnes-affaires', 'contrastes', 'mouvements'] as const;

/** Ce que la sélection a retenu, plus ce qu'elle a consommé — la couverture
 *  doit éviter les mêmes annonces et les mêmes photos. */
export interface Selection { chosen: Fact[]; usedIds: Set<string>; usedPhotos: Set<string> }

/**
 * Retient trois faits : trois familles différentes, trois quartiers différents,
 * trois annonces différentes.
 *
 * La contrainte de quartier est le cœur : le quartier qui domine l'arrivage
 * remporte mécaniquement tous les classements du jour (rendement, ticket
 * d'entrée, volume), et le carrousel sortait alors trois fois le même nom.
 *
 * Exporté pour `scripts/verify-social.mjs` — la sélection est la seule partie
 * de ce module qui se teste sans base.
 */
export function selectFacts(families: Fact[][], limit = 3): Selection {
  const ranked = families.filter(f => f.length).sort((a, b) => b[0].weight - a[0].weight);
  const chosen: Fact[] = [];
  const usedZones = new Set<string>();
  const usedIds = new Set<string>();
  const usedPhotos = new Set<string>();

  const take = (f: Fact) => {
    chosen.push(f);
    usedZones.add(f.headline);
    if (f.listingId) usedIds.add(f.listingId);
    if (f.photoUrl) usedPhotos.add(f.photoUrl);
  };
  const free = (f: Fact) =>
    !(f.listingId && usedIds.has(f.listingId)) && !(f.photoUrl && usedPhotos.has(f.photoUrl));

  // Premier passage : on exige une photo. Le contrôle de filigrane en retire à
  // certains candidats, et une slide illustrée vaut mieux qu'une slide sobre —
  // à condition de ne pas sacrifier la diversité de quartier pour l'obtenir.
  for (const fam of ranked) {
    if (chosen.length >= limit) break;
    const pick = fam.find(c => c.photoUrl && !usedZones.has(c.headline) && free(c));
    if (pick) take(pick);
  }
  // Deuxième passage : compléter avec les familles restées muettes, photo ou non.
  for (const fam of ranked) {
    if (chosen.length >= limit) break;
    if (chosen.some(c => c.kind === fam[0].kind)) continue;
    const pick = fam.find(c => !usedZones.has(c.headline) && free(c));
    if (pick) take(pick);
  }
  // Dernier passage : un marché très concentré peut ne pas offrir assez de
  // quartiers distincts. On relâche alors la contrainte de zone, jamais celle
  // d'annonce ni de photo — deux slides sur la même image se verraient bien plus.
  for (const fam of ranked) {
    if (chosen.length >= limit) break;
    if (chosen.some(c => c.kind === fam[0].kind)) continue;
    const pick = fam.find(free);
    if (pick) take(pick);
  }
  return { chosen, usedIds, usedPhotos };
}

/**
 * Formulations volontairement à l'échelle du QUARTIER, jamais de la ville.
 *
 * Depuis que la sélection impose trois quartiers distincts, le fait retenu pour
 * une famille n'est plus le maximum de la ville : c'est le maximum d'un quartier
 * encore libre. Les anciens libellés (« Le ticket d'entrée du jour », « Le
 * quartier le plus actif ») sont alors devenus faux — 361 446 € annoncés comme
 * ticket d'entrée quand le vrai minimum du jour était 137 349 €. Sur un compte
 * qui vend du conseil en investissement, une accroche invérifiable coûte plus
 * cher qu'elle ne rapporte.
 */
export async function computeDayFacts(): Promise<DayFacts | null> {
  if (!hasStore()) return null;

  const [listings, exclusions, prevPrices] = await Promise.all([
    loadAllListings(), loadExclusions(), loadPreviousPrices(),
  ]);
  if (listings.length < 50) return null;

  // Photographie du jour, pour les diffs de demain.
  const snapshot: Record<string, number> = {};
  for (const l of listings) if (l.price_eur > 0) snapshot[l.id] = l.price_eur;
  void savePriceSnapshot(snapshot);

  const dayMs = 864e5;
  const isFresh = (l: any) => l.scraped_at && Date.now() - new Date(l.scraped_at).getTime() < dayMs;
  const usable = (l: any) =>
    l.price_eur > 50_000 && photoOf(l) &&
    !exclusions.listingIds.has(String(l.id)) &&
    !exclusions.photoUrls.has(photoOf(l)!);

  const fresh = listings.filter(l => isFresh(l) && usable(l));
  // Repli : si la nuit n'a rien ramené, on élargit à la semaine plutôt que de
  // retomber sur les agrégats statiques qui posaient problème.
  const pool = fresh.length >= 8 ? fresh : listings.filter(l => usable(l)).slice(-2000);

  // ─── Candidats, par famille de fait ───────────────────────────────────────
  // Chaque famille propose PLUSIEURS candidats, chacun sur un quartier distinct.
  // Sans cela, la zone qui domine l'arrivage remporte tous les classements à la
  // fois : le rendu du 19 septembre sortait trois slides sur Jumeirah Village
  // Circle, ce qui donne un carrousel qui se répète alors que les faits, eux,
  // sont bien différents.
  const families: Fact[][] = [];

  /** Jusqu'à `n` candidats pris dans l'ordre donné, un seul par quartier. */
  function spread<T>(rows: T[], zoneOf: (r: T) => string, make: (r: T) => Fact, n = CANDIDATES_PER_FAMILY): Fact[] {
    const seen = new Set<string>();
    const out: Fact[] = [];
    for (const r of rows) {
      const z = zoneOf(r);
      if (seen.has(z)) continue;
      seen.add(z);
      out.push(make(r));
      if (out.length >= n) break;
    }
    return out;
  }
  const zoneOfListing = (l: any) => ZONE_CLEAN(l.location);

  // 1. Volume d'arrivages — chiffre qui bouge tous les jours.
  const newCount = listings.filter(isFresh).length;
  if (newCount > 0) {
    const zoneCount: Record<string, number> = {};
    for (const l of listings.filter(isFresh)) {
      const z = ZONE_CLEAN(l.location);
      zoneCount[z] = (zoneCount[z] ?? 0) + 1;
    }
    const ranked = Object.entries(zoneCount).sort((a, b) => b[1] - a[1]).slice(0, CANDIDATES_PER_FAMILY);
    families.push(ranked.map(([zone, n]) => {
      // Ce fait n'est rattaché à aucune annonce, donc il n'avait pas de photo et
      // sortait en slide à moitié vide. On l'illustre avec une annonce fraîche
      // située dans le quartier dont il parle.
      const illus = pool.find(l => ZONE_CLEAN(l.location) === zone);
      return {
        kind: 'zone_surge' as const, kicker: 'Arrivages du jour',
        headline: zone, value: `${n} biens`,
        context: ['mis en ligne dans les dernières 24 heures', `sur ${num(newCount)} nouvelles annonces à Dubaï`],
        photoUrl: illus ? photoOf(illus) : undefined,
        listingId: illus ? String(illus.id) : undefined,
        weight: 60 + Math.min(30, n),
      };
    }));
  }

  // 2. Meilleur rendement PARMI LES NOUVELLES — change chaque nuit.
  families.push(spread(
    [...pool].filter(l => l.yield_pct > 0).sort((a, b) => b.yield_pct - a.yield_pct),
    zoneOfListing,
    l => ({
      kind: 'best_new', kicker: 'Meilleur rendement du quartier',
      headline: ZONE_CLEAN(l.location),
      value: `${String(Math.round(l.yield_pct * 10) / 10).replace('.', ',')} %`,
      context: [`${eur(l.price_eur)} · ${rooms(l.beds || 0)} · ${Math.round(l.sqm || 0)} m²`, 'rendement brut estimé, 0 % d\'impôt sur les loyers'],
      photoUrl: photoOf(l), listingId: String(l.id), weight: 95,
    }),
  ));

  // 3. Baisse de prix — le fait le plus actionnable quand il existe.
  const drops: Array<{ l: any; oldP: number; pct: number }> = [];
  for (const l of listings) {
    const old = prevPrices[l.id];
    if (!old || !l.price_eur || l.price_eur >= old) continue;
    const pct = ((old - l.price_eur) / old) * 100;
    if (pct >= DROP_FLOOR_PCT && usable(l)) drops.push({ l, oldP: old, pct });
  }
  families.push(spread(
    drops.sort((a, b) => b.pct - a.pct),
    d => ZONE_CLEAN(d.l.location),
    d => ({
      kind: 'price_drop', kicker: 'Baisse détectée depuis hier',
      headline: ZONE_CLEAN(d.l.location),
      value: `−${d.pct.toFixed(1).replace('.', ',')} %`,
      context: [`${eur(d.oldP)} → ${eur(d.l.price_eur)}`, 'détectée automatiquement sur les annonces suivies'],
      photoUrl: photoOf(d.l), listingId: String(d.l.id), weight: 100,
    }),
  ));

  // 4. Ticket d'entrée du jour — parmi les nouvelles uniquement.
  families.push(spread(
    [...pool].sort((a, b) => a.price_eur - b.price_eur),
    zoneOfListing,
    l => ({
      kind: 'entry_ticket', kicker: 'Ticket d\'entrée du quartier',
      headline: ZONE_CLEAN(l.location), value: eur(l.price_eur),
      context: [`${rooms(l.beds || 0)} · ${Math.round(l.sqm || 0)} m² · ${l.completion === 'Ready' ? 'livré' : l.completion || 'off-plan'}`, 'frais d\'acquisition : 4 % DLD + 2 % agence'],
      photoUrl: photoOf(l), listingId: String(l.id), weight: 80,
    }),
  ));

  // 5. Le haut du panier du jour — donne l'amplitude du marché.
  families.push(spread(
    [...pool].sort((a, b) => b.price_eur - a.price_eur),
    zoneOfListing,
    l => ({
      kind: 'premium_new', kicker: 'Haut du panier du quartier',
      headline: ZONE_CLEAN(l.location), value: eur(l.price_eur),
      context: [`${rooms(l.beds || 0)} · ${Math.round(l.sqm || 0)} m²`, 'Golden Visa dès 545 000 € investis'],
      photoUrl: photoOf(l), listingId: String(l.id), weight: 70,
    }),
  ));

  // ─── Filigranes ───────────────────────────────────────────────────────────
  // Analyse réseau, donc hors du filtre synchrone `usable` : on ne teste que
  // les biens réellement en lice, pas les milliers du réservoir.
  const byId = new Map<string, any>();
  for (const l of listings) byId.set(String(l.id), l);
  // On entrelace : meilleur candidat de chaque famille, puis deuxième de chaque,
  // etc. Si le budget de temps s'épuise, ce sont les candidats les moins bons
  // qui restent non analysés, pas le meilleur d'une famille entière.
  const interleaved: string[] = [];
  for (let rank = 0; rank < CANDIDATES_PER_FAMILY; rank++) {
    for (const fam of families) {
      const id = fam[rank]?.listingId;
      if (id) interleaved.push(id);
    }
  }
  const contenders = [...new Set(interleaved)].map(id => ({ id, images: photosOf(byId.get(id)) }));

  const clean = await screenListings(contenders, 90_000, 10);
  console.log(`[socialFacts] filigranes : ${clean.size}/${contenders.length} biens sans marque`);

  // Un bien marqué garde son fait — c'est l'information qui compte — mais perd
  // sa photo. Une slide sobre vaut mieux que la marque d'un concurrent.
  for (const fam of families) {
    for (const f of fam) {
      if (f.listingId && !clean.has(f.listingId)) f.photoUrl = undefined;
    }
  }

  const { chosen, usedIds, usedPhotos } = selectFacts(families);

  if (chosen.length < 2) return null;

  // L'angle tourne, en évitant celui de la veille.
  const angle = ANGLES.find(a => a !== exclusions.lastAngles[0]) ?? ANGLES[0];

  // Couverture : une photo d'annonce fraîche, jamais utilisée.
  // La couverture passe par le même contrôle, bien par bien, jusqu'à en trouver
  // une propre. Sans photo utilisable, la slide 1 reste typographique.
  const coverPool = pool.filter(l => !usedIds.has(String(l.id)) && !usedPhotos.has(photoOf(l)!));
  let coverCandidate: any = coverPool.find(l => clean.has(String(l.id))) ?? null;
  if (!coverCandidate) {
    // Aucun bien déjà validé ne convient : on en contrôle un lot, en parallèle.
    const batch = coverPool.slice(0, 24).map(l => ({ id: String(l.id), images: photosOf(l) }));
    const ok = await screenListings(batch, 30_000, 10);
    coverCandidate = coverPool.find(l => ok.has(String(l.id))) ?? null;
  }
  const coverPhotoUrl = coverCandidate ? photoOf(coverCandidate) : chosen[0]?.photoUrl;

  return {
    date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    newLast24h: newCount,
    totalListings: listings.length,
    facts: chosen,
    coverPhotoUrl,
    listingIds: [...chosen.map(f => f.listingId), coverCandidate ? String(coverCandidate.id) : undefined].filter(Boolean) as string[],
    photoUrls: [...chosen.map(f => f.photoUrl), coverPhotoUrl].filter(Boolean) as string[],
    angle,
  };
}

/** À appeler APRÈS publication réussie, pour que rien ne soit republié. */
export async function markPublished(day: DayFacts): Promise<void> {
  if (!hasStore()) return;
  await fetch(`${SUPABASE_URL}/rest/v1/social_published`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      day: today(), angle: day.angle,
      listing_ids: day.listingIds, photo_urls: day.photoUrls,
      facts: day.facts.map(f => ({ kind: f.kind, headline: f.headline, value: f.value })),
    }]),
    signal: AbortSignal.timeout(10_000),
  }).catch(err => console.error('[socialFacts] markPublished', err?.message));
}
