/**
 * Vérifie les garde-fous de coût : bornes d'entrée, limite de débit, calcul de
 * coût, disjoncteur de budget, authenticité des webhooks, et fermeture des
 * endpoints qui déclenchent des appels payants.
 *
 * Ces assertions valent de l'argent réel : chacune correspond à un scénario
 * d'abus chiffré dans docs/AGENCY_SETUP.md.
 */
import { writeFileSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createHmac } from 'crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = await import(pathToFileURL(resolve(ROOT, 'node_modules/esbuild/lib/main.js')).href);

const out = mkdtempSync(join(tmpdir(), 'guard-'));
const entry = join(out, 'e.ts');
writeFileSync(entry, `
export * from '${ROOT}/api/lib/guard';
export { verifyInbound } from '${ROOT}/api/lib/whatsapp';
export { isCronAuthorized, secretMatches } from '${ROOT}/api/lib/cronAuth';
`);
const bundle = join(out, 'b.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
const m = await import(pathToFileURL(bundle).href);

let pass = 0, fail = 0;
const check = (l, c, d = '') => { c ? (pass++, console.log(`  ok   ${l}`)) : (fail++, console.log(`  FAIL ${l}${d ? ` — ${d}` : ''}`)); };

const msg = (n, len) => Array.from({ length: n }, () => ({ role: 'user', content: 'x'.repeat(len) }));

console.log('BORNES SUR L\'ENTRÉE (plafonne le coût d\'UNE requête)');
check('conversation normale acceptée', m.checkInputSize(msg(6, 300)).ok);
check('trop de messages refusé', !m.checkInputSize(msg(m.MAX_MESSAGES + 1, 10)).ok);
check('message unique géant refusé', !m.checkInputSize([{ role: 'user', content: 'x'.repeat(m.MAX_SINGLE_CHARS + 1) }]).ok);
check('volume total excessif refusé', !m.checkInputSize(msg(20, 5000)).ok);
check('tableau invalide refusé sans crash', !m.checkInputSize(null).ok);
// Le plafond de coût par requête, une fois borné
const capTokens = m.MAX_TOTAL_CHARS / 3.5;
const capCost = (capTokens * 6.25 + 8000 * 25) / 1e6 + 0.04;
check(`coût max d'une requête sous 0,30 $ (${capCost.toFixed(3)} $)`, capCost < 0.30, `${capCost.toFixed(3)} $`);

console.log('\nLIMITE DE DÉBIT PAR IP');
const ip = '203.0.113.7';
let allowed = 0;
for (let i = 0; i < m.RATE_MAX_PER_WINDOW + 5; i++) if (m.rateLimit(ip).ok) allowed++;
check(`plafonné à ${m.RATE_MAX_PER_WINDOW} requêtes par minute`, allowed === m.RATE_MAX_PER_WINDOW, `${allowed} autorisées`);
check('une autre IP n\'est pas pénalisée', m.rateLimit('198.51.100.1').ok);
check('Retry-After fourni au refus', (m.rateLimit(ip).retryAfterS ?? 0) > 0);
check('IP extraite de x-forwarded-for', m.clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }) === '1.2.3.4');

console.log('\nCALCUL DE COÛT');
const c = m.costUsd({ input_tokens: 1e6, output_tokens: 0 });
check('1 M tokens d\'entrée = 5 $', Math.abs(c - 5) < 1e-9, `${c}`);
check('1 M tokens de sortie = 25 $', Math.abs(m.costUsd({ output_tokens: 1e6 }) - 25) < 1e-9);
check('lecture de cache 10× moins chère que l\'entrée',
  Math.abs(m.costUsd({ cache_read_input_tokens: 1e6 }) - 0.5) < 1e-9);
check('écriture de cache à 1,25×', Math.abs(m.costUsd({ cache_creation_input_tokens: 1e6 }) - 6.25) < 1e-9);
check('champs null tolérés (le SDK renvoie null)',
  m.costUsd({ input_tokens: 100, cache_read_input_tokens: null, cache_creation_input_tokens: null }) > 0);

