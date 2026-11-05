// Prérequis (hors package.json, outillage de test uniquement) :
//   npm i --no-save geojson-vt@3.2.1 vt-pbf@3.1.3   puis   npm run dev
//   node scripts/visual/map3d-harness.cjs <dossier-sortie> [desktop|mobile|reduced] [t-exact|t-geocoded|t-approx]
// Banc de test visuel de la carte 3D (fixtures locales : tuiles synthétiques,
// annonces de test, Nominatim simulé). Aucun appel à un service payant.
// usage: node run.cjs <outDir> [desktop|mobile|reduced] [case...]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { makeTileServer } = require('./synthetic-tiles.cjs');

const OUT = process.argv[2];
const MODE = process.argv[3] || 'desktop';
const ONLY = process.argv.slice(4);
const BASE = process.env.BASE || 'http://localhost:5173';
fs.mkdirSync(OUT, { recursive: true });

const LISTINGS = [
  { id: 't-exact', title: '2 BR in Marina Gate 1, Dubai Marina', location: 'Dubai Marina, Dubai', price: 520000, yield: 6.8, type: 'Apartment', image: '/hero-poster.jpg', beds: 2, baths: 2, sqm: 112, completion: 'Ready', lat: 25.0805, lng: 55.1403, source: 'propertyfinder', sourceUrl: 'https://example.invalid/1' },
  { id: 't-geocoded', title: '1 BR in Binghatti Corner, JVC', location: 'Jumeirah Village Circle, Dubai', price: 210000, yield: 7.6, type: 'Apartment', image: '/hero-poster.jpg', beds: 1, baths: 1, sqm: 68, completion: 'Ready', source: 'propertyfinder', sourceUrl: 'https://example.invalid/2' },
  { id: 't-approx', title: 'Studio lumineux, Arjan', location: 'Arjan, Dubai', price: 145000, yield: 7.9, type: 'Apartment', image: '/hero-poster.jpg', beds: 0, baths: 1, sqm: 38, completion: 'Ready', source: 'propertyfinder', sourceUrl: 'https://example.invalid/3' },
];
const GEOCODED = { lat: 25.0612, lng: 55.2087 };
const tile = makeTileServer([
  { lat: 25.0805, lng: 55.1403, named: 'Marina Gate 1', h: 190, place: 'Dubai Marina' },
  { ...GEOCODED, named: 'Binghatti Corner', h: 62, place: 'Jumeirah Village Circle' },
  { lat: 25.062, lng: 55.242, place: 'Arjan' },
]);

