/**
 * Agent réseaux sociaux — publication quotidienne automatique.
 *
 * Déclenché par Vercel Cron (voir vercel.json, "0 8 * * *" = 08:00 UTC).
 * Aussi déclenchable manuellement : /api/cron/social-poster?secret=CRON_SECRET
 *
 * Étapes :
 *   1. Gemini rédige l'angle du jour (actualité géopolitique + immobilier Dubaï)
 *      + une légende par plateforme, via Google Search pour la fraîcheur.
 *   2. Imagen génère une image ; Veo une vidéo (si SOCIAL_ENABLE_VIDEO=true).
 *   3. Médias uploadés sur Supabase Storage → URL publique.
 *   4. Publication sur Facebook, Instagram, TikTok, YouTube (celles configurées).
 *
 * Configuration requise : voir docs/SOCIAL_AGENT_SETUP.md.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { generateDailyContent, generateMedia, publishAll, type PublishResult, type ArticleContext } from '../lib/social';
import { generateCarousel, type DayFacts } from '../lib/carousel';
import { isCronAuthorized } from '../lib/cronAuth';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

/**
 * Récupère l'article de blog du jour (publié par seo-geo-optimizer à 4h UTC)
 * pour que le post social le relaie et pointe vers sa page dédiée.
 * Renvoie null si aucun article n'a été publié aujourd'hui (repli angle autonome).
 */
async function fetchTodayArticle(): Promise<ArticleContext | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_posts?select=title,slug,created_at&order=created_at.desc&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(5_000) }
    );
    if (!res.ok) return null;
    const rows: any[] = await res.json();
    const post = rows[0];
    if (!post?.slug) return null;
    // On n'exige pas la date exacte : le plus récent article fait toujours foi,
    // mais on ignore un article vieux de plus de 36h (cron 4h probablement en échec).
    const ageMs = Date.now() - new Date(post.created_at).getTime();
    if (ageMs > 36 * 3600 * 1000) return null;
    return { title: post.title, slug: post.slug, url: `https://dubainvest.eu/blog/${post.slug}` };
  } catch {
    return null;
  }
}

export default async function handler(
  req: { method: string; headers: Record<string, string>; query?: Record<string, string> },
  res: { status: (code: number) => { json: (data: object) => void } }
) {

  const dryRun = (req as any).query?.dry === '1';

  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.API_KEY) {
    return res.status(500).json({ ok: false, error: 'API_KEY (Gemini) manquante.' });
  }

  const startedAt = Date.now();
  const log: string[] = [];

  try {
    // Relaie l'article du jour (page dédiée du blog) s'il existe.
    const article = await fetchTodayArticle();
    if (article) log.push(`✓ Article du jour à relayer : « ${article.title} » → ${article.url}`);
    else log.push('— Aucun article du jour trouvé : angle social autonome.');

    log.push('Génération du post du jour via Gemini + Google Search…');
    const content = await generateDailyContent(article ?? undefined);
    log.push(`✓ Sujet : ${content.topic}`);
    log.push(`✓ Titre : ${content.title}`);

    let dayFacts: DayFacts | null = null;

    log.push('Génération des médias (image / vidéo)…');
    const media = await generateMedia(content);
    log.push(`✓ Image : ${media.imageUrl ? 'ok (hébergée)' : media.imageBase64 ? 'ok (bytes, non hébergée)' : 'aucune'}`);
    log.push(`✓ Vidéo : ${media.videoUrl ? 'ok (hébergée)' : media.videoBase64 ? 'ok (bytes)' : (process.env.SOCIAL_ENABLE_VIDEO === 'true' ? 'échec/timeout' : 'désactivée')}`);

    // Carrousel du jour — mode par défaut FB/IG. Le contenu et les photos
    // viennent des annonces arrivées dans les dernières 24 h, en excluant tout
    // ce qui a déjà été publié : c'est ce qui garantit qu'aucun post ne répète
    // le précédent.
    log.push('Génération du carrousel (faits du jour + photos d\'annonces)…');
    const carousel = await generateCarousel();
    if (carousel) {
      media.carouselUrls = carousel.urls;
      const d = carousel.day;
      log.push(`✓ Carrousel : angle « ${d.angle} », ${d.newLast24h} annonces nouvelles sur ${d.totalListings} suivies`);
      for (const f of d.facts) {
        log.push(`   · ${f.kicker} — ${f.headline} : ${f.value}${f.photoDataUri ? ' (photo annonce)' : ' (sans photo)'}`);
      }
      dayFacts = d;
    } else {
      log.push('⚠ Carrousel indisponible (aucun fait exploitable) — repli sur l\'image simple.');
    }

    // dry=1 : on génère mais on ne publie pas (utile pour tester sans poster).
    let results: PublishResult[] = [];
    if (dryRun) {
      log.push('DRY RUN — publication désactivée.');
      results = [];
    } else {
      log.push('Publication sur les réseaux configurés…');
      const only = (req as any).query?.only as ('facebook' | 'instagram' | 'tiktok' | 'youtube' | undefined);
      results = await publishAll(content, media, only);
      for (const r of results) {
        if (r.skipped) log.push(`— ${r.platform} : ignoré (${r.error ?? 'identifiants absents'})`);
        else if (r.ok) log.push(`✓ ${r.platform} : publié (${r.id ?? 'ok'})`);
        else log.push(`✗ ${r.platform} : ${r.error}`);
      }
    }

    const elapsed = Date.now() - startedAt;
    log.push(`Terminé en ${elapsed}ms`);

    return res.status(200).json({
      ok: true,
      elapsed_ms: elapsed,
      dry_run: dryRun,
      content: {
        topic: content.topic,
        title: content.title,
        caption: content.caption,
        hashtags: content.hashtags,
        per_platform: content.perPlatform,
      },
      media: { image: !!media.imageUrl, video: !!media.videoUrl, image_url: media.imageUrl, video_url: media.videoUrl, carousel: media.carouselUrls ?? [] },
      day_facts: dayFacts ? { angle: dayFacts.angle, new_last_24h: dayFacts.newLast24h, facts: dayFacts.facts.map(f => ({ kind: f.kind, headline: f.headline, value: f.value })) } : null,
      results,
      log,
    });
  } catch (err: any) {
    console.error('[social-poster]', err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err), log });
  }
}
