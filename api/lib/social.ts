/**
 * Agent réseaux sociaux — génération de contenu + médias + publication.
 *
 * Pipeline quotidien (voir api/cron/social-poster.ts) :
 *   1. Gemini (+ Google Search) rédige l'angle du jour : actualité géopolitique
 *      + immobilier Dubaï, puis une légende adaptée à chaque plateforme.
 *   2. Imagen (Gemini) génère une image ; Veo (Gemini) génère une courte vidéo
 *      verticale (optionnel, gated par SOCIAL_ENABLE_VIDEO).
 *   3. Les médias sont poussés sur Supabase Storage → URL publique
 *      (indispensable pour Instagram et TikTok qui exigent une URL, pas des bytes).
 *   4. Publication sur Facebook, Instagram, TikTok, YouTube — chaque plateforme
 *      est publiée UNIQUEMENT si ses identifiants sont présents, sinon "skipped".
 *
 * Aucune de ces plateformes ne peut être "connectée" par le code seul : il faut
 * créer les apps développeur et fournir les tokens (voir docs/SOCIAL_AGENT_SETUP.md).
 * Tout est en dégradation gracieuse : un média ou une plateforme qui échoue
 * n'interrompt jamais le reste du run.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { GoogleGenAI } from '@google/genai';
import { pickDailyPhoto, fetchPhotoBase64 } from './stock-photos';

const GEMINI_KEY = process.env.API_KEY ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const TEXT_MODEL  = process.env.SOCIAL_TEXT_MODEL  ?? 'gemini-flash-latest';
const IMAGE_MODEL = process.env.SOCIAL_IMAGE_MODEL ?? 'gemini-2.5-flash-image';
const VIDEO_MODEL = process.env.SOCIAL_VIDEO_MODEL ?? 'veo-2.0-generate-001';

const ENABLE_VIDEO = process.env.SOCIAL_ENABLE_VIDEO === 'true';
// Mode économe par défaut : photos de stock Dubaï (gratuit). Passer à 'true'
// pour réactiver la génération d'image Gemini (payante) après reset du budget.
const ENABLE_AI_IMAGES = process.env.SOCIAL_ENABLE_AI_IMAGES === 'true';
const STORAGE_BUCKET = process.env.SOCIAL_STORAGE_BUCKET ?? 'social-media';

const SITE_URL = 'https://dubainvest.eu';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Platform = 'facebook' | 'instagram' | 'tiktok' | 'youtube';

export interface DailyContent {
  /** Sujet/angle éditorial du jour (interne, non publié). */
  topic: string;
  /** Légende commune de secours. */
  caption: string;
  /** Légendes adaptées par plateforme. */
  perPlatform: Record<Platform, string>;
  hashtags: string[];
  /** Titre court (YouTube). */
  title: string;
  imagePrompt: string;
  videoPrompt: string;
}

export interface GeneratedMedia {
  /** Image PNG en base64 (sans préfixe data:). */
  imageBase64?: string;
  imageUrl?: string;
  /** Vidéo MP4 en base64. */
  videoBase64?: string;
  videoUrl?: string;
  /** Slides infographiques (URLs publiques) — publiées en carrousel si présentes. */
  carouselUrls?: string[];
}

export interface PublishResult {
  platform: Platform;
  ok: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
}

const ai = () => new GoogleGenAI({ apiKey: GEMINI_KEY });

// ─── 1. Génération du contenu (texte) ────────────────────────────────────────

/** Article du jour publié sur le blog — sert d'angle et de destination au post. */
export interface ArticleContext {
  title: string;
  slug: string;
  url: string;
}

