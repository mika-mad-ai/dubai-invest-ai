/* eslint-disable @typescript-eslint/no-explicit-any */

export type SourceStatus = {
  source: 'propertyfinder' | 'bayut';
  ok: boolean;
  count: number;
  reason?: string;
};

export type Listing = {
  id: string;
  title: string;
  location: string;
  districtId: 'downtown' | 'marina' | 'creek' | 'palm' | 'other';
  price: number;
  yield: number;
  type: string;
  image: string;
  images?: string[];
  beds: number;
  baths: number;
  sqm: number;
  completion: string;
  serviceChargesSqft: number;
  marketPriceSqft: number;
  liquidity: 'High' | 'Medium' | 'Low';
  catalysts: string[];
  sourceUrl: string;
  source: 'propertyfinder' | 'bayut';
};

const MARKET_PRICE_BY_DISTRICT: Record<string, number> = {
  downtown: 6300,
  marina: 5800,
  creek: 5200,
  palm: 7500,
  other: 5000
};

// Taux de change AED → EUR (1 AED ≈ 0.236 EUR, soit 1 EUR ≈ 4.24 AED)
const AED_TO_EUR = 1 / 4.24;

const APIFY_BASE = 'https://api.apify.com/v2';

// ─── Helpers ────────────────────────────────────────────────────────────────

function inferDistrictId(location: string): 'downtown' | 'marina' | 'creek' | 'palm' | 'other' {
  const l = location.toLowerCase();
  if (l.includes('downtown')) return 'downtown';
  if (l.includes('marina')) return 'marina';
  if (l.includes('creek')) return 'creek';
  if (l.includes('palm')) return 'palm';
  return 'other';
}

function inferTypeFromUrl(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('/apartment-')) return 'Appartement';
  if (u.includes('/villa-')) return 'Villa';
  if (u.includes('/townhouse-')) return 'Townhouse';
  if (u.includes('/penthouse-')) return 'Penthouse';
  return 'Bien immobilier';
}

function normalizePropertyType(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes('apartment') || t.includes('flat') || t.includes('appartement')) return 'Appartement';
  if (t.includes('penthouse')) return 'Penthouse';
  if (t.includes('townhouse') || t.includes('town house')) return 'Townhouse';
  if (t.includes('villa')) return 'Villa';
  if (t.includes('studio')) return 'Studio';
  return 'Bien immobilier';
}

function normalizeCompletion(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('ready') || s.includes('completed') || s.includes('prêt')) return 'Prêt';
  if (s.includes('off') || s.includes('plan') || s.includes('construction') || s.includes('under')) return 'Off-plan';
  return raw || 'Prêt';
}

function inferYieldByType(type: string): number {
  const t = type.toLowerCase();
  if (t.includes('appartement') || t.includes('apartment') || t.includes('studio')) return 6.8;
  if (t.includes('townhouse')) return 6.1;
  if (t.includes('villa')) return 5.2;
  if (t.includes('penthouse')) return 5.8;
  return 6.0;
}

function inferLiquidity(location: string): 'High' | 'Medium' | 'Low' {
  const l = location.toLowerCase();
  if (l.includes('downtown') || l.includes('marina') || l.includes('palm')) return 'High';
  if (l.includes('jvc') || l.includes('creek') || l.includes('business bay')) return 'Medium';
  return 'Low';
}

function extractBeds(title: string, description: string): number {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('studio')) return 0;
  const m = text.match(/(\d+)\s*(br|bed|bedroom)/i);
  if (m) return Number(m[1]);
  return 1;
}

