/**
 * Vérifie le chat d'accueil sans navigateur : rapprochement d'une réponse
 * tapée avec les options proposées, et cohérence des parcours de questions.
 */
import { writeFileSync, mkdtempSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve, join } from 'path';
import { tmpdir } from 'os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = await import(pathToFileURL(resolve(ROOT, 'node_modules/esbuild/lib/main.js')).href);
const out = mkdtempSync(join(tmpdir(), 'verify-concierge-'));
const entry = join(out, 'entry.ts');
writeFileSync(entry, `
export * from '${ROOT}/components/qualification/answerMatch';
export { AGENT_TREES, TREE_STEPS } from '${ROOT}/components/qualification/steps';
`);
const bundlePath = join(out, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundlePath, logLevel: 'error', jsx: 'automatic' });
const m = await import(pathToFileURL(bundlePath).href);

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nCHAT D\'ACCUEIL — lecture des montants');
check('« 300k » → 300 000', eq(m.parseAmounts('300k'), [300000]));
check('« 1,5 M€ » → 1 500 000', eq(m.parseAmounts('1,5 M€'), [1500000]));
check('« 200 000 – 400 000 € » → deux bornes', eq(m.parseAmounts('200 000 – 400 000 €'), [200000, 400000]));
check('« 2 millions » → 2 000 000', eq(m.parseAmounts('2 millions'), [2000000]));
check('« 1.500 € » (séparateur de milliers) → 1 500', eq(m.parseAmounts('1.500 €'), [1500]));
check('« Moins de 200 000 € » → tranche 0–200 000', eq(m.optionRange('Moins de 200 000 €'), [0, 200000]));
check('« Plus de 1,5 M€ » → tranche ouverte', m.optionRange('Plus de 1,5 M€')?.[0] === 1500000 && m.optionRange('Plus de 1,5 M€')?.[1] === Infinity);
check('un libellé sans montant n\'est pas une tranche', m.optionRange('Loyer stable longue durée') === null);

console.log('\nCHAT D\'ACCUEIL — rapprochement des réponses tapées');
const budget = m.AGENT_TREES.locatif.find(s => s.id === 'budget').options;
check('budget « environ 650k » → tranche 400–700 k€', m.matchAnswer(budget, 'environ 650k')?.index === 2);
check('le montant exact est conservé', m.matchAnswer(budget, 'environ 650k')?.amount === 650000);
check('budget « 150 000 euros » → première tranche', m.matchAnswer(budget, '150 000 euros')?.index === 0);
check('budget « 3 millions » → dernière tranche', m.matchAnswer(budget, '3 millions')?.index === budget.length - 1);
check('« 2 » → deuxième option', m.matchAnswer(budget, '2')?.index === 1);
check('numéro hors liste → rien', m.matchAnswer(budget, '9') === null);
const rental = m.AGENT_TREES.locatif[0].options;
check('« plutôt du airbnb » → option Airbnb', rental[m.matchAnswer(rental, 'plutôt du airbnb')?.index ?? -1]?.label.includes('Airbnb'));
check('charabia → rien (on redemande, on ne devine pas)', m.matchAnswer(rental, 'blabla') === null);
check('réponse vide → rien', m.matchAnswer(rental, '   ') === null);
const project = [
  { label: 'Investir pour louer', desc: 'Acheter un bien et encaisser des loyers.' },
  { label: 'Acheter pour y vivre', desc: 'Résidence principale, pied-à-terre.' },
  { label: 'Louer un logement', desc: 'Trouver une location à Dubaï.' },
];
check('« je veux investir pour louer » → investissement', m.matchAnswer(project, 'je veux investir pour louer')?.index === 0);
check('« je cherche une location » → location', m.matchAnswer(project, 'je cherche une location')?.index === 2);
check('« y vivre avec ma famille » → résidence', m.matchAnswer(project, 'y vivre avec ma famille')?.index === 1);

console.log('\nCHAT D\'ACCUEIL — message libre');
const T = m.AGENT_TREES;
const labels = (id, text, current) => Object.fromEntries(m.extractAnswers(T[id], text, current).map(a => [a.stepId, T[id].find(s => s.id === a.stepId).options[a.index].label]));
check('« 300 000 €, je veux un loyer mensuel » → projet investissement', m.detectProject('300 000 €, je veux un loyer mensuel') === 'locatif');
{
  const got = labels('locatif', '300 000 €, je veux un loyer mensuel', 'rental_type');
  check('… et renseigne le budget', got.budget === '200 000 – 400 000 €', JSON.stringify(got));
  check('… et le type de loyer', got.rental_type === 'Loyer stable longue durée', JSON.stringify(got));
  check('… avec le montant exact', m.extractAnswers(T.locatif, '300 000 €, je veux un loyer mensuel').find(a => a.stepId === 'budget')?.amount === 300000);
}
check('« y vivre avec ma famille, budget 800k » → projet résidence', m.detectProject('je cherche un 2 chambres à Marina pour y vivre avec ma famille, budget 800k') === 'residence');
check('… budget 700 k€ – 1,5 M€', labels('residence', 'pour y vivre avec ma famille, budget 800k').budget?.startsWith('700 000'));
check('« louer un studio, 1500 euros par mois max » → projet location', m.detectProject('je veux louer un studio, 1500 euros par mois max') === 'location');
check('… le montant va au loyer mensuel, pas ailleurs', Object.keys(labels('location', 'je veux louer un studio, 1500 euros par mois max')).join() === 'monthly_budget');
check('« investir 500k en airbnb » → budget + Airbnb', (() => { const g = labels('locatif', 'investir 500k en airbnb'); return g.budget === '400 000 – 700 000 €' && g.rental_type?.includes('Airbnb'); })());
check('« bonjour » → aucun projet deviné', m.detectProject('bonjour') === null);
check('« appartement à dubai marina » → aucun projet deviné', m.detectProject('appartement à dubai marina') === null);
check('charabia → aucune réponse inventée', m.extractAnswers(T.locatif, 'blabla', 'first_rent').length === 0);
check('« 2 chambres » n\'est pas pris pour un budget', !m.extractAnswers(T.locatif, 'un 2 chambres').some(a => a.stepId === 'budget'));
check('une question ne reçoit qu\'une réponse', (() => { const a = m.extractAnswers(T.locatif, '300k ou 500k en airbnb'); return new Set(a.map(x => x.stepId)).size === a.length; })());

console.log('\nCHAT D\'ACCUEIL — parcours de questions');
for (const [id, steps] of Object.entries(m.AGENT_TREES)) {
  check(`parcours « ${id} » : 4 à 7 questions`, steps.length >= 4 && steps.length <= 7, String(steps.length));
  check(`parcours « ${id} » : 2 à 5 réponses par question`, steps.every(s => s.options.length >= 2 && s.options.length <= 5));
  check(`parcours « ${id} » : libellés uniques par question`, steps.every(s => new Set(s.options.map(o => o.label)).size === s.options.length));
  check(`parcours « ${id} » : chaque réponse renseigne le profil`, steps.every(s => s.options.every(o => Object.keys(o.updates).length > 0)));
}
for (const id of ['locatif', 'residence']) {
  const b = m.AGENT_TREES[id].find(s => s.id === 'budget');
  check(`parcours « ${id} » : toutes les tranches de budget sont lisibles`, !!b && b.options.every(o => m.optionRange(o.label)));
  check(`parcours « ${id} » : chaque tranche fixe un budget`, !!b && b.options.every(o => Number(o.updates.totalBudget) > 0));
}

console.log(`\n${pass} vérifications passées, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
