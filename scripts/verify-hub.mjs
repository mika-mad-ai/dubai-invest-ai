/**
 * Vérifie la logique pure de l'interface carte des résultats (niveaux de zoom,
 * poses de caméra, quartiers affichés, anti-chevauchement) sans navigateur.
 */
import { writeFileSync, mkdtempSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve, join } from 'path';
import { tmpdir } from 'os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = await import(pathToFileURL(resolve(ROOT, 'node_modules/esbuild/lib/main.js')).href);
const out = mkdtempSync(join(tmpdir(), 'verify-hub-'));
const entry = join(out, 'entry.ts');
writeFileSync(entry, `export * from '${ROOT}/components/hub/zoomLevels';`);
const bundlePath = join(out, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundlePath, logLevel: 'error' });
const m = await import(pathToFileURL(bundlePath).href);

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\nINTERFACE CARTE — niveaux de zoom');
check('zoom 10 → ville', m.levelForZoom(10) === 'city');
check('zoom 13 → quartier', m.levelForZoom(13) === 'district');
check('zoom 16 → immeuble', m.levelForZoom(16) === 'building');
check('zoom 17.5 → appartement', m.levelForZoom(17.5) === 'unit');
check('seuils strictement croissants', m.HUB_LEVELS.every((l, i, a) => i === 0 || l.minZoom > a[i - 1].minZoom));

console.log('\nINTERFACE CARTE — poses de caméra');
const pt = { lat: 25.0805, lng: 55.1403, precision: 'exact' };
for (const l of m.HUB_LEVELS) {
  const pose = m.cameraFor(l.id, pt, 120);
  check(`la pose « ${l.id} » retombe dans son propre niveau`, m.levelForZoom(pose.zoom) === l.id, `zoom ${pose.zoom}`);
}
check('sans bien localisé, toute pose revient à la ville', m.cameraFor('building', null).zoom === m.CITY_POSE.zoom);
check('position approximative : on reste plus haut qu\'en exact',
  m.cameraFor('building', { ...pt, precision: 'approx' }).zoom < m.cameraFor('building', pt).zoom);
check('niveaux rapprochés orientés vers la vue', m.cameraFor('unit', pt, 120).bearing === 120);

console.log('\nINTERFACE CARTE — quartiers');
const ds = m.districtPoints();
check('au moins 25 quartiers affichables', ds.length >= 25, String(ds.length));
check('une seule étiquette par zone DLD', new Set(ds.map(d => d.zone)).size === ds.length);
check('tous dans l\'agglomération de Dubaï', ds.every(d => d.lat > 24.6 && d.lat < 25.5 && d.lng > 54.8 && d.lng < 55.7));
check('triés par volume décroissant', ds.every((d, i) => i === 0 || d.volume12m <= ds[i - 1].volume12m));
check('médianes vraisemblables (500–6000 AED/sqft)', ds.every(d => d.aedSqft > 500 && d.aedSqft < 6000));
const jvc = m.districtOf('Jumeirah Village Circle, Dubai', 'Apartment', ds);
check('annonce JVC → étiquette JVC (alias le plus court)', jvc?.label === 'JVC', jvc?.label);
check('quartier inconnu → aucun point', m.districtOf('Quartier Imaginaire', 'Apartment', ds) === null);
const marina = m.districtOf('Dubai Marina, Dubai', 'Apartment', ds);
check('Marina plus chère que JVC', marina && jvc && m.pricePercentile(marina, ds) > m.pricePercentile(jvc, ds));
check('rang de prix borné 0–100', ds.every(d => { const p = m.pricePercentile(d, ds); return p >= 0 && p <= 100; }));

console.log('\nINTERFACE CARTE — anti-chevauchement des étiquettes');
const kept = m.placeWithoutOverlap([
  { x: 0, y: 0, w: 100, h: 20 },
  { x: 50, y: 5, w: 100, h: 20 },   // recouvre la 1re
  null,                              // hors écran
  { x: 0, y: 40, w: 100, h: 20 },   // libre
]);
check('la première (prioritaire) est gardée', kept.has(0));
check('celle qui la recouvre est masquée', !kept.has(1));
check('une boîte absente est ignorée', !kept.has(2));
check('une boîte libre est gardée', kept.has(3));

console.log(`\n${pass} vérifications passées, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
