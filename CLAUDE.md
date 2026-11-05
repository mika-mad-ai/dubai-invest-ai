# CLAUDE.md

## 1) Stack Technique

### Langages / Frameworks / Librairies
- Frontend: `TypeScript`, `React 19`, `Vite 6`
- UI: `Tailwind CSS`, `Lucide React`
- Data viz: `Recharts`
- Cartographie: `Leaflet`
- Backend API (serverless): fonctions `api/*.ts` (style Vercel Functions)
- Backend secondaire (non branché au frontend): `Python` + `FastAPI` (`backend.py`, actuellement mock)
- LLM d'analyse et de conseil: `@anthropic-ai/sdk` (Claude `claude-opus-5`)
- LLM de génération de contenu/médias: `@google/genai` (SEO, blog, social, Veo/Imagen)

### Versions détectées (environnement local)
- `Node.js`: `v22.13.1`
- `npm`: `11.0.0`
- `Python`: `3.12.6`

### Base de données
- **Cible implémentée**: Supabase Postgres via REST (`/rest/v1`)
- Table prévue: `live_listings_snapshots` (voir `docs/SUPABASE_SETUP.md`)
- Fallback actuel si Supabase non configuré: stockage mémoire in-process

### Services externes déjà intégrés
- Anthropic Claude API (`ANTHROPIC_API_KEY`) + web search côté serveur Anthropic
- Google Gemini API (`API_KEY`) — uniquement contenu SEO/social et génération d'images/vidéos
- Property Finder (scraping public via JSON-LD de pages SEO)
- DLD / Dubai Pulse API (tentative live via token OAuth / access token)
- Vercel (déploiement + serverless endpoints)
- Supabase (optionnel, persistance des snapshots)

---

## 2) Architecture des dossiers

### Vue d’ensemble
- `App.tsx`: orchestrateur principal UI, état global, intégrations API frontend
- `index.tsx`: point d’entrée React
- `index.html`: shell HTML + styles globaux
- `types.ts`: types métier partagés
- `services/`: services frontend (conseiller Claude, DLD)
- `components/`: composants UI, charts, carte, formulaires, chat
- `api/`: endpoints serverless (scraping, agrégateur, DLD, collector, store)
- `docs/`: documentation d’exploitation (Supabase setup)
- `backend.py`: FastAPI mock indépendant (non utilisé dans le flux React actuel)

### Détail des dossiers/fichiers clés

#### Couche agent IA (Claude)
- `api/lib/claude.ts`
  - Client Anthropic partagé, modèle `claude-opus-5`
  - Personas des 3 conseillers (Karim / James / Léa) + `qualifiers` par conseiller
  - Construction du prompt système en 2 blocs : stable (mis en cache éphémère)
    puis volatile (dossier, annonces, DLD). L'ordre est structurant : le cache
    est un préfixe, tout ce qui change en amont l'invalide.
- `api/agent-chat.ts`
  - Chat du conseiller en SSE. Recharge annonces scorées + DLD à chaque tour
  - Émet `meta` (biens retenus) avant le texte, puis `text`*, puis `done`
- `api/lib/qualifier.ts`
  - Agent de qualification WhatsApp : un seul appel Claude en sortie structurée
    renvoie à la fois la réponse, les champs extraits et les signaux d'achat
- `services/agentService.ts`
  - Client frontend du flux SSE + capture de lead

#### Couche décision (sans LLM, volontairement)
- `api/lib/matchEngine.ts`
  - Scoring déterministe annonce ↔ profil sur 100 points : budget 40,
    contrôle prix 20, objectif 20, zone 10, risque 10
  - Retourne `matchReasons` — la traçabilité de chaque recommandation
- `api/lib/priceCheck.ts`
  - Croisement prix demandé ↔ transactions DLD, verdict en 5 paliers
  - `netYield()` : rendement net après service charges, vacance et gestion
  - `BENCHMARK_AED_SQFT` : grille de repli par quartier, **datée 2024-2025**
- `api/lib/leadScore.ts`
  - Score 0-100, palier `cold`/`warm`/`hot`/`qualified`, valorisation 500-2000 €
  - `missing` pilote la prochaine question de l'agent de qualification

