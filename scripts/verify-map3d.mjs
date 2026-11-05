/**
 * Vérifie la logique pure de la carte 3D (vues, choix de l'immeuble,
 * géocodage) sans navigateur ni réseau.
 */
import { writeFileSync, mkdtempSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve, join } from 'path';
import { tmpdir } from 'os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = await import(pathToFileURL(resolve(ROOT, 'node_modules/esbuild/lib/main.js')).href);
const out = mkdtempSync(join(tmpdir(), 'verify-map3d-'));
const entry = join(out, 'entry.ts');
writeFileSync(entry, `
export * from '${ROOT}/components/map3d/viewAnalysis';
export { buildingNameFrom, geocodeQuery, communityCentroid, resolveCoords } from '${ROOT}/components/map3d/geocode';
`);
const bundlePath = join(out, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundlePath, logLevel: 'error' });
const m = await import(pathToFileURL(bundlePath).href);

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};

// ── Vue mer ────────────────────────────────────────────────────────────────
const marina = m.estimateViews(25.0805, 55.1403);
const seaM = marina.find(v => v.kind === 'sea');
check('Dubai Marina : vue mer détectée', !!seaM);
check('Dubai Marina : la mer est à l’ouest (O/NO), pas au NE', seaM && ['O', 'NO'].includes(seaM.direction), seaM?.direction);
const palm = m.estimateViews(25.112, 55.139).find(v => v.kind === 'sea');
check('Palm Jumeirah : île → vue mer probable', palm?.likelihood === 'probable');
check('Palm Jumeirah : large côté NO/O/N (opposé au continent)', palm && ['N', 'NO', 'O'].includes(palm.direction), palm?.direction);
check('JVC (≈8 km de la côte) : aucune vue mer', !m.estimateViews(25.06, 55.21).some(v => v.kind === 'sea'));
check('Downtown : Burj Khalifa en vue probable', m.estimateViews(25.195, 55.276).some(v => v.label === 'Burj Khalifa' && v.likelihood === 'probable'));
check('4 vues max', m.estimateViews(25.0805, 55.1403).length <= 4);

const near = m.nearestOnPolyline(25.0, 55.0, [[25.0, 55.0], [25.0, 55.1]]);
check('nearestOnPolyline : point sur la ligne → 0 km', near.km < 0.001);
const mid = m.nearestOnPolyline(25.01, 55.05, [[25.0, 55.0], [25.0, 55.1]]);
check('nearestOnPolyline : projection au milieu du segment (pas au sommet)', Math.abs(mid.lng - 55.05) < 1e-6 && mid.km > 1.05 && mid.km < 1.2, JSON.stringify(mid));

// ── Choix de l'immeuble ────────────────────────────────────────────────────
const sq = (lng, lat, d, props, id) => ({
  id, properties: props,
  geometry: { type: 'Polygon', coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]] },
});
const target = sq(55.2087, 25.0612, 0.00015, { render_height: 62, name: 'Binghatti Corner' }, 1);
const tallFront = sq(55.2087, 25.0606, 0.00015, { render_height: 262 }, 2); // 65 m au sud, masque la cible en vue inclinée
check('pickBuilding : l’empreinte contenant le point gagne sur la tour voisine plus haute',
  m.pickBuilding([tallFront, target], 25.0612, 55.2087)?.properties.name === 'Binghatti Corner');
check('pickBuilding : socle + tour → la partie la plus haute',
  m.pickBuilding([sq(55.2087, 25.0612, 0.0003, { render_height: 12 }, 3), target], 25.0612, 55.2087)?.properties.render_height === 62);
check('pickBuilding : point sur le trottoir (~20 m) → immeuble le plus proche',
  m.pickBuilding([target], 25.0614, 55.2089)?.properties.name === 'Binghatti Corner');
