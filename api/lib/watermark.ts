/**
 * Écarte les photos d'annonce qui portent le filigrane d'une agence.
 *
 * Pourquoi c'est nécessaire : sur un échantillon de 24 photos fraîches, ~20
 * portaient une marque d'agence (« DACHA », « haus&haus », « Edwards & Towers »…).
 * Publier ça sur notre propre page, c'est afficher la marque d'un concurrent, et
 * diffuser une image sous droits avec sa signature. On ne retouche pas : effacer
 * la marque d'une photo qui ne nous appartient pas est pire que de la laisser.
 * On choisit donc, parmi les centaines d'annonces fraîches du jour, celles qui
 * n'en portent pas.
 *
 * Comment on les reconnaît : un filigrane est le seul motif qui se répète à
 * l'identique, au même endroit et à la même échelle, sur des photos de pièces
 * différentes du MÊME bien. Le résidu haute fréquence de deux scènes sans
 * rapport ne corrèle nulle part — sauf là où la même incrustation est posée.
 *
 * Une première version comparait les photos d'annonces DIFFÉRENTES : elle n'a
 * rien séparé (corrélations 0,02–0,16 sans rapport avec la présence de marque),
 * le signal étant noyé par le contenu. La comparaison intra-annonce, elle,
 * sépare nettement : 0,19–0,95 pour les photos marquées, 0,08–0,14 pour les
 * propres, vérifié à l'œil sur les deux extrémités du classement.
 */

import sharp from 'sharp';

/** Taille d'analyse et taille de bloc. 512/32 → grille 16×16. */
const S = 512;
const B = 32;
const G = S / B;

/**
 * Au-dessus, on considère la photo marquée.
 *
 * Calibré sur un échantillon étiqueté à l'œil : la marque la plus discrète
 * trouvée (« haus&haus », très transparente) score 0,19 ; la photo propre la
 * mieux notée score 0,14. Le seuil est volontairement placé bas dans cette
 * marge : avec ~950 annonces fraîches par nuit pour 4 photos à publier, jeter
 * des photos propres ne coûte rien, publier un logo concurrent coûte cher.
 */
export const WATERMARK_SCORE_MAX = 0.12;

/** Combien de photos d'un même bien on compare. En dessous de 3, trop de faux positifs. */
const SAMPLE = 3;

/**
 * Property Finder sert une variante redimensionnée (`668x452.jpg`) sur laquelle
 * son CDN incruste la marque de l'agence. `original.jpg` en est souvent exempt —
 * et fait 1200-1600 px de large, ce qui évite en prime d'agrandir une image de
 * 668 px sur une slide de 1080. Quand la variante n'existe pas (403), on garde
 * l'URL d'origine, qui sera de toute façon soumise au même contrôle.
 */
export function originalVariant(url: string): string {
  return url.replace(/\/\d+x\d+\.jpg/, '/original.jpg');
}

async function fetchImage(url: string, timeoutMs: number): Promise<Buffer | null> {
  for (const candidate of [originalVariant(url), url]) {
    try {
      const res = await fetch(candidate, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      // Réseau ou délai : on tente la variante suivante, sinon on renonce.
    }
    if (candidate === url) break;
  }
  return null;
}

/** Résidu haute fréquence : l'image moins sa version floue. */
async function highPass(buf: Buffer): Promise<Float64Array> {
  const grey = sharp(buf).resize(S, S, { fit: 'fill' }).greyscale();
  const [sharpRaw, blurRaw] = await Promise.all([
    grey.clone().raw().toBuffer(),
    grey.clone().blur(6).raw().toBuffer(),
  ]);
  const out = new Float64Array(S * S);
  for (let i = 0; i < out.length; i++) out[i] = sharpRaw[i] - blurRaw[i];
  return out;
}

/** Corrélation normalisée sur un bloc de B×B pixels. */
function blockCorrelation(x: Float64Array, y: Float64Array, bx: number, by: number): number {
  let sx = 0, sy = 0;
  const n = B * B;
  for (let j = 0; j < B; j++) {
    for (let i = 0; i < B; i++) {
      const k = (by * B + j) * S + bx * B + i;
      sx += x[k]; sy += y[k];
    }
  }
  const mx = sx / n, my = sy / n;
  let num = 0, dx = 0, dy = 0;
  for (let j = 0; j < B; j++) {
    for (let i = 0; i < B; i++) {
      const k = (by * B + j) * S + bx * B + i;
      const a = x[k] - mx, b = y[k] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 1e-6 ? num / denom : 0;
}

/**
 * Score de filigrane : la meilleure corrélation locale confirmée par TOUTES les
 * paires de photos. Exiger l'accord de toutes les paires évite qu'un hasard
 * entre deux photos suffise à condamner l'annonce.
 */
export function watermarkScore(maps: Float64Array[]): number {
  let best = 0;
  for (let by = 0; by < G; by++) {
    for (let bx = 0; bx < G; bx++) {
      let worst = Infinity;
      for (let i = 0; i < maps.length; i++) {
        for (let j = i + 1; j < maps.length; j++) {
          worst = Math.min(worst, blockCorrelation(maps[i], maps[j], bx, by));
        }
      }
      if (worst > best) best = worst;
    }
  }
  return best;
}

/**
 * `true` si les photos de ce bien ne portent pas de marque visible.
 *
 * Échec fermé : une annonce qu'on n'arrive pas à analyser (photos manquantes,
 * réseau muet, format illisible) est traitée comme marquée. Le coût d'un faux
 * négatif — publier le logo d'un concurrent — est sans commune mesure avec
 * celui d'un faux positif, qui ne fait que passer à l'annonce suivante.
 */
export async function isCleanListing(images: string[], timeoutMs = 12_000): Promise<boolean> {
  const urls = images.filter(u => typeof u === 'string' && u.startsWith('http')).slice(0, SAMPLE);
  if (urls.length < SAMPLE) return false;

  const buffers = (await Promise.all(urls.map(u => fetchImage(u, timeoutMs)))).filter(Boolean) as Buffer[];
  if (buffers.length < SAMPLE) return false;

  try {
    // Le score suppose que les photos se superposent : même cadrage source,
    // donc même position du filigrane. Des dimensions différentes le
    // décaleraient et le rendraient indétectable — on refuse plutôt que de
    // rendre un verdict qui ne veut rien dire.
    const sizes = await Promise.all(buffers.map(b => sharp(b).metadata()));
    const [w, h] = [sizes[0].width, sizes[0].height];
    if (!w || !h || sizes.some(s => s.width !== w || s.height !== h)) return false;

    const maps = await Promise.all(buffers.map(highPass));
    return watermarkScore(maps) <= WATERMARK_SCORE_MAX;
  } catch {
    return false;
  }
}

/**
 * Analyse plusieurs biens en parallèle et renvoie les identifiants sans marque.
 *
 * `budgetMs` borne l'ensemble : cette fonction tourne dans un cron serverless,
 * qui a une durée maximale. Passé le budget, les biens non analysés restent
 * hors de l'ensemble renvoyé — donc écartés, conformément à l'échec fermé.
 */
export async function screenListings(
  items: Array<{ id: string; images: string[] }>,
  budgetMs = 45_000,
  concurrency = 6,
): Promise<Set<string>> {
  const clean = new Set<string>();
  const deadline = Date.now() + budgetMs;
  const queue = [...items];

  const worker = async () => {
    while (queue.length && Date.now() < deadline) {
      const it = queue.shift();
      if (!it) return;
      const left = deadline - Date.now();
      if (left <= 0) return;
      if (await isCleanListing(it.images, Math.min(12_000, left))) clean.add(it.id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return clean;
}
