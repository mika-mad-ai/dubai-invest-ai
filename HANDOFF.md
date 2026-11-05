# HANDOFF — journal de bord (session cloud autonome du 2026-11-05)

> Session reprise depuis VS Code, puis menée en autonomie dans le cloud.
> Missions demandées : (1) finaliser la carte 3D, (2) design via Figma /
> audit design, (3) backlog technique (coût par lead, éval, RGPD, nettoyage).
> Règles : services gratuits uniquement, aucun appel facturé, aucun
> déploiement ; `npx tsc --noEmit && npm run build && npm run verify` vert
> après chaque étape ; PR vers `feat/agence-ia-uae`, jamais de merge.

## État des missions

| Mission | État | PR |
|---|---|---|
| 1. Carte 3D | ✅ testée (tuiles de test, voir limite ci-dessous) | voir « PR ouvertes » |
| 2. Design / Figma | ⏳ | — |
| 3a. Coût réel par lead | ⏳ | — |
| 3b. Banc d'éval conseiller | ⏳ | — |
| 3c. RGPD WhatsApp | ⏳ | — |
| 3d. Nettoyage code mort | ⏳ | — |

## Mission 1 — carte 3D : fait

Bugs trouvés en test navigateur et corrigés (commit `995378a`) :
- **Bloquant, dev ET prod** : MapLibre v6 cherche son worker à côté de son
  module (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`). Bundlé par
  Vite, ce fichier n'existe plus → « Worker failed to load », **aucune tuile**.
  Le build de prod n'émettait pas le worker. Corrigé par
  `setWorkerUrl(import 'maplibre-gl/dist/maplibre-gl-worker.mjs?url')`
  → `dist/assets/maplibre-gl-worker-*.mjs` (519 kB, chargé à l'ouverture).
- Error boundary locale au dialogue : avant, une erreur de chargement du chunk
  remontait à l'ErrorBoundary global et **faisait tomber toute la page**.
- Mauvaise tour dorée : `queryRenderedFeatures` au pixel écran choisissait la
  tour du premier plan en vue inclinée. Remplacé par `pickBuilding()` (test
  point-dans-polygone sur `querySourceFeatures`, repli « plus proche < 35 m »).
- Z-fighting (rayures) entre la tour dorée et l'originale → filtre par id +
  empreinte gonflée de 1,5 %. Effet « rayon X » (bâti voisin à 55 %).
- Vue mer fausse (« NE » à la Marina au lieu de NO) : distance au sommet de
  côte le plus proche → distance au **segment** ; côte densifiée ; îles.
- Nominatim appelé 2× (StrictMode) → requêtes en vol dédupliquées ; requête
  « Arjan, Arjan, Dubai » corrigée ; 429/5xx plus mis en cache comme négatif ;
  géocodage d'un quartier seul marqué `approx` (avant : `exact` à tort).
- UI : panneau sous le bouton fermer (chevauchement), halo pointillé en mode
  quartier, attribution OSM dégagée en mobile, focus clavier géré.
- `vite.config.ts` : `optimizeDeps.include: ['maplibre-gl']` (évite le reload
  dev au premier clic).
- `scripts/verify-map3d.mjs` : 28 assertions ajoutées à `npm run verify`.

Screenshots : `docs/screenshots/map3d/` (bureau 1440, mobile 390, reduced-motion).

### ⚠️ Limite du test visuel (décision prise)
Le réseau de la session cloud **refuse `tiles.openfreemap.org` et
`nominatim.openstreetmap.org`** (politique réseau de l'environnement). Décision :
tester le code avec des **tuiles synthétiques** au schéma OpenMapTiles servies
par Playwright (`scripts/visual/`), annonces et Nominatim simulés. Les
screenshots montrent donc du bâti **factice** (blocs générés), pas Dubaï.
Validé : worker, extrusions, tour dorée, cône, panneau, 3 cas de localisation,
mobile, reduced-motion, console propre. **Non validé** : rendu avec les vraies
tuiles OpenFreeMap (densité, labels/glyphes, présence de `id` sur les
bâtiments). À refaire sur un poste avec réseau ouvert :
`npm run dev` → profil → « Carte 3D ». Pour autoriser ces hôtes dans le cloud :
paramètres de l'environnement → Network access → Allowed domains.

Rejouer le banc :
```bash
npm i --no-save geojson-vt@3.2.1 vt-pbf@3.1.3
npm run dev &
node scripts/visual/map3d-harness.cjs /tmp/shots desktop   # ou mobile / reduced
```
En dev Vite, `/api/live-listings` n'existe pas : **aucune carte de bien ne
s'affiche** (contrairement à ce que disait le handoff précédent, il n'y a pas
de fallback statique côté front — « Erreur de chargement des annonces »). Le
banc intercepte la route avec 3 annonces de test.

---

# Historique — handoff VS Code (avant reprise)


## Tâche demandée

> « Dans les résultats, intégrer une map animée 3D ultra design de Dubaï qui
> montre où l'unité est exactement placée, dans quel immeuble, avec quelle vue.
> Récupérer tout ce qui est gratuit et public. »

Contexte de la même session, déjà **terminé et commité** (`6dbbb79`) : recalage
complet des grilles de prix sur les médianes DLD revente 12 mois via le
connecteur MCP « DXB interact » (~50 quartiers appartements + ~35 villas +
correctif par chambre, voir `api/lib/dldBenchmarks.ts`).

Reste aussi en file d'attente (hors de cette branche) : l'utilisateur a ajouté
un **connecteur Figma** et demandé « optimise le design de mon site » — le
connecteur n'apparaissait pas dans la session en cours, il faut **relancer la
session** pour le voir (même comportement que DXB interact).

## Ce qui est fait (ce commit)

Stack choisie, 100 % gratuite et sans clé API :
- **MapLibre GL JS** (open source, npm `maplibre-gl`, installé)
- **OpenFreeMap** : tuiles vectorielles OSM avec hauteurs d'immeubles
  (`https://tiles.openfreemap.org/planet`, glyphes `/fonts/{fontstack}/{range}.pbf`)
  — endpoints vérifiés OK le 2026-11-05, aucune clé
- **Nominatim** (OSM) pour géocoder l'immeuble quand l'annonce n'a pas de
  lat/lng, avec cache localStorage et repli sur centroïdes de quartier embarqués

Fichiers créés :
- `components/map3d/viewAnalysis.ts` — haversine/azimut, repères publics
  (Burj, Palm, marina, golfs, tracé de côte approximé), `estimateViews()` →
  chips « vue probable/possible + direction + distance », `viewCone()` (secteur
  GeoJSON), `floorsFromHeight()`
- `components/map3d/geocode.ts` — résolution lat/lng : annonce → Nominatim
  (caché) → centroïde quartier ; extraction du nom d'immeuble depuis le titre
  (« … in Binghatti Corner, JVC »)
- `components/map3d/dubaiMidnightStyle.ts` — style MapLibre maison aligné sur
  l'identité midnight/gold (fond nuit, eau, routes, extrusions 3D des immeubles
  colorées par hauteur, labels de quartiers)
