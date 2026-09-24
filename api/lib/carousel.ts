/**
 * Carrousel infographique quotidien — slides 1080×1350 (4:5) rendues par code.
 *
 * Pourquoi pas l'IA d'image : les modèles dessinent les textes avec des fautes.
 * Ici satori (texte → tracés SVG, polices embarquées) + sharp (SVG → PNG) :
 * chiffres nets, couleurs de marque exactes, rendu déterministe.
 *
 * 5 slides : couverture → 3 faits du jour → CTA.
 *
 * Le contenu vient de `socialFacts`, qui calcule ce qui a CHANGÉ dans les
 * dernières 24 h. La version précédente affichait des agrégats sur toute la
 * table : classements figés, et un carrousel visuellement identique d'un jour
 * à l'autre. Les visuels viennent désormais des photos réelles des annonces
 * citées — près de 10 000 disponibles, renouvelées chaque nuit — au lieu d'une
 * banque de six photos de stock tournant sur six jours.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import satori from 'satori';
import sharp from 'sharp';
import { SORA_700, MANROPE_400, MANROPE_800 } from './fonts';
import { computeDayFacts, markPublished, num, type DayFacts as RawDayFacts, type Fact } from './socialFacts';

/** Comme `DayFacts`, mais les photos sont déjà téléchargées en data URI :
 *  satori ne sait pas aller chercher une URL distante lui-même. */
export type DayFacts = Omit<RawDayFacts, 'facts'> & { facts: Array<Fact & { photoDataUri?: string }> };

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const STORAGE_BUCKET = process.env.SOCIAL_STORAGE_BUCKET ?? 'social-media';

const W = 1080;
const H = 1350;

// Thème (cohérent avec le site) — or = marque, cyan = accent secondaire,
// encre chaude sur fond #050505. Contrastes AA vérifiés sur fond sombre.
const BG = '#050505';
const GOLD = '#D4AF37';
const CYAN = '#00F2FF';
const INK = 'rgba(240,235,224,0.94)';
const INK_MUTED = 'rgba(240,235,224,0.72)';


// ─── Helpers de rendu ────────────────────────────────────────────────────────

const eur = (n: number) => `${num(n)} €`;

type Node = { type: string; props: Record<string, any> };
const el = (type: string, style: Record<string, any>, children?: any): Node => ({
  type,
  props: { style, ...(children !== undefined ? { children } : {}) },
});

/** Pied de slide commun : marque + pagination. */
function footer(page: number): Node {
  return el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }, [
    el('div', { display: 'flex', fontFamily: 'Sora', fontSize: 34, color: GOLD }, 'dubainvest.eu'),
    el('div', { display: 'flex', fontFamily: 'Manrope', fontSize: 30, color: INK_MUTED }, `${page} / 5`),
  ]);
}

/** Filet décoratif or→cyan. */
function rule(width: number): Node {
  return el('div', {
    display: 'flex', width, height: 6, borderRadius: 3,
    backgroundImage: `linear-gradient(90deg, ${GOLD}, ${CYAN})`,
  });
}

/** Cadre commun : fond sombre, padding, contenu + pied. */
function frame(children: Node[], page: number, bgImage?: string): Node {
  return el('div', {
    width: W, height: H, display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between', padding: 72, backgroundColor: BG,
    ...(bgImage ? { backgroundImage: `url(${bgImage})`, backgroundSize: `${W}px ${H}px` } : {}),
  }, [
    el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, width: '100%' }, children),
    footer(page),
  ]);
}

/**
 * Slide de fait : photo réelle de l'annonce en haut, données en bas.
 *
 * La photo occupe 44 % de la hauteur. En dessous d'environ un tiers elle se lit
 * comme une vignette décorative ; au-delà de la moitié, le chiffre héros passe
 * sous la ligne de flottaison du fil Instagram.
 */
