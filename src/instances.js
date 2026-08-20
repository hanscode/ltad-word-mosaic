/**
 * Turns the frequency table into the list of drawable word instances.
 *
 * Two problems this solves:
 *
 * 1. Density. A conventional tag cloud of a few dozen unique words cannot fill
 *    the lungs at a readable size. The client reference repeats each word —
 *    largest once, then progressively smaller — so repeats supply the texture.
 *
 * 2. The early wall. Sizes are RELATIVE, never absolute: the most-shared word
 *    always renders at `maxSize`, and every other word is sized as a share of
 *    it. The number of instances is budgeted from the total submission count.
 *    So the first word arrives large and legible, and the lungs visibly densify
 *    as more words come in rather than starting as a few specks.
 */

export const TUNING = {
  growth: 0.62,          // exponent applied to a word's share of the top count
  instancesPerWord: 6,   // instance budget granted per submission received
  minInstances: 8,       // …so a wall of one word still composes
  maxInstances: 180,     // caps layout cost once the wall is full
  maxRepeats: 120,
  // Repeats shrink fast on purpose: a handful of large words per term, then a
  // long tail of small ones. Slower falloff produces many big words that the
  // layout cannot place, which is disproportionately expensive.
  stepDown: 0.55,
  stepCurve: 1,
  minSize: 6.5           // px at reference scale; smaller instances are dropped
};

/** Instance budget for a wall that has received `total` submissions. */
export function instanceBudget(total, tuning = TUNING) {
  const t = { ...TUNING, ...tuning };
  return Math.min(t.maxInstances, Math.max(t.minInstances, Math.round(total * t.instancesPerWord)));
}

/**
 * @param {Array<{display:string,count:number}>} list  descending by count
 * @param {number} scale     canvas width / reference width
 * @param {object} opts
 * @param {number} opts.maxSize   px size of the most-shared word
 * @param {number} opts.budget    total instances to distribute
 * @param {number} opts.maxWidth  px a single instance may span
 */
export function buildInstances(list, scale, { maxSize, budget, maxWidth = Infinity }, tuning = TUNING) {
  const t = { ...TUNING, ...tuning };
  if (!list.length) return [];

  const topCount = list[0].count;
  const total = list.reduce((s, e) => s + e.count, 0);
  const out = [];

  list.forEach((e) => {
    const share = Math.pow(e.count / topCount, t.growth);
    // Long words are capped by width: an instance wider than the lungs can
    // never be placed, and every failed placement scans the whole grid.
    const widthCap = maxWidth / (0.62 * e.display.length);
    const base = Math.min(maxSize * share, widthCap);
    const reps = Math.min(t.maxRepeats, Math.max(2, Math.round((budget * e.count) / total)));
    for (let k = 0; k < reps; k++) {
      const size = base / Math.pow(1 + t.stepDown * k, t.stepCurve);
      if (size < t.minSize * scale) break;
      out.push({ text: e.display, size, count: e.count });
    }
  });

  return out.sort((a, b) => b.size - a.size);
}
