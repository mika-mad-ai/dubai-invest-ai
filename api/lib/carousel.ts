/**
 * Carrousel infographique quotidien — slides 1080×1350 (4:5) rendues par code.
 *
 * Pourquoi pas l'IA d'image : les modèles dessinent les textes avec des fautes.
 * Ici satori (texte → tracés SVG, polices embarquées) + sharp (SVG → PNG) :
 * chiffres nets, couleurs de marque exactes, rendu déterministe.
 *
 * 5 slides : couverture (photo IA du jour en fond si dispo) → 3 stat tiles
 * (meilleur rendement / ticket d'entrée / premium) → CTA.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import satori from 'satori';
import sharp from 'sharp';
import { SORA_700, MANROPE_400, MANROPE_800 } from './fonts';

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const STORAGE_BUCKET = process.env.SOCIAL_STORAGE_BUCKET ?? 'social-media';
const AED_TO_EUR = 1 / 4.24;

const W = 1080;
const H = 1350;

// Thème (cohérent avec le site) — or = marque, cyan = accent secondaire,
// encre chaude sur fond #050505. Contrastes AA vérifiés sur fond sombre.
const BG = '#050505';
const GOLD = '#D4AF37';
const CYAN = '#00F2FF';
const INK = 'rgba(240,235,224,0.94)';
const INK_MUTED = 'rgba(240,235,224,0.72)';

const ZONE_LABELS: Record<string, string> = {
  jvc: 'Jumeirah Village Circle',
  businessbay: 'Business Bay',
  marina: 'Dubai Marina',
  downtown: 'Downtown Dubai',
  creek: 'Dubai Creek Harbour',
  palm: 'Palm Jumeirah',
  jbr: 'JBR',
};

export interface CarouselStats {
  total: number;
  date: string;
  topYield: { zone: string; yield: number; avgEur: number };
  affordable: { zone: string; minEur: number; avgEur: number };
  premium: { zone: string; avgEur: number; yield: number };
}

// ─── Stats depuis les annonces réelles ───────────────────────────────────────

export async function fetchCarouselStats(): Promise<CarouselStats | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/listings?select=price:price_aed,district:district_id,y:yield_pct&limit=2000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const rows: any[] = await res.json();
    const byZone: Record<string, { prices: number[]; yields: number[] }> = {};
    for (const r of rows) {
      if (!r.district || !ZONE_LABELS[r.district]) continue;
      (byZone[r.district] ??= { prices: [], yields: [] });
      if (r.price > 100_000) byZone[r.district].prices.push(r.price);
      if (r.y) byZone[r.district].yields.push(r.y);
    }
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const zones = Object.entries(byZone)
      .filter(([, d]) => d.prices.length >= 3)
      .map(([z, d]) => ({
        zone: ZONE_LABELS[z],
        avgEur: Math.round(avg(d.prices) * AED_TO_EUR),
        minEur: Math.round(Math.min(...d.prices) * AED_TO_EUR),
        yield: Math.round(avg(d.yields) * 10) / 10 || 6.5,
      }));
    if (zones.length < 3) return null;
    const topYield = [...zones].sort((a, b) => b.yield - a.yield)[0];
    const affordable = [...zones].sort((a, b) => a.minEur - b.minEur)[0];
    const premium = [...zones].sort((a, b) => b.avgEur - a.avgEur)[0];
    return {
      total: rows.length,
      date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      topYield: { zone: topYield.zone, yield: topYield.yield, avgEur: topYield.avgEur },
      affordable: { zone: affordable.zone, minEur: affordable.minEur, avgEur: affordable.avgEur },
      premium: { zone: premium.zone, avgEur: premium.avgEur, yield: premium.yield },
    };
  } catch {
    return null;
  }
}

// ─── Helpers de rendu ────────────────────────────────────────────────────────

const eur = (n: number) => `${n.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €`;

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

/** Slide stat : kicker, zone, valeur héros, contexte. */
function statSlide(page: number, kicker: string, zone: string, value: string, valueColor: string, context: string[]): Node {
  // Taille adaptative pour que la valeur tienne sur une seule ligne.
  const heroSize = value.length <= 8 ? 168 : value.length <= 12 ? 118 : 98;
  return frame([
    el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: 34 }, [
      el('div', { display: 'flex', fontFamily: 'Manrope', fontWeight: 800, fontSize: 40, color: CYAN, textTransform: 'uppercase', letterSpacing: 4 }, kicker),
      el('div', { display: 'flex', fontFamily: 'Sora', fontSize: 76, color: INK, lineHeight: 1.1 }, zone),
      rule(220),
      el('div', { display: 'flex', fontFamily: 'Manrope', fontWeight: 800, fontSize: heroSize, color: valueColor, lineHeight: 1 }, value),
      el('div', { display: 'flex', flexDirection: 'column', gap: 14 },
        context.map(line => el('div', { display: 'flex', fontFamily: 'Manrope', fontSize: 40, color: INK_MUTED, lineHeight: 1.35 }, line))),
    ]),
  ], page);
}

