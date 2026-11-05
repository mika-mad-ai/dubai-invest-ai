/**
 * Banc d'évaluation HORS-LIGNE du conseiller (aucune clé API, aucun appel LLM).
 *
 *   1. Matching   : pour chaque scénario investisseur, le classement déterministe
 *                   respecte-t-il le budget, l'objectif, le profil de risque ?
 *   2. Verdicts   : le contrôle prix DLD classe-t-il correctement des biens
 *                   construits à ±X % de la médiane de leur zone ?
 *   3. Prompt     : chaque chiffre décisif arrive-t-il intact dans le bloc
 *                   d'annonces injecté au modèle ?
 *   4. Fidélité   : le correcteur `auditReply` accepte une réponse fidèle et
 *                   attrape chaque piège (prix/rendement inventé, bien fantôme,
 *                   verdict contredit, lien inventé, pavé hors règle).
 *
 * Usage :
 *   node scripts/eval-advisor.mjs                 # banc complet
 *   node scripts/eval-advisor.mjs --reply r.txt --scenario rente-prudente
 *       → note une VRAIE réponse enregistrée contre les données du scénario
 */
import { writeFileSync, mkdtempSync, readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve, join } from 'path';
import { tmpdir } from 'os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = await import(pathToFileURL(resolve(ROOT, 'node_modules/esbuild/lib/main.js')).href);
const out = mkdtempSync(join(tmpdir(), 'eval-advisor-'));
const entry = join(out, 'entry.ts');
writeFileSync(entry, `
export { matchListings, allInCost } from '${ROOT}/api/lib/matchEngine';
export { checkPrice, benchmarkFor } from '${ROOT}/api/lib/priceCheck';
export { buildListingsBlock } from '${ROOT}/api/lib/claude';
export { auditReply, extractEurAmounts, extractPercents } from '${ROOT}/api/lib/advisorEval';
`);
const bundlePath = join(out, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundlePath, logLevel: 'error' });
const m = await import(pathToFileURL(bundlePath).href);

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};

// ── Fixtures : annonces construites à un écart voulu de la médiane DLD ──────
const SQFT = 10.7639, AED = 4.24;
let seq = 0;
/** Prix EUR tel que le bien soit à `deltaPct` de la référence DLD de sa zone. */
function listing({ location, sqm, beds, deltaPct, type = 'Apartment', completion = 'Ready', yieldPct = 7, liquidity = 'Medium', serviceChargesSqft = 15 }) {
  const ref = m.checkPrice(1_000_000, sqm, location, undefined, { beds, type }).benchmarkAedSqft; // référence corrigée chambre
  const price = Math.round((ref * (1 + deltaPct / 100) * sqm * SQFT) / AED);
  seq++;
  return {
    id: `fx-${seq}`, title: `${beds === 0 ? 'Studio' : `${beds} BR`} in Fixture Tower ${seq}, ${location}`, location,
    districtId: 'other', price, yield: yieldPct, type, image: '', beds, baths: Math.max(1, beds), sqm, completion,
    serviceChargesSqft, marketPriceSqft: 0, liquidity, catalysts: [], sourceUrl: `https://www.propertyfinder.ae/fixture-${seq}`, source: 'propertyfinder',
  };
}

const POOL = {
  jvcFair: listing({ location: 'Jumeirah Village Circle, Dubai', sqm: 70, beds: 1, deltaPct: 0, yieldPct: 7.8, liquidity: 'High' }),
  jvcCheap: listing({ location: 'Jumeirah Village Circle, Dubai', sqm: 72, beds: 1, deltaPct: -9, yieldPct: 8.1, liquidity: 'High' }),
  jvcOverpriced: listing({ location: 'Jumeirah Village Circle, Dubai', sqm: 70, beds: 1, deltaPct: 25, yieldPct: 6.2 }),
  marinaBig: listing({ location: 'Dubai Marina, Dubai', sqm: 140, beds: 2, deltaPct: 2, yieldPct: 6.1 }),
  downtownOffplan: listing({ location: 'Downtown Dubai, Dubai', sqm: 90, beds: 1, deltaPct: -2, completion: '2028', yieldPct: 5.4 }),
  creekOffplan: listing({ location: 'Dubai Creek Harbour, Dubai', sqm: 85, beds: 1, deltaPct: -5, completion: '2027', yieldPct: 5.9 }),
  palmVilla: listing({ location: 'Palm Jumeirah, Dubai', sqm: 420, beds: 5, deltaPct: 0, type: 'Villa', yieldPct: 4.2, liquidity: 'Low' }),
  studioJlt: listing({ location: 'Jumeirah Lake Towers, Dubai', sqm: 40, beds: 0, deltaPct: -3, yieldPct: 8.4, liquidity: 'High' }),
};
const ALL = Object.values(POOL);

