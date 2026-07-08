/**
 * Sitemap dynamique des articles de blog quotidiens.
 *
 * Route : /sitemap-blog.xml (rewrite vercel.json)
 * Source : table Supabase daily_posts (alimentée chaque jour par
 * api/cron/seo-geo-optimizer.ts). Référencé par sitemap_index.xml et robots.txt.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = 'https://dubainvest.eu';

export default async function handler(
  _req: unknown,
  res: {
    setHeader: (k: string, v: string) => void;
    status: (code: number) => { end: (body: string) => void };
  }
) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=600');

  let posts: any[] = [];
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/daily_posts?select=slug,created_at&order=created_at.desc&limit=500`,
        {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          signal: AbortSignal.timeout(5_000),
        }
      );
      if (r.ok) posts = await r.json();
    } catch { /* sitemap vide plutôt qu'une 500 */ }
  }

  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    `  <url>\n    <loc>${BASE_URL}/blog</loc>\n    <lastmod>${(posts[0]?.created_at ?? today).slice(0, 10)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    ...posts.map(
      (p) => `  <url>\n    <loc>${BASE_URL}/blog/${p.slug}</loc>\n    <lastmod>${(p.created_at ?? today).slice(0, 10)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`
    ),
  ];

  return res.status(200).end(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
  );
}
