import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = 'https://dubainvest.eu';
const today = new Date().toISOString().slice(0, 10);

const LOCALES = ['en', 'es', 'ru', 'zh', 'ar', 'af'];

const homeAlternates = [
  `    <xhtml:link rel="alternate" hreflang="fr" href="${BASE_URL}/"/>`,
  ...LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${BASE_URL}/${l}"/>`),
  `    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE_URL}/"/>`,
].join('\n');

const urls = [
  {
    loc: `${BASE_URL}/`,
    changefreq: 'daily',
    priority: '1.0',
    alternates: homeAlternates,
  },
  ...LOCALES.map((l) => ({
    loc: `${BASE_URL}/${l}`,
    changefreq: 'daily',
    priority: '0.9',
    alternates: homeAlternates,
  })),
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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.alternates ? '\n' + u.alternates : ''}
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
  <sitemap>
    <loc>${BASE_URL}/sitemap-blog.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>
`;

writeFileSync(join(process.cwd(), 'public', 'sitemap.xml'), sitemapXml, 'utf8');
writeFileSync(join(process.cwd(), 'public', 'sitemap_index.xml'), sitemapIndexXml, 'utf8');

console.log(`[sitemap] Generated sitemap.xml + sitemap_index.xml (${today})`);
