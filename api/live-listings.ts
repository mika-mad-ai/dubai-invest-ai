/**
 * Endpoint principal de lecture des annonces.
 *
 * Stratégie :
 *   1. Lire depuis Supabase (< 50ms) — si données disponibles et fraîches (< 25h)
 *   2. Fallback scraping direct PF si Supabase vide ou non configuré (~5-10s)
 *
 * Paramètres :
 *   budget  — budget max en EUR (filtre price_eur)
 *   limit   — nb max d'annonces (défaut 40)
 *   district — filtrer par zone (optionnel)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = 'listings';
const EUR_TO_AED = 4.15;
const AED_TO_EUR = 1 / EUR_TO_AED;

const PF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ─── Supabase read ────────────────────────────────────────────────────────────

async function readFromSupabase(budgetEur: number, limit: number): Promise<any[] | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    // Vérifier fraîcheur : au moins 1 ligne scrappée dans les 25 dernières heures
    const freshnessRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?select=scraped_at&order=scraped_at.desc&limit=1`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        signal: AbortSignal.timeout(4_000),
      }
    );

    if (!freshnessRes.ok) return null;
    const freshRows = await freshnessRes.json();
    if (!freshRows?.length) return null;

    const lastScrape = new Date(freshRows[0].scraped_at);
    const ageHours = (Date.now() - lastScrape.getTime()) / 3_600_000;
    if (ageHours > 25) return null; // données trop vieilles → fallback scraping

    // Construire la query filtrée
    const params = new URLSearchParams({
      select: 'id,title,location,district_id,price_eur,yield_pct,type,beds,baths,sqm,completion,liquidity,images,image,amenities,lat,lng,source_url,source',
      order: 'updated_at.desc',
      limit: String(limit),
    });

    if (budgetEur > 0) {
      // Marge 30% : montrer des biens jusqu'à budget+30% (l'IA les classe par pertinence)
      params.append('price_eur', `lte.${Math.round(budgetEur * 1.30)}`);
    }

    const listingsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?${params}`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        signal: AbortSignal.timeout(5_000),
      }
    );

    if (!listingsRes.ok) return null;
    const rows = await listingsRes.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;

    // Remapper vers le format Property attendu par le frontend
    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      location: r.location,
      districtId: r.district_id,
      price: r.price_eur,
      yield: r.yield_pct ?? 6.5,
      type: r.type ?? 'Appartement',
      image: r.image ?? (r.images?.[0] ?? ''),
      images: r.images ?? [],
      amenities: r.amenities ?? [],
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      beds: r.beds ?? 1,
      baths: r.baths ?? 1,
      sqm: r.sqm ?? 50,
      completion: r.completion ?? 'Prêt',
      serviceChargesSqft: 16,
      marketPriceSqft: 5500,
      liquidity: r.liquidity ?? 'Medium',
      catalysts: ['Annonce PropertyFinder'],
      sourceUrl: r.source_url,
      source: r.source ?? 'propertyfinder',
    }));
  } catch {
    return null;
  }
}

// ─── Fallback : scraping direct PF ───────────────────────────────────────────

function buildPFUrls(maxPriceAED: number): string[] {
  const pt = maxPriceAED > 0 ? `&pt=${maxPriceAED}` : '';
  const areas = [
    'jumeirah-village-circle',
    'business-bay',
    'dubai-marina',
    'downtown-dubai',
    'dubai-creek-harbour-the-lagoons',
  ];
  const urls: string[] = [];
  for (const area of areas) {
    urls.push(`https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-${area}.html?page=1${pt}`);
    urls.push(`https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-${area}.html?page=2${pt}`);
  }
  urls.push(`https://www.propertyfinder.ae/en/buy/dubai/studio-apartments-for-sale-jumeirah-village-circle.html${pt ? '?' + pt.slice(1) : ''}`);
  return urls;
}

function buildImageUrl(rawUrl: string): string {
  return rawUrl.replace(/\/\d+x\d+\.jpg$/, '/original.jpg');
}

async function scrapePFPage(url: string): Promise<any[]> {
  try {
    const res = await fetch(url, { headers: PF_HEADERS, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const html = await res.text();

    // Primary: __NEXT_DATA__ (3 images per listing + exact beds/baths/amenities)
    const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (ndMatch?.[1]) {
      try {
        const nd = JSON.parse(ndMatch[1]);
        const listings: any[] = nd?.props?.pageProps?.searchResult?.listings ?? [];
        if (listings.length > 0) {
          return listings.map((l: any) => ({ _source: 'next_data', ...l.property })).filter(Boolean);
        }
      } catch { /* fall through */ }
    }

    // Fallback: JSON-LD
    const match = html.match(/<script[^>]+id="serp-schema"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match?.[1]) return [];
    const schema = JSON.parse(match[1]);
    return (schema?.accessModeSufficient?.itemListElement ?? []).map((it: any) => it?.mainEntity).filter(Boolean);
  } catch { return []; }
}