// Le disjoncteur doit facturer au tarif DU modèle appelé. Coder en dur ceux
// d'Opus coupait le service à 40 % du budget réel sur Sonnet.
console.log('\nTARIFS PAR MODÈLE (fiabilité du disjoncteur)');
const M = { out: 1e6 };
check('Opus 5 : sortie à 25 $/MTok', Math.abs(m.costUsd({ output_tokens: 1e6 }, 'claude-opus-5') - 25) < 1e-9);
check('Sonnet 5 : sortie à 15 $/MTok', Math.abs(m.costUsd({ output_tokens: 1e6 }, 'claude-sonnet-5') - 15) < 1e-9);
check('Haiku 4.5 : sortie à 5 $/MTok', Math.abs(m.costUsd({ output_tokens: 1e6 }, 'claude-haiku-4-5') - 5) < 1e-9);
check('Sonnet coûte bien moins qu\'Opus',
  m.costUsd({ output_tokens: 1e6 }, 'claude-sonnet-5') < m.costUsd({ output_tokens: 1e6 }, 'claude-opus-5'));
check('modèle inconnu → tarif le plus élevé (jamais sous-estimer)',
  m.costUsd({ output_tokens: 1e6 }, 'modele-inconnu-2027') >= m.costUsd({ output_tokens: 1e6 }, 'claude-opus-5'),
  'un modèle non listé doit majorer, pas minorer');
check('lecture de cache Sonnet à 0,30 $/MTok',
  Math.abs(m.costUsd({ cache_read_input_tokens: 1e6 }, 'claude-sonnet-5') - 0.30) < 1e-9);
check('priceFor exposé et cohérent', m.priceFor('claude-opus-5').output === 25);

console.log('\nDISJONCTEUR DE BUDGET');
delete process.env.DAILY_BUDGET_USD;
check('sans budget configuré → désactivé', m.dailyBudgetUsd() === 0);
check('sans budget → laisse passer', (await m.checkDailyBudget()).ok);
process.env.DAILY_BUDGET_USD = '5';
check('budget lu depuis l\'environnement', m.dailyBudgetUsd() === 5);
check('sous le budget → laisse passer', (await m.checkDailyBudget()).ok);
// On dépasse via le compteur mémoire (Supabase non configuré dans ce test)
for (let i = 0; i < 3; i++) await m.recordUsage('test', { input_tokens: 500_000 });
const after = await m.checkDailyBudget();
check('au-delà du budget → bloque', !after.ok, `dépensé ${(await m.spentToday()).toFixed(2)} $`);
process.env.DAILY_BUDGET_USD = '';

console.log('\nAUTHENTICITÉ DU WEBHOOK WHATSAPP');
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.WHATSAPP_VERIFY_TOKEN;
check('aucun moyen configuré → REFUSE (pas d\'ouverture par défaut)',
  !m.verifyInbound({ headers: {}, query: {} }).ok);

process.env.WHATSAPP_VERIFY_TOKEN = 'jeton-secret';
check('jeton correct accepté', m.verifyInbound({ headers: {}, query: { token: 'jeton-secret' } }).ok);
check('jeton absent refusé', !m.verifyInbound({ headers: {}, query: {} }).ok);
check('jeton erroné refusé', !m.verifyInbound({ headers: {}, query: { token: 'faux' } }).ok);

process.env.TWILIO_AUTH_TOKEN = 'token-twilio';
const body = { From: 'whatsapp:+33612345678', Body: 'bonjour', MessageSid: 'SM1' };
const url = 'https://dubainvest.eu/api/whatsapp/webhook';
const payload = Object.keys(body).sort().reduce((a, k) => a + k + body[k], url);
const goodSig = createHmac('sha1', 'token-twilio').update(Buffer.from(payload, 'utf8')).digest('base64');
const reqOf = sig => ({
  headers: { 'x-twilio-signature': sig, 'x-forwarded-host': 'dubainvest.eu', 'x-forwarded-proto': 'https' },
  url: '/api/whatsapp/webhook', body, query: {},
});
check('signature Twilio valide acceptée', m.verifyInbound(reqOf(goodSig)).ok);
check('signature Twilio falsifiée refusée', !m.verifyInbound(reqOf('ZmFsc2lmaWU=')).ok);
check('signature de longueur différente refusée sans crash', !m.verifyInbound(reqOf('x')).ok);
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.WHATSAPP_VERIFY_TOKEN;