check('pickBuilding : rien à moins de 35 m → null', m.pickBuilding([tallFront], 25.07, 55.22) === null);
const holed = { properties: {}, geometry: { type: 'Polygon', coordinates: [
  [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
] } };
check('geometryContains : un point dans un patio (trou) n’est pas dans l’immeuble', !m.geometryContains(holed.geometry, 5, 5) && m.geometryContains(holed.geometry, 2, 2));

// ── Géocodage ──────────────────────────────────────────────────────────────
check('buildingNameFrom : « 1 BR in Binghatti Corner, JVC » → Binghatti Corner', m.buildingNameFrom('1 BR in Binghatti Corner, JVC', 'Jumeirah Village Circle, Dubai') === 'Binghatti Corner');
check('geocodeQuery : immeuble + communauté', m.geocodeQuery('1 BR in Binghatti Corner, JVC', 'Jumeirah Village Circle, Dubai') === 'Binghatti Corner, Jumeirah Village Circle, Dubai');
check('geocodeQuery : pas de « Arjan, Arjan, Dubai »', m.geocodeQuery('Studio lumineux, Arjan', 'Arjan, Dubai') === 'Arjan, Dubai', m.geocodeQuery('Studio lumineux, Arjan', 'Arjan, Dubai'));
check('communityCentroid : « Dubai Hills Estate » → dubai hills, approx', m.communityCentroid('Dubai Hills Estate, Dubai')?.precision === 'approx');
check('communityCentroid : clé la plus longue d’abord (damac hills 2 ≠ damac hills)', m.communityCentroid('Damac Hills 2, Dubai')?.label === 'damac hills 2');

// resolveCoords : lat/lng fournis → exact, sans réseau
globalThis.fetch = async () => { throw new Error('réseau interdit dans ce test'); };
const exact = await m.resolveCoords({ title: 'x', location: 'Dubai Marina', lat: 25.08, lng: 55.14 });
check('resolveCoords : lat/lng de l’annonce → exact', exact?.precision === 'exact' && exact.lat === 25.08);
const approx = await m.resolveCoords({ title: 'Studio lumineux, Arjan', location: 'Arjan, Dubai' });
check('resolveCoords : sans immeuble → centroïde approx, sans appel réseau', approx?.precision === 'approx' && approx.label === 'arjan');
let calls = 0;
globalThis.fetch = async () => { calls++; return { ok: false, status: 429, json: async () => [] }; };
const r429 = await m.resolveCoords({ title: '1 BR in Binghatti Corner, JVC', location: 'Jumeirah Village Circle, Dubai' });
check('resolveCoords : Nominatim 429 → repli centroïde', r429?.precision === 'approx', JSON.stringify(r429));
globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => [{ lat: '25.0612', lon: '55.2087' }] }; };
const [a, b] = await Promise.all([
  m.resolveCoords({ title: '2 BR in Bloom Towers, JVC', location: 'JVC, Dubai' }),
  m.resolveCoords({ title: '2 BR in Bloom Towers, JVC', location: 'JVC, Dubai' }),
]);
check('resolveCoords : deux demandes simultanées → une seule requête Nominatim', calls === 2 && a?.precision === 'exact' && b?.lat === a?.lat, `calls=${calls}`);
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [{ lat: '48.85', lon: '2.35' }] });
const paris = await m.resolveCoords({ title: '2 BR in Rue de Rivoli, JVC', location: 'JVC, Dubai' });
check('resolveCoords : résultat hors Dubaï rejeté → centroïde', paris?.precision === 'approx');

// ── Géométrie ──────────────────────────────────────────────────────────────
const c = m.circlePolygon(25.06, 55.24, 0.45).geometry.coordinates[0];
check('circlePolygon : anneau fermé', c[0][0] === c[c.length - 1][0] && Math.abs(c[0][1] - c[c.length - 1][1]) < 1e-12);
check('circlePolygon : rayon ≈ 450 m', Math.abs(m.haversineKm(25.06, 55.24, c[16][1], c[16][0]) - 0.45) < 0.005);
const inf = m.inflateGeometry({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] }, 1.5);
check('inflateGeometry : agrandit autour du centre', inf.coordinates[0][0][0] === -0.5 && inf.coordinates[0][2][1] === 2.5, JSON.stringify(inf.coordinates));
check('floorsFromHeight : 190 m ≈ 61 étages', m.floorsFromHeight(190) === 61);

console.log(`\n${pass} vérifications passées, ${fail} échec(s)`);
if (fail) process.exit(1);
