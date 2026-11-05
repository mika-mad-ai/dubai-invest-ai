j-- ═══════════════════════════════════════════════════════════════════════════
-- DubaiInvest — schéma complet
--
-- À coller tel quel dans l'éditeur SQL Supabase :
--   https://supabase.com/dashboard/project/<ref>/sql/new
--
-- Idempotent : réexécutable sans risque, y compris sur une base déjà partiellement
-- créée (tout est en `if not exists` / `add column if not exists`).
--
-- Quatre tables, une par usage :
--   · leads                    — dossiers prospects et conversations (le CRM)
--   · listings                 — annonces normalisées, lues par /api/live-listings
--   · live_listings_snapshots  — snapshots bruts du collecteur Apify
--   · usage_daily              — dépense Claude du jour (disjoncteur de budget)
--   · usage_by_lead            — dépense Claude cumulée par prospect (coût par lead)
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Dossiers prospects ──────────────────────────────────────────────────
-- `handle` est la clé de déduplication : téléphone normalisé en priorité, email
-- à défaut. C'est ce qui permet à un prospect arrivé par le web puis recontacté
-- sur WhatsApp de rester un seul dossier.

create table if not exists public.leads (
  handle            text primary key,
  id                text,
  name              text,
  email             text,
  phone             text,
  advisor_id        text,
  profile           jsonb       not null default '{}'::jsonb,
  transcript        jsonb       not null default '[]'::jsonb,
  signals           jsonb       not null default '[]'::jsonb,
  viewed_listings    jsonb      not null default '[]'::jsonb,
  score             integer     not null default 0,
  tier              text        not null default 'cold',
  crm_id            text,
  status            text        not null default 'new',
  sold_to           text,
  sold_at           timestamptz,
  sold_price_eur    numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists leads_updated_at_idx on public.leads (updated_at desc);
create index if not exists leads_tier_idx       on public.leads (tier);
create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_score_idx      on public.leads (score desc);


-- ── 2. Annonces normalisées ────────────────────────────────────────────────
-- Alimentée par /api/cron/refresh-listings, lue par /api/live-listings.
--
-- ⚠️ `scraped_at` porte le test de fraîcheur (25 h) de /api/live-listings et est
-- réécrit à chaque passage du collecteur. Le `default now()` ci-dessous ne suffit
-- pas seul : il ne se déclenche qu'à l'insertion, pas sur un upsert.

create table if not exists public.listings (
  id            text primary key,
  title         text,
  location      text,
  district_id   text,
  price_eur     integer,
  price_aed     integer,
  yield_pct     numeric,
  type          text,
  beds          integer,
  baths         integer,
  sqm           numeric,
  completion    text,
  liquidity     text,
  images        jsonb,
  image         text,
  amenities     jsonb,
  lat           numeric,
  lng           numeric,
  source_url    text,
  source        text,
  scraped_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Le filtre budget de /api/live-listings trie sur price_eur, le test de
-- fraîcheur lit scraped_at : les deux méritent un index.
create index if not exists listings_price_eur_idx  on public.listings (price_eur);
create index if not exists listings_scraped_at_idx on public.listings (scraped_at desc);
create index if not exists listings_updated_at_idx on public.listings (updated_at desc);
create index if not exists listings_district_idx   on public.listings (district_id);


-- ── 3. Snapshots du collecteur ─────────────────────────────────────────────
-- Payload brut renvoyé par Apify, conservé tel quel pour pouvoir rejouer une
-- normalisation sans relancer un scraping payant.

create table if not exists public.live_listings_snapshots (
  key         text primary key,
  payload     jsonb       not null,
  updated_at  timestamptz not null default now()
);

create index if not exists live_listings_snapshots_updated_at_idx
  on public.live_listings_snapshots (updated_at desc);


-- ── 4. Comptabilité de consommation Claude ─────────────────────────────────
-- Alimente le disjoncteur de budget quotidien (`api/lib/guard.ts`). Sans cette
-- table, le compteur retombe en mémoire par instance serverless — donc plusieurs
-- compteurs indépendants, et un plafond quotidien qui ne tient plus.

create table if not exists public.usage_daily (
  day             date primary key,
  requests        integer not null default 0,
  input_tokens    bigint  not null default 0,
  output_tokens   bigint  not null default 0,
  cache_write     bigint  not null default 0,
  cache_read      bigint  not null default 0,
  cost_usd        numeric not null default 0,
  by_endpoint     jsonb   not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- Incrément ATOMIQUE. Indispensable : deux requêtes simultanées qui feraient
-- lire-puis-écrire s'écraseraient l'une l'autre et sous-compteraient la dépense,
-- ce qui est exactement le cas où le disjoncteur doit être fiable.
create or replace function public.bump_usage_daily(
  p_day date,
  p_endpoint text,
  p_input bigint,
  p_output bigint,
  p_cache_write bigint,
  p_cache_read bigint,
  p_cost numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usage_daily as u
    (day, requests, input_tokens, output_tokens, cache_write, cache_read, cost_usd, by_endpoint)
  values
    (p_day, 1, p_input, p_output, p_cache_write, p_cache_read, p_cost,
     jsonb_build_object(p_endpoint, jsonb_build_object('requests', 1, 'cost_usd', p_cost)))
  on conflict (day) do update set
    requests      = u.requests + 1,
    input_tokens  = u.input_tokens + p_input,
    output_tokens = u.output_tokens + p_output,
    cache_write   = u.cache_write + p_cache_write,
    cache_read    = u.cache_read + p_cache_read,
    cost_usd      = u.cost_usd + p_cost,
    by_endpoint   = jsonb_set(
                      u.by_endpoint,
                      array[p_endpoint],
                      jsonb_build_object(
                        'requests', coalesce((u.by_endpoint -> p_endpoint ->> 'requests')::int, 0) + 1,
                        'cost_usd', coalesce((u.by_endpoint -> p_endpoint ->> 'cost_usd')::numeric, 0) + p_cost
                      ),
                      true
                    ),
    updated_at    = now();
end;
$$;


-- ── 4 bis. Coût IA par prospect ───────────────────────────────────────────
-- Même clé que `leads.handle`. Alimentée à chaque appel Claude imputable
-- (chat web avec téléphone/email, qualification WhatsApp, veille nocturne).
-- Permet de comparer le coût d'acquisition IA au prix de revente du lead.

create table if not exists public.usage_by_lead (
  handle          text primary key,
  requests        integer not null default 0,
  input_tokens    bigint  not null default 0,
  output_tokens   bigint  not null default 0,
  cache_write     bigint  not null default 0,
  cache_read      bigint  not null default 0,
  cost_usd        numeric not null default 0,
  by_endpoint     jsonb   not null default '{}'::jsonb,
  first_at        timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create or replace function public.bump_usage_lead(
  p_handle text,
  p_endpoint text,
  p_input bigint,
  p_output bigint,
  p_cache_write bigint,
  p_cache_read bigint,
  p_cost numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usage_by_lead as u
    (handle, requests, input_tokens, output_tokens, cache_write, cache_read, cost_usd, by_endpoint)
  values
    (p_handle, 1, p_input, p_output, p_cache_write, p_cache_read, p_cost,
     jsonb_build_object(p_endpoint, jsonb_build_object('requests', 1, 'cost_usd', p_cost)))
  on conflict (handle) do update set
    requests      = u.requests + 1,
    input_tokens  = u.input_tokens + p_input,
    output_tokens = u.output_tokens + p_output,
    cache_write   = u.cache_write + p_cache_write,
    cache_read    = u.cache_read + p_cache_read,
    cost_usd      = u.cost_usd + p_cost,
    by_endpoint   = jsonb_set(
                      u.by_endpoint,
                      array[p_endpoint],
                      jsonb_build_object(
                        'requests', coalesce((u.by_endpoint -> p_endpoint ->> 'requests')::int, 0) + 1,
                        'cost_usd', coalesce((u.by_endpoint -> p_endpoint ->> 'cost_usd')::numeric, 0) + p_cost
                      ),
                      true
                    ),
    updated_at    = now();
end;
$$;

-- ── 5. Sécurité ────────────────────────────────────────────────────────────
-- RLS activé et AUCUNE policy : le service role l'ignore par conception, donc
-- les fonctions serverless continuent d'écrire, mais la clé publique `anon` ne
-- peut rien lire. C'est ce qu'on veut : `leads` contient des données
-- personnelles (téléphone, email, conversations) qui ne doivent jamais être
-- accessibles depuis le navigateur.
--
-- Si tu ajoutes un jour une lecture côté client, crée une policy explicite —
-- ne désactive pas RLS.

alter table public.leads                   enable row level security;
alter table public.usage_by_lead           enable row level security;
alter table public.listings                enable row level security;
alter table public.live_listings_snapshots enable row level security;
alter table public.usage_daily             enable row level security;

-- Les RPC de comptabilité sont `security definer` : par défaut Postgres les
-- rend exécutables par PUBLIC, donc par la clé `anon` du navigateur. Un
-- visiteur pourrait alors gonfler `usage_daily` et déclencher le disjoncteur
-- de budget (coupure du conseiller). Seul le service role les appelle.
revoke execute on function public.bump_usage_daily(date, text, bigint, bigint, bigint, bigint, numeric) from public, anon, authenticated;
revoke execute on function public.bump_usage_lead(text, text, bigint, bigint, bigint, bigint, numeric)  from public, anon, authenticated;
grant  execute on function public.bump_usage_daily(date, text, bigint, bigint, bigint, bigint, numeric) to service_role;
grant  execute on function public.bump_usage_lead(text, text, bigint, bigint, bigint, bigint, numeric)  to service_role;


-- ── 6. Migration d'une base existante ──────────────────────────────────────
-- Colonnes ajoutées après la première mise en service. Sans effet si déjà là.

alter table public.leads    add column if not exists status         text not null default 'new';
alter table public.leads    add column if not exists sold_to        text;
alter table public.leads    add column if not exists sold_at        timestamptz;
alter table public.leads    add column if not exists sold_price_eur numeric;
alter table public.listings add column if not exists scraped_at     timestamptz not null default now();
alter table public.listings add column if not exists price_aed      integer;


-- ── Contrôle ───────────────────────────────────────────────────────────────
-- Doit renvoyer les quatre tables avec rls_enabled = true.
select
  c.relname                                   as table_name,
  c.relrowsecurity                            as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('leads', 'listings', 'live_listings_snapshots', 'usage_daily')
order by c.relname;


-- ═══════════════════════════════════════════════════════════════════════════
-- Agent social — nouveauté garantie du post quotidien
--
-- Problème résolu : le carrousel affichait des agrégats sur TOUTE la table
-- (meilleur rendement, ticket le plus bas, quartier premium). Ces classements
-- ne bougent pas d'un jour à l'autre — mesuré entre le 16 et le 19 septembre
-- 2026, la seule différence visible sur une slide était « 259 644 € » au lieu
-- de « 258 716 € ». Les deux tables ci-dessous permettent de publier ce qui a
-- CHANGÉ, et de ne jamais republier la même chose.
-- ═══════════════════════════════════════════════════════════════════════════

-- Photographie quotidienne des prix, pour détecter les baisses le lendemain.
-- Un seul enregistrement par jour : une carte id → prix, ~300 Ko en JSON pour
-- 10 000 annonces. Bien plus léger qu'une ligne par annonce et par jour.
create table if not exists public.social_price_snapshots (
  day        date primary key,
  prices     jsonb       not null,
  listing_n  integer     not null default 0,
  created_at timestamptz not null default now()
);

-- Ce qui a déjà été publié : empêche de reproposer la même annonce, la même
-- photo ou le même angle. C'est ce registre qui garantit la nouveauté, plutôt
-- qu'un tirage aléatoire qui finirait par se répéter.
create table if not exists public.social_published (
  day          date primary key,
  angle        text,
  listing_ids  jsonb       not null default '[]'::jsonb,
  photo_urls   jsonb       not null default '[]'::jsonb,
  facts        jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists social_published_created_idx
  on public.social_published (created_at desc);

alter table public.social_price_snapshots enable row level security;
alter table public.social_published       enable row level security;