function statSlide(page: number, kicker: string, zone: string, value: string, valueColor: string, context: string[], photo?: string): Node {
  // Taille adaptative pour que la valeur tienne sur une seule ligne.
  const heroSize = value.length <= 8 ? 152 : value.length <= 12 ? 112 : 92;
  const PHOTO_H = Math.round(H * 0.44);

  const body = el('div', {
    display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: 28,
    padding: photo ? '0 72px' : 0,
  }, [
    el('div', { display: 'flex', fontFamily: 'Manrope', fontWeight: 800, fontSize: 38, color: CYAN, textTransform: 'uppercase', letterSpacing: 4 }, kicker),
    el('div', { display: 'flex', fontFamily: 'Sora', fontSize: 68, color: INK, lineHeight: 1.1 }, zone),
    rule(220),
    el('div', { display: 'flex', fontFamily: 'Manrope', fontWeight: 800, fontSize: heroSize, color: valueColor, lineHeight: 1 }, value),
    el('div', { display: 'flex', flexDirection: 'column', gap: 12 },
      context.map(line => el('div', { display: 'flex', fontFamily: 'Manrope', fontSize: 36, color: INK_MUTED, lineHeight: 1.35 }, line))),
  ]);

  if (!photo) return frame([body], page);

  return el('div', { width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: BG }, [
    el('div', { display: 'flex', position: 'relative', width: W, height: PHOTO_H }, [
      { type: 'img', props: { src: photo, style: { width: W, height: PHOTO_H, objectFit: 'cover' } } } as Node,
      // Dégradé vers le fond : sans lui, la photo se termine par une arête nette
      // qui coupe la slide en deux.
      el('div', {
        position: 'absolute', bottom: 0, left: 0, width: W, height: 260, display: 'flex',
        backgroundImage: `linear-gradient(180deg, rgba(5,5,5,0) 0%, ${BG} 100%)`,
      }),
    ]),
    el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between', padding: '0 0 72px 0' }, [
      body,
      el('div', { display: 'flex', padding: '0 72px', width: '100%' }, footer(page)),
    ]),
  ]);
}

// ─── Construction des 5 slides ───────────────────────────────────────────────

/** Titres de couverture, tournés par angle pour ne pas répéter la même accroche. */
const COVER_TITLES: Record<string, string> = {
  'arrivages': 'Ce qui est arrivé sur le marché cette nuit',
  'bonnes-affaires': 'Les opportunités repérées aujourd’hui',
  'contrastes': 'Le marché de Dubaï, ce matin',
  'mouvements': 'Ce qui a bougé depuis hier',
};

/** Accroches de clôture, tournées elles aussi. */
const CTA_TITLES: Record<string, string> = {
  'arrivages': 'Ces biens correspondent-ils à votre budget ?',
  'bonnes-affaires': 'Votre simulation personnalisée en 2 minutes',
  'contrastes': 'Combien rapporterait votre budget à Dubaï ?',
  'mouvements': 'Soyez alerté dès qu’un prix baisse',
};

function buildTree(day: DayFacts, slide: number, coverBg?: string): Node {
  if (slide === 1) {
    const overlay = el('div', {
      position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex',
      backgroundImage: 'linear-gradient(180deg, rgba(5,5,5,0.55) 0%, rgba(5,5,5,0.30) 45%, rgba(5,5,5,0.88) 100%)',
    });
    const coverImg: Node = {
      type: 'img',
      props: { src: coverBg, style: { position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' } },
    };
    const fresh = num(day.newLast24h);
    return el('div', { width: W, height: H, display: 'flex', position: 'relative', backgroundColor: BG }, [
      ...(coverBg ? [coverImg, overlay] : []),
      el('div', { position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72 }, [
        el('div', { display: 'flex', fontFamily: 'Manrope', fontWeight: 800, fontSize: 38, color: CYAN, textTransform: 'uppercase', letterSpacing: 5 }, day.date),
        el('div', { display: 'flex', flexDirection: 'column', gap: 30 }, [
          el('div', { display: 'flex', fontFamily: 'Sora', fontSize: 92, color: INK, lineHeight: 1.08 }, COVER_TITLES[day.angle] ?? COVER_TITLES['contrastes']),
          el('div', { display: 'flex', fontFamily: 'Manrope', fontSize: 44, color: GOLD },
            day.newLast24h > 0 ? `${fresh} nouvelles annonces analysées` : `${num(day.totalListings)} annonces suivies en continu`),
          rule(220),
        ]),
        footer(1),
      ]),
    ]);
  }

  // Slides 2 à 4 : un fait du jour chacune, illustré par la photo de l'annonce.
  if (slide >= 2 && slide <= 4) {
    const fact = day.facts[slide - 2];
    if (!fact) {
      return frame([
        el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: 30 }, [
          el('div', { display: 'flex', fontFamily: 'Sora', fontSize: 72, color: INK, lineHeight: 1.12 }, 'Le marché de Dubaï, suivi en continu'),
          rule(220),
          el('div', { display: 'flex', fontFamily: 'Manrope', fontSize: 40, color: INK_MUTED }, `${num(day.totalListings)} annonces analysées chaque nuit`),
        ]),
      ], slide);
    }
    return statSlide(slide, fact.kicker, fact.headline, fact.value, GOLD, fact.context, fact.photoDataUri);
  }

  return frame([
    el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: 40 }, [
      el('div', { display: 'flex', fontFamily: 'Sora', fontSize: 84, color: INK, lineHeight: 1.12 }, CTA_TITLES[day.angle] ?? CTA_TITLES['bonnes-affaires']),
      rule(220),
      el('div', { display: 'flex', flexDirection: 'column', gap: 16 }, [
        el('div', { display: 'flex', fontFamily: 'Manrope', fontSize: 42, color: INK_MUTED }, 'Rendement, cashflow, fiscalité, Golden Visa —'),
        el('div', { display: 'flex', fontFamily: 'Manrope', fontSize: 42, color: INK_MUTED }, 'calculés sur des annonces réelles, selon votre budget.'),
      ]),
      el('div', {
        display: 'flex', alignSelf: 'flex-start', marginTop: 26, padding: '30px 58px', borderRadius: 999,
        backgroundImage: `linear-gradient(135deg, #b8891e, ${GOLD} 48%, #f0c060)`,
      }, el('div', { display: 'flex', fontFamily: 'Manrope', fontWeight: 800, fontSize: 40, color: '#050505', letterSpacing: 2 }, 'GRATUIT · LIEN EN BIO')),
    ]),
  ], 5);
}

