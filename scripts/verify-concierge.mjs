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
export * from '${ROOT}/components/qualification/chatI18n';
export { AGENT_TREES, TREE_STEPS } from '${ROOT}/components/qualification/steps';
`);
const bundlePath = join(out, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundlePath, logLevel: 'error', jsx: 'automatic', loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl', '.mp4': 'dataurl' } });
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

console.log('\nCHAT D\'ACCUEIL — anglais');
check('« €300,000 » (virgule de milliers) → 300 000', eq(m.parseAmounts('€300,000'), [300000]));
check('« 1.2 million » → 1 200 000', eq(m.parseAmounts('1.2 million'), [1200000]));
check('« 1,5 M€ » reste 1 500 000 (virgule décimale française)', eq(m.parseAmounts('1,5 M€'), [1500000]));
check('« Under €200,000 » → tranche 0–200 000', eq(m.optionRange('Under €200,000'), [0, 200000]));
check('« €700,000 – €1.5M » → tranche', eq(m.optionRange('€700,000 – €1.5M'), [700000, 1500000]));
check('« I want rental income every month » → investissement, pas location', m.detectProject('€300,000, I want rental income every month') === 'locatif');
check('« to live in with my family » → résidence', m.detectProject('looking for a 2 bed in Marina to live in with my family, budget 800k') === 'residence');
check('« rent a studio, 1,500 euros per month » → location', m.detectProject('I want to rent a studio, 1,500 euros per month max') === 'location');
check('« hello » → aucun projet deviné', m.detectProject('hello') === null);
for (const id of Object.keys(T)) {
  const en = m.localizedTree(id, 'en');
  check(`parcours « ${id} » traduit : mêmes questions, mêmes réponses, mêmes effets`, en.length === T[id].length && en.every((s, i) => s.id === T[id][i].id && s.options.length === T[id][i].options.length && s.options.every((o, j) => o.value === T[id][i].options[j].value && JSON.stringify(o.updates) === JSON.stringify(T[id][i].options[j].updates))));
  check(`parcours « ${id} » traduit : aucune question restée en français`, en.every((s, i) => s.question !== T[id][i].question && s.sub !== T[id][i].sub));
  check(`parcours « ${id} » en français : inchangé`, m.localizedTree(id, 'fr') === T[id]);
}
{
  const en = m.localizedTree('locatif', 'en');
  const got = Object.fromEntries(m.extractAnswers(en, '€300,000, I want rental income every month').map(a => [a.stepId, en.find(s => s.id === a.stepId).options[a.index].label]));
  check('message anglais → budget €200,000 – €400,000', got.budget === '€200,000 – €400,000', JSON.stringify(got));
  check('… sans réponse inventée sur un mot banal (« every »)', !Object.values(got).some(v => /every night/.test(v)), JSON.stringify(got));
  check('tranches de budget lisibles en anglais', en.find(s => s.id === 'budget').options.every(o => m.optionRange(o.label)));
}
check('langue inconnue → anglais', m.chatLang('xx') === 'en' && m.chatLang('fr') === 'fr');

console.log('\nCHAT D\'ACCUEIL — toutes les langues du site');
for (const lang of ['es', 'ru', 'zh', 'ar', 'af']) {
  check(`${lang} : le chat a sa propre langue`, m.chatLang(lang) === lang);
  const C = m.CHAT_TEXT[lang];
  check(`${lang} : textes d'interface complets`, ['stage', 'greeting', 'projectQuestion', 'contactQuestion', 'placeholder', 'go', 'more'].every(k => C[k] && C[k] !== m.CHAT_TEXT.en[k]));
  check(`${lang} : présentation du conseiller avec son nom`, C.intro('Karim Haddad', 'x', 'y').includes('Karim Haddad') && !/[{}]/.test(C.intro('a', 'b', 'c')));
  check(`${lang} : messages à variables sans accolade oubliée`, !/[{}]/.test(C.noted('a') + C.searching('Karim', ' (b)') + C.progressAria(2, 7)));
  check(`${lang} : trois projets, dans l'ordre des conseillers`, m.PROJECT_TEXT[lang].map(p => p.agentId).join() === 'locatif,residence,location' && m.PROJECT_TEXT[lang].every(p => p.label && p.desc));
  for (const id of Object.keys(T)) {
    const tr = m.localizedTree(id, lang);
    check(`${lang}/${id} : mêmes questions, mêmes réponses, mêmes effets`, tr.length === T[id].length && tr.every((s, i) => s.id === T[id][i].id && s.options.length === T[id][i].options.length && s.options.every((o, j) => o.value === T[id][i].options[j].value && JSON.stringify(o.updates) === JSON.stringify(T[id][i].options[j].updates))));
    check(`${lang}/${id} : rien n'est resté en français ni en anglais`, (() => { const en = m.localizedTree(id, 'en'); return tr.every((s, i) => s.question !== T[id][i].question && s.question !== en[i].question && s.options.every((o, j) => o.desc !== T[id][i].options[j].desc && o.desc !== en[i].options[j].desc)); })());
    check(`${lang}/${id} : tranches chiffrées lisibles`, tr.filter(s => /budget/.test(s.id)).every(s => s.options.every(o => m.optionRange(o.label))));
    const a = m.agentText(id, lang);
    check(`${lang}/${id} : conseiller présenté dans la langue`, !!a && a.role !== m.agentText(id, 'en').role && a.desc !== m.agentText(id, 'en').desc);
  }
  const loc = m.localizedTree('locatif', lang);
  check(`${lang} : un budget tapé (« 300 000 ») tombe dans la bonne tranche`, m.extractAnswers(loc, '300 000 €').find(x => x.stepId === 'budget')?.index === 1);
}
console.log('\nCHAT D\'ACCUEIL — toujours à la première personne');
for (const lang of ['fr', 'en', 'es', 'ru', 'zh', 'ar', 'af']) {
  check(`${lang} : « je lance la recherche », jamais « Karim lance »`, !m.CHAT_TEXT[lang].searching('Karim', '').includes('Karim'));
}
check('fr : présentations à la première personne', ['locatif', 'residence', 'location'].every(id => /^Je /.test(m.agentText(id, 'fr').desc) && !/\b(Il|Elle) /.test(m.agentText(id, 'fr').desc)));
check('en : présentations à la première personne', ['locatif', 'residence', 'location'].every(id => /^I /.test(m.agentText(id, 'en').desc) && !/\b(He|She) /.test(m.agentText(id, 'en').desc)));
check('tranche « < 200 000 € » → 0–200 000', eq(m.optionRange('< 200 000 €'), [0, 200000]));
check('tranche « > 1.5 M€ » → ouverte', m.optionRange('> 1.5 M€')?.[0] === 1500000);
check('espagnol : « quiero invertir 300 000 € » → investissement', m.detectProject('quiero invertir 300 000 € para tener ingresos por alquiler') === 'locatif');
check('espagnol : « para vivir con mi familia » → résidence', m.detectProject('busco un piso para vivir con mi familia') === 'residence');
check('russe : « хочу инвестировать » → investissement', m.detectProject('хочу инвестировать 300 000 евро и сдавать квартиру') === 'locatif');
check('russe : « снять квартиру » → location', m.detectProject('хочу снять квартиру на год') === 'location');
check('chinois : « 投资 … 收租 » → investissement', m.detectProject('我想投资30万欧元，每月收租') === 'locatif');
check('chinois : « 租房 » → location', m.detectProject('我想在迪拜租房') === 'location');
check('arabe : « أريد الاستثمار » → investissement', m.detectProject('أريد استثمار 300000 يورو للتأجير') === 'locatif');
check('afrikaans : « ek wil belê » → investissement', m.detectProject('ek wil €300 000 belê en huurinkomste kry') === 'locatif');
check('afrikaans : « ek wil ’n woonstel huur » → location', m.detectProject('ek soek ’n woonstel te huur') === 'location');

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
