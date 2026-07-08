/**
 * Pages blog server-rendered — SEO + GEO.
 *
 * Les articles quotidiens (table Supabase daily_posts, générés par
 * api/cron/seo-geo-optimizer.ts) n'étaient consommés que via JSON : invisibles
 * pour Google et les crawlers IA (qui n'exécutent pas le JS du SPA).
 *
 * Routes (rewrites vercel.json) :
 *   /blog            → index HTML de tous les articles
 *   /blog/:slug      → article complet en HTML statique + JSON-LD Article
 *
 * Le contenu est du markdown simple (titres, listes, gras, liens) rendu
 * côté serveur sans dépendance.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = 'https://dubainvest.eu';

// ─── Supabase ────────────────────────────────────────────────────────────────

async function supabase(path: string): Promise<any[] | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Markdown minimal → HTML ─────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMd(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function mdToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inlineMd(para.join(' '))}</p>`); para = []; }
  };
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const raw of lines) {
    const line = escapeHtml(raw.trim());
    if (!line) { flushPara(); closeList(); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara(); closeList();
      const lvl = Math.min(h[1].length + 1, 4); // # devient h2 (h1 = titre de page)
      out.push(`<h${lvl}>${inlineMd(h[2])}</h${lvl}>`);
      continue;
    }
    if (/^[*-]\s+/.test(line)) {
      flushPara();
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(line.replace(/^[*-]\s+/, ''))}</li>`);
      continue;
    }
    para.push(line);
  }
  flushPara(); closeList();
  return out.join('\n');
}

// ─── Layout HTML partagé ─────────────────────────────────────────────────────

function pageShell(opts: { title: string; description: string; canonical: string; jsonLd: object[]; body: string }): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<link rel="canonical" href="${opts.canonical}" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${opts.canonical}" />
<meta property="og:title" content="${escapeHtml(opts.title)}" />
<meta property="og:description" content="${escapeHtml(opts.description)}" />
<meta property="og:image" content="${BASE_URL}/NewLogoDubAInvestV2.png" />
<meta property="og:locale" content="fr_FR" />
${opts.jsonLd.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#050505; color:rgba(240,235,224,0.92); font-family:Manrope,-apple-system,sans-serif; line-height:1.75; }
  main { max-width:72ch; margin:0 auto; padding:48px 20px 80px; }
  h1,h2,h3 { font-family:Sora,Manrope,sans-serif; line-height:1.2; color:#fff; text-wrap:balance; }
  h1 { font-size:clamp(1.6rem,4.5vw,2.4rem); margin:0 0 8px; }
  h2 { font-size:1.35rem; margin-top:2.2em; }
  h3 { font-size:1.1rem; }
  a { color:#e2bf5c; }
  a:hover { color:#f0c060; }
  header.site { display:flex; align-items:center; justify-content:space-between; max-width:72ch; margin:0 auto; padding:20px; }
  header.site a.logo { font-family:Sora,sans-serif; font-weight:700; color:#D4AF37; text-decoration:none; font-size:1.05rem; }
  header.site nav a { margin-left:16px; font-size:0.85rem; text-decoration:none; color:rgba(240,235,224,0.75); }
  header.site nav a:hover { color:#e2bf5c; }
  .meta { color:rgba(240,235,224,0.60); font-size:0.85rem; margin-bottom:32px; }
  .cta { display:inline-block; margin-top:40px; padding:14px 28px; border-radius:999px; background:linear-gradient(135deg,#b8891e,#D4AF37 48%,#f0c060); color:#050505; font-weight:800; text-decoration:none; letter-spacing:0.04em; }
  ul.posts { list-style:none; padding:0; }
  ul.posts li { padding:14px 0; border-bottom:1px solid rgba(212,175,55,0.15); }
  ul.posts time { color:rgba(240,235,224,0.55); font-size:0.8rem; display:block; }
  footer.related { max-width:72ch; margin:0 auto; padding:0 20px 60px; border-top:1px solid rgba(212,175,55,0.15); }
  footer.related h2 { font-size:1rem; color:rgba(240,235,224,0.85); }
  footer.related a { display:block; margin:8px 0; font-size:0.9rem; }
</style>
</head>
<body>
<header class="site">
  <a class="logo" href="/">DubaiInvest</a>
  <nav>
    <a href="/blog">Analyses</a>
    <a href="/guide-visa-or-dubai">Golden Visa</a>
    <a href="/meilleurs-quartiers-dubai-investissement">Quartiers</a>
  </nav>
</header>
<main>${opts.body}</main>
<footer class="related">
  <h2>À lire aussi</h2>
  <a href="/analyse-geopolitique-dubai">Analyse géopolitique Dubaï : impact sur les prix et transactions</a>
  <a href="/guide-visa-or-dubai">Guide Golden Visa Dubaï : résidence 10 ans dès 545 000 €</a>
  <a href="/meilleurs-quartiers-dubai-investissement">Meilleurs quartiers où investir à Dubaï</a>
  <a href="/">Simulateur IA : rendement locatif personnalisé en 2 minutes</a>
</footer>
</body>
</html>`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(
  req: { query?: Record<string, string> },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (code: number) => { end: (body: string) => void };
  }
) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const slug = ((req as any).query?.slug ?? '').replace(/[^a-z0-9-]/g, '');

  // ── Article unique ──
  if (slug) {
    const rows = await supabase(`/daily_posts?select=title,slug,content,created_at&slug=eq.${slug}&limit=1`);
    const post = rows?.[0];
    if (!post) {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(404).end(pageShell({
        title: 'Article introuvable | DubaiInvest',
        description: 'Cet article n\'existe pas ou a été déplacé.',
        canonical: `${BASE_URL}/blog`,
        jsonLd: [],
        body: '<h1>Article introuvable</h1><p>Retrouvez toutes nos analyses du marché immobilier de Dubaï sur <a href="/blog">la page Analyses</a>.</p>',
      }));
    }

    const date = (post.created_at ?? '').slice(0, 10);
    const description = `${post.title} — analyse quotidienne du marché immobilier de Dubaï : prix, rendements locatifs et opportunités par quartier, données du ${date}.`;
    const canonical = `${BASE_URL}/blog/${post.slug}`;
    // Retire le H1 markdown initial (déjà rendu comme <h1> de page)
    const md = String(post.content ?? '').replace(/^#\s+.*\n/, '');

    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return res.status(200).end(pageShell({
      title: `${post.title} | DubaiInvest`,
      description,
      canonical,
      jsonLd: [{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        datePublished: post.created_at,
        dateModified: post.created_at,
        inLanguage: 'fr',
        mainEntityOfPage: canonical,
        author: { '@type': 'Organization', name: 'DubaiInvest AI Advisor', url: BASE_URL },
        publisher: { '@type': 'Organization', name: 'DubaiInvest AI Advisor', url: BASE_URL, logo: { '@type': 'ImageObject', url: `${BASE_URL}/NewLogoDubAInvestV2.png` } },
        image: `${BASE_URL}/NewLogoDubAInvestV2.png`,
      }, {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${BASE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Analyses du marché', item: `${BASE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
        ],
      }],
      body: `<h1>${escapeHtml(post.title)}</h1>
<p class="meta"><time datetime="${date}">Publié le ${date}</time> · DubaiInvest AI Advisor · Données PropertyFinder & DLD</p>
${mdToHtml(md)}
<a class="cta" href="/">Simuler mon investissement à Dubaï →</a>`,
    }));
  }

  // ── Index /blog ──
  const posts = (await supabase('/daily_posts?select=title,slug,created_at&order=created_at.desc&limit=90')) ?? [];
  res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=86400');
  return res.status(200).end(pageShell({
    title: 'Analyses quotidiennes du marché immobilier de Dubaï | DubaiInvest',
    description: 'Analyse quotidienne du marché immobilier de Dubaï générée à partir de données réelles : prix moyens par quartier, rendements locatifs, tendances et opportunités pour investisseurs francophones.',
    canonical: `${BASE_URL}/blog`,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Analyses du marché immobilier de Dubaï',
      url: `${BASE_URL}/blog`,
      inLanguage: 'fr',
      publisher: { '@type': 'Organization', name: 'DubaiInvest AI Advisor', url: BASE_URL },
      blogPost: posts.slice(0, 30).map((p: any) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: `${BASE_URL}/blog/${p.slug}`,
        datePublished: p.created_at,
      })),
    }],
    body: `<h1>Analyses du marché immobilier de Dubaï</h1>
<p class="meta">Un article par jour, généré à partir des annonces réelles (PropertyFinder) et des transactions DLD.</p>
${posts.length === 0
  ? '<p>Les premières analyses arrivent très bientôt. En attendant, découvrez nos <a href="/meilleurs-quartiers-dubai-investissement">guides quartiers</a>.</p>'
  : `<ul class="posts">${posts.map((p: any) => `<li><time datetime="${(p.created_at ?? '').slice(0, 10)}">${(p.created_at ?? '').slice(0, 10)}</time><a href="/blog/${p.slug}">${escapeHtml(p.title)}</a></li>`).join('')}</ul>`}
<a class="cta" href="/">Simuler mon investissement à Dubaï →</a>`,
  }));
}