function inferDistrict(loc: string): string {
  const l = loc.toLowerCase();
  if (l.includes('downtown')) return 'downtown';
  if (l.includes('marina')) return 'marina';
  if (l.includes('creek')) return 'creek';
  if (l.includes('palm')) return 'palm';
  if (l.includes('jumeirah village') || l.includes('jvc')) return 'jvc';
  if (l.includes('business bay')) return 'businessbay';
  return 'other';
}

function inferLiquidity(loc: string): 'High' | 'Medium' | 'Low' {
  const l = loc.toLowerCase();
  if (l.includes('downtown') || l.includes('marina') || l.includes('palm')) return 'High';
  if (l.includes('jvc') || l.includes('creek') || l.includes('business bay')) return 'Medium';
  return 'Low';
}

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

function normalizeScrape(e: any): any | null {
  // __NEXT_DATA__ format
  if (e?._source === 'next_data') {
    const idNum = e?.id;
    const listingHash = e?.listing_id ?? '';
    const priceAED = Number(e?.price?.value ?? 0);
    const title = String(e?.title ?? '').trim();
    const detailsPath = String(e?.details_path ?? '').trim();
    if (!priceAED || !title || !listingHash) return null;

    const locationFull = String(e?.location?.full_name ?? 'Dubai').trim();
    const loc = e?.location ?? {};
    const lat = loc?.coordinates?.lat ? Number(loc.coordinates.lat) : null;
    const lng = loc?.coordinates?.lon ? Number(loc.coordinates.lon) : null;
    const sqft = Number(e?.size?.value ?? 0);
    const sqm = sqft > 0 ? Math.max(20, Math.round(sqft / 10.764)) : 50;
    const beds = e?.bedrooms_value ?? e?.bedrooms ?? 1;
    const baths = e?.bathrooms_value ?? e?.bathrooms ?? 1;
    const amenities: string[] = e?.amenity_names ?? [];
    const rawImages: any[] = e?.images ?? [];
    const images: string[] = rawImages.map((img: any) => {
      const med = img?.medium ?? img?.small ?? '';
      return med ? buildImageUrl(med) : '';
    }).filter(Boolean);
    const type = (e?.bedrooms_value === 0 || String(e?.property_type ?? '').toLowerCase().includes('studio'))
      ? 'Studio' : 'Appartement';
    const url = detailsPath ? `https://www.propertyfinder.ae${detailsPath}` : '';

    return {
      id: `pf-${idNum ?? simpleHash(listingHash)}`,
      title,
      location: locationFull,
      districtId: inferDistrict(locationFull),
      price: Math.round(priceAED * AED_TO_EUR),
      yield: beds === 0 ? 7.2 : beds === 1 ? 7.0 : 6.5,
      type,
      image: images[0] ?? '',
      images,
      amenities,
      lat,
      lng,
      beds,
      baths,
      sqm,
      completion: e?.completion_status === 'off_plan' ? 'Off-plan' : 'Prêt',
      serviceChargesSqft: 16,
      marketPriceSqft: 5500,
      liquidity: inferLiquidity(locationFull),
      catalysts: ['Annonce PropertyFinder'],
      sourceUrl: url,
      source: 'propertyfinder',
    };
  }

  // JSON-LD fallback format
  const url = String(e?.url ?? '').trim();
  const priceAED = Number(e?.offers?.[0]?.priceSpecification?.price ?? 0);
  const title = String(e?.name ?? '').trim();
  if (!url || !priceAED || !title) return null;

  const location = String(e?.address?.name ?? e?.address?.addressRegion ?? 'Dubai').trim();
  const sqft = Number(e?.floorSize?.value ?? 0);
  const sqm = sqft > 0 ? Math.max(20, Math.round(sqft / 10.764)) : 50;
  const desc = String(e?.description ?? '');
  const rawImage = String(e?.image ?? '').trim();
  const image = rawImage ? buildImageUrl(rawImage) : '';
  const idRaw = String(e?.['@id'] ?? '').trim();
  const text = `${title} ${desc}`.toLowerCase();
  const beds = text.includes('studio') ? 0 : (text.match(/(\d+)\s*(br|bed)/i)?.[1] ? Number(text.match(/(\d+)\s*(br|bed)/i)![1]) : 1);
  const type = url.toLowerCase().includes('studio') ? 'Studio' : 'Appartement';

  return {
    id: `pf-${idRaw || simpleHash(url)}`,
    title,
    location,
    districtId: inferDistrict(location),
    price: Math.round(priceAED * AED_TO_EUR),
    yield: beds === 0 ? 7.2 : 6.8,
    type,
    image,
    images: image ? [image] : [],
    amenities: [],
    lat: null,
    lng: null,
    beds,
    baths: 1,
    sqm,
    completion: 'Prêt',
    serviceChargesSqft: 16,
    marketPriceSqft: 5500,
    liquidity: inferLiquidity(location),
    catalysts: ['Annonce PropertyFinder'],
    sourceUrl: url,
    source: 'propertyfinder',
  };
}