console.log('\nENDPOINTS PAYANTS FERMÉS PAR DÉFAUT');
for (const f of ['api/cron/watch.ts', 'api/collector/run.ts']) {
  const src = readFileSync(resolve(ROOT, f), 'utf8');
  check(`${f} échoue fermé sans secret`,
    (/if \(!expected\) return false;/.test(src) || /secretMatches\(process\.env\.COLLECTOR_SECRET/.test(src)) && !/if \(!expected\) return true;/.test(src));
}
// Crons et webhooks qui appellent Gemini/Imagen/Veo/Apify : garde-fou commun
// en échec fermé (lib/cronAuth). Les anciens tests « Bearer ${CRON_SECRET ?? ''} »
// laissaient passer un en-tête « Bearer » vide ou « Bearer undefined ».
for (const f of ['api/cron/refresh-listings.ts', 'api/cron/seo-geo-optimizer.ts', 'api/cron/mention-monitor.ts', 'api/cron/monthly-report.ts', 'api/cron/social-poster.ts']) {
  const src = readFileSync(resolve(ROOT, f), 'utf8');
  check(`${f} protégé par isCronAuthorized (échec fermé)`, /if \(!isCronAuthorized\(req\)\)/.test(src) && !/Bearer \$\{(process\.env\.)?CRON_SECRET/.test(src));
}
{
  const saved = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  check('cron : sans CRON_SECRET, « Bearer » vide refusé', !m.isCronAuthorized({ headers: { authorization: 'Bearer ' } }));
  check('cron : sans CRON_SECRET, « Bearer undefined » refusé', !m.isCronAuthorized({ headers: { authorization: 'Bearer undefined' }, query: { secret: 'undefined' } }));
  process.env.CRON_SECRET = 'secret-de-test-cron';
  check('cron : bon secret Bearer accepté', m.isCronAuthorized({ headers: { authorization: 'Bearer secret-de-test-cron' } }));
  check('cron : bon secret ?secret accepté', m.isCronAuthorized({ headers: {}, query: { secret: 'secret-de-test-cron' } }));
  check('cron : mauvais secret refusé', !m.isCronAuthorized({ headers: { authorization: 'Bearer autre' } }));
  check('webhook : secret trop court (< 8) jamais accepté', !m.secretMatches('abc', 'abc'));
  if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
}
for (const f of ['api/haro-webhook.ts', 'api/apify-webhook.ts']) {
  check(`${f} exige son secret (échec fermé)`, /if \(!secretMatches\(/.test(readFileSync(resolve(ROOT, f), 'utf8')));
}

for (const f of ['api/agent-chat.ts', 'api/whatsapp/webhook.ts']) {
  const src = readFileSync(resolve(ROOT, f), 'utf8');
  check(`${f} consulte le disjoncteur`, /checkDailyBudget/.test(src));
  check(`${f} enregistre la consommation`, /recordUsage/.test(src));
}

console.log('\nCOÛT RÉEL PAR LEAD (usage → usage_by_lead, sans appel Anthropic)');
// Usage représentatif d'un tour de chat mis en cache (valeurs mesurées en doc).
const turn = { input_tokens: 2, output_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 4550 };
const opusCost = m.costUsd(turn, 'claude-opus-5');
check('coût d’un tour Opus = 600×25 + 2×5 + 4550×0,5 par million',
  Math.abs(opusCost - (600 * 25 + 2 * 5 + 4550 * 0.5) / 1e6) < 1e-12, String(opusCost));
check('le tarif suit le modèle réellement servi (repli Sonnet moins cher)',
  m.costUsd(turn, 'claude-sonnet-5') < opusCost);
let agg = m.addLeadUsage(undefined, '+971500000000', 'agent-chat', turn, opusCost);
agg = m.addLeadUsage(agg, '+971500000000', 'agent-chat', turn, opusCost);
agg = m.addLeadUsage(agg, '+971500000000', 'whatsapp-qualifier', { input_tokens: 900, output_tokens: 300 }, 0.01);
check('agrégat : 3 requêtes, tokens cumulés', agg.requests === 3 && agg.output_tokens === 1500 && agg.cache_read === 9100 && agg.input_tokens === 904);
check('agrégat : coût total = somme des coûts', Math.abs(agg.cost_usd - (2 * opusCost + 0.01)) < 1e-12);
check('agrégat : ventilation par canal', agg.by_endpoint['agent-chat'].requests === 2 && agg.by_endpoint['whatsapp-qualifier'].cost_usd === 0.01);
check('visiteur anonyme non imputé', !m.isAttributableHandle('anon:abc123') && !m.isAttributableHandle(null) && m.isAttributableHandle('a@b.fr'));

// Repli mémoire (pas de Supabase dans ce bundle)
await m.recordUsage('agent-chat', turn, { leadHandle: 'lead@example.invalid', model: 'claude-opus-5' });
await m.recordUsage('agent-chat', turn, { leadHandle: 'lead@example.invalid', model: 'claude-opus-5' });
await m.recordUsage('agent-chat', turn, { leadHandle: 'anon:zz' });
const mem = await m.leadUsage('lead@example.invalid');
check('repli mémoire : coût du lead cumulé sur 2 tours', mem?.requests === 2 && Math.abs(mem.cost_usd - 2 * opusCost) < 1e-12);
check('repli mémoire : anonyme absent', (await m.leadUsage('anon:zz')) === null);

// Avec Supabase : on vérifie les appels RPC envoyés (fetch simulé).
process.env.SUPABASE_URL = 'https://projet.supabase.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-service';
const sb = await import(pathToFileURL(bundle).href + '?supabase');
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null }); return { ok: true, status: 204, text: async () => '', json: async () => [] }; };
await sb.recordUsage('agent-chat', turn, { leadHandle: '+971500000000', model: 'claude-sonnet-5' });
const daily = calls.find(c => c.url.endsWith('/rpc/bump_usage_daily'));
const perLead = calls.find(c => c.url.endsWith('/rpc/bump_usage_lead'));
check('Supabase : incrément quotidien ET incrément du lead', !!daily && !!perLead, calls.map(c => c.url).join(', '));
check('Supabase : le lead est la clé handle, tokens et coût transmis',
  perLead?.body.p_handle === '+971500000000' && perLead.body.p_output === 600 && perLead.body.p_cache_read === 4550 &&
  Math.abs(perLead.body.p_cost - sb.costUsd(turn, 'claude-sonnet-5')) < 1e-12);
check('Supabase : même coût dans les deux tables', daily?.body.p_cost === perLead?.body.p_cost);
calls.length = 0;
await sb.recordUsage('agent-chat', turn, { leadHandle: 'anon:xyz' });
check('Supabase : visiteur anonyme → quotidien seulement', calls.length === 1 && calls[0].url.endsWith('/rpc/bump_usage_daily'));
globalThis.fetch = async () => { throw new Error('Supabase down'); };
let threw = false;
try { await sb.recordUsage('agent-chat', turn, { leadHandle: 'x@y.fr' }); } catch { threw = true; }
check('Supabase en panne : la comptabilité ne fait jamais échouer la réponse', !threw);
globalThis.fetch = realFetch;

const chatSrc = readFileSync(resolve(ROOT, 'api/agent-chat.ts'), 'utf8');
check('agent-chat impute le coût au lead et au modèle servi', /recordUsage\('agent-chat', final\.usage, \{ leadHandle, model: final\.model \}\)/.test(chatSrc));
check('webhook WhatsApp impute le coût au lead', /recordUsage\('whatsapp-qualifier', turn\.usage, \{ leadHandle: handle \}\)/.test(readFileSync(resolve(ROOT, 'api/whatsapp/webhook.ts'), 'utf8')));
check('veille nocturne impute le coût au lead', (readFileSync(resolve(ROOT, 'api/cron/watch.ts'), 'utf8').match(/leadHandle: lead\.handle/g) || []).length === 2);

console.log(`\n${pass} vérifications passées, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