- `components/map3d/Property3DMap.tsx` — la scène : survol d'arrivée (flyTo
  ville → immeuble, pitch 64°), orbite lente auto (stoppée à la première
  interaction), **immeuble exact ré-extrudé en or** (géométrie extraite des
  tuiles par `queryRenderedFeatures`), balise pulsée + faisceau + étiquette
  prix, cône de vue cyan vers la meilleure vue, panneau d'analyse (hauteur/
  étages OSM, vues, distances Burj/DXB/mer, demandé vs médiane DLD avec zone
  et date). `prefers-reduced-motion` : caméra directe, pas d'orbite ni pulse
- `components/map3d/Map3DDialog.tsx` — overlay plein écran (portal, Échap,
  scroll lock) + `Map3DButton` réutilisable ; **MapLibre est lazy-loadé**
  (chunk séparé ~306 kB gz, le bundle principal ne bouge presque pas)

Fichiers modifiés :
- `components/MatchedListings.tsx` — bouton « Carte 3D » sur chaque bien de la
  sélection du conseiller
- `components/PropertyCard.tsx` — même bouton dans l'overlay titre de la carte
- `api/lib/listingsCollector.ts` — `lat`/`lng` optionnels sur `Listing`,
  extraits de l'item Apify (`coordinates`/`latitude`, spéculatif) et du JSON-LD
  (`e.geo`)