export async function generateDailyContent(article?: ArticleContext): Promise<DailyContent> {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Si l'article du jour existe, le post social le relaie et pointe vers sa page
  // dédiée (au lieu d'un angle indépendant). Sinon, angle géopolitique autonome.
  const link = article?.url ?? SITE_URL;
  const angleBrief = article
    ? `L'article du jour vient d'être publié sur le blog DubaiInvest :
TITRE : « ${article.title} »
URL À PARTAGER : ${link}

Ta mission : rédiger les posts qui donnent envie de LIRE cet article. Résume son intérêt (marché immobilier Dubaï, chiffres, opportunités) sans tout dévoiler, et invite à cliquer. NE change PAS de sujet.`
    : `En t'appuyant sur l'actualité RÉELLE et RÉCENTE (utilise Google Search), choisis UN angle éditorial fort du jour croisant l'ACTUALITÉ GÉOPOLITIQUE (Moyen-Orient, économie mondiale, flux de capitaux) ET son impact sur l'IMMOBILIER À DUBAÏ (prix, rendements, demande, Golden Visa).`;

  const prompt = `Tu es le responsable social media de "DubaiInvest", plateforme d'investissement immobilier à Dubaï pour investisseurs internationaux.

Nous sommes le ${today}. ${angleBrief}

Rédige un post engageant, factuel, sans survente, orienté investisseur.

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour), au format exact :
{
  "topic": "résumé interne de l'angle en 1 phrase",
  "title": "titre court accrocheur (max 70 caractères, pour YouTube)",
  "caption": "légende principale, 3-5 phrases, ton expert et accessible, 1 emoji max par phrase",
  "perPlatform": {
    "facebook": "version Facebook (2-4 phrases, invite à commenter, finit par le lien ${link})",
    "instagram": "version Instagram (accroche + 2-3 phrases + appel à l'action 'article complet, lien en bio', plus visuelle)",
    "tiktok": "version TikTok très courte, punchy, 1-2 phrases, ton direct",
    "youtube": "description YouTube Short (2-3 phrases + ${link})"
  },
  "hashtags": ["8 à 12 hashtags pertinents sans le #, mix EN/FR: DubaiRealEstate, InvestInDubai, ImmobilierDubai, GoldenVisa, ..."],
  "imagePrompt": "prompt EN détaillé pour générer une image photoréaliste, luxueuse, editorial, skyline/immobilier Dubaï illustrant l'angle du jour, sans texte incrusté, aspect cinématographique",
  "videoPrompt": "prompt EN pour une vidéo verticale 9:16 de 5-8s, plans aériens cinématographiques de Dubaï illustrant l'angle, mouvement de caméra fluide, sans texte"
}`;

  try {
    // L'appel Gemini est DANS le try : si le texte échoue (quota/cap 429,
    // réseau…), on retombe sur le fallback au lieu de faire planter le run.
    const result = await ai().models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: { temperature: 0.7, tools: [{ googleSearch: {} }] },
    });
    const raw = (result.text ?? '').replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(raw) as DailyContent;
    // Garde-fous
    parsed.hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 12) : [];
    parsed.perPlatform = parsed.perPlatform ?? ({} as any);
    return parsed;
  } catch {
    // Fallback minimal si le JSON ne parse pas
    const fallback = article
      ? `${article.title} — notre analyse du marché immobilier de Dubaï. À lire → ${link}`
      : `Dubaï reste une valeur refuge : 0 % d'impôt sur les loyers, rendements 6–9 %, Golden Visa dès 545 000 €. Analyse du jour → ${link}`;
    return {
      topic: article ? `Relai de l'article : ${article.title}` : 'Fallback — résilience du marché immobilier de Dubaï',
      title: article?.title?.slice(0, 70) ?? 'Investir à Dubaï en 2026',
      caption: fallback,
      perPlatform: { facebook: fallback, instagram: fallback, tiktok: fallback, youtube: fallback },
      hashtags: ['DubaiRealEstate', 'InvestInDubai', 'ImmobilierDubai', 'GoldenVisa', 'RealEstate', 'Dubai'],
      imagePrompt: 'Cinematic photorealistic aerial view of Dubai Marina skyline at golden hour, luxury real estate, editorial, no text',
      videoPrompt: 'Cinematic vertical 9:16 aerial drone shot flying over Dubai skyline at sunset, smooth camera motion, no text',
    };
  }
}

// ─── 2. Génération des médias (image + vidéo) ────────────────────────────────

export async function generateImage(prompt: string): Promise<string | null> {
  try {
    // Les modèles imagen-* passent par generateImages ; les modèles
    // gemini-*-image génèrent via generateContent (inlineData en sortie).
    if (IMAGE_MODEL.startsWith('imagen')) {
      const resp: any = await ai().models.generateImages({
        model: IMAGE_MODEL,
        prompt,
        config: { numberOfImages: 1, aspectRatio: '1:1' },
      });
      const bytes = resp?.generatedImages?.[0]?.image?.imageBytes;
      return typeof bytes === 'string' ? bytes : null;
    }
    const resp: any = await ai().models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
    });
    const parts: any[] = resp?.candidates?.[0]?.content?.parts ?? [];
    const bytes = parts.find(p => p?.inlineData?.data)?.inlineData?.data;
    return typeof bytes === 'string' ? bytes : null;
  } catch (e: any) {
    console.error('[social] image generation failed:', e?.message ?? e);
    return null;
  }
}

