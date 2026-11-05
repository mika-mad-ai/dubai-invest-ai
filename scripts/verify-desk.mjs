/**
 * Vérifie le bureau des leads de bout en bout : autorisation, rendu, filtres,
 * export CSV, mise à jour de statut, échappement HTML. Aucune clé API requise —
 * le store retombe en mémoire quand Supabase n'est pas configuré.
 */
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Racine du projet, robuste aux espaces dans le chemin.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = await import(pathToFileURL(resolve(ROOT, 'node_modules/esbuild/lib/main.js')).href);
const out = mkdtempSync(join(tmpdir(), 'desk-'));
const entry = join(out, 'e.ts');
writeFileSync(entry, `
import handler from '${ROOT}/api/leads-desk';
export { handler };
export { upsertLead } from '${ROOT}/api/lib/leadStore';
export { recordUsage } from '${ROOT}/api/lib/guard';
`);
const bundle = join(out, 'b.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
const m = await import(pathToFileURL(bundle).href);

process.env.ADMIN_SECRET = 'test-secret';

// Deux leads en mémoire (pas de Supabase configuré → repli mémoire)
await m.upsertLead({
  handle: '+33612345678', name: 'Marie Dupont', email: 'marie@ex.fr', phone: '+33612345678',
  advisor_id: 'locatif', score: 82, tier: 'qualified', status: 'new',
  profile: { totalBudget: 800000, objective: 'rental_income' },
  signals: ['budget_confirmed', 'visit_requested'],
  consent: { partners: { granted: true, at: '2026-11-05T10:00:00.000Z', source: 'web_form', textVersion: 'test-v1' } },
  transcript: [{ role: 'user', content: 'Je veux visiter la semaine prochaine <script>alert(1)</script>', at: new Date().toISOString(), channel: 'whatsapp' }],
});
await m.upsertLead({
  handle: 'jean@ex.fr', name: 'Jean Martin', email: 'jean@ex.fr',
  advisor_id: 'residence', score: 41, tier: 'warm', status: 'contacted',
  profile: { totalBudget: 300000, objective: 'golden_visa' }, signals: [],
});

const mkRes = () => {
  const r = { code: 0, headers: {}, body: '', statusCode: 0,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.code = c; return this; },
    send(b) { this.body = typeof b === 'string' ? b : JSON.stringify(b); return this; },
    json(b) { return this.send(b); },
    end() {},
  };
  return r;
};

// toLocaleString('fr-FR') sépare les milliers par une espace fine insécable
// (U+202F) : toute assertion sur un nombre formaté doit la normaliser.
const norm = s => s.replace(/[\u202f\u00a0]/g, ' ');

let pass = 0, fail = 0;
const check = (l, c, d = '') => { c ? (pass++, console.log(`  ok   ${l}`)) : (fail++, console.log(`  FAIL ${l}${d ? ` — ${d}` : ''}`)); };

// 1. Sans secret → 401
let res = mkRes();
await m.handler({ method: 'GET', query: {} }, res);
check('accès sans clé refusé (401)', res.code === 401, `code=${res.code}`);

// 2. Mauvaise clé → 401
res = mkRes();
await m.handler({ method: 'GET', query: { key: 'wrong' } }, res);
check('mauvaise clé refusée (401)', res.code === 401);

// 3. Bonne clé → HTML
res = mkRes();
await m.handler({ method: 'GET', query: { key: 'test-secret' } }, res);
check('bonne clé → 200 HTML', res.code === 200 && res.headers['content-type'].includes('text/html'));
check('les deux leads sont listés', res.body.includes('Marie Dupont') && res.body.includes('Jean Martin'));
check('trié par score décroissant', res.body.indexOf('Marie Dupont') < res.body.indexOf('Jean Martin'));
check('pipeline valorisé', norm(res.body).includes('2 800 €'), 'attendu 2 000 € (qualified) + 800 € (warm)');
check('signaux traduits en clair', res.body.includes('demande de visite'));
check('nom du conseiller résolu', res.body.includes('Karim Haddad') && res.body.includes('James Bennett'));
check('injection HTML échappée', res.body.includes('&lt;script&gt;') && !res.body.includes('<script>alert(1)</script>'));
check('page non indexable', res.body.includes('noindex'));

// 4. Filtre par palier
res = mkRes();
await m.handler({ method: 'GET', query: { key: 'test-secret', tier: 'warm' } }, res);
check('filtre palier=warm exclut le qualified', res.body.includes('Jean Martin') && !res.body.includes('Marie Dupont'));

// 5. Export CSV
res = mkRes();
await m.handler({ method: 'GET', query: { key: 'test-secret', format: 'csv' } }, res);
check('CSV servi en text/csv', res.headers['content-type'].includes('text/csv'));
check('CSV RGPD : seul le lead ayant consenti à la transmission est exporté (en-tête + 1 ligne)', res.body.trim().split('\n').length === 2, `${res.body.trim().split('\n').length} lignes`);
check('CSV RGPD : Jean (sans consentement partenaires) absent', !res.body.includes('Jean Martin'));
check('CSV RGPD : date et version du consentement exportées', res.body.includes('2026-11-05T10:00:00.000Z') && res.body.includes('test-v1'));
check('CSV échappe les guillemets', res.body.includes('"Marie Dupont"'));

// 6. POST : marquer vendu
res = mkRes();
await m.handler({ method: 'POST', query: { key: 'test-secret' }, body: { handle: '+33612345678', status: 'sold', soldTo: 'Betterhomes', soldPriceEur: '1800' } }, res);
check('POST redirige (303)', res.statusCode === 303, `statusCode=${res.statusCode}`);

res = mkRes();
await m.handler({ method: 'GET', query: { key: 'test-secret' } }, res);
check('vente enregistrée et encaissé mis à jour', norm(res.body).includes('1 800 €'), 'montant absent');
check('statut passé à Vendu', /option value="sold" selected/.test(res.body));

// 7. POST invalide
res = mkRes();
await m.handler({ method: 'POST', query: { key: 'test-secret' }, body: { handle: 'x', status: 'bogus' } }, res);
check('statut invalide rejeté (400)', res.code === 400);

// Coût IA par lead : visible au bureau, jamais dans le CSV livré aux agences.
await m.recordUsage('agent-chat', { input_tokens: 2, output_tokens: 600, cache_read_input_tokens: 4550 }, { leadHandle: '+33612345678', model: 'claude-opus-5' });
res = mkRes();
await m.handler({ method: 'GET', query: { key: 'test-secret' } }, res);
check('bureau : coût IA réel affiché pour le lead imputé', /coût IA 0\.017 \$/.test(res.body), (res.body.match(/coût IA[^<]*/g) || []).join(' | '));
check('bureau : lead sans consommation → « coût IA — »', /coût IA —/.test(res.body));
res = mkRes();
await m.handler({ method: 'GET', query: { key: 'test-secret', format: 'csv' } }, res);
check('CSV agences : aucun coût interne exporté', !/coût IA|cost_usd/i.test(res.body));

console.log(`\n${pass} vérifications passées, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