// ─── Rendu + upload ──────────────────────────────────────────────────────────

const FONTS = [
  { name: 'Sora', data: Buffer.from(SORA_700, 'base64'), weight: 700 as const, style: 'normal' as const },
  { name: 'Manrope', data: Buffer.from(MANROPE_400, 'base64'), weight: 400 as const, style: 'normal' as const },
  { name: 'Manrope', data: Buffer.from(MANROPE_800, 'base64'), weight: 800 as const, style: 'normal' as const },
];

/** Data URI avec le bon type MIME détecté depuis les octets (PNG Gemini vs JPEG stock). */
function toDataUri(base64: string): string {
  const head = Buffer.from(base64.slice(0, 12), 'base64');
  let mime = 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50) mime = 'image/png';
  else if (head[0] === 0xff && head[1] === 0xd8) mime = 'image/jpeg';
  else if (head[8] === 0x57 && head[9] === 0x45) mime = 'image/webp';
  return `data:${mime};base64,${base64}`;
}

export async function renderSlide(day: DayFacts, slide: number, coverPhoto?: string): Promise<Buffer> {
  const svg = await satori(buildTree(day, slide, coverPhoto) as any, { width: W, height: H, fonts: FONTS });
  return sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
}

/** Télécharge une photo d'annonce et la convertit en data URI pour satori. */
async function toDataUriFromUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    // Recadrage 4:5 en amont : satori ne gère pas `objectFit` aussi finement que
    // le navigateur, et une photo d'annonce en 16:9 se retrouverait étirée.
    const png = await sharp(buf).resize(W, Math.round(H * 0.44), { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${png.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/**
 * Génère les 5 slides du jour, les uploade, renvoie les URLs.
 *
 * `null` si aucun fait exploitable n'a pu être calculé — l'appelant retombe
 * alors sur l'image simple plutôt que de publier un carrousel vide.
 */
export async function generateCarousel(): Promise<{ urls: string[]; day: DayFacts } | null> {
  const raw = await computeDayFacts();
  if (!raw) return null;

  // Les photos sont téléchargées en parallèle : trois requêtes séquentielles
  // ajouteraient plusieurs secondes à un cron déjà proche de sa limite.
  const [coverPhoto, ...factPhotos] = await Promise.all([
    toDataUriFromUrl(raw.coverPhotoUrl),
    ...raw.facts.map(f => toDataUriFromUrl(f.photoUrl)),
  ]);

  const day: DayFacts = {
    ...raw,
    facts: raw.facts.map((f, i) => ({ ...f, photoDataUri: factPhotos[i] })),
  };

  const dayKey = new Date().toISOString().slice(0, 10);
  const urls: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const png = await renderSlide(day, i, coverPhoto);
    const path = `carousel/${dayKey}/slide-${i}.png`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY, 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: new Uint8Array(png),
    });
    if (!up.ok) {
      console.error('[carousel] upload failed:', up.status, await up.text());
      return null;
    }
    urls.push(`${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`);
  }

  // Enregistré seulement maintenant : marquer avant l'upload interdirait de
  // reproposer ces annonces demain alors que rien n'aurait été publié.
  await markPublished(raw);

  return { urls, day };
}