const log = [];
const shot = async (page, name) => {
  const p = path.join(OUT, `${MODE}-${name}.png`);
  await page.screenshot({ path: p });
  log.push(`shot ${p}`);
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctxOpts = MODE === 'mobile'
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
  if (MODE === 'reduced') ctxOpts.reducedMotion = 'reduce';
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();

  const nominatimCalls = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) log.push(`console.${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => log.push(`pageerror: ${e.message}`));

  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname === 'localhost') {
      if (u.pathname === '/api/live-listings') return route.fulfill({ json: { live: true, listings: LISTINGS, statuses: [{ source: 'fixture', ok: true, count: 3 }] } });
      if (u.pathname.startsWith('/api/') && !/\.(ts|tsx|js|mjs)$/.test(u.pathname)) return route.fulfill({ status: 503, json: { live: false, reason: 'fixture: api hors ligne en dev' } });
      return route.continue();
    }
    if (u.hostname === 'tiles.openfreemap.org') {
      if (u.pathname === '/planet') return route.fulfill({ json: { tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/mock/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } });
      const m = u.pathname.match(/^\/mock\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
      if (m) return route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: tile(+m[1], +m[2], +m[3]) });
      if (u.pathname.startsWith('/fonts/')) return route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
    }
    if (u.hostname === 'nominatim.openstreetmap.org') {
      const q = u.searchParams.get('q') || '';
      nominatimCalls.push(q);
      const rows = /binghatti/i.test(q) ? [{ lat: String(GEOCODED.lat), lon: String(GEOCODED.lng), display_name: 'Binghatti Corner' }] : [];
      return route.fulfill({ json: rows });
    }
    return route.abort();
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Parcours questionnaire : on clique la 1re option jusqu'au formulaire final.
  await page.evaluate(() => document.getElementById('decision-tree')?.scrollIntoView());
  for (let i = 0; i < 30; i++) {
    const form = page.locator('#decision-tree form');
    if (await form.count() && await form.first().isVisible()) break;
    // option de l'étape la plus basse dans la page = étape courante
    const target = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('#decision-tree button:not([disabled])')]
        .filter(b => b.offsetParent && (b.innerText || '').trim().length > 2 && !/retour|back|précédent|modifier/i.test(b.innerText));
      if (!bs.length) return null;
      const withY = bs.map(b => { const r = b.getBoundingClientRect(); return { b, y: r.top + window.scrollY, x: r.left }; });
      const maxY = Math.max(...withY.map(o => o.y));
      const row = withY.filter(o => o.y > maxY - 60).sort((a, c) => a.x - c.x);
      document.querySelectorAll('[data-h]').forEach(e => e.removeAttribute('data-h'));
      row[0].b.setAttribute('data-h', '1');
      return true;
    });
    if (!target) break;
    await page.locator('[data-h="1"]').scrollIntoViewIfNeeded();
    await page.locator('[data-h="1"]').click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  const inputs = page.locator('#decision-tree form input:not([type=range]):not([type=checkbox])');
  for (let k = 0; k < await inputs.count(); k++) {
    const el = inputs.nth(k);
    const type = await el.getAttribute('type');
    await el.fill(type === 'email' ? 'test@example.invalid' : type === 'tel' ? '+33600000000' : 'Test Fixture');
  }
  const boxes = page.locator('#decision-tree form input[type=checkbox]');
  for (let k = 0; k < await boxes.count(); k++) await boxes.nth(k).check().catch(() => {});
  await page.locator('#decision-tree form [type=submit]').click({ timeout: 8000 });
  await page.waitForTimeout(3000);

  const btns = page.getByRole('button', { name: 'Carte 3D' });
  await btns.first().waitFor({ timeout: 20000 });
  log.push(`boutons Carte 3D: ${await btns.count()}`);
  await btns.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot(page, '00-cards');

  const cases = [['t-exact', 0], ['t-geocoded', 1], ['t-approx', 2]].filter(([id]) => !ONLY.length || ONLY.includes(id));
  for (const [id] of cases) {
    const listing = LISTINGS.find(l => l.id === id);
    await page.evaluate(title => {
      document.querySelectorAll('[data-m3d]').forEach(e => e.removeAttribute('data-m3d'));
      const h = [...document.querySelectorAll('h3')].find(e => e.textContent.includes(title));
      let el = h; while (el && !el.querySelector('button[aria-haspopup=dialog]')) el = el.parentElement;
      el?.querySelector('button[aria-haspopup=dialog]')?.setAttribute('data-m3d', '1');
    }, listing.title);
    const btn = page.locator('[data-m3d="1"]');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForTimeout(MODE === 'reduced' ? 400 : 1200);
    await shot(page, `${id}-1-arrivee`);
    await page.waitForTimeout(MODE === 'reduced' ? 2500 : 3200);
    await shot(page, `${id}-2-vol`);
    await page.waitForTimeout(MODE === 'reduced' ? 1500 : 4500);
    await shot(page, `${id}-3-scene`);
    const info = await page.evaluate(() => {
      const panel = document.querySelector('.m3d-panel');
      return { panel: panel?.innerText.replace(/\s+/g, ' ').slice(0, 400), gold: !!document.querySelector('.m3d-root') };
    });
    log.push(`${id} panel: ${info.panel}`);
    await page.keyboard.press('Escape');
    await page.locator('[role=dialog]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    log.push(`${id} dialog fermé: ${!(await page.locator('[role=dialog]').count())}`);
  }
  log.push(`nominatim: ${JSON.stringify(nominatimCalls)}`);
  fs.writeFileSync(path.join(OUT, `${MODE}-log.txt`), log.join('\n'));
  console.log(log.join('\n'));
  await browser.close();
})().catch(e => { console.error('HARNESS FAIL', e); console.log(log.join('\n')); process.exit(1); });
