# CLAUDE.md

## 1) Stack Technique

### Langages / Frameworks / Librairies
- Frontend: `TypeScript`, `React 19`, `Vite 6`
- UI: `Tailwind CSS`, `Lucide React`
- Data viz: `Recharts`
- Cartographie: `Leaflet`
- Backend API (serverless): fonctions `api/*.ts` (style Vercel Functions)
- Backend secondaire (non branché au frontend): `Python` + `FastAPI` (`backend.py`, actuellement mock)
- LLM actuel: `@google/genai` (Gemini `gemini-2.0-flash`)

### Versions détectées (environnement local)
- `Node.js`: `v22.13.1`
- `npm`: `11.0.0`
- `Python`: `3.12.6`

### Base de données
- **Cible implémentée**: Supabase Postgres via REST (`/rest/v1`)
- Table prévue: `live_listings_snapshots` (voir `docs/SUPABASE_SETUP.md`)
- Fallback actuel si Supabase non configuré: stockage mémoire in-process

### Services externes déjà intégrés
- Google Gemini API (`API_KEY`) + Google Search tool côté modèle
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
- `services/`: services frontend (Gemini, DLD)
- `components/`: composants UI, charts, carte, formulaires, chat
- `api/`: endpoints serverless (scraping, agrégateur, DLD, collector, store)
- `docs/`: documentation d’exploitation (Supabase setup)
- `backend.py`: FastAPI mock indépendant (non utilisé dans le flux React actuel)

### Détail des dossiers/fichiers clés
- `services/geminiService.ts`
  - Création session chat Gemini
  - Prompting système investisseur
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

- `docs/SUPABASE_SETUP.md`
  - SQL table + variables d’environnement + trigger collector

---

## 3) Ce qui est déjà fonctionnel

### Fonctionnel (code + build)
- UI complète de simulation investisseur (profil, projections, fiscalité, cashflow, carte zones)
- Chat IA intégré via Gemini
- Section géopolitique avec graphes hebdomadaires prix/volume
- Chargement d’annonces “réelles” via endpoint agrégateur
- Pipeline `collector -> snapshot -> API lecture` implémenté
- Build frontend `npm run build` OK

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

### Intégration Apify (scraping Bayut + Property Finder Dubai)
- **Non implémentée** actuellement
- Collecteur actuel scrape directement les pages publiques
- Bayut retourne fréquemment challenge/401 côté serveur (non résolu)
- Aucune orchestration Apify Actors (pas de clé Apify, pas de webhook, pas de dataset pull)

### Connexion aux données DLD (Dubai Land Department)
- Endpoint `api/dld-weekly.ts` prêt mais dépend de credentials:
  - `DLD_API_KEY` + `DLD_API_SECRET` ou `DLD_ACCESS_TOKEN`
- Sans credentials valides: fallback local / data indisponible
- Mapping des champs DLD basé sur heuristiques (date/value/type), à durcir en production

### Pipeline d’analyse via LLM
- Pipeline actuel centré sur Gemini (pas Claude)
- Pas de pipeline batch scoring d’annonces + matching investisseur persistant
- Pas de couche de traçabilité/évaluation des recommandations LLM

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

1. Finaliser intégration Apify (actors Bayut + PF)
2. Remplacer Gemini par Claude API pour l'analyse
3. Intégrer WhatsApp Business API
4. Connecter CRM
5. Construire agent de surveillance nocturne automatique

---

## Variables d’environnement actuelles (référence rapide)

- Front LLM:
  - `API_KEY` (Gemini actuel)
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
  - `COLLECTOR_SECRET` (recommandé)
