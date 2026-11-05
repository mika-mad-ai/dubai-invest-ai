# Régénérer les boucles idle des avatars avec Veo

Objectif : une boucle où le conseiller est **vivant mais ne parle pas**. C'est le
point sur lequel les deux générations précédentes ont échoué — `e273016` donnait
des portraits vivants qui articulaient en continu, `f09190f` des portraits muets
mais quasi figés (mouvement mesuré à 0,42 et 0,81 contre 3 à 10 pour un portrait
vivant).

Veo animera la bouche si on ne le lui interdit pas explicitement. Les prompts
ci-dessous sont écrits pour ça : l'interdiction est répétée trois fois sous des
formes différentes, parce qu'une seule mention ne suffit pas.

---

## 1. Réglages dans Flow (ou l'app Gemini)

- Mode : **image vers vidéo** (« Image to video » / « Frames to video »)
- Format : **9:16 portrait** — je recadre ensuite en 3:4, ce qui laisse de la
  marge et évite que le visage soit rogné
- Durée : **8 secondes**
- Audio : inutile, la piste est supprimée au traitement
- Prompt négatif, si le champ existe :
  `talking, speaking, lip sync, mouth opening, moving lips, singing, subtitles, text, watermark, camera movement, zoom, pan, cuts`

## 2. Images à fournir

Elles sont dans le dépôt (extension `.png` mais contenu JPEG, 896×1200) :

```
public/agents/agent-locatif.png     → Karim Haddad
public/agents/agent-residence.png   → James Bennett
public/agents/agent-location.png    → Léa Marchand
```

Chemin complet pour le Finder :
`~/Desktop/DubaiInvest AI Advisor/public/agents/`

## 3. Prompts, un par avatar

Le tronc commun est identique — c'est lui qui porte l'interdiction de parler.
Seule la dernière phrase change, pour coller à la personne.

### Karim Haddad — `agent-locatif.png`

```
Photorealistic living portrait. Keep the exact same face, identity, skin tone, eye colour, hair, beard, navy suit and blurred city-lights background as the input image.

The person does NOT speak. His lips stay closed and completely still for the entire clip — no lip movement, no mouth opening, no talking, no whispering, no jaw motion. He holds a calm, warm, closed-lip smile throughout.

The only motion is subtle and continuous life: slow relaxed breathing that gently raises and lowers the shoulders, tiny natural head movements of a few degrees, two or three soft natural eye blinks spread across the clip, and micro shifts in gaze. The motion never stops and never freezes.

Locked-off camera on a tripod: no zoom, no pan, no tilt, no cuts, no transitions. Single continuous shot. No text, no watermark, no subtitles.

He is a composed, trustworthy investment advisor listening attentively to a client.
```

### James Bennett — `agent-residence.png`

```
Photorealistic living portrait. Keep the exact same face, identity, skin tone, eye colour, hair, stubble, grey blazer, white shirt and warm blurred background as the input image.

The person does NOT speak. His lips stay closed and completely still for the entire clip — no lip movement, no mouth opening, no talking, no whispering, no jaw motion. He holds a calm, friendly, closed-lip smile throughout.

The only motion is subtle and continuous life: slow relaxed breathing that gently raises and lowers the shoulders, tiny natural head movements of a few degrees, two or three soft natural eye blinks spread across the clip, and micro shifts in gaze. The motion never stops and never freezes.

Locked-off camera on a tripod: no zoom, no pan, no tilt, no cuts, no transitions. Single continuous shot. No text, no watermark, no subtitles.

He is a relaxed, approachable British property advisor waiting for his client to speak.
```

### Léa Marchand — `agent-location.png`

