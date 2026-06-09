/* eslint-disable @typescript-eslint/no-explicit-any */

const PF_BASE = 'https://www.propertyfinder.ae';

const MARKET_PRICE_BY_DISTRICT: Record<string, number> = {
  downtown: 6300,
  marina: 5800,
  creek: 5200,
  palm: 7500,
  other: 5000
};

function inferDistrictId(location: string): 'downtown' | 'marina' | 'creek' | 'palm' | 'other' {
  const l = location.toLowerCase();
  if (l.includes('downtown')) return 'downtown';
  if (l.includes('marina')) return 'marina';
  if (l.includes('creek')) return 'creek';
  if (l.includes('palm')) return 'palm';
  return 'other';
}

function inferTypeFromUrl(url: string): string {
  if (url.includes('/apartment-')) return 'Appartement';
  if (url.includes('/villa-')) return 'Villa';
  if (url.includes('/townhouse-')) return 'Townhouse';
  if (url.includes('/penthouse-')) return 'Penthouse';
  return 'Bien immobilier';
}

function inferYieldByType(type: string): number {
  if (type.toLowerCase().includes('appartement')) return 6.8;
  if (type.toLowerCase().includes('townhouse')) return 6.1;
  if (type.toLowerCase().includes('villa')) return 5.2;
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

function extractSerpSchema(html: string): any | null {
  const match = html.match(/<script id="serp-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function mapListings(schema: any, limit: number) {
  const itemList: any[] = schema?.accessModeSufficient?.itemListElement || [];
  const seen = new Set<string>();
  const out: any[] = [];

  for (const item of itemList) {
    const entity = item?.mainEntity;
    if (!entity) continue;

    const id = String(entity['@id'] || '');
    const title = String(entity.name || '').trim();
    const location = String(entity?.address?.name || entity?.address?.addressRegion || 'Dubai').trim();
    const url = String(entity.url || '').trim();
    const image = String(entity.image || '').trim();
    const price = Number(entity?.offers?.[0]?.priceSpecification?.price || 0);
    const sqft = Number(entity?.floorSize?.value || 0);
    const description = String(entity?.description || '');
    if (!id || !title || !url || !price || !image || !sqft) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const districtId = inferDistrictId(location);
    const type = inferTypeFromUrl(url);
    const beds = extractBeds(title, description);
    const baths = extractBaths(description);
    const sqm = Math.max(20, Math.round(sqft / 10.764));
    const yieldPct = inferYieldByType(type);
    const liquidity = inferLiquidity(location);

    out.push({
      id: `pf-${id}`,
      title,
      location,
      districtId,
      price,
      yield: yieldPct,
      type,
      image,
      beds,
      baths,
      sqm,
      completion: 'Prêt',
      serviceChargesSqft: 16,
      marketPriceSqft: MARKET_PRICE_BY_DISTRICT[districtId] || MARKET_PRICE_BY_DISTRICT.other,
      liquidity,
      catalysts: ['Annonce réelle PF'],
      sourceUrl: url
    });

    if (out.length >= limit) break;
  }

  return out;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const city = String(req.query?.city || 'dubai').toLowerCase();
    const limit = Math.min(30, Math.max(6, Number(req.query?.limit || 18)));
    const pfUrl = `${PF_BASE}/en/buy/${city}/properties-for-sale.html`;

    const response = await fetch(pfUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; DubaiInvestBot/1.0; +https://dubainvest.eu)'
      }
    });

    if (!response.ok) {
      res.status(200).json({
        live: false,
        source: 'Property Finder scrape',
        reason: `HTTP ${response.status}`,
        listings: []
      });
      return;
    }

    const html = await response.text();
    const schema = extractSerpSchema(html);
    if (!schema) {
      res.status(200).json({
        live: false,
        source: 'Property Finder scrape',
        reason: 'serp-schema not found',
        listings: []
      });
      return;
    }

    const listings = mapListings(schema, limit);
    res.status(200).json({
      live: listings.length > 0,
      source: 'Property Finder public search page',
      fetchedAt: new Date().toISOString(),
      listings
    });
  } catch (error: any) {
    res.status(200).json({
      live: false,
      source: 'Property Finder scrape',
      reason: error?.message || 'Unknown error',
      listings: []
    });
  }
}