#### Couche commerciale
- `api/lead.ts` — capture web : scoring, CRM, premier contact WhatsApp
- `api/whatsapp/webhook.ts` — boucle complète de l'agent de qualification
- `api/cron/watch.ts` — veille nocturne : nouvelles offres et baisses de prix
- `api/lib/leadStore.ts` — persistance Supabase, repli mémoire
- `api/leads-desk.ts` — bureau des leads sur `/bureau` : le CRM interne, rendu
  côté serveur, protégé par `ADMIN_SECRET`. Rend Airtable/HubSpot optionnels
- `api/lib/crm.ts` — miroir CRM externe optionnel (Airtable ou HubSpot)
- `api/lib/whatsapp.ts` — Twilio ou 360dialog, + normalisation des entrants
- `api/lib/context.ts` — charge annonces + DLD, partagé par les 3 agents
- `api/lib/guard.ts` — garde-fous de coût : bornes d'entrée, débit par IP,
  disjoncteur de budget quotidien adossé à `usage_daily`, calcul de coût réel

- `services/dldService.ts`
  - Client frontend `/api/dld-weekly`

- `api/dld-weekly.ts`
  - Récupère transactions DLD (si credentials)
  - Agrège hebdo prix moyen + volume autour du conflit

- `api/lib/listingsCollector.ts`
  - Collecteur multi-source (Property Finder + Bayut)
  - Normalisation + déduplication
  - **État source**: PF fonctionne, Bayut souvent bloqué (challenge/401)

- `api/lib/listingsStore.ts`
  - Save/read snapshots
  - Supabase REST si configuré, sinon mémoire

- `api/live-listings.ts`
  - Endpoint consommé par le frontend
  - Lit snapshot récent, refresh sinon

- `api/collector/run.ts`
  - Trigger manuel/cron du collecteur
  - Auth simple via `COLLECTOR_SECRET`

- `api/propertyfinder-scrape.ts`
  - Endpoint legacy PF-only (toujours présent)

- `components/charts/GeopoliticalImpactChart.tsx`
  - Graphiques prix moyen + volume hebdo (DLD/fallback)

- `components/PropertyCard.tsx`
  - Carte annonce + lien source

- `components/MatchedListings.tsx`
  - Sélection du conseiller avec verdict prix DLD et score d'adéquation

