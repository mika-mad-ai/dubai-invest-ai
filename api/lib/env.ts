/**
 * Lecture des variables d'environnement, débarrassée des blancs de bordure.
 *
 * Cinq variables de production contenaient un saut de ligne final, capturé au
 * collage dans l'interface Vercel (`APP_URL`, `APIFY_API_TOKEN`, `FB_PAGE_ID`,
 * `IG_USER_ID`, `VITE_GOOGLE_SHEET_WEBHOOK`).
 *
 * Le défaut est sournois parce qu'il ne se voit pas partout de la même façon :
 * l'analyseur d'URL du standard supprime les sauts de ligne, donc les appels
 * Graph construits avec `FB_PAGE_ID` continuaient de fonctionner. Un en-tête
 * HTTP, lui, n'a pas cette indulgence : `Authorization: Bearer <token>\n` est
 * refusé par `fetch`, ce qui fait échouer l'appel Apify et bascule en silence
 * sur le repli sans token.
 *
 * On nettoie donc à la lecture plutôt que de compter sur la saisie.
 */

/** Valeur nettoyée, ou `undefined` si absente ou vide une fois nettoyée. */
export function env(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

/** Idem, avec valeur de repli. */
export function envOr(name: string, fallback: string): string {
  return env(name) ?? fallback;
}