// ── 1. MATCHING ──────────────────────────────────────────────────────────────
console.log('MATCHING — scénarios investisseur');
const SCENARIOS = {
  'rente-prudente': { profile: { totalBudget: 320000, objective: 'rental_income', zonePreference: 'high_yield', riskLevel: 1 }, budget: 320000 },
  'golden-visa': { profile: { totalBudget: 650000, objective: 'golden_visa', riskLevel: 3 }, budget: 650000 },
  'plus-value-dynamique': { profile: { totalBudget: 600000, objective: 'capital_gains', zonePreference: 'capital_appreciation', riskLevel: 5 }, budget: 600000 },
  'budget-inconnu': { profile: { objective: 'diversification' }, budget: 0 },
};
const ranked = Object.fromEntries(Object.entries(SCENARIOS).map(([k, s]) => [k, m.matchListings(ALL, s.profile, 8)]));

{
  const r = ranked['rente-prudente'];
  check('rente prudente : le n°1 tient dans le budget frais inclus', m.allInCost(r[0].price) <= 320000 * 1.1, `${r[0].title} ${m.allInCost(r[0].price)} €`);
  check('rente prudente : le n°1 est livré (pas d’off-plan pour un profil prudent)', r[0].completion === 'Ready');
  check('rente prudente : à JVC équivalent, le moins cher DLD passe devant le surévalué',
    r.findIndex(l => l.id === POOL.jvcCheap.id) < r.findIndex(l => l.id === POOL.jvcOverpriced.id));
  check('rente prudente : villa Palm hors budget jamais dans le top 3', !r.slice(0, 3).some(l => l.id === POOL.palmVilla.id));
  check('rente prudente : la villa hors budget porte une raison « hors budget » explicable', r.find(l => l.id === POOL.palmVilla.id)?.matchReasons.some(x => /hors budget/.test(x)));
  check('rente prudente : un off-plan porte l’alerte « risque de livraison »', r.find(l => l.id === POOL.creekOffplan.id)?.matchReasons.some(x => /risque de livraison/.test(x)));
}
{
  const r = ranked['golden-visa'];
  const eligible = r.filter(l => l.price >= 472000 && m.allInCost(l.price) <= 650000 * 1.1);
  check('golden visa : le pool contient au moins un bien éligible (assertion non vide)', eligible.length > 0, String(eligible.length));
  check('golden visa : le n°1 franchit le seuil 2 M AED', r[0].price >= 472000, `${r[0].title} ${r[0].price} €`);
  check('golden visa : un bien sous le seuil dit combien il manque', r.find(l => l.price < 472000)?.matchReasons.some(x => /sous le seuil Golden Visa — .* € manquants/.test(x)));
}
{
  const r = ranked['plus-value-dynamique'];
  check('plus-value dynamique : le n°1 est un off-plan', r[0].completion !== 'Ready', r[0].title);
  check('plus-value dynamique : le n°1 est dans une zone de valorisation', /downtown|creek|dubai hills|mbr/i.test(r[0].location), r[0].location);
}
{
  const r = ranked['budget-inconnu'];
  check('budget inconnu : score partiel signalé, pas de fausse certitude', r.every(l => l.matchReasons.some(x => /budget non renseigné/.test(x))));
  check('scores bornés 0-100 et triés', Object.values(ranked).every(rs => rs.every((l, i) => l.matchScore >= 0 && l.matchScore <= 100 && (i === 0 || rs[i - 1].matchScore >= l.matchScore))));
}

// ── 2. VERDICTS PRIX DLD ─────────────────────────────────────────────────────
console.log('\nVERDICTS PRIX — biens construits à un écart connu de la médiane');
const verdictOf = l => m.checkPrice(l.price, l.sqm, l.location, undefined, { beds: l.beds, type: l.type });
check('JVC à 0 % → fair', verdictOf(POOL.jvcFair).code === 'fair');
check('JVC à −9 % → below', verdictOf(POOL.jvcCheap).code === 'below', verdictOf(POOL.jvcCheap).deltaPct?.toFixed(1));
check('JVC à +25 % → well_above', verdictOf(POOL.jvcOverpriced).code === 'well_above');
check('villa Palm comparée à la grille villa (pas appartement)', verdictOf(POOL.palmVilla).code === 'fair', `${verdictOf(POOL.palmVilla).benchmarkAedSqft}`);
check('studio : correctif chambre appliqué (référence > médiane de zone)',
  verdictOf(POOL.studioJlt).benchmarkAedSqft > m.benchmarkFor(POOL.studioJlt.location).value);
check('chaque verdict est daté et sourcé', ALL.every(l => verdictOf(l).asOf && verdictOf(l).basis === 'benchmark'));

