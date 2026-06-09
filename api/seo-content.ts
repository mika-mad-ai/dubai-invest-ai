/**
 * Endpoint qui expose le contenu SEO dynamique au frontend React.
 *
 * GET /api/seo-content
 * Retourne : meta_description + faq_schema + market_stats
 *
 * Le frontend injecte le faq_schema dans <head> → Google SGE / Gemini Overviews.
 * La meta_description est injectée dynamiquement dans <meta name="description">.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface SEORow {
  key: string;
  content: string;
  generated_at: string;
}

async function fetchSEORows(): Promise<SEORow[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/seo_content?key=in.(meta_description,faq_schema,market_stats)&select=key,content,generated_at`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        signal: AbortSignal.timeout(4_000),
      }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function handler(
  _req: unknown,
  res: {
    setHeader: (k: string, v: string) => void;
    status: (code: number) => { json: (data: object) => void };
  }
) {
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const rows = await fetchSEORows();
  const byKey: Record<string, string> = {};
  for (const row of rows) byKey[row.key] = row.content;

  let faq_schema: object | null = null;
  try {
    if (byKey.faq_schema) faq_schema = JSON.parse(byKey.faq_schema);
  } catch { /* ignore */ }

  const generated_at = rows[0]?.generated_at ?? null;

  return res.status(200).json({
    meta_description: byKey.meta_description ?? null,
    faq_schema,
    market_stats: byKey.market_stats ?? null,
    generated_at,
    fresh: generated_at ? (Date.now() - new Date(generated_at).getTime()) < 25 * 60 * 60 * 1000 : false,
  });
}
