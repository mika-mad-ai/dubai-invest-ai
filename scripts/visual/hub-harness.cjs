// Prérequis (hors package.json, outillage de test uniquement) :
//   npm i --no-save geojson-vt@3.2.1 vt-pbf@3.1.3   puis   npm run dev
//   node scripts/visual/hub-harness.cjs <dossier-sortie> [desktop|wide|mobile|reduced]
// Banc de test visuel de l'interface carte des résultats (ResultsHub) (fixtures locales : tuiles synthétiques,
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
  { id: 't-near1', title: '1 BR in Marina Promenade', location: 'Dubai Marina, Dubai', price: 310000, yield: 6.1, type: 'Apartment', image: '/hero-poster.jpg', beds: 1, baths: 1, sqm: 74, completion: 'Ready', lat: 25.0772, lng: 55.1352, source: 'propertyfinder', sourceUrl: 'https://example.invalid/4' },
  { id: 't-near2', title: 'Studio in JLT Cluster D', location: 'JLT, Dubai', price: 160000, yield: 7.2, type: 'Apartment', image: '/hero-poster.jpg', beds: 0, baths: 1, sqm: 41, completion: 'Ready', lat: 25.0712, lng: 55.1412, source: 'propertyfinder', sourceUrl: 'https://example.invalid/5' },
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
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctxOpts = MODE === 'mobile'
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: MODE === 'wide' ? { width: 1720, height: 960 } : { width: 1440, height: 900 }, deviceScaleFactor: 1 };
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


  await page.locator('.hub-stage').waitFor({ timeout: 20000 });
  const state = async label => {
    const s = await page.evaluate(() => ({
      level: document.querySelector('.hub-stage')?.getAttribute('data-level'),
      title: document.querySelector('.hub-head h2')?.textContent,
      tabs: [...document.querySelectorAll('.hub-panel .hub-tabs button, .hub-sheet-body .hub-head .hub-tabs button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join('|'),
      card: document.querySelector('.hub-card')?.className + ' :: ' + (document.querySelector('.hub-card h3')?.textContent || document.querySelector('.hub-card')?.textContent?.slice(0, 80)),
      pills: [...document.querySelectorAll('.hub-pill')].filter(e => !e.classList.contains('off')).length + '/' + document.querySelectorAll('.hub-pill').length,
      dots: document.querySelectorAll('.hub-dot').length,
      readout: document.querySelector('.hub-readout')?.textContent,
      body: document.querySelector('.hub-body')?.innerText.replace(/\s+/g, ' ').slice(0, 260),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    log.push(`[${label}] ${JSON.stringify(s)}`);
  };
  const wait = ms => page.waitForTimeout(ms);
  const clickStep = async name => { await page.locator('.hub-stepper button', { hasText: name }).click(); await wait(MODE === 'reduced' ? 1200 : 5200); };
  const tab = async name => { await page.locator('.hub-head .hub-tabs button', { hasText: name }).click(); await wait(1400); };
  const openAnalyses = async () => { if (MODE === 'mobile') { const b = page.locator('.hub-sheet-bar button').first(); if (!(await b.getAttribute('class') || '').includes('on')) await b.click(); await wait(500); } };
  const closeSheet = async () => { if (MODE === 'mobile') { const b = page.locator('.hub-sheet-bar button.on'); if (await b.count()) await b.click(); await wait(400); } };

  await wait(900);
  await shot(page, '01-ville-depart'); await state('depart');
  await wait(MODE === 'reduced' ? 1500 : 3000);
  await shot(page, '02-travelling');
  await wait(MODE === 'reduced' ? 1500 : 6500);
  await shot(page, '03-arrivee-immeuble'); await state('arrivee');
  await openAnalyses(); await shot(page, '04-immeuble-panneau'); await closeSheet();

  await clickStep('Appartement'); await state('appartement');
  await openAnalyses(); await shot(page, '05-appartement-bien');
  await tab('Trésorerie'); await shot(page, '06-appartement-tresorerie');
  await tab('Frais'); await shot(page, '07-appartement-frais'); await closeSheet();

  await clickStep('Quartier'); await state('quartier');
  await openAnalyses(); await shot(page, '08-quartier-prix');
  await tab('Location'); await shot(page, '09-quartier-location'); await closeSheet();

  await clickStep('Ville'); await state('ville');
  await openAnalyses(); await shot(page, '10-ville-marche');
  await tab('Projection'); await shot(page, '11-ville-projection');
  await tab('Fiscalité'); await shot(page, '12-ville-fiscalite'); await closeSheet();

  // Clic sur une étiquette de quartier → descente dans ce quartier.
  const pill = page.locator('.hub-pill:not(.off):not(.active)').first();
  if (await pill.count()) {
    log.push(`pill cliquée: ${await pill.textContent()}`);
    await pill.click({ force: true }); await wait(MODE === 'reduced' ? 1200 : 4200);
    await state('quartier-clique'); await openAnalyses(); await shot(page, '13-quartier-clique'); await closeSheet();
  } else log.push('aucune étiquette de quartier visible');

  // Bien suivant : nouveau travelling, la fiche ressort de la carte.
  if (MODE !== 'mobile') {
    await page.locator('.hub-pager button[aria-label="Bien suivant"]').click();
    await wait(700); await shot(page, '14-bien-suivant-depart');
    await wait(MODE === 'reduced' ? 2500 : 7500);
    await state('bien-suivant'); await shot(page, '15-bien-suivant-arrivee');
    // Conseiller
    const reopen = page.locator('.hub-reopen.right');
    if (await reopen.count()) { await reopen.click(); await wait(900); }
    await shot(page, '16-conseiller-ouvert');
  } else {
    await page.locator('.hub-sheet-bar button').nth(1).click(); await wait(900);
    await shot(page, '16-conseiller-ouvert');
  }

  log.push(`nominatim: ${JSON.stringify(nominatimCalls)}`);
  fs.writeFileSync(path.join(OUT, `${MODE}-log.txt`), log.join('\n'));
  console.log(log.join('\n'));
  await browser.close();
})().catch(e => { console.error('HARNESS FAIL', e); console.log(log.join('\n')); process.exit(1); });
