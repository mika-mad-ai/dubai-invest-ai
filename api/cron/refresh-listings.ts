/**
 * Cron quotidien — scrappe PropertyFinder et sauvegarde dans Supabase.
 *
 * Déclenché par Vercel Cron (vercel.json) à 3h du matin chaque jour.
 * Scrape ~10 pages × 5 zones = ~1200 annonces par run.
 * Durée estimée : 30-60 secondes (fetches en parallèle).
 *
 * Peut aussi être déclenché manuellement :
 *   GET /api/cron/refresh-listings?secret=CRON_SECRET
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TABLE = 'listings';
const EUR_TO_AED = 4.15;
const AED_TO_EUR = 1 / EUR_TO_AED;

const PF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ─── Build all URLs to scrape ────────────────────────────────────────────────

function buildAllUrls(): string[] {
  const areas: [string, number][] = [
    ['jumeirah-village-circle', 12],
    ['business-bay', 8],
    ['dubai-marina', 8],
    ['downtown-dubai', 6],
    ['dubai-creek-harbour-the-lagoons', 6],
    ['palm-jumeirah', 4],
    ['jumeirah-beach-residence', 4],
  ];

  const urls: string[] = [];

  for (const [area, pages] of areas) {
    for (let p = 1; p <= pages; p++) {
      urls.push(
        `https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-${area}.html?page=${p}`
      );
    }
    // Studios séparément (plus abordables)
    if (area === 'jumeirah-village-circle') {
      for (let p = 1; p <= 4; p++) {
        urls.push(
          `https://www.propertyfinder.ae/en/buy/dubai/studio-apartments-for-sale-${area}.html?page=${p}`
        );
      }
    }
  }

  return urls;
}

// ─── Scrape one PF page via __NEXT_DATA__ ───────────────────────────────────
// __NEXT_DATA__ contains richer data than JSON-LD: 3 images per listing (small+medium+original),
// exact beds/baths, amenity_names[], GPS coordinates, floor_plans, contact info.

async function scrapePage(url: string): Promise<any[]> {
  try {
    const res = await fetch(url, {
      headers: PF_HEADERS,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Primary: parse __NEXT_DATA__ (rich, structured data)
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

    // Fallback: JSON-LD serp-schema (1 image only)
    const match = html.match(/<script[^>]+id="serp-schema"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match?.[1]) return [];
    const schema = JSON.parse(match[1]);
    return (schema?.accessModeSufficient?.itemListElement ?? [])
      .map((it: any) => ({ _source: 'jsonld', ...it?.mainEntity }))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Normalize → DB row ──────────────────────────────────────────────────────

function inferDistrict(loc: string): string {
  const l = loc.toLowerCase();
  if (l.includes('downtown')) return 'downtown';
  if (l.includes('marina')) return 'marina';
  if (l.includes('creek')) return 'creek';
  if (l.includes('palm')) return 'palm';
  if (l.includes('jumeirah village') || l.includes('jvc')) return 'jvc';
  if (l.includes('business bay')) return 'businessbay';
  if (l.includes('jumeirah beach') || l.includes('jbr')) return 'jbr';
  return 'other';
}

function inferLiquidity(loc: string): string {
  const l = loc.toLowerCase();
  if (l.includes('downtown') || l.includes('marina') || l.includes('palm')) return 'High';
  if (l.includes('jvc') || l.includes('creek') || l.includes('business bay')) return 'Medium';
  return 'Low';
}

function inferYield(beds: number, type: string): number {
  if (beds === 0) return 7.2; // studio
  const t = type.toLowerCase();
  if (t.includes('villa')) return 5.2;
  if (t.includes('penthouse')) return 5.8;
  return beds === 1 ? 7.0 : 6.5;
}

function inferType(url: string, propertyType?: string): string {
  const p = (propertyType ?? '').toLowerCase();
  if (p.includes('studio') || p === '0') return 'Studio';
  if (p.includes('villa')) return 'Villa';
  if (p.includes('penthouse')) return 'Penthouse';
  const u = url.toLowerCase();
  if (u.includes('studio')) return 'Studio';
  if (u.includes('/villa-')) return 'Villa';
  if (u.includes('/penthouse-')) return 'Penthouse';
  return 'Appartement';
}

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

// Build image URL: use the larger "original" size when we have the listing hash + UUID
function buildImageUrl(rawUrl: string): string {
  // rawUrl might be small (416x272) — replace with original
  return rawUrl.replace(/\/\d+x\d+\.jpg$/, '/original.jpg');
}

function normalizeNextData(e: any): any | null {
  // __NEXT_DATA__ property object format
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

  // Images: __NEXT_DATA__ gives 3 preview images; upgrade each to original size
  const rawImages: any[] = e?.images ?? [];
  const images: string[] = rawImages.map((img: any) => {
    const med = img?.medium ?? img?.small ?? '';
    return med ? buildImageUrl(med) : '';
  }).filter(Boolean);

  const image = images[0] ?? '';
  const propertyType = String(e?.property_type ?? '');
  const url = detailsPath
    ? `https://www.propertyfinder.ae${detailsPath}`
    : '';
  const type = inferType(url, propertyType);

  // Completion status
  const completion = e?.completion_status === 'off_plan' ? 'Off-plan' : 'Prêt';

  return {
    id: `pf-${idNum ?? simpleHash(listingHash)}`,
    title,
    location: locationFull,
    district_id: inferDistrict(locationFull),
    price_eur: Math.round(priceAED * AED_TO_EUR),
    price_aed: priceAED,
    yield_pct: inferYield(beds, type),
    type,
    beds,
    baths,
    sqm,
    completion,
    liquidity: inferLiquidity(locationFull),
    images,
    image: image || null,
    amenities,
    lat,
    lng,
    source_url: url,
    source: 'propertyfinder',
    updated_at: new Date().toISOString(),
  };
}

function extractBeds(title: string, desc: string): number {
  const t = `${title} ${desc}`.toLowerCase();
  if (t.includes('studio')) return 0;
  const m = t.match(/(\d+)\s*(br|bed|bedroom)/i);
  return m ? Number(m[1]) : 1;
}

function extractAmenities(e: any): string[] {
  const features: string[] = [];
  for (const feat of e?.amenityFeature ?? []) {
    if (feat?.value === true && feat?.name) features.push(feat.name);
  }
  return features;
}

function normalizeJsonLd(e: any): any | null {
  // Fallback: JSON-LD serp-schema format (1 image, less data)
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
  const type = inferType(url);
  const beds = extractBeds(title, desc);
  const lat = e?.geo?.latitude ? Number(e.geo.latitude) : null;
  const lng = e?.geo?.longitude ? Number(e.geo.longitude) : null;

  return {
    id: `pf-${idRaw || simpleHash(url)}`,
    title,
    location,
    district_id: inferDistrict(location),
    price_eur: Math.round(priceAED * AED_TO_EUR),
    price_aed: priceAED,
    yield_pct: inferYield(beds, type),
    type,
    beds,
    baths: 1,
    sqm,
    completion: 'Prêt',
    liquidity: inferLiquidity(location),
    images: image ? [image] : [],
    image: image || null,
    amenities: extractAmenities(e),
    lat,
    lng,
    source_url: url,
    source: 'propertyfinder',
    updated_at: new Date().toISOString(),
  };
}

function normalize(e: any): any | null {
  return e?._source === 'next_data' ? normalizeNextData(e) : normalizeJsonLd(e);
}

// ─── Supabase upsert (batch) ─────────────────────────────────────────────────

async function upsertListings(rows: any[]): Promise<{ inserted: number; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { inserted: 0, error: 'Supabase non configuré' };
  if (rows.length === 0) return { inserted: 0 };

  // Upsert par batch de 100 pour éviter les limites de payload
  const BATCH = 100;
  let total = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[upsert] batch error:', err);
      return { inserted: total, error: err };
    }
    total += batch.length;
  }

  return { inserted: total };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  // Sécurité : vérifier le secret Vercel Cron ou CRON_SECRET manuel
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const querySecret = req.query?.secret;

  if (cronSecret) {
    const provided = authHeader?.replace('Bearer ', '') || querySecret;
    if (provided !== cronSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const startedAt = Date.now();
  const urls = buildAllUrls();

  console.log(`[cron] Starting refresh — ${urls.length} pages to scrape`);

  // Scrape toutes les pages en parallèle (par batch de 10 pour éviter le rate-limit)
  const BATCH_SIZE = 10;
  const allItems: any[] = [];

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(u => scrapePage(u)));
    for (const r of results) {
      if (r.status === 'fulfilled') allItems.push(...r.value);
    }
  }

  console.log(`[cron] Scraped ${allItems.length} raw items`);

  // Normaliser + dédupliquer
  const seen = new Set<string>();
  const rows: any[] = [];
  for (const item of allItems) {
    const row = normalize(item);
    if (!row || seen.has(row.source_url)) continue;
    seen.add(row.source_url);
    rows.push(row);
  }

  console.log(`[cron] ${rows.length} unique listings after dedup`);

  // Sauvegarder dans Supabase
  const { inserted, error } = await upsertListings(rows);

  const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[cron] Done in ${duration}s — inserted/updated: ${inserted}`);

  res.status(200).json({
    ok: !error,
    pagesScraped: urls.length,
    rawItems: allItems.length,
    uniqueListings: rows.length,
    inserted,
    durationSeconds: parseFloat(duration),
    error: error ?? null,
  });
}
