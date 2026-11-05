/**
 * RGPD / consentement : logique pure (lib/consent) + parcours réels
 * (/api/lead, webhook WhatsApp, veille, bureau) en mémoire, sans clé API,
 * sans fournisseur WhatsApp configuré (aucun message ne peut partir).
 */
import { writeFileSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = await import(pathToFileURL(resolve(ROOT, 'node_modules/esbuild/lib/main.js')).href);
const out = mkdtempSync(join(tmpdir(), 'consent-'));
const entry = join(out, 'e.ts');
writeFileSync(entry, `
export * from '${ROOT}/api/lib/consent';
import lead from '${ROOT}/api/lead';
import webhook from '${ROOT}/api/whatsapp/webhook';
export { lead, webhook };
export { getLead } from '${ROOT}/api/lib/leadStore';
export { recordUsage } from '${ROOT}/api/lib/guard';
`);
const bundle = join(out, 'b.mjs');
for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'D360_API_KEY', 'SUPABASE_URL', 'ANTHROPIC_API_KEY', 'AIRTABLE_TOKEN', 'HUBSPOT_TOKEN']) delete process.env[k];
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
const m = await import(pathToFileURL(bundle).href);

let pass = 0, fail = 0;
const check = (l, c, d = '') => { c ? (pass++, console.log(`  ok   ${l}`)) : (fail++, console.log(`  FAIL ${l}${d ? ` — ${d}` : ''}`)); };
const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() {} });
const read = p => readFileSync(resolve(ROOT, p), 'utf8');

console.log('LOGIQUE PURE');
const t0 = new Date('2026-11-05T09:00:00Z');
let c = m.applyConsent(undefined, { whatsapp: true }, 'lead_modal', t0);
check('accord WhatsApp horodaté, sourcé, versionné', c.whatsapp?.granted === true && c.whatsapp.at === t0.toISOString() && c.whatsapp.source === 'lead_modal' && c.whatsapp.textVersion === m.CONSENT_TEXT_VERSION);
check('finalité non posée = ni accord ni retrait', c.partners === undefined && !m.canSharePartners(c));
c = m.applyConsent(c, { partners: false }, 'web_form', t0);
check('un refus partenaires ne touche pas l’accord WhatsApp', m.canMessageWhatsApp(c) && c.partners?.granted === false);
check('aucun consentement par défaut', !m.canMessageWhatsApp(undefined) && !m.canSharePartners({}));
const w = m.withdrawAll(c, new Date('2026-11-06T00:00:00Z'));
check('STOP retire tout, avec la date du retrait', !m.canMessageWhatsApp(w) && !m.canSharePartners(w) && w.whatsapp.at === '2026-11-06T00:00:00.000Z' && w.whatsapp.source === 'whatsapp_stop');
for (const s of ['STOP', 'stop', ' Stop ! ', 'ARRÊT', 'arret svp', 'Désinscrire', 'unsubscribe', 'STOP merci']) check(`« ${s} » reconnu comme retrait`, m.isOptOutMessage(s));
for (const s of ['je ne veux pas que ça s’arrête', 'stop au loyer cher, je veux du 7 %', 'Arrêtez-vous à JVC ?', '']) check(`« ${s} » n’est PAS un retrait`, !m.isOptOutMessage(s));

