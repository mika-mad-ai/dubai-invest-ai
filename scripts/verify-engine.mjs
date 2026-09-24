/**
 * Vérifie la logique métier pure (matching, prix, scoring) sans clé API.
 * Compile les modules TS à la volée via esbuild, déjà présent dans node_modules (vite).
 */
import { writeFileSync, mkdtempSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { join } from 'path';

// Racine du projet, robuste aux espaces dans le chemin (fileURLToPath décode l'URL).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = await import(pathToFileURL(resolve(ROOT, 'node_modules/esbuild/lib/main.js')).href);
const out = mkdtempSync(join(tmpdir(), 'verify-'));

const entry = join(out, 'entry.ts');
writeFileSync(entry, `
export { scoreListing, matchListings, allInCost } from '${ROOT}/api/lib/matchEngine';
export { checkPrice, netYield, benchmarkFor } from '${ROOT}/api/lib/priceCheck';
export { scoreLead, nextQualifyingQuestion } from '${ROOT}/api/lib/leadScore';
`);

const bundlePath = join(out, 'bundle.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  logLevel: 'error',
});

const m = await import(pathToFileURL(bundlePath).href);

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};

// ── priceCheck ────────────────────────────────────────────────────────────────
console.log('\nCONTRÔLE PRIX vs MARCHÉ');
// Le prix « au marché » est dérivé de la grille, pas codé en dur : sinon un
// recalage de la grille casserait ces tests sans que ce soit un vrai défaut.
const jvcFair = Math.round((60 * 10.7639 * m.benchmarkFor('Jumeirah Village Circle').value) / 4.24);
const fair = m.checkPrice(jvcFair, 60, 'Jumeirah Village Circle');
check('un bien au prix de référence est jugé "fair"', fair.code === 'fair', `code=${fair.code} delta=${fair.deltaPct?.toFixed(1)}`);

const cheap = m.checkPrice(Math.round(jvcFair * 0.8), 60, 'Jumeirah Village Circle');
check('−20 % → well_below', cheap.code === 'well_below', `code=${cheap.code}`);

const pricey = m.checkPrice(Math.round(jvcFair * 1.25), 60, 'JVC');
check('+25 % → well_above', pricey.code === 'well_above', `code=${pricey.code}`);

check('surface manquante → unknown, sans crash', m.checkPrice(500000, 0, 'JVC').code === 'unknown');

// Garde-fou de vraisemblance : c'est l'assertion qui empêche la grille de
// référence de dériver. Une grille trop haute ferait passer tout bien surévalué
// pour une aubaine — le pire mode de défaillance du système.
console.log('\nVRAISEMBLANCE DE LA GRILLE DE RÉFÉRENCE');
const realWorld = [
  // quartier, surface m², fourchette réelle du prix de marché en EUR
  ['Jumeirah Village Circle', 45, 120000, 185000],
  ['Downtown Dubai', 70, 350000, 520000],
  ['Dubai Marina', 90, 350000, 550000],
  ['Palm Jumeirah', 150, 1000000, 1500000],
  ['Business Bay', 60, 200000, 320000],
];
for (const [loc, sqm, lo, hi] of realWorld) {
  const implied = Math.round((m.benchmarkFor(loc).value * sqm * 10.7639) / 4.24);
  check(
    `${loc} ${sqm} m² → prix de référence plausible`,
    implied >= lo && implied <= hi,
    `implique ${implied.toLocaleString('fr-FR')} €, attendu ${lo.toLocaleString('fr-FR')}–${hi.toLocaleString('fr-FR')} €`
  );
}

// Une moyenne DLD toutes-zones mal branchée ne doit pas pouvoir écraser la
// grille quartier : le garde-fou d'unité rejette les valeurs invraisemblables.
check('valeur AED/sqft aberrante ignorée', m.checkPrice(150000, 45, 'JVC', 45000).basis === 'benchmark');
check('valeur AED/sqft de quartier plausible acceptée', m.checkPrice(150000, 45, 'JVC', 1400).basis === 'dld');
check('Palm Jumeirah reconnu', m.benchmarkFor('Palm Jumeirah, Dubai').key === 'palm jumeirah');
check('variante "Jumeirah Village" mappe sur JVC', m.benchmarkFor('Jumeirah Village Triangle').key === 'jvc');
check('quartier inconnu retombe sur "other"', m.benchmarkFor('Zone Inconnue').key === 'other');

