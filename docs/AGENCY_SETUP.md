# Mise en service de l'agence IA

Ce document décrit tout ce qu'il faut brancher pour passer du code déployé à une
agence qui tourne. Chaque brique est indépendante : l'app fonctionne dès la
première variable, et chaque ajout débloque une capacité supplémentaire.

## Ordre de branchement recommandé

| Étape | Ce que ça débloque | Bloquant ? |
|---|---|---|
| 1. `ANTHROPIC_API_KEY` | Les 3 conseillers IA répondent, analysent et recommandent | **Oui** — sans ça, pas de conseiller |
| 2. `APIFY_API_TOKEN` | Annonces réelles Property Finder au lieu du jeu statique | Non, mais fortement recommandé |
| 3. `SUPABASE_*` | Persistance des leads et des conversations entre deux requêtes | Non en dev, **oui en prod** |
| 4. `ADMIN_SECRET` | Bureau des leads interne sur `/bureau` — le CRM, gratuit | Non, mais c'est là que tu travailles les leads |
| 5. Twilio **ou** 360dialog | Agent WhatsApp autonome + alertes de veille | Non |
| 6. Airtable **ou** HubSpot | Miroir vers un CRM externe — **inutile** si le bureau interne suffit | Non |
| 7. `DLD_*` | Prix de référence issus des transactions réelles au lieu de la grille interne | Non |

---

## 0. Poser les variables dans Vercel

Toutes les variables ci-dessous se posent au même endroit :

**Vercel → ton projet → Settings → Environment Variables → Add New**

Pour chacune : coller le nom, coller la valeur, cocher les trois environnements
(Production, Preview, Development), puis Save.

⚠️ **Une variable ajoutée ne s'applique pas au déploiement déjà en ligne.** Il faut
redéployer : onglet **Deployments** → dernier déploiement → menu `···` →
**Redeploy**. Sans ça, rien ne change et on croit que la variable est ignorée.

Ordre minimal pour que l'agence tourne :

1. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → la mémoire
2. `ADMIN_SECRET` → l'accès au bureau des leads
3. `ANTHROPIC_API_KEY` → les conseillers
4. le reste au fur et à mesure (Apify, WhatsApp, DLD)

### Vérifier que Supabase est bien branché

Après le redéploiement, ouvre :

```
https://<ton-domaine>/bureau?key=<ADMIN_SECRET>
```

- Le bureau s'affiche avec « 0 dossier » → Supabase répond, tout est branché.
- `401 Unauthorized` avec `ADMIN_SECRET non configuré` → la variable n'est pas
  passée, ou le redéploiement n'a pas eu lieu.
- Une erreur 500 → l'URL ou la clé Supabase est erronée, ou le SQL n'a pas été
  exécuté.

---

## 1. Claude — le cerveau (obligatoire)

```
ANTHROPIC_API_KEY=sk-ant-...
```

Modèle utilisé : `claude-opus-5`. Trois niveaux d'effort selon l'usage —
`medium` pour le chat et la qualification, `low` pour les alertes de veille.

`system` ne contient que du stable (identité, persona, marché, style) et porte le
point de cache. Le dossier, le marché et les annonces partent dans le **premier
message utilisateur**, pas dans `system` : le cache étant un préfixe, des annonces
rechargées dans `system` à chaque tour invalideraient tout l'historique derrière.
Mesuré sur une conversation de 6 tours : 0,257 $ dans la version initiale contre
0,185 $ après ce déplacement, soit 28 % de moins — et l'écart se creuse quand la
conversation s'allonge.

### Coût réel, mesuré contre l'API

Conversation de 6 tours (1 audit + 5 échanges), tokens réellement facturés :

| Modèle | Réponses non bornées | Réponses bornées à 250 mots |
|---|---|---|
| `claude-opus-5` | 0,346 $ | **0,127 $** |
| `claude-sonnet-5` | 0,208 $ | **0,076 $** |

**Le coût est à 80 % dans les tokens de sortie.** Grâce au cache, l'entrée ne
représente que 2 tokens facturés au tarif plein par tour. Sans plafond, le modèle
produisait 2 000 à 3 000 tokens par réponse — soit 12 300 tokens sur la
conversation. Bornées, on tombe à 3 960.

