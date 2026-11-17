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
  const re = /(\d{1,3}(?:[   .,]\d{3})+|\d+)(?:[.,](\d{1,2})(?!\d))?\s*(millions?|mille|thousand|k|m)?(?![a-z])/gi;
  let m: RegExpExecArray | null;
  const t = norm(text);
  while ((m = re.exec(t))) {
    const whole = Number(m[1].replace(/[   .,]/g, ''));
    const value = m[2] ? whole + Number(`0.${m[2]}`) : whole;
    const unit = (m[3] || '').toLowerCase();
    const mult = unit.startsWith('m') && unit !== 'mille' ? 1_000_000 : unit === 'k' || unit === 'mille' || unit === 'thousand' ? 1_000 : 1;
    out.push(Math.round(value * mult));
  }
  return out;
}

/** Tranche de montants décrite par un libellé d'option, si c'en est une. */
export function optionRange(label: string): [number, number] | null {
  const amounts = parseAmounts(label);
  if (!amounts.length) return null;
  const t = norm(label);
  if (/moins de|jusqu a|under|less than|up to|below|</.test(t)) return [0, amounts[0]];
  if (/plus de|au-dela|over|more than|above|>/.test(t)) return [amounts[0], Infinity];
  if (amounts.length >= 2) return [Math.min(amounts[0], amounts[1]), Math.max(amounts[0], amounts[1])];
  return null;
}

const STOP = new Set([
  'les', 'des', 'une', 'pour', 'avec', 'dans', 'que', 'qui', 'est', 'sur', 'mon', 'mes', 'par', 'pas', 'plus', 'moins',
  'veux', 'voudrais', 'aimerais', 'cherche', 'souhaite', 'bien', 'tres', 'peu', 'aux', 'ses', 'son', 'vous', 'nous', 'moi',
  // anglais
  'the', 'and', 'for', 'with', 'want', 'would', 'like', 'looking', 'need', 'from', 'that', 'this', 'into', 'have', 'some', 'year', 'years', 'month',
  'every', 'each', 'all', 'very', 'more', 'most', 'best', 'good', 'out', 'about', 'around', 'income', 'budget',
]);
const stem = (w: string) => (w.length > 5 ? w.slice(0, 5) : w);
const tokens = (s: string) =>
  norm(s)
    // Lettres de tous les alphabets (cyrillique, arabe…), pas seulement latin.
    .split(/[^\p{L}\p{N}]+/u)
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

// ── Message libre : comprendre plusieurs informations d'un coup ────────────

export type ProjectId = 'locatif' | 'residence' | 'location';

const PROJECT_CUES: Record<ProjectId, RegExp[]> = {
  locatif: [
    /invest/, /rendement/, /rentab/, /placer|placement/, /airbnb/, /cash ?flow/, /plus[- ]value/, /revenus? (locatif|passif|complementaire)/,
    /(toucher|percevoir|encaisser|generer|recevoir)\b.{0,25}\bloyers?/, /loyers? (mensuel|chaque mois|tous les mois)/, /mettre en location/, /pour (le |la )?louer/,
    // anglais
    /\byield/, /\breturns?\b|\broi\b/, /rental income|passive income|monthly income/, /rent(ing)? (it )?out/, /buy[- ]to[- ]let/, /capital (gain|growth|appreciation)/,
    /(collect|earn|receive|get)\b.{0,25}\brent\b/, /\blandlord/,
    // espagnol, russe, chinois, arabe, afrikaans (texte déjà sans accents ni « й/ё »)
    /invert|inversion/, /rentabilidad/, /ingresos? (por alquiler|pasivos)/, /cobrar .{0,20}alquiler/, /plusvalia/,
    /инвест/, /доходност/, /сдавать/, /арендн\S* доход/, /пассивн/,
    /投资/, /收益|回报/, /出租|收租|租金收入/,
    /استثمار|استثمر|عائد|للتأجير|دخل ايجاري|دخل إيجاري/,
    /bele|beleg/, /opbrengs/, /verhuur/, /huurinkomste/,
  ],
  residence: [
    /y vivre|vivre a|vivre la[- ]bas/, /habiter/, /m ?installer|nous installer|s ?installer/, /residence (principale|secondaire)/, /pied[- ]a[- ]terre/,
    /expatri/, /demenag/, /(ma|notre) famille/, /pour (moi|nous)\b/,
    // anglais
    /\blive (in|there)\b|to live\b|living in/, /\bmove (to|in)\b|\bmoving\b|relocat/, /(main|primary|second) (home|residence)/, /\b(my|our) (family|kids|children)/,
    /for (myself|ourselves|me|us)\b/, /\bown home\b|\ba home\b/, /golden visa/,
    /\bvivir\b/, /mudar/, /mi familia/, /para (mi|nosotros)\b/,
    /жить/, /переез/, /для себя/, /семь/,
    /自住|居住|定居|搬家|全家|家人/,
    /للسكن|أسكن|اسكن|أعيش|اعيش|الانتقال|عائلتي/,
    /\bwoon\b|intrek|verhuis/, /my gesin/, /vir myself/,
  ],
  location: [
    /louer un|louer une/, /(cherche|trouver|besoin d ?une?) .{0,20}location/, /a louer/, /locataire/, /en location\b/, /loyer (max|maximum)/,
    /budget .{0,15}(par mois|mensuel)/, /\d\s*(€|euros?|aed)?\s*(par mois|\/ ?mois|mensuel)\b.{0,20}(max|loyer)/,
    // anglais
    /\brent (a|an)\b/, /(looking for|find|need) .{0,20}(a rental|to rent|for rent)/, /\bto rent\b|\bfor rent\b/, /\btenant\b/, /\blease\b/,
    /\d\s*(€|eur|euros?|aed|usd|\$|£)?\s*(per month|a month|\/ ?month|monthly|pcm)/,
    /alquilar un|alquilar una/, /busco .{0,20}alquiler/, /en alquiler\b/, /inquilino/, /al mes\b/,
    /снять|сниму/, /арендовать/, /в месяц/,
    /租房|求租|想租|月租/,
    /استئجار|أستأجر|استأجر|للإيجار|للايجار|شهريا/,
    /huur\s+n\b/, /te huur\b/, /per maand/, /huurder/,
  ],
};