console.log('\nPARCOURS /api/lead');
const profile = { name: 'Inès Test', email: 'ines@example.invalid', phone: '+971 50 111 2222', totalBudget: '400000', objective: 'rental_income' };
let res = mkRes();
await m.lead({ method: 'POST', body: { profile } }, res);
let stored = await m.getLead(res.body.handle);
check('sans case cochée : aucun consentement enregistré', !m.canMessageWhatsApp(stored.consent) && !m.canSharePartners(stored.consent));
check('sans consentement : aucune tentative d’envoi WhatsApp', res.body.whatsapp === undefined, String(res.body.whatsapp));
res = mkRes();
await m.lead({ method: 'POST', body: { profile, consent: { whatsapp: true, partners: false }, consentSource: 'lead_modal' } }, res);
stored = await m.getLead(res.body.handle);
check('accord WhatsApp tracé avec la source « lead_modal »', stored.consent.whatsapp?.granted === true && stored.consent.whatsapp.source === 'lead_modal');
check('refus partenaires tracé (preuve du choix)', stored.consent.partners?.granted === false);
check('avec consentement : le premier contact est tenté (fournisseur absent ici)', /non configuré/.test(String(res.body.whatsapp)), String(res.body.whatsapp));
res = mkRes();
await m.lead({ method: 'POST', body: { profile: { ...profile, phone: undefined }, consent: { partners: true } } }, res);
const emailLead = await m.getLead(res.body.handle);
check('formulaire web : seule la case partenaires est décidée', emailLead.consent.partners?.granted === true && emailLead.consent.whatsapp === undefined);
res = mkRes();
await m.lead({ method: 'POST', body: { profile, consentWhatsApp: true } }, res);
check('ancien champ consentWhatsApp toujours accepté', m.canMessageWhatsApp((await m.getLead(res.body.handle)).consent));

console.log('\nRETRAIT PAR WHATSAPP (STOP)');
process.env.WHATSAPP_VERIFY_TOKEN = 'jeton';
process.env.DAILY_BUDGET_USD = '0.000001';
await m.recordUsage('agent-chat', { output_tokens: 1000 }); // budget du jour épuisé
res = mkRes();
await m.webhook({ method: 'POST', query: { token: 'jeton' }, headers: {}, body: { From: 'whatsapp:+971501112222', Body: 'STOP', MessageSid: 'SM-stop-1' } }, res);
stored = await m.getLead('+971501112222');
check('STOP honoré même budget épuisé et sans clé Claude', res.body?.optOut === true, JSON.stringify(res.body));
check('STOP : WhatsApp et partenaires retirés', stored && !m.canMessageWhatsApp(stored.consent) && !m.canSharePartners(stored.consent));
check('STOP : le message du prospect est gardé au dossier', stored?.transcript.some(t => t.content === 'STOP'));
delete process.env.DAILY_BUDGET_USD;

console.log('\nGARDE-FOUS DANS LE CODE');
const watch = read('api/cron/watch.ts');
check('veille nocturne : n’alerte que les leads ayant consenti', /if \(!canMessageWhatsApp\(l\.consent\)\) return false;/.test(watch));
const wh = read('api/whatsapp/webhook.ts');
check('webhook : STOP traité avant le disjoncteur de budget', wh.indexOf('isOptOutMessage(inbound.text)') > 0 && wh.indexOf('isOptOutMessage(inbound.text)') < wh.indexOf('checkDailyBudget()'));
check('bureau : export CSV filtré sur le consentement partenaires', /all\.filter\(l => canSharePartners\(l\.consent\)\)/.test(read('api/leads-desk.ts')));
const ui = read('components/ConsentFields.tsx');
check('UI : cases jamais pré-cochées (état initial false)', /EMPTY_CONSENT: ConsentChoice = \{ whatsapp: false, partners: false \}/.test(ui) && !/defaultChecked|checked=\{true\}/.test(ui));
check('UI : aucune case n’est obligatoire pour obtenir l’analyse', !/required/.test(ui));
check('UI : contact RGPD configurable, jamais inventé', /VITE_PRIVACY_CONTACT/.test(ui) && !/@[a-z0-9-]+\.[a-z]{2,}/i.test(ui));
const locales = ['fr', 'en', 'es', 'ru', 'zh', 'ar', 'af'];
check('textes de consentement présents dans les 7 langues', locales.every(l => /consent: \{[\s\S]*whatsapp:[\s\S]*partners:[\s\S]*note:/.test(read(`i18n/${l}.ts`))));
check('plus de promesse « Données confidentielles » alors que le dossier peut être transmis', !/Données confidentielles/.test(read('i18n/fr.ts')));
check('schéma : colonne consent sur leads', /alter table public\.leads\s+add column if not exists consent\s+jsonb/.test(read('docs/supabase-schema.sql')));

console.log(`\n${pass} vérifications passées, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