// ─── Construction des 5 slides ───────────────────────────────────────────────

function buildTree(stats: CarouselStats, slide: number, coverBg?: string): Node {
  switch (slide) {
    case 1: {
      const overlay = el('div', {
        position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex',
        backgroundImage: 'linear-gradient(180deg, rgba(5,5,5,0.55) 0%, rgba(5,5,5,0.30) 45%, rgba(5,5,5,0.88) 100%)',
      });
      return el('div', { width: W, height: H, display: 'flex', position: 'relative', backgroundColor: BG }, [
        ...(coverBg ? [el('img', { position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover', src: coverBg } as any), overlay] : []),
        el('div', { position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72 }, [
          el('div', { display: 'flex', fontFamily: 'Manrope', fontWeight: 800, fontSize: 38, color: CYAN, textTransform: 'uppercase', letterSpacing: 5 }, stats.date),
          el('div', { display: 'flex', flexDirection: 'column', gap: 30 }, [
            el('div', { display: 'flex', fontFamily: 'Sora', fontSize: 96, color: INK, lineHeight: 1.08 }, 'Le marché de Dubaï aujourd’hui'),
            el('div', { display: 'flex', fontFamily: 'Manrope', fontSize: 44, color: GOLD }, `${stats.total.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} annonces réelles analysées par IA`),
            rule(220),
          ]),
          footer(1),
        ]),
      ]);
    }
    case 2:
      return statSlide(2, 'Meilleur rendement locatif', stats.topYield.zone,
        `${String(stats.topYield.yield).replace('.', ',')} %`, GOLD,
        [`brut par an · prix moyen ${eur(stats.topYield.avgEur)}`, 'vs 3,2 % en moyenne en Europe']);
    case 3:
      return statSlide(3, 'Ticket d’entrée le plus bas', stats.affordable.zone,
        `dès ${eur(stats.affordable.minEur)}`, GOLD,
        [`prix moyen du quartier ${eur(stats.affordable.avgEur)}`, '0 % d’impôt sur les loyers']);
    case 4:
      return statSlide(4, 'Le quartier premium', stats.premium.zone,
        eur(stats.premium.avgEur), GOLD,
        [`prix moyen · rendement ${String(stats.premium.yield).replace('.', ',')} % par an`, 'Golden Visa dès 545 000 € d’investissement']);
    default:
      return frame([
        el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: 40 }, [
          el('div', { display: 'flex', fontFamily: 'Sora', fontSize: 88, color: INK, lineHeight: 1.12 }, 'Votre simulation personnalisée en 2 minutes'),
          rule(220),
          el('div', { display: 'flex', flexDirection: 'column', gap: 16 }, [
            el('div', { display: 'flex', fontFamily: 'Manrope', fontSize: 42, color: INK_MUTED }, 'Rendement, cashflow, fiscalité, Golden Visa —'),
            el('div', { display: 'flex', fontFamily: 'Manrope', fontSize: 42, color: INK_MUTED }, 'calculés sur des annonces réelles, selon votre budget.'),
          ]),
          el('div', {
            display: 'flex', alignSelf: 'flex-start', marginTop: 26, padding: '30px 58px', borderRadius: 999,
            backgroundImage: `linear-gradient(135deg, #b8891e, ${GOLD} 48%, #f0c060)`,
          }, el('div', { display: 'flex', fontFamily: 'Manrope', fontWeight: 800, fontSize: 40, color: '#050505', letterSpacing: 2 }, 'GRATUIT → LIEN EN BIO')),
        ]),
      ], 5);
  }
}

// ─── Rendu + upload ──────────────────────────────────────────────────────────

const FONTS = [
  { name: 'Sora', data: Buffer.from(SORA_700, 'base64'), weight: 700 as const, style: 'normal' as const },
  { name: 'Manrope', data: Buffer.from(MANROPE_400, 'base64'), weight: 400 as const, style: 'normal' as const },
  { name: 'Manrope', data: Buffer.from(MANROPE_800, 'base64'), weight: 800 as const, style: 'normal' as const },
];

export async function renderSlide(stats: CarouselStats, slide: number, coverImageBase64?: string): Promise<Buffer> {
  const coverBg = coverImageBase64 ? `data:image/png;base64,${coverImageBase64}` : undefined;
  const svg = await satori(buildTree(stats, slide, coverBg) as any, { width: W, height: H, fonts: FONTS });
  return sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
}

/**
 * Génère les 5 slides, les uploade sur le Storage public, renvoie les URLs.
 * null si les stats sont indisponibles (l'appelant retombe sur l'image simple).
 */
export async function generateCarousel(coverImageBase64?: string): Promise<{ urls: string[]; stats: CarouselStats } | null> {
  const stats = await fetchCarouselStats();
  if (!stats) return null;

  const day = new Date().toISOString().slice(0, 10);
  const urls: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const png = await renderSlide(stats, i, coverImageBase64);
    const path = `carousel/${day}/slide-${i}.png`;
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
  return { urls, stats };
}
