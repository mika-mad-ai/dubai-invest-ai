# Supabase Setup (Collector -> DB -> UI)

## 1) Create table

Run this SQL in Supabase SQL Editor:

```sql
create table if not exists public.live_listings_snapshots (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_live_listings_snapshots_updated_at
  on public.live_listings_snapshots (updated_at desc);
```

## 2) Configure Vercel env vars

Add these variables in the Vercel project:

- `SUPABASE_URL` = your project URL (example: `https://xxxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` = service role key
- `SUPABASE_LISTINGS_TABLE` = `live_listings_snapshots` (optional)
- `COLLECTOR_SECRET` = random secret for `/api/collector/run` (recommended)

## 3) Trigger collector

Manual run:

```bash
curl "https://<your-domain>/api/collector/run?city=dubai&limit=24&secret=<COLLECTOR_SECRET>"
```

## 4) Read endpoint used by UI

The UI reads:

`/api/live-listings?city=dubai&limit=18`

- Returns cached DB snapshot when fresh.
- Refreshes collection when stale or if `refresh=1`.

---

## 5) Table seo_content (Agent SEO/GEO quotidien)

Créer cette table pour l'agent `api/cron/seo-geo-optimizer.ts` :

```sql
create table if not exists public.seo_content (
  key text primary key,           -- 'llms_txt', 'meta_description', 'faq_schema', 'market_stats'
  content text not null,
  generated_at timestamptz not null default now(),
  metadata jsonb default '{}'::jsonb
);

-- Index pour récupération rapide par clé
create index if not exists idx_seo_content_generated_at
  on public.seo_content (generated_at desc);

-- RLS : lecture publique (pour /api/llms-txt et /api/seo-content)
alter table public.seo_content enable row level security;

create policy "Public read" on public.seo_content
  for select using (true);

create policy "Service role write" on public.seo_content
  for all using (auth.role() = 'service_role');
```

## 6) Variables d'env supplémentaires (agent SEO/GEO)

Ajouter dans Vercel :

- `CRON_SECRET` = secret partagé entre vercel.json cron et le handler (pour appels manuels)

L'agent tourne automatiquement tous les jours à **4h UTC** (après refresh-listings à 3h).

Appel manuel :
```bash
curl "https://dubainvest.eu/api/cron/seo-geo-optimizer?secret=<CRON_SECRET>"
```

## 8) Tables agents SEO off-site

```sql
-- Rapports mensuels (Agent 1)
create table if not exists public.seo_reports (
  slug text primary key,
  title text not null,
  html text not null,
  meta_description text,
  published_at timestamptz default now(),
  stats jsonb default '{}'::jsonb
);

-- Mentions surveillées + drafts réponses (Agent 2)
create table if not exists public.seo_mentions (
  source_id text primary key,       -- ex: "reddit_abc123"
  platform text not null,           -- ex: "Reddit r/investissement"
  url text not null,
  title text,
  body_preview text,
  score integer default 0,
  reply_draft text,
  status text default 'pending',    -- pending | posted | skipped
  detected_at timestamptz default now()
);

-- Opportunités HARO / presse (Agent 3)
create table if not exists public.seo_haro_opportunities (
  id uuid primary key default gen_random_uuid(),
  journalist_email text,
  media_outlet text,
  category text,
  deadline text,
  query_preview text,
  relevance_score integer default 0,
  email_subject text,
  response_draft text,
  status text default 'draft',      -- draft | sent | declined
  received_at timestamptz default now()
);

-- RLS : lecture/écriture service role uniquement
alter table public.seo_reports enable row level security;
alter table public.seo_mentions enable row level security;
alter table public.seo_haro_opportunities enable row level security;

create policy "Public read reports" on public.seo_reports for select using (true);
create policy "Service write reports" on public.seo_reports for all using (auth.role() = 'service_role');
create policy "Service all mentions" on public.seo_mentions for all using (auth.role() = 'service_role');
create policy "Service all haro" on public.seo_haro_opportunities for all using (auth.role() = 'service_role');
```

## 9) Variables d'env supplémentaires (agents off-site)

```
SLACK_WEBHOOK_URL     = https://hooks.slack.com/services/xxx  (alertes mention monitor + HARO)
HARO_WEBHOOK_SECRET   = random_secret  (sécurise le webhook HARO)
CRON_SECRET           = random_secret  (déjà utilisé, vérifier qu'il est défini)
```

**HARO webhook URL à configurer dans Zapier/Make :**
```
POST https://dubainvest.eu/api/haro-webhook
Headers: X-Webhook-Secret: <HARO_WEBHOOK_SECRET>
Body: { "subject": "...", "text": "..." }
```

## 7) Flux complet quotidien

```
3h UTC → /api/cron/refresh-listings   → scrape PropertyFinder → Supabase listings
4h UTC → /api/cron/seo-geo-optimizer  → stats listings → Gemini → Supabase seo_content
↓
/llms.txt            → servi dynamiquement depuis seo_content.llms_txt
/api/seo-content     → meta_description + faq_schema injectés dans <head> par React
```
