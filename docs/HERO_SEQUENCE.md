# Hero — vidéo cinématographique scrubée au scroll

Le hero ([components/HeroSection.tsx](../components/HeroSection.tsx)) pilote une
vidéo **image par image avec le scroll** (technique Apple AirPods / MacBook) :
la progression du scroll → `video.currentTime`, lissée en `requestAnimationFrame`
pour un rendu fluide. Desktop = scrub ; mobile / `prefers-reduced-motion` =
fallback vidéo en boucle + contenu visible immédiatement.

## Remplacer la vidéo par la séquence finale « Magneto »

Il suffit de **remplacer le fichier** `public/hero-scrub.mp4` — **aucun code à toucher**.

### Specs impératives du fichier
- **Format** : MP4 / H.264, `yuv420p`, sans piste audio.
- **Keyframes fréquentes** (crucial pour un scrub fluide) : GOP court.
  Ré-encoder avec :
  ```bash
  ffmpeg -i source.mp4 -an -c:v libx264 -crf 24 -preset slow \
    -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart \
    -pix_fmt yuv420p public/hero-scrub.mp4
  ```
  (`-g 4` = 1 keyframe toutes les 4 frames → seek quasi frame-perfect.)
- **Durée** : 8–15 s (la durée de la vidéo est mappée sur la hauteur de scroll,
  actuellement `360vh` — ajustable dans `HeroSection.tsx`).
- **Résolution** : 1280×720 ou 1920×1080, ratio 16:9 (le composant fait `object-cover`).
- **Poids cible** : < 12 MB (les keyframes fréquentes alourdissent ; viser 6–10 MB).
- Fournir aussi un **poster** (1re frame) si souhaité — sinon l'`BG_IMAGE` par défaut sert de fond au chargement.

### Story-board attendu (0 s → fin)
1. **0–2 s** — vue large mer + désert de Dubaï, lumière basse.
2. **2–5 s** — les gratte-ciels s'assemblent morceau par morceau (effet Magneto).
3. **5–8 s** — zoom sur le **Burj Khalifa** qui se monte segment par segment.
4. **8–11 s** — on continue le zoom **dans un appartement** qui s'assemble.
5. **11–15 s** — sortie sur la **terrasse + piscine à débordement**, l'eau monte seule.

### Comment produire cette séquence (l'asset, hors code)
Cette animation d'assemblage photoréaliste n'est pas générable en pur code.
Trois voies :

1. **Modèle vidéo IA** (le plus rapide). Google **Veo 3**, OpenAI **Sora**, **Kling**,
   **Runway Gen-4**. Prompt de départ (EN, à affiner / découper en plans de 5-8 s
   puis raccorder) :
   > Cinematic aerial shot of Dubai: calm sea meeting golden desert dunes at
   > sunrise. Skyscrapers assemble themselves piece by piece, glass and steel
   > fragments flying into place like magnetically reassembled, forming the
   > skyline. Continuous smooth zoom toward the Burj Khalifa, which builds itself
   > segment by segment from the base up. Keep zooming through a window into a
   > luxury apartment that assembles itself — furniture, walls, floor-to-ceiling
   > glass — then out onto a terrace with an infinity pool whose water rises and
   > fills on its own, overlooking the skyline. Photorealistic, 8k, cinematic
   > camera move, no text, no people.

   Les modèles vidéo font ~5-10 s par plan : générer les 4-5 plans séparément,
   puis les raccorder (CapCut / Premiere / ffmpeg concat) en une séquence continue.

2. **3D studio** (le plus contrôlé) : Blender / Cinema 4D — modèles du Burj Khalifa
   et d'un penthouse, animation d'assemblage (Cell Fracture inversé pour l'effet
   Magneto), simulation de fluide pour la montée d'eau, rendu 16:9.

3. **Hybride** : survol réel (drone/stock) + inserts d'assemblage 3D composés par-dessus.

Une fois le `.mp4` prêt et ré-encodé (specs ci-dessus), le déposer dans `public/`
et déployer. Rien d'autre à faire.