- `docs/supabase-schema.sql`
  - Schéma complet et idempotent : `leads`, `listings`, `live_listings_snapshots`,
    plus RLS sans policy (le service role l'ignore, la clé `anon` ne lit rien)

- `docs/SUPABASE_SETUP.md`
  - SQL table + variables d’environnement + trigger collector (antérieur)

- `docs/AGENCY_SETUP.md`
  - Mise en service complète : ordre de branchement, schéma SQL `leads`,
    colonnes CRM attendues, webhooks WhatsApp, garde-fous de la veille

- `scripts/verify-{engine,desk,schema,guard}.mjs` (`npm run verify`)
  - 92 assertions sans clé API : matching, contrôle prix, scoring, vraisemblance
    de la grille, bureau des leads (auth, filtres, CSV, XSS), cohérence du schéma
    SQL, et garde-fous de coût (bornes, débit, disjoncteur, signature Twilio)

---

## 3) Ce qui est déjà fonctionnel

### Fonctionnel (code + build + `npm run verify`)
- UI complète de simulation investisseur (profil, projections, fiscalité, cashflow, carte zones)
- 3 conseillers IA Claude spécialisés, avec avatar compagnon persistant et
  questionnaire spécialisé par conseiller
- Chat conseiller en streaming SSE, prompt système mis en cache
- Matching déterministe annonces ↔ profil + contrôle prix vs DLD, avec
  affichage du verdict et des raisons du score côté UI
- Scoring de lead avec valorisation de revente et détection de signaux d'achat
- Agent WhatsApp de qualification autonome (sortie structurée)
- Push CRM Airtable/HubSpot à chaque interaction
- Agent de veille nocturne avec garde-fous anti-spam
- Section géopolitique avec graphes hebdomadaires prix/volume
- Pipeline `collector -> snapshot -> API lecture` implémenté
- Build `npm run build` OK, `npm run verify` 28/28

### Fonctionnel en production (si variables minimales)
- App web déployable sur Vercel
- Endpoints `api/*` actifs en serverless
- Scraping Property Finder SEO (selon disponibilité source)
- Fallback automatique vers annonces statiques si collecte indisponible

### Différences production vs développement
- En dev Vite pur, les routes `api/*` ne sont pas natives (sauf usage `vercel dev` ou proxy custom)
- En prod Vercel, les routes `api/*` sont natives et utilisées par le frontend

---

## 4) Ce qui est bloqué ou incomplet

### Intégration Apify
- **Implémentée** : actor `shahidirfan~propertyfinder-scraper`, run asynchrone
  + webhook `/api/apify-webhook`, repli scraping direct sans token
- **Bayut toujours bloqué** : CAPTCHA côté serveur, nécessiterait un proxy
  premium Apify. Property Finder seul alimente le pipeline aujourd'hui

### Connexion aux données DLD (Dubai Land Department)
- Endpoint `api/dld-weekly.ts` prêt mais dépend de credentials:
  - `DLD_API_KEY` + `DLD_API_SECRET` ou `DLD_ACCESS_TOKEN`
- Sans credentials valides: fallback local / data indisponible
- Mapping des champs DLD basé sur heuristiques (date/value/type), à durcir en production

### Pipeline d’analyse via LLM
- **Migré sur Claude** (`claude-opus-5`). Gemini ne sert plus qu'au contenu
  SEO/social et à la génération d'images/vidéos
- Le scoring est délibérément **sans LLM** (`matchEngine`, `priceCheck`,
  `leadScore`) : reproductible, auditable, gratuit. Claude explique et arbitre
  sur une liste déjà réduite et déjà vérifiée en prix
- Traçabilité : chaque bien recommandé porte ses `matchReasons` et son verdict
  prix ; chaque lead porte son `breakdown` de score
- **Cache de prompt** : `system` ne doit contenir QUE du stable. Le dossier et les
  annonces vont dans le premier message utilisateur — sinon le rechargement des
  annonces à chaque tour invalide tout l'historique. Vérifié contre l'API :
  4 550 tokens écrits au tour 1, relus au tour 2 avec 2 tokens d'entrée fraîche
- **Le coût est à 80 % dans la sortie.** Mesuré : 12 300 tokens de sortie sur une
  conversation de 6 tours sans plafond, soit 0,346 $ sur Opus 5. `max_tokens` est
  donc plafonné à 2 200 et la règle de style impose 250 mots — ce qui ramène à
  0,127 $, et rend les réponses lisibles dans la colonne de chat
- `CLAUDE_MODEL` permet de basculer sur `claude-sonnet-5` sans toucher au code :
  même fidélité aux données mesurée (6/6 sur le banc), 40 % moins cher
- **Manque encore** : agrégation du `usage` réellement consommé (les coûts
  documentés sont calculés, pas mesurés), et évaluation systématique de la
  qualité des réponses du conseiller (pas de jeu d'évaluation)

### Exposition de coût (traitée)
- `/api/agent-chat` est public par nature : un visiteur doit pouvoir parler au
  conseiller. Sans bornes, une requête pouvait remplir la fenêtre de contexte et
  coûter 1,44 $ ; c'est désormais plafonné à 0,29 $
- `/api/cron/watch` et `/api/collector/run` étaient **publics** dès que
  `COLLECTOR_SECRET` était absent (`if (!expected) return true`). Corrigé :
  échec fermé
- Le webhook WhatsApp acceptait n'importe quel POST. Il exige maintenant une
  signature HMAC Twilio ou un jeton partagé
- `DAILY_BUDGET_USD` arme un disjoncteur global adossé à `usage_daily`. Le seul
  plafond dur reste la limite de dépense de la console Anthropic

### Contrainte WhatsApp (structurante)
- Texte libre autorisé uniquement dans les 24 h suivant le dernier message du
  prospect ; au-delà, seul un modèle pré-approuvé par Meta passe
- La veille nocturne bascule donc automatiquement en mode modèle, où Claude ne
  produit que les variables via sortie structurée (`TEMPLATE_VARS_SCHEMA`)
- Sans `WHATSAPP_TEMPLATE_ALERT_SID`/`_NAME`, la veille ne peut pas alerter hors
  fenêtre et le dit dans son rapport plutôt que d'échouer en silence

### Grille de prix de référence
- La grille vit dans `api/lib/dldBenchmarks.ts`, **recalée au 2026-11-05** sur
  les médianes DLD revente 12 mois (connecteur MCP « DXB interact », disponible
  dans les sessions Claude Code — refaire ce recalage périodiquement) :
  ~50 clés quartier appartements + ~35 villas (grilles séparées : Palm villa
  7 061 vs appart 2 796), correctif par nombre de chambres (studio ×1,14,
  2 ch. ×0,90, 3 ch.+ ×0,87), zone DLD source et volume 12 mois par entrée
- `checkPrice` accepte `{ beds, type }` et porte `asOf` + `zone` dans son
  verdict ; `marketPriceSqft` des annonces est désormais en AED/sqft DLD
- Sans credentials DLD, tous les verdicts prix s'appuient sur elle
  (`basis: 'benchmark'` au lieu de `'dld'`) — à recaler périodiquement
- **Point le plus sensible du système** : une grille trop haute fait passer un
  bien surévalué pour une aubaine. `npm run verify` porte des assertions de
  vraisemblance par quartier qui échouent si la grille dérive
- `checkPrice` n'accepte en 4ᵉ argument qu'un prix moyen **de quartier**, jamais
  une moyenne DLD toutes-zones (garde-fou d'unité 500–6000 AED/sqft)

### Chemin rapide Supabase des annonces
- `live-listings` teste la fraîcheur sur `max(scraped_at)`. La colonne n'était
  alimentée que par son `default now()`, donc uniquement à l'insertion — jamais
  sur un upsert `merge-duplicates`
- En pratique le test passe, parce qu'au moins une annonce inédite entre chaque
  nuit et que le `max` porte sur toute la table. Mais c'est un effet de bord :
  une nuit sans nouvel identifiant laisserait le `max` vieillir, et au-delà de
  25 h tout retomberait sur du scraping direct (5-10 s au lieu de < 50 ms)
- `refresh-listings` écrit désormais `scraped_at` explicitement à chaque passage,
  ce qui supprime cette dépendance. `verify-schema` empêche la régression

### Persistance des leads
- Sans Supabase, les leads vivent en mémoire du process : un cold start Vercel
  interrompt une conversation WhatsApp en cours. Bloquant en production

---

## 5) Objectifs du projet (à intégrer tels quels)

Ce projet est un conseiller en investissement immobilier  
à Dubai pour investisseurs étrangers.

L'architecture cible est :
- Scraping Bayut + Property Finder via Apify 
  (une seule clé API pour tous les actors)
- Croisement avec données DLD pour valider 
  les prix vs transactions réelles
- Analyse et matching via Claude API (pas Gemini) 
  selon profil investisseur : budget, quartier, 
  objectif rendement locatif ou plus-value
- Alerte et suivi automatique via WhatsApp Business API 
  (Twilio ou 360dialog) : nouvelles offres matching 
  le profil, baisses de prix détectées
- Agent conversationnel WhatsApp qui qualifie 
  le lead en autonomie via questions ciblées
- CRM (HubSpot ou Airtable) alimenté automatiquement 
  par chaque interaction WhatsApp :
  profil complet, biens consultés, niveau d'intérêt, 
  signaux d'achat détectés
- Monétisation : revente de leads qualifiés 
  aux agences immobilières et promoteurs Dubai
  (500 à 2000€ par lead selon qualité)

---

## 6) Conventions de code observées

- TypeScript `strict` activé (`tsconfig`)
- Composants React majoritairement fonctionnels + hooks (`useState/useEffect/useMemo/useRef`)
- Async/await côté API serverless, `.then/.catch` parfois côté frontend
- Typage métier centralisé dans `types.ts`
- Nommage:
  - `PascalCase` pour composants/types
  - `camelCase` pour variables/fonctions
  - constantes globales en `UPPER_SNAKE_CASE` partiel
- Styling via classes utilitaires Tailwind (chaînes longues inline)
- I18N implicite: UX principalement en français, code/commentaires mix FR/EN
- API routes retournent souvent `200` même en erreur métier (avec `live:false` + `reason`)
- Peu/pas de tests automatisés présents dans le repo

---

## 7) Prochaines étapes prioritaires

Les 5 étapes initiales (Apify, Claude, WhatsApp, CRM, veille nocturne) sont
implémentées. Ce qui reste :

1. **Brancher les credentials** — voir `docs/AGENCY_SETUP.md`, ordre de
   branchement et vérifications par étape
2. ~~Instrumenter le coût réel par lead~~ — fait : `usage_by_lead` (RPC
   atomique `bump_usage_lead`), imputé par `recordUsage(…, { leadHandle,
   model })` depuis le chat, WhatsApp et la veille ; affiché au bureau
   (`/bureau`, jamais dans le CSV agences). Reste : exécuter le SQL sur la base
3. ~~Recaler la grille de prix par quartier~~ — fait le 2026-11-05 via le
   connecteur MCP DXB interact (médianes DLD revente 12 mois). Reste à
   automatiser : la grille demeure statique entre deux recalages manuels
4. **Débloquer Bayut** (proxy premium Apify) pour doubler le volume d'annonces
5. ~~Jeu d'évaluation du conseiller~~ — banc hors-ligne `npm run eval`
   (`scripts/eval-advisor.mjs` + correcteur `api/lib/advisorEval.ts`) :
   matching par scénario, verdicts DLD, fidélité du prompt, détection
   d'hallucinations chiffrées. Reste : brancher le correcteur sur les
   transcripts réels (`--reply fichier.txt`) pour une mesure continue
6. **Consentement et RGPD** — mécanique faite (`api/lib/consent.ts`) : deux
   finalités distinctes (WhatsApp / transmission partenaires), cases non
   pré-cochées, décision horodatée + version du texte (`leads.consent`),
   STOP honoré avant tout (même budget épuisé), veille et export CSV filtrés
   sur le consentement. **Reste BLOQUANT avant prod** : politique de
   confidentialité avec l'identité du responsable de traitement, et
   `VITE_PRIVACY_CONTACT` (adresse d'exercice des droits)

---

## Variables d’environnement actuelles (référence rapide)

Détail et ordre de branchement : `docs/AGENCY_SETUP.md`.

- LLM conseiller (**obligatoire**):
  - `ANTHROPIC_API_KEY`
- LLM contenu SEO / médias:
  - `API_KEY` (Gemini)
- DLD:
  - `DLD_API_KEY`
  - `DLD_API_SECRET`
  - `DLD_ACCESS_TOKEN`
  - `DLD_RESOURCE_ID` (optionnel)
  - `DLD_OAUTH_URL` (optionnel)
  - `DLD_CKAN_BASE` (optionnel)
- Collector/Store:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_LISTINGS_TABLE` (optionnel)
  - `SUPABASE_LEADS_TABLE` (optionnel, défaut `leads`)
  - `COLLECTOR_SECRET` (recommandé)
  - `APIFY_API_TOKEN`
- Bureau des leads interne:
  - `ADMIN_SECRET` (accès à `/bureau`)
- CRM externe, optionnel (le premier configuré gagne):
  - `AIRTABLE_TOKEN` + `AIRTABLE_BASE_ID` + `AIRTABLE_LEADS_TABLE` (optionnel)
  - ou `HUBSPOT_TOKEN`
- WhatsApp (le premier configuré gagne):
  - `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_WHATSAPP_FROM`
  - ou `D360_API_KEY`
  - `WHATSAPP_VERIFY_TOKEN` (poignée de main Meta/360dialog)
  - `WHATSAPP_TEMPLATE_ALERT_SID` (Twilio) ou `WHATSAPP_TEMPLATE_ALERT_NAME`
    + `WHATSAPP_TEMPLATE_LANG` (360dialog) — requis pour la veille hors 24 h
  - `SALES_ALERT_WHATSAPP` (optionnel — alerte interne sur lead qualifié)
- Veille:
  - `CRON_SECRET` (envoyé en Bearer par les crons Vercel)