/**
 * Vidéo via Veo — opération longue (1-3 min), on poll jusqu'à complétion.
 * Nécessite un compte Gemini API payant + accès Veo. Gated par SOCIAL_ENABLE_VIDEO.
 */
export async function generateVideo(prompt: string): Promise<string | null> {
  if (!ENABLE_VIDEO) return null;
  try {
    const client = ai();
    let operation: any = await client.models.generateVideos({
      model: VIDEO_MODEL,
      prompt,
      config: { aspectRatio: '9:16', numberOfVideos: 1 },
    });

    const deadline = Date.now() + 4 * 60 * 1000; // 4 min max
    while (!operation?.done && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 10_000));
      operation = await client.operations.getVideosOperation({ operation });
    }
    if (!operation?.done) {
      console.error('[social] video generation timed out');
      return null;
    }

    const file: any = operation?.response?.generatedVideos?.[0]?.video;
    // Selon le SDK : bytes inline OU URI à télécharger.
    if (file?.videoBytes) return file.videoBytes as string;
    if (file?.uri) {
      const res = await fetch(`${file.uri}&key=${GEMINI_KEY}`);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.toString('base64');
      }
    }
    return null;
  } catch (e: any) {
    console.error('[social] video generation failed:', e?.message ?? e);
    return null;
  }
}

// ─── 3. Upload Supabase Storage → URL publique ───────────────────────────────

async function uploadToStorage(base64: string, ext: 'png' | 'mp4', contentType: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}.${ext}`;
  try {
    const bytes = Buffer.from(base64, 'base64');
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: bytes,
    });
    if (!res.ok) {
      console.error('[social] storage upload failed:', res.status, await res.text());
      return null;
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  } catch (e: any) {
    console.error('[social] storage upload error:', e?.message ?? e);
    return null;
  }
}

export async function generateMedia(content: DailyContent): Promise<GeneratedMedia> {
  const media: GeneratedMedia = {};

  // Mode économe (défaut) : photo Dubaï de stock, aucune dépense Gemini.
  // L'URL publique sert au post FB/IG ; les octets servent de fond au carrousel.
  if (!ENABLE_AI_IMAGES) {
    // &fm=jpg : force le JPEG (satori et FB/IG gèrent mal le webp d'Unsplash).
    media.imageUrl = pickDailyPhoto(0, 1600) + '&fm=jpg';
    media.imageBase64 = (await fetchPhotoBase64(pickDailyPhoto(0, 1200) + '&fm=jpg')) ?? undefined;
    return media;
  }

  // Mode IA : génération Gemini (payante).
  const [imageBase64, videoBase64] = await Promise.all([
    generateImage(content.imagePrompt),
    generateVideo(content.videoPrompt),
  ]);

  if (imageBase64) {
    media.imageBase64 = imageBase64;
    media.imageUrl = (await uploadToStorage(imageBase64, 'png', 'image/png')) ?? undefined;
  }
  if (videoBase64) {
    media.videoBase64 = videoBase64;
    media.videoUrl = (await uploadToStorage(videoBase64, 'mp4', 'video/mp4')) ?? undefined;
  }
  return media;
}

// ─── 4. Publishers par plateforme ────────────────────────────────────────────

function withHashtags(text: string, tags: string[]): string {
  const tagLine = tags.map(t => `#${t.replace(/^#/, '')}`).join(' ');
  return `${text}\n\n${tagLine}`.trim();
}

