# HANDOFF — carte 3D des résultats (session du 2026-11-05)

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