- `api/agent-chat.ts` — le `meta` SSE transmet `type`, `lat`, `lng`
- `services/agentService.ts` — `MatchedListing` porte `type`/`lat`/`lng`

État de validation : `npx tsc --noEmit` propre, `npm run build` OK,
`npm run verify` 127/127. **Le test navigateur n'a PAS été terminé** (interrompu
par ce handoff).

## Ce qui reste à faire (étapes précises)

1. `npm run dev` puis ouvrir http://localhost:5173 — vérifier que la section
   annonces se charge en dev (les routes `api/*` n'existent pas sous Vite pur :
   les annonces viennent du fallback statique). Au premier test, `find` n'a pas
   trouvé le bouton « Carte 3D » sur le premier écran : il faut **scroller
   jusqu'aux cartes de biens** (ou vérifier que la section se rend bien en dev).
2. Cliquer « Carte 3D » et vérifier : tuiles midnight chargées, animation
   d'arrivée, extrusions 3D à partir du zoom ~14, immeuble doré surligné (cas
   lat/lng exact), orbite qui s'arrête au premier geste, panneau d'analyse,
   attribution OSM visible.
3. Tester le cas sans lat/lng (la plupart des annonces Apify) : Nominatim doit
   localiser l'immeuble, sinon halo doré « position approximative » au
   centroïde du quartier + note ambre dans le panneau.
4. Tester mobile (≤720 px : le panneau devient bottom-sheet) et
   `prefers-reduced-motion`.
5. Vérifier la console navigateur : ni erreur de glyphes (le style n'utilise
   que `Noto Sans Regular`), ni 403 Nominatim.
6. Si tout est bon : merger dans `feat/agence-ia-uae` (ou garder la branche) et
   reprendre le sujet Figma après relancement de session.

## Pièges connus

- **`import maplibregl from 'maplibre-gl'` casse le build** (TS1192, pas de
  default export) → garder `import * as maplibregl`.
- **Ne jamais importer `Property3DMap` statiquement** : il doit rester derrière
  `React.lazy` sinon +306 kB gz sur le bundle principal.
- `queryRenderedFeatures` ne trouve l'immeuble **qu'après `idle`** et seulement
  si le point est dans le viewport au zoom final — c'est pour ça que le
  highlight se fait dans `dressScene()` après `moveend`+`idle`.
- Le TileJSON OpenFreeMap pointe vers un snapshot daté
  (`…/planet/20261101_…/{z}/{x}/{y}.pbf`) — toujours passer par l'URL TileJSON
  `https://tiles.openfreemap.org/planet`, jamais par l'URL de tuiles en dur.
- Nominatim : volume faible obligatoire (politique OSM), pas de User-Agent
  custom possible depuis le navigateur, d'où le cache localStorage et le garde-
  fou « résultat dans la bbox de Dubaï ».
- Les champs Apify `coordinates/latitude` sont **spéculatifs** (non confirmés
  dans la doc de l'actor) — le `?? NaN) || null` les rend inoffensifs, mais si
  l'actor fournit des coordonnées sous un autre nom, les brancher là.
- `Map3DButton` fait `stopPropagation` : nécessaire car la `PropertyCard` est
  cliquable (sélection).
- En dev Vite, `api/*` n'existe pas : le flux conseiller (MatchedListings) ne
  peut pas être testé sans `vercel dev` ; tester via les PropertyCards.

## Validation rapide

```bash
npx tsc --noEmit && npm run build && npm run verify
```