// ── 3. FIDÉLITÉ DU PROMPT ────────────────────────────────────────────────────
console.log('\nPROMPT — ce que le modèle reçoit');
const top = ranked['rente-prudente'];
const block = m.buildListingsBlock(top);
const fr = n => n.toLocaleString('fr-FR');
check('chaque prix arrive au centime près dans le bloc', top.slice(0, 8).every(l => block.includes(`${fr(l.price)} €`)));
check('chaque verdict DLD est injecté mot pour mot', top.slice(0, 8).every(l => block.includes(l.priceVerdict)));
check('chaque score d’adéquation est injecté', top.slice(0, 8).every(l => block.includes(`${l.matchScore}/100`)));
check('chaque lien source est injecté', top.slice(0, 8).every(l => block.includes(l.sourceUrl)));
check('ordre du bloc = ordre du matching', top.slice(0, 8).every((l, i) => block.includes(`${i + 1}. ${l.title}`)));
check('aucune annonce → consigne explicite de ne rien inventer', /n'as pas d'annonce vérifiée/.test(m.buildListingsBlock([])));

// ── 4. CORRECTEUR DE FIDÉLITÉ ────────────────────────────────────────────────
console.log('\nCORRECTEUR — réponses de référence');
const ctxOf = (key) => ({ listings: ranked[key], budgetEur: SCENARIOS[key].budget });
const L1 = top[0], L2 = top[1];
const cheapIdx = top.findIndex(l => l.id === POOL.jvcCheap.id) + 1;
const overIdx = top.findIndex(l => l.id === POOL.jvcOverpriced.id) + 1;
const faithful = `Je vous recommande d'abord le bien ${1} (${L1.location}) : ${fr(L1.price)} €, soit ${fr(m.allInCost(L1.price))} € frais inclus, ` +
  `pour un rendement brut estimé de ${L1.yield} %${L1.netYield ? ` (net ≈ ${L1.netYield} %)` : ''}. Il tient dans vos ${fr(320000)} €. ` +
  `En second choix, le bien 2 à ${fr(L2.price)} €. À Dubaï, 0 % d'impôt sur les loyers et 4 % de frais DLD à l'achat. Annonce : ${L1.sourceUrl}`;
const g = m.auditReply(faithful, ctxOf('rente-prudente'));
check('réponse fidèle acceptée (0 alerte)', g.ok, JSON.stringify(g.findings));

const traps = [
  ['prix inventé', `Le bien 1 est affiché à 287 500 €.`, 'unsourced_price'],
  ['rendement inventé', `Le bien 1 rapporte 11,4 % net.`, 'unsourced_percent'],
  ['bien fantôme', `Regardez aussi le bien 9, il est excellent.`, 'unknown_listing_ref'],
  ['verdict contredit (surévalué présenté en aubaine)', `Le bien ${overIdx} est une vraie bonne affaire, nettement sous le marché.`, 'verdict_contradiction'],
  ['verdict contredit (décote présentée comme chère)', `Attention, le bien ${cheapIdx} est surévalué.`, 'verdict_contradiction'],
  ['lien inventé', `Voir https://www.bayut.com/invente-123 pour le détail.`, 'unsourced_url'],
  ['pavé hors règle des 250 mots', Array.from({ length: 330 }, () => 'mot').join(' '), 'over_length'],
];
for (const [label, reply, kind] of traps) {
  const r = m.auditReply(reply, ctxOf('rente-prudente'));
  check(`piège détecté : ${label}`, r.findings.some(f => f.kind === kind), JSON.stringify(r.findings));
}
check('extraction : « 1,2 M€ », « 520k€ », « 210 000 € » reconnus',
  JSON.stringify(m.extractEurAmounts('1,2 M€ puis 520k€ et 210 000 €')) === JSON.stringify([1200000, 520000, 210000]),
  JSON.stringify(m.extractEurAmounts('1,2 M€ puis 520k€ et 210 000 €')));
check('extraction : « 7,6 % » et « −5 % »', JSON.stringify(m.extractPercents('7,6 % puis −5 %')) === '[7.6,5]');

// ── Mode notation d'une vraie réponse ───────────────────────────────────────
const argv = process.argv.slice(2);
const replyFile = argv[argv.indexOf('--reply') + 1];
if (argv.includes('--reply') && replyFile) {
  const key = argv.includes('--scenario') ? argv[argv.indexOf('--scenario') + 1] : 'rente-prudente';
  const res = m.auditReply(readFileSync(replyFile, 'utf8'), ctxOf(key));
  console.log(`\nNOTATION de ${replyFile} (scénario ${key}) : ${res.ok ? 'fidèle' : `${res.findings.length} alerte(s)`}`);
  for (const f of res.findings) console.log(`  - [${f.kind}] ${f.detail}`);
}

console.log(`\n${pass} vérifications passées, ${fail} échec(s)`);
if (fail) process.exit(1);