function extractBaths(description: string): number {
  const m = description.match(/(\d+)\s*(bath|bathroom)/i);
  if (m) return Number(m[1]);
  return 1;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function extractScriptJson(html: string, scriptId: string): any | null {
  const match = html.match(new RegExp(`<script id="${scriptId}" type="application/ld\\+json">([\\s\\S]*?)</script>`, 'i'));
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// ─── Apify ──────────────────────────────────────────────────────────────────

/**
 * Lance un actor Apify en mode synchrone et retourne les items du dataset.
 * Timeout 100s (actor) + 110s côté fetch — configuré pour le collector endpoint
 * qui a maxDuration=300 dans vercel.json.
 */
async function runApifyActor(actorId: string, input: object, maxItems: number): Promise<any[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];

  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=100&maxItems=${maxItems}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(110_000)
    });

    if (!response.ok) {
      console.error(`[Apify] ${actorId} HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : (data?.items ?? []);
  } catch (err: any) {
    console.error(`[Apify] ${actorId} error:`, err?.message ?? err);
    return [];
  }
}

/**
 * Normalise un tableau d'items Property Finder (pour le webhook Apify).
 * Exporté pour être réutilisé dans api/apify-webhook.ts.
 */
export function normalizePropertyFinderItems(items: any[], limit: number): Listing[] {
  const listings: Listing[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const listing = normalizePropertyFinderItem(item);
    if (!listing || seen.has(listing.sourceUrl)) continue;
    seen.add(listing.sourceUrl);
    listings.push(listing);
    if (listings.length >= limit) break;
  }
  return listings;
}

/**
 * Normalise un item Property Finder de l'actor shahidirfan~propertyfinder-scraper.
 * Champs confirmés: id, title, price, currency, location, locationPathName,
 * bedrooms, bathrooms, area (sqft), areaUnit, url, propertyType,
 * completionStatus, images (string[]).
 */
function normalizePropertyFinderItem(item: Record<string, any>): Listing | null {
  const url = String(item.url ?? '').trim();
  const priceAED = Number(item.price ?? 0);
  const title = String(item.title ?? '').trim();

  if (!url || !priceAED || !title) return null;

  // Les prix Apify/PropertyFinder sont en AED — convertir en EUR pour l'affichage
  const price = Math.round(priceAED * AED_TO_EUR);

  // On n'accepte que les URLs du domaine propertyfinder (pas de liens externes parasites)
  // On ne filtre plus sur /plp/ car l'actor retourne parfois d'autres formats d'URL valides
  if (!url.includes('propertyfinder.ae')) return null;

  // locationPathName = "Dubai, Marina, Dubai Marina, Tower" → meilleur pour le district
  const location = String(item.locationPathName ?? item.location ?? 'Dubai').trim();

  // area est en sqft (areaUnit = "sqft"), convertir en m²
  const sqft = Number(item.area ?? 0);
  const sqm = sqft > 0 ? Math.max(20, Math.round(sqft / 10.764)) : 50;

  // Déduplique les images par nom de fichier (sans extension ni variation de taille CDN)
  // Nécessaire car l'actor extrait souvent les variants small/ et large/ du même fichier
  function imageKey(rawUrl: string): string {
    try {
      const pathname = new URL(rawUrl).pathname;
      const filename = pathname.split('/').pop() || '';
      return filename.replace(/\.(jpg|jpeg|png|webp|gif|avif)$/i, '').toLowerCase();
    } catch {
      return rawUrl.toLowerCase().trim();
    }
  }

  const rawImages: string[] = Array.isArray(item.images) ? item.images : [];
  const seenKeys = new Set<string>();
  const images = rawImages.filter(u => {
    const raw = String(u).trim();
    if (!raw) return false;
    const key = imageKey(raw);
    if (!key || seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
  const image = images[0] ?? '';

  const beds = Number(item.bedrooms ?? item.beds ?? 0);
  const baths = Number(item.bathrooms ?? item.baths ?? 1);
  const rawType = String(item.propertyType ?? 'Apartment');
  const rawCompletion = String(item.completionStatus ?? 'completed');

  const type = normalizePropertyType(rawType);
  const completion = normalizeCompletion(rawCompletion);
  const districtId = inferDistrictId(location);

  return {
    id: `pf-${item.id ?? simpleHash(url)}`,
    title,
    location,
    districtId,
    price,
    yield: inferYieldByType(type),
    type,
    image,
    images: images.length > 0 ? images : undefined,
    beds,
    baths,
    sqm,
    completion,
    serviceChargesSqft: 16,
    marketPriceSqft: MARKET_PRICE_BY_DISTRICT[districtId] ?? MARKET_PRICE_BY_DISTRICT.other,
    liquidity: inferLiquidity(location),
    catalysts: ['Annonce Property Finder via Apify'],
    sourceUrl: url,
    source: 'propertyfinder'
  };
}

async function fetchApifyPropertyFinder(
  city: string,
  limit: number
): Promise<{ listings: Listing[]; status: SourceStatus }> {
  const p2 = '?page=2';
  const startUrls = [
    { url: `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-jumeirah-village-circle.html${p2}` },
    { url: `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-business-bay.html${p2}` },
    { url: `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-downtown-dubai.html${p2}` },
    { url: `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-dubai-marina.html${p2}` },
    { url: `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-dubai-creek-harbour-the-lagoons.html${p2}` },
    { url: 'https://www.propertyfinder.ae/en/buy/dubai/studio-apartments-for-sale-jumeirah-village-circle.html' },
    { url: 'https://www.propertyfinder.ae/en/buy/dubai/1-bedroom-apartments-for-sale-business-bay.html' },
    { url: 'https://www.propertyfinder.ae/en/buy/dubai/1-bedroom-apartments-for-sale-dubai-creek-harbour-the-lagoons.html' },
  ];

  const items = await runApifyActor(
    'shahidirfan~propertyfinder-scraper',
    { startUrls, maxItems: limit },
    limit
  );

  if (items.length === 0) {
    return {
      listings: [],
      status: { source: 'propertyfinder', ok: false, count: 0, reason: 'Apify returned 0 items' }
    };
  }

  const listings: Listing[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const listing = normalizePropertyFinderItem(item);
    if (!listing || seen.has(listing.sourceUrl)) continue;
    seen.add(listing.sourceUrl);
    listings.push(listing);
    if (listings.length >= limit) break;
  }

  return {
    listings,
    status: { source: 'propertyfinder', ok: listings.length > 0, count: listings.length }
  };
}

// ─── Direct scraping (fallback si APIFY_API_TOKEN absent) ───────────────────

function mapPropertyFinder(schema: any, limit: number): Listing[] {
  const itemList: any[] = schema?.accessModeSufficient?.itemListElement || [];
  const out: Listing[] = [];
  const seen = new Set<string>();

  for (const item of itemList) {
    const e = item?.mainEntity;
    if (!e) continue;
    const id = String(e['@id'] || '');
    const title = String(e.name || '').trim();
    const location = String(e?.address?.name || e?.address?.addressRegion || 'Dubai').trim();
    const url = String(e.url || '').trim();
    const image = String(e.image || '').trim();
    const price = Number(e?.offers?.[0]?.priceSpecification?.price || 0);
    const sqft = Number(e?.floorSize?.value || 0);
    const description = String(e?.description || '');
    if (!id || !title || !url || !image || !price || !sqft) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const districtId = inferDistrictId(location);
    const type = inferTypeFromUrl(url);
    const beds = extractBeds(title, description);
    const baths = extractBaths(description);
    const sqm = Math.max(20, Math.round(sqft / 10.764));

    out.push({
      id: `pf-${id}`,
      title,
      location,
      districtId,
      price,
      yield: inferYieldByType(type),
      type,
      image,
      beds,
      baths,
      sqm,
      completion: 'Prêt',
      serviceChargesSqft: 16,
      marketPriceSqft: MARKET_PRICE_BY_DISTRICT[districtId] || MARKET_PRICE_BY_DISTRICT.other,
      liquidity: inferLiquidity(location),
      catalysts: ['Annonce réelle PF'],
      sourceUrl: url,
      source: 'propertyfinder'
    });

    if (out.length >= limit) break;
  }

  return out;
}

async function fetchPropertyFinder(city: string, limit: number): Promise<{ listings: Listing[]; status: SourceStatus }> {
  const url = `https://www.propertyfinder.ae/en/buy/${city}/properties-for-sale.html`;
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; DubaiInvestBot/1.0; +https://dubainvest.eu)'
    }
  });
  if (!response.ok) {
    return {
      listings: [],
      status: { source: 'propertyfinder', ok: false, count: 0, reason: `HTTP ${response.status}` }
    };
  }
  const html = await response.text();
  const schema = extractScriptJson(html, 'serp-schema');
  if (!schema) {
    return {
      listings: [],
      status: { source: 'propertyfinder', ok: false, count: 0, reason: 'serp-schema missing' }
    };
  }
  const listings = mapPropertyFinder(schema, limit);
  return {
    listings,
    status: {
      source: 'propertyfinder',
      ok: listings.length > 0,
      count: listings.length,
      reason: listings.length ? undefined : 'No listing parsed'
    }
  };
}

