/**
 * Vérifie que docs/supabase-schema.sql couvre exactement ce que le code lit et
 * écrit. Attrape la classe de bug la plus coûteuse ici : une colonne utilisée par
 * une fonction serverless mais absente du schéma — l'erreur ne se manifeste
 * qu'en production, sur une requête REST qui échoue en silence.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(ROOT, p), 'utf8');
const sql = read('docs/supabase-schema.sql');

function colsOf(table) {
  const m = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`table ${table} absente du schéma`);
  const cols = new Set(
    m[1].split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('--'))
      .map(l => l.split(/\s+/)[0])
  );
  // colonnes ajoutées dans la section migration
  const addRe = new RegExp(`alter table public\\.${table}\\s+add column if not exists (\\w+)`, 'g');
  for (const m2 of sql.matchAll(addRe)) cols.add(m2[1]);
  return cols;
}

let pass = 0, fail = 0;
const check = (label, missing) => {
  if (missing.length) { fail++; console.log(`  FAIL ${label} — colonnes manquantes : ${missing.sort().join(', ')}`); }
  else { pass++; console.log(`  ok   ${label}`); }
};

const leads = colsOf('leads');
const listings = colsOf('listings');
const snapshots = colsOf('live_listings_snapshots');

// listings — lecture
const sel = read('api/live-listings.ts').match(/select: '([^']+)'/)[1].split(',');
check('listings couvre les colonnes lues par live-listings',
  [...sel, 'scraped_at', 'updated_at'].filter(c => !listings.has(c)));

// listings — écriture
const KNOWN = new Set(['id','title','location','district_id','price_eur','price_aed','yield_pct',
  'type','beds','baths','sqm','completion','liquidity','images','image','amenities','lat','lng',
  'source_url','source','scraped_at','updated_at']);
const written = [...read('api/cron/refresh-listings.ts').matchAll(/^ {4}(\w+):/gm)]
  .map(m => m[1]).filter(c => KNOWN.has(c));
check('listings couvre les colonnes écrites par refresh-listings',
  written.filter(c => !listings.has(c)));

// `scraped_at` doit être réécrit à chaque passage, sinon le chemin rapide
// Supabase se croit périmé en permanence et tout retombe sur le scraping.
check('refresh-listings écrit bien scraped_at',
  read('api/cron/refresh-listings.ts').includes('scraped_at:') ? [] : ['scraped_at jamais écrit']);

// leads — type StoredLead
const block = read('api/lib/leadStore.ts').match(/export type StoredLead = \{([\s\S]*?)\n\};/)[1];
const fields = [...block.matchAll(/^ {2}(\w+)\??:/gm)].map(m => m[1]);
check('leads couvre tous les champs de StoredLead', fields.filter(c => !leads.has(c)));

// snapshots
check('live_listings_snapshots complet',
  ['key','payload','updated_at'].filter(c => !snapshots.has(c)));

// RLS obligatoire sur les données personnelles
check('RLS activé sur leads',
  /alter table public\.leads\s+enable row level security/.test(sql) ? [] : ['RLS absent sur leads']);


// Les tables du post quotidien. Sans elles, PostgREST répond 404 et le module
// dégrade en silence : plus d'historique de prix (donc jamais de slide « baisse
// détectée ») et plus d'exclusions (donc le même bien peut ressortir). Le défaut
// est invisible dans les logs de production, d'où cette assertion.
const socialSrc = read('api/lib/socialFacts.ts');
const socialTables = [...new Set([
  ...[...socialSrc.matchAll(/\/rest\/v1\/(\w+)/g)].map(m => m[1]),
  ...[...socialSrc.matchAll(/sb\(`(\w+)\?/g)].map(m => m[1]),
])];
check('les tables lues par socialFacts sont déclarées dans le schéma',
  socialTables.filter(t => !new RegExp(`create table if not exists public\\.${t}\\b`).test(sql)));

console.log(`\n${pass} vérifications passées, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