/** Projet décrit par un message libre (investir pour louer, y vivre, louer), ou null si ce n'est pas clair. */
export function detectProject(text: string): ProjectId | null {
  const t = norm(text);
  const score = (id: ProjectId) => PROJECT_CUES[id].filter(re => re.test(t)).length;
  const scores: Array<[ProjectId, number]> = [
    ['locatif', score('locatif')],
    ['residence', score('residence')],
    ['location', score('location')],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] === 0 || scores[0][1] === scores[1][1]) return null;
  return scores[0][0];
}

export type MatchableStep = { id: string; options: MatchableOption[] };
export type ExtractedAnswer = { stepId: string; index: number; amount?: number };

/**
 * Tout ce qu'un message libre renseigne parmi les questions restantes.
 * La question en cours bénéficie du rapprochement complet (numéro, mots de la
 * description) ; les autres ne sont remplies que sur un indice fort — un
 * montant plausible pour leurs tranches, ou un mot de leur libellé.
 */
export function extractAnswers(steps: MatchableStep[], text: string, currentStepId?: string): ExtractedAnswer[] {
  const out: ExtractedAnswer[] = [];
  const taken = new Set<string>();
  const add = (a: ExtractedAnswer) => {
    if (taken.has(a.stepId)) return;
    taken.add(a.stepId);
    out.push(a);
  };

  // 1. Montants → la question à tranches pour laquelle ils sont plausibles.
  const rangeSteps = steps
    .map(s => ({ s, ranges: s.options.map(o => optionRange(o.label)) }))
    .filter(x => x.ranges.filter(Boolean).length >= 2);
  for (const amount of parseAmounts(text)) {
    let best: { stepId: string; index: number; gap: number } | null = null;
    for (const { s, ranges } of rangeSteps) {
      if (taken.has(s.id)) continue;
      const bounds = ranges.flatMap(r => (r ? [r[0], r[1]] : [])).filter(v => v > 0 && Number.isFinite(v));
      if (!bounds.length) continue;
      const lo = Math.min(...bounds);
      const hi = Math.max(...bounds);
      if (amount < lo * 0.15 || amount > hi * 20) continue;
      let index = ranges.findIndex(r => r && amount >= r[0] && amount < r[1]);
      if (index < 0) index = amount < lo ? ranges.findIndex(Boolean) : ranges.length - 1;
      // Distance (en ordres de grandeur) au cœur des tranches : départage deux
      // questions à tranches, par exemple budget d'achat et loyer mensuel.
      const gap = Math.abs(Math.log10(amount) - Math.log10(Math.sqrt(lo * hi)));
      if (!best || gap < best.gap) best = { stepId: s.id, index, gap };
    }
    if (best) add({ stepId: best.stepId, index: best.index, amount });
  }

  // 2. La question en cours : rapprochement complet.
  const current = steps.find(s => s.id === currentStepId);
  if (current && !taken.has(current.id)) {
    const hit = matchAnswer(current.options, text);
    if (hit) add({ stepId: current.id, ...hit });
  }

  // 3. Les autres questions : un mot du libellé, sans ambiguïté.
  const words = new Set(tokens(text));
  for (const s of steps) {
    if (taken.has(s.id) || s.id === currentStepId) continue;
    const scores = s.options.map(o => {
      let n = 0;
      new Set(tokens(o.label)).forEach(w => {
        if (words.has(w)) n += 1;
      });
      return n;
    });
    const top = Math.max(...scores);
    if (top >= 1 && scores.filter(v => v === top).length === 1 && words.size >= 1) {
      // Un seul mot commun ne suffit que s'il est distinctif (long).
      const label = s.options[scores.indexOf(top)].label;
      const shared = tokens(label).filter(w => words.has(w));
      if (top >= 2 || shared.some(w => w.length >= 5)) add({ stepId: s.id, index: scores.indexOf(top) });
    }
  }
  return out;
}
