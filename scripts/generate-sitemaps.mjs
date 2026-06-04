import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = 'https://dubainvest.eu';
const today = new Date().toISOString().slice(0, 10);

const urls = [
  {
    loc: `${BASE_URL}/`,
    changefreq: 'daily',
    priority: '1.0',
  },
  {
    loc: `${BASE_URL}/analyse-geopolitique-dubai`,
    changefreq: 'weekly',
    priority: '0.9',
  },
  {
    loc: `${BASE_URL}/guide-visa-or-dubai`,
    changefreq: 'monthly',
    priority: '0.85',
  },
  {
    loc: `${BASE_URL}/meilleurs-quartiers-dubai-investissement`,
    changefreq: 'monthly',
    priority: '0.85',
  },
];

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE_URL}/sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>
`;

writeFileSync(join(process.cwd(), 'public', 'sitemap.xml'), sitemapXml, 'utf8');
writeFileSync(join(process.cwd(), 'public', 'sitemap_index.xml'), sitemapIndexXml, 'utf8');

console.log(`[sitemap] Generated sitemap.xml + sitemap_index.xml (${today})`);