// ── netYield ──────────────────────────────────────────────────────────────────
console.log('\nRENDEMENT NET');
const ny = m.netYield({ priceEur: 300000, grossYieldPct: 8, sqm: 60, serviceChargesSqft: 16 });
check('net strictement inférieur au brut', ny !== null && ny < 8, `net=${ny}`);
check('net reste plausible (> 3 %)', ny !== null && ny > 3, `net=${ny}`);
check('brut nul → null', m.netYield({ priceEur: 300000, grossYieldPct: 0, sqm: 60, serviceChargesSqft: 16 }) === null);

// ── allInCost ─────────────────────────────────────────────────────────────────
console.log('\nCOÛT TOUT COMPRIS');
const aic = m.allInCost(500000);
check('DLD 4 % + agence 2 % appliqués', aic >= 530000 && aic <= 532000, `${aic}`);

// ── matchEngine ───────────────────────────────────────────────────────────────
console.log('\nMOTEUR DE MATCHING');
const base = {
  id: 'L1', title: 'Studio JVC', location: 'Jumeirah Village Circle', districtId: 'other',
  price: 180000, yield: 8.5, type: 'Apartment', image: '', beds: 1, baths: 1, sqm: 45,
  completion: 'Ready', serviceChargesSqft: 14, marketPriceSqft: 3400,
  liquidity: 'High', catalysts: [], sourceUrl: 'https://x', source: 'propertyfinder',
};

const rental = m.scoreListing(base, { totalBudget: 200000, objective: 'rental_income', zonePreference: 'high_yield', riskLevel: 2 });
check('dossier locatif cohérent → score élevé', rental.matchScore >= 70, `score=${rental.matchScore}`);
check('raisons du score fournies', rental.matchReasons.length >= 3, `${rental.matchReasons.length} raisons`);
check('rendement net calculé', rental.netYield !== null);

const overBudget = m.scoreListing({ ...base, price: 900000 }, { totalBudget: 200000, objective: 'rental_income' });
check('hors budget → score bas', overBudget.matchScore < 45, `score=${overBudget.matchScore}`);
check('hors budget expliqué, pas masqué', overBudget.matchReasons.some(r => r.includes('hors budget')));

const gv = m.scoreListing(base, { totalBudget: 600000, objective: 'golden_visa' });
check('sous le seuil Golden Visa → signalé', gv.matchReasons.some(r => r.includes('Golden Visa')));

const gvOk = m.scoreListing({ ...base, price: 600000, sqm: 140 }, { totalBudget: 700000, objective: 'golden_visa' });
check('au-dessus du seuil Golden Visa → crédité', gvOk.matchScore > gv.matchScore, `${gvOk.matchScore} vs ${gv.matchScore}`);

const sorted = m.matchListings(
  [{ ...base, id: 'A', price: 900000 }, { ...base, id: 'B' }],
  { totalBudget: 200000, objective: 'rental_income', zonePreference: 'high_yield' }
);
check('tri par score décroissant', sorted[0].id === 'B', `premier=${sorted[0].id}`);
check('limite respectée', m.matchListings(Array.from({ length: 30 }, (_, i) => ({ ...base, id: `x${i}` })), { totalBudget: 200000 }, 5).length === 5);

// ── leadScore ─────────────────────────────────────────────────────────────────
console.log('\nSCORING DE LEAD');
const cold = m.scoreLead({ messageCount: 1 });
check('lead anonyme → cold, valeur nulle', cold.tier === 'cold' && cold.estimatedValueEur[1] === 0, `tier=${cold.tier}`);
check('manques listés pour guider les questions', cold.missing.includes('budget') && cold.missing.includes('numéro WhatsApp'));

const hot = m.scoreLead({
  name: 'Marie Dupont', email: 'm@d.fr', phone: '+33612345678',
  totalBudget: 800000, initialInvestment: 300000, objective: 'rental_income',
  investmentHorizon: 'short', messageCount: 14, viewedListings: ['a', 'b', 'c'],
  signals: ['budget_confirmed', 'visit_requested', 'financing_ready'],
});
check('dossier complet + signaux → qualified', hot.tier === 'qualified', `tier=${hot.tier} score=${hot.score}`);
check('valorisation dans la fourchette 1400–2000 €', hot.estimatedValueEur[0] === 1400 && hot.estimatedValueEur[1] === 2000);
check('score borné à 100', hot.score <= 100, `score=${hot.score}`);

const unreachable = m.scoreLead({ totalBudget: 2000000, signals: ['visit_requested', 'budget_confirmed', 'financing_ready'], messageCount: 20 });
check('gros budget mais injoignable → reste cold', unreachable.tier === 'cold', `tier=${unreachable.tier} score=${unreachable.score}`);

check('question suivante priorise le budget', m.nextQualifyingQuestion(['budget', 'nom']).includes('enveloppe'));
check('aucun manque → pas de question', m.nextQualifyingQuestion([]) === null);

console.log(`\n${pass} vérifications passées, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