```
Photorealistic living portrait. Keep the exact same face, identity, skin tone, eye colour, wavy dark hair, cream blazer and blurred city-lights background as the input image.

The person does NOT speak. Her lips stay closed and completely still for the entire clip — no lip movement, no mouth opening, no talking, no whispering, no jaw motion. She holds a calm, warm, closed-lip smile throughout.

The only motion is subtle and continuous life: slow relaxed breathing that gently raises and lowers the shoulders, tiny natural head movements of a few degrees, two or three soft natural eye blinks spread across the clip, and micro shifts in gaze. The motion never stops and never freezes.

Locked-off camera on a tripod: no zoom, no pan, no tilt, no cuts, no transitions. Single continuous shot. No text, no watermark, no subtitles.

She is an elegant, attentive rental advisor listening to a client describe what they are looking for.
```

## 4. Comment vérifier avant de me les envoyer

Regarde la bouche, pas l'ensemble. Si les lèvres s'écartent ne serait-ce qu'une
fois, régénère : à l'écran, en boucle, le moindre mouvement de lèvres se lit comme
« il parle dans le vide ». Les yeux doivent cligner au moins deux fois, sinon on
retombe sur l'effet figé de `f09190f`.

## 5. Où déposer les fichiers

Télécharge et nomme exactement :

```
~/Desktop/veo-idles/locatif.mp4
~/Desktop/veo-idles/residence.mp4
~/Desktop/veo-idles/location.mp4
```

Puis lance :

```bash
npm run avatars:idle
```

Le script (`scripts/process-veo-idle.mjs`) fait tout le reste, sans clé API :

1. recadre 9:16 → 3:4 et redimensionne en 600×800, comme les fichiers existants ;
2. supprime la piste audio ;
3. construit un **boomerang** (aller puis retour) pour que la boucle n'ait aucune
   coupure visible — sans lui, le raccord fin↔début saute ;
4. mesure le mouvement global et celui de la zone de la bouche, et **refuse le
   fichier** si la bouche bouge trop : c'est le garde-fou qui évite de réinstaller
   un portrait qui parle ;
5. installe le résultat dans `public/agents/agent-<id>-idle.mp4`.

Les fichiers en place sont sauvegardés en `.bak` avant remplacement.

## 6. Après installation

```bash
npm run build
vercel --prod
```

Puis rechargement forcé du navigateur (Cmd+Shift+R) : les anciennes vidéos sont
en cache.

Une fois les trois boucles en place, le drapeau `idleFromPhoto` de Léa dans
`components/AgentsSection.tsx` peut être retiré — il n'existe que parce qu'elle
n'avait aucune version muette. Le script le signale.

---

## Si Veo bloque le prompt (« blocked due to safety reasons »)

Arrivé sur Léa alors que le même prompt passait pour James. Cause la plus
probable : la formule de préservation d'identité (« Keep the exact same face,
identity… ») appliquée à la photo d'une personne réelle — le filtre y voit une
demande de clonage de visage, et il est plus strict sur les sujets féminins.

Cette phrase est inutile techniquement : en image-vers-vidéo, l'image d'entrée
ancre déjà l'apparence. On la retire, ainsi que tout descriptif corporel.

### Version épurée — à utiliser pour Léa

```
Cinematic reaction shot. The person in the photo is listening quietly while
someone off-camera speaks. It is not their turn to talk.

Their lips stay closed in a faint, warm smile for the whole clip. They nod very
slightly twice, blink naturally two or three times, and breathe calmly with a
small rise and fall of the shoulders. Their gaze shifts a fraction as they
follow what they hear. Nothing else happens.

No dialogue in this scene. No speech. Ambient room tone only.

Locked-off tripod, single continuous take, 8 seconds. No zoom, no pan, no cuts.
No text, no subtitles, no watermark.
```

### Si ça bloque encore

1. Relancer tel quel — le filtre n'est pas déterministe, une seconde tentative
   passe souvent.
2. Retirer aussi « cinematic reaction shot » et commencer directement par
   « The person in the photo is listening quietly… ».
3. Essayer depuis l'app Gemini plutôt que Flow, la configuration de sécurité
   n'est pas la même.
4. En dernier recours, garder le cinémagraphe construit depuis la photo fixe
   (`idleFromPhoto` dans `components/AgentsSection.tsx`) : muet, sans clignement,
   mais propre.