/** Facebook Page : carrousel multi-photos, sinon /photos, /videos ou /feed. */
async function publishFacebook(content: DailyContent, media: GeneratedMedia): Promise<PublishResult> {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) return { platform: 'facebook', ok: false, skipped: true };

  const message = withHashtags(content.perPlatform.facebook || content.caption, content.hashtags);
  const v = 'v21.0';

  // Carrousel infographique : upload de chaque slide en non-publié,
  // puis un post unique qui les attache toutes.
  if (media.carouselUrls?.length) {
    try {
      const mediaIds: string[] = [];
      for (const slideUrl of media.carouselUrls) {
        const r = await fetch(`https://graph.facebook.com/${v}/${pageId}/photos`, {
          method: 'POST',
          body: new URLSearchParams({ url: slideUrl, published: 'false', access_token: token }),
        });
        const d: any = await r.json();
        if (!r.ok || !d?.id) return { platform: 'facebook', ok: false, error: JSON.stringify(d?.error ?? d) };
        mediaIds.push(d.id);
      }
      const feedBody = new URLSearchParams({ message, access_token: token });
      mediaIds.forEach((id, i) => feedBody.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
      const res = await fetch(`https://graph.facebook.com/${v}/${pageId}/feed`, { method: 'POST', body: feedBody });
      const data: any = await res.json();
      if (!res.ok) return { platform: 'facebook', ok: false, error: JSON.stringify(data?.error ?? data) };
      return { platform: 'facebook', ok: true, id: data?.id };
    } catch (e: any) {
      return { platform: 'facebook', ok: false, error: e?.message ?? String(e) };
    }
  }

  try {
    let url: string;
    let body: Record<string, string>;
    if (media.videoUrl) {
      url = `https://graph.facebook.com/${v}/${pageId}/videos`;
      body = { file_url: media.videoUrl, description: message, access_token: token };
    } else if (media.imageUrl) {
      url = `https://graph.facebook.com/${v}/${pageId}/photos`;
      body = { url: media.imageUrl, caption: message, access_token: token };
    } else {
      url = `https://graph.facebook.com/${v}/${pageId}/feed`;
      body = { message, link: SITE_URL, access_token: token };
    }
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams(body) });
    const data: any = await res.json();
    if (!res.ok) return { platform: 'facebook', ok: false, error: JSON.stringify(data?.error ?? data) };
    return { platform: 'facebook', ok: true, id: data?.id ?? data?.post_id };
  } catch (e: any) {
    return { platform: 'facebook', ok: false, error: e?.message ?? String(e) };
  }
}

/** Instagram Business (Graph API) : carrousel natif, sinon container simple → publish. */
async function publishInstagram(content: DailyContent, media: GeneratedMedia): Promise<PublishResult> {
  const igUserId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN ?? process.env.FB_PAGE_ACCESS_TOKEN;
  if (!igUserId || !token) return { platform: 'instagram', ok: false, skipped: true };
  if (!media.carouselUrls?.length && !media.imageUrl && !media.videoUrl) {
    return { platform: 'instagram', ok: false, error: 'Instagram exige une image ou vidéo hébergée (URL publique) — aucune disponible.' };
  }

  const caption = withHashtags(content.perPlatform.instagram || content.caption, content.hashtags);
  const v = 'v21.0';

  // Carrousel infographique : containers enfants → container CAROUSEL → publish.
  if (media.carouselUrls?.length) {
    try {
      const children: string[] = [];
      for (const slideUrl of media.carouselUrls) {
        const r = await fetch(`https://graph.facebook.com/${v}/${igUserId}/media`, {
          method: 'POST',
          body: new URLSearchParams({ image_url: slideUrl, is_carousel_item: 'true', access_token: token }),
        });
        const d: any = await r.json();
        if (!r.ok || !d?.id) return { platform: 'instagram', ok: false, error: JSON.stringify(d?.error ?? d) };
        children.push(d.id);
      }
      const carRes = await fetch(`https://graph.facebook.com/${v}/${igUserId}/media`, {
        method: 'POST',
        body: new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), caption, access_token: token }),
      });
      const carData: any = await carRes.json();
      if (!carRes.ok || !carData?.id) return { platform: 'instagram', ok: false, error: JSON.stringify(carData?.error ?? carData) };

      // Le container CAROUSEL doit être FINISHED avant publication, sinon
      // "Media is not ready" (9007). On poll le status_code jusqu'à 60s.
      for (let i = 0; i < 12; i++) {
        const st = await fetch(`https://graph.facebook.com/${v}/${carData.id}?fields=status_code&access_token=${token}`);
        const sd: any = await st.json();
        if (sd?.status_code === 'FINISHED') break;
        if (sd?.status_code === 'ERROR') return { platform: 'instagram', ok: false, error: 'container status ERROR' };
        await new Promise(r => setTimeout(r, 5_000));
      }

      const pubRes = await fetch(`https://graph.facebook.com/${v}/${igUserId}/media_publish`, {
        method: 'POST',
        body: new URLSearchParams({ creation_id: carData.id, access_token: token }),
      });
      const pubData: any = await pubRes.json();
      if (!pubRes.ok) return { platform: 'instagram', ok: false, error: JSON.stringify(pubData?.error ?? pubData) };
      return { platform: 'instagram', ok: true, id: pubData?.id };
    } catch (e: any) {
      return { platform: 'instagram', ok: false, error: e?.message ?? String(e) };
    }
  }

  try {
    const createBody: Record<string, string> = { caption, access_token: token };
    if (media.videoUrl) { createBody.media_type = 'REELS'; createBody.video_url = media.videoUrl; }
    else { createBody.image_url = media.imageUrl!; }

    const createRes = await fetch(`https://graph.facebook.com/${v}/${igUserId}/media`, {
      method: 'POST', body: new URLSearchParams(createBody),
    });
    const createData: any = await createRes.json();
    if (!createRes.ok) return { platform: 'instagram', ok: false, error: JSON.stringify(createData?.error ?? createData) };
    const creationId = createData.id;

    // Les Reels ont besoin d'un délai de traitement avant publication.
    if (media.videoUrl) await new Promise(r => setTimeout(r, 15_000));

    const pubRes = await fetch(`https://graph.facebook.com/${v}/${igUserId}/media_publish`, {
      method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: token }),
    });
    const pubData: any = await pubRes.json();
    if (!pubRes.ok) return { platform: 'instagram', ok: false, error: JSON.stringify(pubData?.error ?? pubData) };
    return { platform: 'instagram', ok: true, id: pubData?.id };
  } catch (e: any) {
    return { platform: 'instagram', ok: false, error: e?.message ?? String(e) };
  }
}

