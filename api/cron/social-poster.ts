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

import { generateDailyContent, generateMedia, publishAll, type PublishResult } from '../lib/social';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export default async function handler(
  req: { method: string; headers: Record<string, string>; query?: Record<string, string> },
  res: { status: (code: number) => { json: (data: object) => void } }
) {
  const authHeader = (req.headers as any)['authorization'] ?? '';
  const querySecret = (req as any).query?.secret ?? '';
  const isVercelCron = authHeader === `Bearer ${CRON_SECRET}`;
  const isManualRun = CRON_SECRET && querySecret === CRON_SECRET;
  const dryRun = (req as any).query?.dry === '1';

  if (!isVercelCron && !isManualRun) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.API_KEY) {
    return res.status(500).json({ ok: false, error: 'API_KEY (Gemini) manquante.' });
  }

  const startedAt = Date.now();
  const log: string[] = [];

  try {
    log.push('Génération de l\'angle éditorial du jour via Gemini + Google Search…');
    const content = await generateDailyContent();
    log.push(`✓ Sujet : ${content.topic}`);
    log.push(`✓ Titre : ${content.title}`);

    log.push('Génération des médias (image / vidéo)…');
    const media = await generateMedia(content);
    log.push(`✓ Image : ${media.imageUrl ? 'ok (hébergée)' : media.imageBase64 ? 'ok (bytes, non hébergée)' : 'aucune'}`);
    log.push(`✓ Vidéo : ${media.videoUrl ? 'ok (hébergée)' : media.videoBase64 ? 'ok (bytes)' : (process.env.SOCIAL_ENABLE_VIDEO === 'true' ? 'échec/timeout' : 'désactivée')}`);

    // dry=1 : on génère mais on ne publie pas (utile pour tester sans poster).
    let results: PublishResult[] = [];
    if (dryRun) {
      log.push('DRY RUN — publication désactivée.');
      results = [];
    } else {
      log.push('Publication sur les réseaux configurés…');
      results = await publishAll(content, media);
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
      media: { image: !!media.imageUrl, video: !!media.videoUrl, image_url: media.imageUrl, video_url: media.videoUrl },
      results,
      log,
    });
  } catch (err: any) {
    console.error('[social-poster]', err);
    return res.status(500).json({ ok: false, error: err?.message ?? String(err), log });
  }
}
