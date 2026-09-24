/**
 * Vérifie la sélection des faits du post quotidien, sans base ni clé API.
 *
 * Ce que ces assertions protègent : le rendu du 19 septembre 2026 sortait trois
 * slides sur Jumeirah Village Circle. Les faits étaient pourtant tous distincts
 * — c'est la zone qui domine l'arrivage, donc elle remportait mécaniquement le
 * rendement, le ticket d'entrée ET le volume. Un carrousel qui répète trois fois
 * le même nom se lit comme un post recyclé, exactement ce qu'on veut éviter.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve, join } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = await import(pathToFileURL(resolve(ROOT, 'node_modules/esbuild/lib/main.js')).href);
// Le bundle doit vivre DANS le projet : `sharp` reste externe pour garder son
// binaire natif, et node ne le résoudrait pas depuis /tmp.
const out = resolve(ROOT, 'node_modules', '.verify-social');
mkdirSync(out, { recursive: true });

const entry = join(out, 'entry.ts');
writeFileSync(entry, `export { selectFacts, num } from '${ROOT}/api/lib/socialFacts';\nexport { originalVariant, watermarkScore, WATERMARK_SCORE_MAX } from '${ROOT}/api/lib/watermark';\n`);
const bundlePath = join(out, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundlePath, logLevel: 'error', external: ['sharp'], absWorkingDir: ROOT });
const m = await import(pathToFileURL(bundlePath).href);

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};

const fact = (kind, zone, weight, id, photo) => ({
  kind, kicker: kind, headline: zone, value: 'x', context: [],
  listingId: id, photoUrl: photo, weight,
});

// ── Diversité de quartier ────────────────────────────────────────────────────
console.log('\nSÉLECTION DES FAITS DU JOUR');

// Cas réel reproduit : JVC arrive en tête des trois familles.
const dominated = [
  [fact('best_new', 'JVC', 95, 'a', 'pa'), fact('best_new', 'Marina', 95, 'b', 'pb')],
  [fact('entry_ticket', 'JVC', 80, 'c', 'pc'), fact('entry_ticket', 'Business Bay', 80, 'd', 'pd')],
  [fact('zone_surge', 'JVC', 90, 'e', 'pe'), fact('zone_surge', 'Marina', 88, 'f', 'pf')],
];
const s1 = m.selectFacts(dominated);
check('trois faits retenus', s1.chosen.length === 3, `${s1.chosen.length}`);
check('trois quartiers distincts malgré une zone dominante',
  new Set(s1.chosen.map(f => f.headline)).size === 3,
  s1.chosen.map(f => f.headline).join(', '));
check('trois familles distinctes', new Set(s1.chosen.map(f => f.kind)).size === 3);
check('aucune annonce réutilisée', new Set(s1.chosen.map(f => f.listingId)).size === 3);
check('aucune photo réutilisée', new Set(s1.chosen.map(f => f.photoUrl)).size === 3);

// La famille la plus lourde doit passer en premier.
check('le fait le plus saillant est retenu', s1.chosen[0].kind === 'best_new', s1.chosen[0].kind);

// ── Marché concentré : on complète plutôt que de rendre un carrousel amputé ──
const concentrated = [
  [fact('best_new', 'JVC', 95, 'a', 'pa')],
  [fact('entry_ticket', 'JVC', 80, 'b', 'pb')],
  [fact('premium_new', 'JVC', 70, 'c', 'pc')],
];
const s2 = m.selectFacts(concentrated);
check('un marché mono-quartier rend quand même trois slides', s2.chosen.length === 3, `${s2.chosen.length}`);
check('… en gardant des annonces différentes', new Set(s2.chosen.map(f => f.listingId)).size === 3);

// ── Une même annonce proposée par deux familles ne doit sortir qu'une fois ───
const overlap = [
  [fact('best_new', 'Marina', 95, 'dup', 'pdup')],
  [fact('entry_ticket', 'JVC', 80, 'dup', 'pdup')],
  [fact('premium_new', 'Downtown', 70, 'z', 'pz')],
];
const s3 = m.selectFacts(overlap);
check('une annonce proposée deux fois n\'est retenue qu\'une fois',
  s3.chosen.filter(f => f.listingId === 'dup').length === 1,
  s3.chosen.map(f => `${f.kind}:${f.listingId}`).join(', '));

// ── Familles vides ───────────────────────────────────────────────────────────
const sparse = m.selectFacts([[], [fact('best_new', 'JVC', 95, 'a', 'pa')], []]);
check('des familles vides ne cassent pas la sélection', sparse.chosen.length === 1);

// ── Formatage des nombres ────────────────────────────────────────────────────
// `fr-FR` sépare les milliers avec U+202F, que les polices embarquées n'ont pas :
// rendu tel quel, satori dessine un carré. Le défaut était visible sur le prix.
console.log('\nFORMATAGE DES NOMBRES');
const formatted = m.num(137349);
check('aucun espace exotique dans les milliers', !/[^\x00-\x7F]/.test(formatted), JSON.stringify(formatted));
check('les milliers restent séparés', /^137 349$/.test(formatted), JSON.stringify(formatted));

// ── Préférence pour les candidats illustrés ──────────────────────────────────
// Le contrôle de filigrane retire sa photo à un candidat marqué. La sélection
// doit alors préférer, DANS LA MÊME FAMILLE, un autre quartier encore illustré
// plutôt que de sortir une slide sobre.
const withPhotoLost = [
  [{ ...fact('best_new', 'JVC', 95, 'a', 'pa'), photoUrl: undefined }, fact('best_new', 'Marina', 95, 'b', 'pb')],
  [fact('entry_ticket', 'Downtown', 80, 'c', 'pc')],
  [fact('zone_surge', 'Business Bay', 60, 'd', 'pd')],
];
const s4 = m.selectFacts(withPhotoLost);
check('un candidat privé de photo cède la place à un candidat illustré',
  s4.chosen.find(f => f.kind === 'best_new')?.headline === 'Marina',
  s4.chosen.find(f => f.kind === 'best_new')?.headline);
check('toutes les slides retenues sont illustrées', s4.chosen.every(f => f.photoUrl));

// Une famille entièrement démarquée doit quand même sortir : l'information
// prime, la slide sera simplement typographique.
const allLost = [
  [{ ...fact('best_new', 'JVC', 95, 'a', 'pa'), photoUrl: undefined }],
  [fact('entry_ticket', 'Downtown', 80, 'c', 'pc')],
];
const s5 = m.selectFacts(allLost);
check('une famille sans photo reste publiée', s5.chosen.length === 2, `${s5.chosen.length}`);

// ── Variante d'image sans filigrane CDN ──────────────────────────────────────
console.log('\nPHOTOS SANS FILIGRANE');
const pf = 'https://static.shared.propertyfinder.ae/media/images/listing/ABC/def/668x452.jpg?v=1';
check('la vignette redimensionnée est remplacée par original.jpg',
  m.originalVariant(pf).includes('/original.jpg?v=1'), m.originalVariant(pf));
check('une URL sans segment de taille est laissée intacte',
  m.originalVariant('https://x.test/a.jpg') === 'https://x.test/a.jpg');

// Le seuil est la seule valeur réglée à la main du détecteur : s'il dérive vers
// le haut, des photos marquées repassent. Bornes issues de l'échantillon
// étiqueté (marque la plus discrète 0,19 · photo propre la mieux notée 0,14).
check('le seuil de filigrane reste sous la marque la plus discrète mesurée',
  m.WATERMARK_SCORE_MAX < 0.19 && m.WATERMARK_SCORE_MAX > 0.02, `${m.WATERMARK_SCORE_MAX}`);

// Deux résidus identiques corrèlent à 1 : le score doit le voir.
const flat = n => { const a = new Float64Array(512 * 512); for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * n); return a; };
const same = flat(0.7);
check('deux photos portant le même motif scorent au maximum',
  m.watermarkScore([same, same]) > 0.99, `${m.watermarkScore([same, same]).toFixed(3)}`);

console.log(`\n${pass} vérifications passées, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
