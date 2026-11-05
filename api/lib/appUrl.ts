/** URL de base de l'app, pour les appels internes entre fonctions serverless. */
import { env } from './env';

export function appUrl(): string {
  const configured = env('APP_URL');
  if (configured) return configured.replace(/\/$/, '');
  const vercel = env('VERCEL_URL');
  if (vercel) return `https://${vercel}`;
  return 'https://dubainvest.eu';
}
