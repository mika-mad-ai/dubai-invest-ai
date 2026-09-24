/** URL de base de l'app, pour les appels internes entre fonctions serverless. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://dubainvest.eu';
}
