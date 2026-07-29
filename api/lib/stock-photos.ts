/**
 * Banque de photos Dubaï — mode économe (aucune génération d'image payante).
 *
 * Utilisé quand SOCIAL_ENABLE_AI_IMAGES !== 'true'. Chaque URL a été
 * vérifiée manuellement (elle résout ET montre bien Dubaï). Rotation par
 * jour de l'année pour varier les visuels des posts / vignettes.
 *
 * Pour réactiver la génération Gemini plus tard : mettre la variable
 * d'environnement SOCIAL_ENABLE_AI_IMAGES=true (voir social.ts / seo-geo).
 */

const UNSPLASH = (id: string, w: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

// IDs Unsplash Dubaï vérifiés (skyline, monuments, immobilier).
const DUBAI_PHOTO_IDS = [
  '1512453979798-5ea266f8880c', // skyline + Burj Khalifa au lever du jour
  '1489516408517-0c0a15662682', // Atlantis / Palm Jumeirah vue aérienne
  '1526495124232-a04e1849168c', // Sheikh Zayed Road, tours de nuit
  '1546412414-e1885259563a',    // Burj Al Arab depuis la plage
  '1533395427226-788cee25cc7b', // Burj Khalifa illuminé la nuit
  '1518684079-3c830dcef090',    // Burj Al Arab + Palm, vue aérienne
];

/** Index du jour (0-based) — rotation déterministe, +offset pour varier. */
function dayIndex(offset = 0): number {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const doy = Math.floor((now.getTime() - start) / 86_400_000);
  return (doy + offset) % DUBAI_PHOTO_IDS.length;
}

/** URL publique d'une photo Dubaï du jour (largeur paramétrable). */
export function pickDailyPhoto(offset = 0, width = 1600): string {
  return UNSPLASH(DUBAI_PHOTO_IDS[dayIndex(offset)], width);
}

/** Télécharge une photo et renvoie ses octets en base64 (pour le rendu satori). */
export async function fetchPhotoBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString('base64');
  } catch {
    return null;
  }
}