async function scrapeDirectPF(budgetEur: number, limit: number): Promise<any[]> {
  const maxPriceAED = budgetEur > 0 ? Math.round(budgetEur * EUR_TO_AED * 1.30) : 0;
  const urls = buildPFUrls(maxPriceAED);
  const pageResults = await Promise.allSettled(urls.map(u => scrapePFPage(u)));

  const rawItems: any[] = [];
  for (const r of pageResults) {
    if (r.status === 'fulfilled') rawItems.push(...r.value);
  }

  const filtered = maxPriceAED > 0
    ? rawItems.filter(e => {
        const p = Number(e?.offers?.[0]?.priceSpecification?.price ?? 0);
        return p > 0 && p <= maxPriceAED;
      })
    : rawItems;

  const seen = new Set<string>();
  const listings: any[] = [];
  for (const item of filtered) {
    const l = normalizeScrape(item);
    if (!l || seen.has(l.sourceUrl)) continue;
    seen.add(l.sourceUrl);
    listings.push(l);
    if (listings.length >= limit) break;
  }
  return listings;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const limit = Math.min(80, Math.max(12, Number(req.query?.limit ?? 40)));
  const budgetEur = Number(req.query?.budget ?? 0);

  // 1. Essayer Supabase en priorité
  const supabaseListings = await readFromSupabase(budgetEur, limit);

  if (supabaseListings && supabaseListings.length > 0) {
    return res.status(200).json({
      live: true,
      source: 'Supabase — PropertyFinder (mis à jour quotidiennement)',
      fetchedAt: new Date().toISOString(),
      listings: supabaseListings,
      statuses: [
        { source: 'propertyfinder', ok: true, count: supabaseListings.length },
        { source: 'bayut', ok: false, count: 0, reason: 'Non implémenté' },
      ],
    });
  }

  // 2. Fallback : scraping direct PF
  const scrapedListings = await scrapeDirectPF(budgetEur, limit);

  res.status(200).json({
    live: scrapedListings.length > 0,
    source: 'PropertyFinder — scraping direct (Supabase vide ou non configuré)',
    fetchedAt: new Date().toISOString(),
    listings: scrapedListings,
    statuses: [
      { source: 'propertyfinder', ok: scrapedListings.length > 0, count: scrapedListings.length },
      { source: 'bayut', ok: false, count: 0, reason: 'Non implémenté' },
    ],
  });
}