C'est pourquoi le levier n'est pas le fournisseur mais la longueur : `max_tokens`
est plafonné à 2 200 dans `agent-chat.ts`, et la règle de style impose 250 mots
pour l'audit, 150 pour la suite. Bonus non négligeable : un pavé de 3 000 tokens
était de toute façon illisible dans une colonne de chat de 400 px.

### Changer de modèle sans toucher au code

```
CLAUDE_MODEL=claude-sonnet-5      # optionnel, défaut claude-opus-5
```

Sur le banc de test avec ce prompt, Sonnet 5 obtient la **même fidélité aux
données** qu'Opus (6/6 : cite les bons quartiers, n'invente aucun quartier absent
de la sélection, reprend les prix exacts, donne le net et le verdict prix), pour
40 % de moins. Si le coût devient un sujet, c'est le premier arbitrage à faire.

⚠️ Haiku 4.5 refuse le paramètre `effort` avec une 400. `outputConfig()` l'omet
automatiquement pour ce modèle, mais Haiku n'a pas été évalué en qualité ici.

### Et Gemini ?

Testé sur le même prompt avec la clé `API_KEY` existante, mais **la comparaison
n'est pas concluante** : avec `maxOutputTokens: 2000`, les tokens de raisonnement
de Gemini Flash ont consommé tout le budget et les réponses sont arrivées
tronquées en milieu de phrase (1 996 tokens facturés pour 41 mots utiles). Ce
n'est pas un défaut du modèle mais une configuration à ajuster — et ça montre
qu'un modèle « pas cher » ne l'est pas automatiquement, puisque le raisonnement
est facturé en sortie.

À noter au passage : `gemini-pro-latest` a renvoyé une **429 quota exceeded** avec
cette clé. Le pipeline SEO qui en dépend est donc lui aussi contraint.