/** TikTok Content Posting API (PULL_FROM_URL). Nécessite app approuvée + token OAuth. */
async function publishTikTok(content: DailyContent, media: GeneratedMedia): Promise<PublishResult> {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) return { platform: 'tiktok', ok: false, skipped: true };
  // Mode texte+image : pas de vidéo → TikTok est ignoré proprement (il exige une vidéo).
  if (!media.videoUrl) {
    return { platform: 'tiktok', ok: false, skipped: true, error: 'vidéo requise (SOCIAL_ENABLE_VIDEO désactivé)' };
  }
  const title = withHashtags(content.perPlatform.tiktok || content.caption, content.hashtags).slice(0, 2200);
  try {
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        post_info: { title, privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false },
        source_info: { source: 'PULL_FROM_URL', video_url: media.videoUrl },
      }),
    });
    const data: any = await res.json();
    if (!res.ok || data?.error?.code !== 'ok') {
      return { platform: 'tiktok', ok: false, error: JSON.stringify(data?.error ?? data) };
    }
    return { platform: 'tiktok', ok: true, id: data?.data?.publish_id };
  } catch (e: any) {
    return { platform: 'tiktok', ok: false, error: e?.message ?? String(e) };
  }
}

/** YouTube Data API v3 : refresh access token puis upload resumable (Shorts). */
async function publishYouTube(content: DailyContent, media: GeneratedMedia): Promise<PublishResult> {
  const clientId = process.env.YT_CLIENT_ID;
  const clientSecret = process.env.YT_CLIENT_SECRET;
  const refreshToken = process.env.YT_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return { platform: 'youtube', ok: false, skipped: true };
  // Mode texte+image : pas de vidéo → YouTube est ignoré proprement (il exige une vidéo).
  if (!media.videoBase64) {
    return { platform: 'youtube', ok: false, skipped: true, error: 'vidéo requise (SOCIAL_ENABLE_VIDEO désactivé)' };
  }

  try {
    // 1. Refresh access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        refresh_token: refreshToken, grant_type: 'refresh_token',
      }),
    });
    const tokenData: any = await tokenRes.json();
    if (!tokenData?.access_token) return { platform: 'youtube', ok: false, error: 'Refresh token invalide' };

    const description = `${content.perPlatform.youtube || content.caption}\n\n${content.hashtags.map(t => `#${t}`).join(' ')} #Shorts`;
    const metadata = {
      snippet: { title: `${content.title} #Shorts`.slice(0, 100), description, categoryId: '25' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    };

    // 2. Upload direct (multipart) — suffisant pour un Short court
    const video = Buffer.from(media.videoBase64, 'base64');
    const boundary = `dubai${Date.now()}`;
    const parts = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
      video,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: parts,
      },
    );
    const uploadData: any = await uploadRes.json();
    if (!uploadRes.ok) return { platform: 'youtube', ok: false, error: JSON.stringify(uploadData?.error ?? uploadData) };
    return { platform: 'youtube', ok: true, id: uploadData?.id };
  } catch (e: any) {
    return { platform: 'youtube', ok: false, error: e?.message ?? String(e) };
  }
}

export async function publishAll(content: DailyContent, media: GeneratedMedia, only?: Platform): Promise<PublishResult[]> {
  const all: Record<Platform, () => Promise<PublishResult>> = {
    facebook: () => publishFacebook(content, media),
    instagram: () => publishInstagram(content, media),
    tiktok: () => publishTikTok(content, media),
    youtube: () => publishYouTube(content, media),
  };
  // ?only=<platform> : republier une seule plateforme (évite les doublons).
  const targets = only ? [only] : (Object.keys(all) as Platform[]);
  return Promise.all(targets.map(p => all[p]()));
}
