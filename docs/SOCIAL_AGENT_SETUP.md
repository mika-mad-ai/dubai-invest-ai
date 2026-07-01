# Agent Réseaux Sociaux — Guide de configuration

L'agent (`api/cron/social-poster.ts` + `api/lib/social.ts`) génère **chaque jour** un post
sur l'**actualité géopolitique + immobilier à Dubaï**, avec une **image** (Imagen) et une
**vidéo** verticale (Veo) générées par Gemini, puis le publie sur **Facebook, Instagram,
TikTok et YouTube**.

- **Planification** : cron Vercel quotidien à **08:00 UTC** (≈ 12:00 Dubaï, 10:00 Paris).
  Pour changer l'heure, modifie `"schedule": "0 8 * * *"` dans `vercel.json` (⚠️ en **UTC**).
- **Dégradation gracieuse** : une plateforme sans identifiants est simplement **ignorée** ;
  un média qui échoue n'empêche pas la publication du texte.

---

## ⚠️ Ce que je ne peux PAS faire à ta place

« Connecter » un réseau social = créer une **app développeur** sur chaque plateforme et
obtenir des **tokens OAuth**. Ces étapes exigent ton compte, parfois une **validation d'app**
(Meta, TikTok) qui prend quelques jours. Le code est **prêt à publier** dès que tu renseignes
les variables d'environnement ci-dessous dans **Vercel → Settings → Environment Variables**.

Tant qu'une plateforme n'a pas ses variables, l'agent la marque `skipped` et continue.

---

## 1. Gemini (obligatoire — texte + image + vidéo)

| Variable | Rôle |
|---|---|
| `API_KEY` | Clé Gemini API (déjà présente pour le site). **Imagen et Veo exigent un compte Gemini API payant** — ils ne sont pas sur le tier gratuit. |
| `SOCIAL_ENABLE_VIDEO` | `true` pour activer la génération vidéo Veo (lente, 1-3 min, coûteuse). Par défaut `false` → image seule. |
| `SOCIAL_IMAGE_MODEL` | (optionnel) défaut `imagen-3.0-generate-002` |
| `SOCIAL_VIDEO_MODEL` | (optionnel) défaut `veo-2.0-generate-001` |
| `SOCIAL_TEXT_MODEL` | (optionnel) défaut `gemini-2.0-flash` |

> **Important** : sans vidéo (`SOCIAL_ENABLE_VIDEO=false`), **TikTok et YouTube seront ignorés**
> car ils exigent une vidéo. Facebook et Instagram publieront l'image.

## 2. Hébergement des médias (obligatoire pour Instagram & TikTok)

Instagram et TikTok n'acceptent **pas** des octets bruts : ils exigent une **URL publique**.
L'agent uploade donc les médias sur **Supabase Storage**.

1. Dans Supabase → **Storage** → crée un bucket **public** nommé `social-media`.
2. Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont déjà utilisées par le site.

| Variable | Rôle |
|---|---|
| `SOCIAL_STORAGE_BUCKET` | (optionnel) défaut `social-media` |

## 3. Facebook Page

1. [developers.facebook.com](https://developers.facebook.com) → crée une app **Business**.
2. Ajoute le produit **Facebook Login** + permissions `pages_manage_posts`, `pages_read_engagement`.
3. Récupère un **Page Access Token longue durée** (Graph API Explorer → échange le token, puis
   génère un token de page ; rends-le permanent via l'endpoint `/oauth/access_token`).

| Variable | Rôle |
|---|---|
| `FB_PAGE_ID` | ID de ta page Facebook |
| `FB_PAGE_ACCESS_TOKEN` | Token d'accès de la page (longue durée) |

## 4. Instagram (compte **Business** ou **Creator**)

1. Le compte Instagram doit être **Business/Creator** et **relié à ta page Facebook**.
2. Même app Meta ; ajoute les permissions `instagram_basic`, `instagram_content_publish`.

| Variable | Rôle |
|---|---|
| `IG_USER_ID` | ID du compte Instagram Business (via `/{page-id}?fields=instagram_business_account`) |
| `IG_ACCESS_TOKEN` | (optionnel) sinon réutilise `FB_PAGE_ACCESS_TOKEN` |

## 5. TikTok (nécessite une app approuvée)

1. [developers.tiktok.com](https://developers.tiktok.com) → crée une app, ajoute **Content Posting API**.
2. Demande le scope `video.publish` (⚠️ **audit TikTok requis** avant la mise en production ;
   en attendant, les posts partent en mode privé/brouillon selon ton statut d'app).
3. Réalise le flux OAuth pour obtenir un **access token** utilisateur (à rafraîchir).

| Variable | Rôle |
|---|---|
| `TIKTOK_ACCESS_TOKEN` | Access token OAuth avec `video.publish` |

> TikTok exige une **vidéo** → active `SOCIAL_ENABLE_VIDEO=true`.

## 6. YouTube (Shorts)

1. [console.cloud.google.com](https://console.cloud.google.com) → active **YouTube Data API v3**.
2. Crée des identifiants **OAuth 2.0** (type *Desktop*), scope `https://www.googleapis.com/auth/youtube.upload`.
3. Fais le consentement OAuth une fois pour obtenir un **refresh token** (via OAuth Playground
   ou un script local).

| Variable | Rôle |
|---|---|
| `YT_CLIENT_ID` | Client ID OAuth Google |
| `YT_CLIENT_SECRET` | Client secret OAuth Google |
| `YT_REFRESH_TOKEN` | Refresh token (obtenu une fois via le consentement) |

> YouTube exige une **vidéo** → active `SOCIAL_ENABLE_VIDEO=true`.

## 7. Sécurité du cron

| Variable | Rôle |
|---|---|
| `CRON_SECRET` | Déjà utilisé par les autres crons. Protège le déclenchement manuel. |

---

## Tester sans rien publier

```bash
# Génère le contenu + médias mais NE PUBLIE PAS (dry run) :
curl "https://dubainvest.eu/api/cron/social-poster?secret=TON_CRON_SECRET&dry=1"

# Run réel (publie sur les plateformes configurées) :
curl "https://dubainvest.eu/api/cron/social-poster?secret=TON_CRON_SECRET"
```

La réponse JSON contient le sujet du jour, les légendes par plateforme, les URLs des médias
et le statut de chaque publication (`published` / `skipped` / erreur).

---

## Récapitulatif — variables d'environnement

```
# Gemini (obligatoire)
API_KEY=...
SOCIAL_ENABLE_VIDEO=false        # true pour TikTok/YouTube

# Supabase Storage (obligatoire pour IG/TikTok)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Facebook
FB_PAGE_ID=...
FB_PAGE_ACCESS_TOKEN=...

# Instagram
IG_USER_ID=...
IG_ACCESS_TOKEN=                 # optionnel, sinon FB_PAGE_ACCESS_TOKEN

# TikTok
TIKTOK_ACCESS_TOKEN=...

# YouTube
YT_CLIENT_ID=...
YT_CLIENT_SECRET=...
YT_REFRESH_TOKEN=...

# Sécurité
CRON_SECRET=...
```
