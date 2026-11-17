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
  await page.locator('.cc-stage').waitFor({ timeout: 20000 });

  // Parcours d'accueil : le chat de qualification, puis sa transformation en carte.
  await page.waitForTimeout(MODE === 'reduced' ? 300 : 900);
  await shot(page, 'a0-intro');
  // Ordinateur : l'introduction est pilotée par le défilement.
  const scrub = await page.locator('.cc-track.scrub').count();
  log.push('mode intro: ' + (await page.locator('.cc-track').getAttribute('class')));
  if (scrub) {
    const end = await page.evaluate(() => { const t = document.querySelector('.cc-track'); return t.offsetTop + t.offsetHeight - innerHeight; });
    await page.evaluate(y => window.scrollTo(0, y), Math.round(end * 0.5)); await page.waitForTimeout(1200);
    await shot(page, 'a0b-intro-mi-course');
    log.push('mi-course: ' + JSON.stringify(await page.evaluate(() => ({ t: +document.querySelector('.cc-video').currentTime.toFixed(2), intro: document.querySelector('.cc-stage').className }))));
    await page.evaluate(y => window.scrollTo(0, y), end); await page.waitForTimeout(1800);
    log.push('fin: ' + JSON.stringify(await page.evaluate(() => ({ t: +document.querySelector('.cc-video').currentTime.toFixed(2), intro: document.querySelector('.cc-stage').className, top: Math.round(document.querySelector('.cc-stage').getBoundingClientRect().top) }))));
  } else {
    await page.waitForTimeout(MODE === 'reduced' ? 400 : 2900);
  }
  // Tout en bas de la page, l'écran du chat doit rester cadré (rien dessous).
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(1700);
  log.push('bas de page: ' + JSON.stringify(await page.evaluate(() => { const r = document.querySelector('.cc-stage').getBoundingClientRect(); const l = document.querySelector('.cc-video.loop'); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, boucle: l ? { opacity: getComputedStyle(l).opacity, paused: l.paused, t: +l.currentTime.toFixed(2) } : null }; })));
  await shot(page, 'a1-chat-accueil');
  await page.locator('.cc-more').click(); await page.waitForTimeout(500); await shot(page, 'a1b-guides');
  await page.locator('[role=dialog] button[aria-label=Fermer]').click(); await page.waitForTimeout(300);
  if ((process.env.FLOW || 'typed') === 'typed') {
    // Recherche écrite : le conseiller part chercher tout de suite, sans autre question.
    await page.locator('.cc-input input').fill('300 000 €, je veux un loyer mensuel');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    log.push('fil (recherche): ' + (await page.evaluate(() => document.querySelector('.cc-log')?.innerText || '(déjà sur la carte)')).replace(/\s+/g, ' ').slice(0, 400));
    await shot(page, 'a3-chat-recherche');
    await page.locator('.hub-stage').waitFor({ timeout: 20000 });
    await page.waitForTimeout(250); await shot(page, 'a6-morph-1');
    await page.waitForTimeout(350); await shot(page, 'a7-morph-2');
    await page.waitForTimeout(450); await shot(page, 'a8-morph-3');
  } else {
    // Parcours guidé : uniquement des clics, puis les coordonnées.
    for (let i = 0; i < 12; i++) {
      if (await page.locator('.cc-contact').count()) break;
      await page.locator('.cc-opt').first().click();
      await page.waitForTimeout(160);
      if (i === 1) await shot(page, 'a4-chat-glissement');
      await page.waitForTimeout(700);
      if (i === 1) await shot(page, 'a3-chat-budget');
    }
    log.push('fil (guidé): ' + (await page.locator('.cc-log').innerText()).replace(/\s+/g, ' ').slice(0, 700));
    await page.locator('.cc-fields input[type=text]').fill('Test Fixture');
    await page.locator('.cc-fields input[type=email]').fill('test@example.invalid');
    await shot(page, 'a5-chat-coordonnees');
    await page.locator('.cc-go').click();
    await page.waitForTimeout(250); await shot(page, 'a6-morph-1');
    await page.waitForTimeout(350); await shot(page, 'a7-morph-2');
    await page.waitForTimeout(450); await shot(page, 'a8-morph-3');
  }

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
      volets: (document.querySelector('.hub-panel') ? 'analyses ' : '') + (document.querySelector('.hub-dock') ? 'conseiller' : '') + (document.querySelector('.hub-sheet')?.className || ''),
      chat: document.querySelector('.hub-dock, .hub-sheet-body.advisor')?.innerText.replace(/\s+/g, ' ').slice(0, 160),
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
  // Arrivé par une recherche écrite, le conseiller est ouvert et les analyses repliées : on les rouvre pour la suite.
  if (await page.locator('.hub-reopen.left').count()) { await page.locator('.hub-reopen.left').click(); await wait(600); await shot(page, '03b-deux-volets'); }
  await openAnalyses(); await shot(page, '04-immeuble-panneau'); await closeSheet();

  // On se place sur un bien localisé exactement (immeuble connu) pour le niveau Appartement.
  if (MODE !== 'mobile') {
    for (let i = 0; i < 5; i++) {
      if (/Marina Gate/.test(await page.locator('.hub-card h3').innerText())) break;
      await page.locator('.hub-pager button[aria-label="Bien suivant"]').click();
      await wait(MODE === 'reduced' ? 2500 : 7500);
    }
    await state('bien-exact');
  }
  await clickStep('Appartement'); await state('appartement');
  await openAnalyses(); await shot(page, '05-appartement-bien');
  // L'appartement dans la tour : on monte le curseur d'étage et la tranche suit.
  const floorInfo = async () => page.evaluate(() => ({ etage: document.querySelector('.hub-floor-n')?.textContent, bloc: document.querySelector('.hub-floor')?.innerText.replace(/\s+/g, ' ').slice(0, 260) }));
  log.push('étage initial: ' + JSON.stringify(await floorInfo()));
  await page.evaluate(() => { const el = document.querySelector('.hub-floor input[type=range]'); if (!el) return; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(Math.round(Number(el.max) * 0.85))); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await wait(1500); log.push('étage réglé: ' + JSON.stringify(await floorInfo()));
  await shot(page, '05b-appartement-etage-haut');
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