**À vérifier une fois la clé posée** : envoie deux messages dans le chat et
contrôle que `usage.cacheRead` est non nul au deuxième tour (visible dans
l'événement `done` du flux SSE). S'il reste à zéro, quelque chose d'instable
s'est glissé dans le préfixe.

Reproduire la mesure : `node scripts/verify-engine.mjs` ne la couvre pas, mais le
script de mesure de coût est reproductible à partir des mêmes modules.

## 1 bis. Plafonner la dépense — à faire AVANT de mettre la clé en ligne

`/api/agent-chat` est public et non authentifié : c'est la nature du produit, un
visiteur doit pouvoir parler au conseiller. Le risque n'est donc pas l'usage
normal (0,19 $ la conversation) mais l'abus.

### Le seul plafond dur : la console Anthropic

Console Anthropic → **Limits** → définir une **limite de dépense mensuelle**, et
créer la clé dans un **Workspace dédié** avec son propre plafond. C'est la seule
barrière que du code ne peut pas contourner : même une clé fuitée s'arrête là.

Recommandation pour démarrer : 50 $/mois. Ça couvre environ 270 conversations,
très au-delà d'un trafic de lancement.

### Les garde-fous applicatifs (`api/lib/guard.ts`)

Trois défenses, de la plus locale à la plus globale :

| Défense | Ce qu'elle plafonne | Valeur |
|---|---|---|
| Bornes d'entrée | le coût d'UNE requête | 40 messages, 30 000 caractères → 0,29 $ max |
| Débit par IP | la cadence d'un attaquant | 8/minute, 40/heure |
| Disjoncteur quotidien | la perte d'une journée | `DAILY_BUDGET_USD` |

```
DAILY_BUDGET_USD=5        # optionnel mais recommandé ; 0 ou absent = désactivé
```

Le disjoncteur lit la dépense du jour dans `usage_daily` et refuse les appels
au-delà. La comptabilité est alimentée après chaque appel avec l'`usage` réel
renvoyé par l'API — donc une mesure, pas une estimation.

⚠️ **Limite connue de la limite par IP** : la mémoire est propre à chaque instance
serverless, donc un attaquant réparti contourne partiellement le compteur. C'est
un ralentisseur ; la vraie barrière est le disjoncteur, qui est global via Supabase,
et au-dessus la limite de dépense Anthropic.

### Endpoints payants : fermés par défaut

`isAuthorized` faisait `if (!expected) return true` dans `/api/cron/watch` et
`/api/collector/run` : sans `COLLECTOR_SECRET`, ces routes étaient **publiques**,
et elles déclenchent des appels Claude et des runs Apify facturés. Elles échouent
désormais fermé. Pose `COLLECTOR_SECRET` pour pouvoir les déclencher à la main.

### Webhook WhatsApp : authentifié

Le POST entrant déclenche un appel Claude. Il exige maintenant soit une signature
HMAC Twilio valide (automatique dès que `TWILIO_AUTH_TOKEN` est présent), soit un
jeton partagé à ajouter à l'URL de webhook :

```
https://<domaine>/api/whatsapp/webhook?token=<WHATSAPP_VERIFY_TOKEN>
```

Sans l'un des deux, il refuse — un endpoint payant ne s'ouvre pas par défaut.

## 2. Apify — les annonces réelles

```
APIFY_API_TOKEN=apify_api_...
COLLECTOR_SECRET=<chaîne aléatoire de ton choix>
```

Déjà en place avant cette itération. `POST /api/collector/run?budget=500000`
démarre un run, le webhook `/api/apify-webhook` normalise et stocke le résultat.

Bayut reste bloqué par un CAPTCHA côté serveur : il faudrait un proxy premium
Apify pour l'ajouter. Property Finder seul suffit pour démarrer.

## 3. Supabase — la mémoire

Projet : `ifayvyzrearwzdcajlqz`

```
SUPABASE_URL=https://ifayvyzrearwzdcajlqz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # Settings → API → service_role
SUPABASE_LEADS_TABLE=leads              # optionnel, défaut « leads »
```

La clé `service_role` contourne RLS par conception : elle ne doit exister que
côté Vercel, jamais dans le frontend.

### Créer les tables

Colle [`docs/supabase-schema.sql`](./supabase-schema.sql) dans l'éditeur SQL :

```
https://supabase.com/dashboard/project/ifayvyzrearwzdcajlqz/sql/new
```

Le script est idempotent, donc réexécutable sans risque, y compris sur une base
déjà partiellement créée. Il crée trois tables :

| Table | Rôle | Écrite par | Lue par |
|---|---|---|---|
| `leads` | dossiers prospects et conversations | `/api/lead`, webhook WhatsApp, veille | `/bureau` |
| `listings` | annonces normalisées | `/api/cron/refresh-listings` | `/api/live-listings` |
| `live_listings_snapshots` | payload brut Apify | `/api/apify-webhook` | rejeu de normalisation |

Il active aussi RLS sans aucune policy sur les trois tables. C'est volontaire :
le service role l'ignore, donc les fonctions serverless écrivent normalement,
mais la clé publique `anon` ne peut rien lire. `leads` contient des données
personnelles — téléphone, email, transcriptions de conversations — qui ne doivent
jamais être atteignables depuis un navigateur. Si tu ajoutes un jour une lecture
côté client, crée une policy explicite plutôt que de désactiver RLS.

La dernière requête du script est un contrôle : elle doit renvoyer les trois
tables avec `rls_enabled = true` et `policies = 0`.

`npm run verify` inclut `verify-schema`, qui recoupe le SQL avec ce que le code
lit et écrit réellement. Si tu ajoutes une colonne au code sans l'ajouter au
schéma, la suite échoue — sinon l'erreur n'apparaîtrait qu'en production, sur une
requête REST qui échoue en silence.

### Sans Supabase

Les leads et conversations vivent en mémoire du process. Ça convient en dev, mais
**pas en production** : un cold start Vercel efface la conversation en cours, et
l'agent WhatsApp repart de zéro au milieu d'un échange.

## 4. Bureau des leads — le CRM, sans rien payer

```
ADMIN_SECRET=<chaîne aléatoire de ton choix>
```

Accessible sur `https://<domaine>/bureau?key=<ADMIN_SECRET>`. Les leads sont déjà
dans Supabase : il ne manquait qu'une surface pour les travailler. La page est
rendue côté serveur, donc rien n'entre dans le bundle public et aucune brique
d'authentification n'est nécessaire.

Ce qu'elle donne :

- valeur du pipeline non vendu et montant déjà encaissé,
- liste triée par score, filtrable par palier et par statut,
- pour chaque dossier : contact, conseiller, score, budget, objectif, signaux
  d'achat en clair, dernier message du prospect, ancienneté,
- cycle de vie `nouveau → contacté → qualifié → vendu` (ou `écarté`), avec le nom
  de l'agence acheteuse et le prix de vente,
- export CSV du filtre courant, pour livrer un lot à une agence.

⚠️ Le secret passe en query string, il apparaît donc dans les logs d'accès.
C'est acceptable pour un outil interne à une personne ; si tu ouvres le bureau à
des tiers, il faut une vraie session. La page est en `noindex, nofollow` et le
contenu des messages est échappé (`npm run verify` teste l'injection HTML).

## 5. CRM externe — optionnel, et probablement inutile

**Tu n'en as pas besoin.** Le bureau ci-dessus couvre le cas d'usage : lister,
filtrer, qualifier, exporter. Un CRM externe ne se justifie que si une équipe
commerciale doit travailler les leads avec des séquences d'emails et de
l'attribution de tâches, ou si tu veux donner un accès direct à des agences
partenaires.

Les deux connecteurs restent en place et s'activent seuls si les variables sont
présentes — le premier configuré gagne, Airtable prioritaire.

### Airtable

```
AIRTABLE_TOKEN=pat...
AIRTABLE_BASE_ID=app...
AIRTABLE_LEADS_TABLE=Leads          # optionnel
```

Colonnes attendues dans la table (l'API est en `typecast: true`, donc les types
sont tolérants, mais les noms doivent correspondre exactement) :

`Nom`, `Email`, `Téléphone`, `Conseiller`, `Score`, `Qualité`,
`Valeur estimée (€)`, `Budget`, `Objectif`, `Signaux d'achat`,
`Biens consultés`, `Canal`, `Dernier message`, `Conversation`.

L'upsert se fait sur `Téléphone` si présent, sinon `Email`.

### HubSpot

```
HUBSPOT_TOKEN=pat-na1-...
```

Propriétés personnalisées à créer sur l'objet Contact, en type texte sauf
mention contraire :

`dubaiinvest_score` (nombre), `dubaiinvest_tier`, `dubaiinvest_advisor`,
`dubaiinvest_budget`, `dubaiinvest_objective`, `dubaiinvest_signals`,
`dubaiinvest_channel`.

Sans ces propriétés, HubSpot rejette la requête avec une 400 listant les champs
inconnus — c'est le symptôme à reconnaître.

## 6. WhatsApp Business

Le premier configuré gagne.

### Twilio

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

Webhook entrant à configurer dans la console Twilio, sur le numéro WhatsApp :
`https://<ton-domaine>/api/whatsapp/webhook`, méthode POST.

### 360dialog

```
D360_API_KEY=...
WHATSAPP_VERIFY_TOKEN=<chaîne aléatoire de ton choix>
```

Même URL de webhook. `WHATSAPP_VERIFY_TOKEN` sert à la poignée de main initiale
en GET (`hub.challenge`), suivant le protocole Meta Cloud API.

### À quoi sert le fournisseur — et la contrainte à connaître

On ne peut pas envoyer un message WhatsApp depuis du code sans passer par la
WhatsApp Business Platform de Meta. Twilio et 360dialog sont des fournisseurs
agréés qui donnent cet accès. C'est ce qui permet à l'agent de qualifier un
prospect en autonomie sur le canal où il répond vraiment, et à la veille de
signaler une baisse de prix.

**La règle qui structure tout le reste** : le texte libre n'est autorisé que dans
les **24 heures** suivant le dernier message du prospect. Passé ce délai, seul un
**modèle pré-approuvé par Meta** peut être envoyé ; un texte libre est rejeté.

La veille nocturne s'adresse par construction à des prospects silencieux depuis
plusieurs jours. Elle bascule donc automatiquement sur un modèle, et Claude ne
rédige alors que les **variables**, pas la phrase. Modèle à faire approuver :

> Bonjour {{1}}, du nouveau sur votre recherche à Dubaï : {{2}} {{3}}

```
# Twilio (Content SID du modèle approuvé, commence par HX)
WHATSAPP_TEMPLATE_ALERT_SID=HX...
# 360dialog
WHATSAPP_TEMPLATE_ALERT_NAME=alerte_veille_dubai
WHATSAPP_TEMPLATE_LANG=fr
```

Sans ces variables, la veille ne peut pas alerter hors fenêtre de 24 h : le
rapport de `/api/cron/watch` le dit explicitement (`WHATSAPP_TEMPLATE_ALERT_SID
non configuré`) plutôt que d'échouer en silence. Le champ `mode` de chaque ligne
du rapport indique lequel des deux chemins a été utilisé.

### Alerte interne

```
SALES_ALERT_WHATSAPP=+33612345678      # optionnel
```

Reçoit un message dès qu'un lead atteint le palier `qualified` **et** demande
explicitement une mise en relation. C'est le signal « ce dossier est vendable ».

## 7. DLD — les transactions réelles

```
DLD_API_KEY=...
DLD_API_SECRET=...
# ou
DLD_ACCESS_TOKEN=...
```

Sans credentials, le contrôle prix s'appuie sur la grille de référence interne
par quartier (`api/lib/priceCheck.ts`, `BENCHMARK_AED_SQFT`). Le verdict reste
utile mais son champ `basis` vaut `benchmark` au lieu de `dld` — c'est ce champ
qui dit si la vérification est adossée à de vraies transactions ou non.

**La grille interne est datée 2025 et se périme.** Elle doit être recalée
périodiquement, ou remplacée par une agrégation DLD par quartier.

C'est le point le plus sensible du système : une grille trop haute fait passer
un bien surévalué pour une aubaine. `npm run verify` contient pour cette raison
des assertions de vraisemblance (un studio de 45 m² à JVC doit ressortir entre
120 k€ et 185 k€, etc.) — elles échouent si la grille dérive.

Ne branche **jamais** la moyenne DLD toutes-zones comme référence d'un bien
précis : `checkPrice` n'accepte en 4ᵉ argument qu'un prix moyen **au niveau du
quartier**, et rejette les valeurs hors de 500–6000 AED/sqft pour attraper les
erreurs d'unité. La moyenne globale sert de contexte au conseiller, pas de
référence de valorisation.

## 8. Veille nocturne

```
CRON_SECRET=<chaîne aléatoire>        # Vercel l'envoie en Bearer sur les crons
```

Cron déclaré dans `vercel.json` à 3 h 30 UTC (`/api/cron/watch`), soit après le
rafraîchissement des annonces de 3 h 00.

Garde-fous en dur dans `api/cron/watch.ts` :

- 25 leads maximum par exécution ; le surplus est compté dans `skippedForCap`
  et non silencieusement ignoré,
- un bien doit scorer au moins 62/100 pour justifier une alerte,
- une baisse de prix doit atteindre 3 % pour être signalée,
- 72 heures minimum entre deux alertes pour un même lead.

Test manuel : `curl -H "x-collector-secret: $COLLECTOR_SECRET" https://<domaine>/api/cron/watch`

---

## Vérifier sans clés

```bash
npm run verify     # 53 assertions, sans aucune clé API
npm run build      # typecheck complet + build de production
```

`npm run verify` enchaîne deux suites : `verify-engine` (35 assertions sur le
matching, le contrôle prix et le scoring de lead, dont des garde-fous de
vraisemblance sur la grille de prix) et `verify-desk` (18 assertions sur le
bureau des leads : autorisation, rendu, filtres, CSV, mise à jour de statut,
échappement HTML).

`npm run verify` compile les modules métier avec esbuild et les exerce
directement. Aucune clé API requise : ces modules sont volontairement sans LLM
pour rester reproductibles et auditables.

## Endpoints

| Endpoint | Méthode | Rôle |
|---|---|---|
| `/api/agent-chat` | POST | Chat du conseiller, flux SSE. Recharge annonces + DLD à chaque tour |
| `/api/lead` | POST | Capture web : scoring, CRM, premier contact WhatsApp |
| `/api/whatsapp/webhook` | GET/POST | Vérification d'abonnement, puis messages entrants |
| `/api/cron/watch` | GET | Veille : nouvelles offres et baisses de prix |
| `/bureau` (`/api/leads-desk`) | GET/POST | Bureau des leads : liste, filtres, export CSV, statuts |
| `/api/live-listings` | GET | Annonces (Supabase puis repli scraping) |
| `/api/collector/run` | POST | Déclenche un run Apify |
| `/api/dld-weekly` | GET | Transactions DLD agrégées par semaine |
