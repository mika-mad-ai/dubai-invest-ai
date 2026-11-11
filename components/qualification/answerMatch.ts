/**
 * Rapproche une réponse tapée au clavier d'une des options proposées, sans
 * appel à un modèle : numéro de l'option, montant tombant dans une tranche,
 * ou mots en commun avec le libellé. Logique pure, testée par
 * `scripts/verify-concierge.mjs`.
 */

export type MatchableOption = { label: string; desc?: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ');

/** Montants cités dans un texte : « 300k », « 1,5 M€ », « 200 000 », « 2 millions ». */
export function parseAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[   .]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(millions?|mille|k|m)?(?![a-z])/gi;
  let m: RegExpExecArray | null;
  const t = norm(text);
  while ((m = re.exec(t))) {
    const whole = Number(m[1].replace(/[   .]/g, ''));
    const value = m[2] ? whole + Number(`0.${m[2]}`) : whole;
    const unit = (m[3] || '').toLowerCase();
    const mult = unit.startsWith('m') && unit !== 'mille' ? 1_000_000 : unit === 'k' || unit === 'mille' ? 1_000 : 1;
    out.push(Math.round(value * mult));
  }
  return out;
}

/** Tranche de montants décrite par un libellé d'option, si c'en est une. */
export function optionRange(label: string): [number, number] | null {
  const amounts = parseAmounts(label);
  if (!amounts.length) return null;
  const t = norm(label);
  if (/moins de|jusqu a|under/.test(t)) return [0, amounts[0]];
  if (/plus de|au-dela|over/.test(t)) return [amounts[0], Infinity];
  if (amounts.length >= 2) return [Math.min(amounts[0], amounts[1]), Math.max(amounts[0], amounts[1])];
  return null;
}

const STOP = new Set([
  'les', 'des', 'une', 'pour', 'avec', 'dans', 'que', 'qui', 'est', 'sur', 'mon', 'mes', 'par', 'pas', 'plus', 'moins',
  'veux', 'voudrais', 'aimerais', 'cherche', 'souhaite', 'bien', 'tres', 'peu', 'aux', 'ses', 'son', 'vous', 'nous', 'moi',
]);
const stem = (w: string) => (w.length > 5 ? w.slice(0, 5) : w);
const tokens = (s: string) =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !STOP.has(w))
    .map(stem);

export type AnswerMatch = { index: number; amount?: number };

/**
 * Option correspondant à une réponse libre, ou null si rien de fiable
 * (dans ce cas l'interface redemande plutôt que de deviner).
 */
export function matchAnswer(options: MatchableOption[], text: string): AnswerMatch | null {
  const raw = text.trim();
  if (!raw) return null;

  // « 2 », « option 3 », « la 1 »
  const num = norm(raw).match(/^(?:option|choix|reponse|la|le|numero|n)?\s*(\d)\s*$/);
  if (num) {
    const i = Number(num[1]) - 1;
    return i >= 0 && i < options.length ? { index: i } : null;
  }

  // Un montant qui tombe dans une tranche (budget, loyer).
  const ranges = options.map(o => optionRange(o.label));
  if (ranges.filter(Boolean).length >= 2) {
    const amount = parseAmounts(raw).find(a => a >= 100);
    if (amount != null) {
      const i = ranges.findIndex(r => r && amount >= r[0] && amount < r[1]);
      if (i >= 0) return { index: i, amount };
      // Borne haute exacte de la dernière tranche fermée.
      const j = ranges.findIndex(r => r && amount === r[1]);
      if (j >= 0) return { index: Math.min(j + 1, options.length - 1), amount };
    }
  }

  // Mots en commun : le libellé pèse deux fois plus que la description.
  const words = new Set(tokens(raw));
  if (!words.size) return null;
  const scores = options.map(o => {
    const label = new Set(tokens(o.label));
    const desc = new Set(tokens(o.desc ?? ''));
    let s = 0;
    words.forEach(w => {
      if (label.has(w)) s += 2;
      else if (desc.has(w)) s += 1;
    });
    return s;
  });
  const best = Math.max(...scores);
  if (best < 1) return null;
  if (scores.filter(s => s === best).length > 1) return null;
  // Un seul mot de description en commun ne suffit que si aucune autre option
  // n'en partage un aussi.
  if (best < 2 && scores.some((s, i) => s > 0 && i !== scores.indexOf(best))) return null;
  return { index: scores.indexOf(best) };
}