// Bayut : bloqué CAPTCHA sans proxy premium — toujours 0 résultats
async function fetchBayut(_city: string): Promise<{ listings: Listing[]; status: SourceStatus }> {
  return {
    listings: [],
    status: { source: 'bayut', ok: false, count: 0, reason: 'CAPTCHA — proxy premium requis' }
  };
}

function dedupeByUrl(listings: Listing[]): Listing[] {
  const seen = new Set<string>();
  const out: Listing[] = [];
  for (const l of listings) {
    const key = l.sourceUrl.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

// ─── Point d'entrée principal ────────────────────────────────────────────────

export async function collectLiveListings(city = 'dubai', limit = 24) {
  const apifyToken = process.env.APIFY_API_TOKEN;

  let pf: { listings: Listing[]; status: SourceStatus };
  const bayut = await fetchBayut(city); // toujours 0 sans proxy premium

  if (apifyToken) {
    // Apify actor : données structurées riches (40+ champs), contourne les limitations HTML
    pf = await fetchApifyPropertyFinder(city, limit);
  } else {
    // Fallback : scraping direct JSON-LD (moins de champs, parfois bloqué)
    pf = await fetchPropertyFinder(city, Math.ceil(limit * 0.8));
  }

  const listings = dedupeByUrl([...pf.listings, ...bayut.listings]).slice(0, limit);

  return {
    live: listings.length > 0,
    source: apifyToken
      ? 'Apify (Property Finder — shahidirfan actor)'
      : 'Direct scraping (Property Finder JSON-LD)',
    fetchedAt: new Date().toISOString(),
    listings,
    statuses: [pf.status, bayut.status]
  };
}
