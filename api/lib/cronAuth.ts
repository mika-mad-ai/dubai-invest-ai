/**
 * Authentification des crons et webhooks qui déclenchent des appels PAYANTS
 * (Gemini, Imagen/Veo, Apify). ÉCHEC FERMÉ : sans secret configuré, l'endpoint
 * refuse tout — avant, `Bearer ${CRON_SECRET ?? ''}` acceptait l'en-tête
 * « Bearer » vide, et `Bearer ${process.env.CRON_SECRET}` acceptait
 * « Bearer undefined » : n'importe qui pouvait faire tourner les générations.
 *
 * Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>` dès que la variable
 * CRON_SECRET est définie dans le projet.
 */
import { timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Vrai seulement si `secret` est défini (≥ 8 car.) ET présenté à l'identique. */
export function secretMatches(secret: string | undefined, provided: unknown): boolean {
  if (!secret || secret.trim().length < 8) return false;
  if (typeof provided !== 'string' || !provided) return false;
  return safeEqual(provided.trim(), secret.trim());
}

/** Crons : en-tête Bearer (Vercel) ou ?secret= (déclenchement manuel). */
export function isCronAuthorized(req: any): boolean {
  const secret = process.env.CRON_SECRET;
  const header = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  return secretMatches(secret, bearer) || secretMatches(secret, req?.query?.secret);
}
