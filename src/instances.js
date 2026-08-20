/**
 * Turns the frequency table into drawable word instances.
 *
 * There are two distinct layers, and they have opposite requirements:
 *
 * 1. THE REAL LAYER — accepted submissions. Every unique word gets exactly ONE
 *    instance. A repeated submission never adds a second copy; it raises the
 *    word's count, which raises its size and darkens its colour. See
 *    `buildRealInstances`.
 *
 * 2. THE GHOST LAYER — decorative placeholders behind the real words. These do
 *    repeat, largest once then progressively smaller, because a few dozen words
 *    cannot fill the lungs at a readable size on their own. Ghost words are not
 *    submissions and never affect counts. See `buildGhostInstances`.
 *
 * Sizing is ABSOLUTE, driven by a word's own count — not by its share of the
 * current leader. A share-based scale makes the first submission render at the
 * maximum size simply because it is the only word on the wall, which leaves it
 * nowhere to grow.
 */

/* ---------------------------------------------------------------- real layer */

/**
 * Count at which a word reaches `maxSize`. Counts above this keep the maximum.
 */
export const COUNT_CEIL = 40;

/**
 * Size for a word, from its own count. Logarithmic.
 *
 * Why logarithmic rather than linear or square-root:
 *
 *   - linear      the 1 → 2 step is nearly invisible when the ceiling is high,
 *                 and the curve never saturates, so one runaway word dwarfs the
 *                 wall.
 *   - sqrt        grows too fast at the low end — a count of 3 already reads as
 *                 a leader — and it also never really flattens.
 *   - logarithmic large relative jumps exactly where the campaign needs visible
 *                 feedback (1 → 2 → 3, "my word grew"), then a gentle flattening
 *                 so popularity still reads as counts diverge without any single
 *                 word taking over the lungs.
 *
 * Normalised so count 1 sits at `minSize` and `COUNT_CEIL` reaches `maxSize`:
 *
 *   t = ln(count) / ln(COUNT_CEIL),  clamped to 0…1
 *
 * At minSize 3.2% / maxSize 10.5% of canvas height this yields roughly
 * 1 → 3.2%, 2 → 4.6%, 3 → 5.4%, 5 → 6.4%, 10 → 7.8%, 20 → 9.1%, 40+ → 10.5%.
 */
export function sizeForCount(count, { minSize, maxSize, ceil = COUNT_CEIL }) {
  const n = Math.max(1, Number(count) || 1);
  const t = Math.min(1, Math.log(n) / Math.log(ceil));
  return minSize + (maxSize - minSize) * t;
}

/**
 * One drawable instance per unique word.
 *
 * @param {Array<{display:string,count:number}>} list  descending by count
 * @param {object} opts
 * @param {number} opts.minSize   px size of a word with count 1
 * @param {number} opts.maxSize   px size of a word at or above COUNT_CEIL
 * @param {number} opts.maxWidth  px a single instance may span
 * @param {number} [opts.scale]   multiplier applied to every instance, used by
 *                                the renderer's fallback when a layout cannot
 *                                place every word at full size
 */
export function buildRealInstances(list, { minSize, maxSize, maxWidth = Infinity, scale = 1 }) {
  return list.map((e) => {
    const target = sizeForCount(e.count, { minSize, maxSize }) * scale;
    // Long words are capped by width: an instance wider than the lungs can
    // never be placed, and every failed placement scans the whole grid first.
    // wordcloud2's shrinkToFit handles the remainder, but capping up-front
    // avoids paying for the shrink cycle on every render.
    const widthCap = maxWidth / (0.62 * e.display.length);
    return {
      text: e.display,
      size: Math.max(1, Math.min(target, widthCap)),
      count: e.count
    };
  })
    // Largest first: wordcloud2 places in list order and big words need the
    // open space. Ties keep the store's order, which is stable between renders.
    .sort((a, b) => b.size - a.size);
}

/* --------------------------------------------------------------- ghost layer */

export const TUNING = {
  growth: 0.62,          // exponent applied to a word's share of the top count
  instancesPerWord: 6,   // instance budget granted per placeholder entry
  minInstances: 8,
  maxInstances: 180,     // caps layout cost
  maxRepeats: 120,
  // Repeats shrink on a gentle curve: a few large words per term, then a long
  // tail of medium and small ones. The reference lung is dense at every size,
  // and a fast falloff leaves visible gaps between the big words. This is
  // affordable only because the ghost layout is cached per canvas size.
  stepDown: 0.48,
  stepCurve: 1,
  minSize: 4.2           // px at reference scale; smaller instances are dropped
};

/** Instance budget for a placeholder set totalling `total` counts. */
export function instanceBudget(total, tuning = TUNING) {
  const t = { ...TUNING, ...tuning };
  return Math.min(t.maxInstances, Math.max(t.minInstances, Math.round(total * t.instancesPerWord)));
}

/**
 * Repeating instances for the decorative ghost wall. Share-based sizing is
 * correct here: the placeholder set is fixed, so there is no "only word on the
 * wall" problem, and the repeats are what give the lungs their texture.
 *
 * @param {Array<{display:string,count:number}>} list  descending by count
 * @param {number} scale     canvas width / reference width
 * @param {object} opts
 * @param {number} opts.maxSize   px size of the most-shared placeholder
 * @param {number} opts.budget    total instances to distribute
 * @param {number} opts.maxWidth  px a single instance may span
 */
export function buildGhostInstances(list, scale, { maxSize, budget, maxWidth = Infinity }, tuning = TUNING) {
  const t = { ...TUNING, ...tuning };
  if (!list.length) return [];

  const topCount = list[0].count;
  const total = list.reduce((s, e) => s + e.count, 0);
  const out = [];

  list.forEach((e) => {
    const share = Math.pow(e.count / topCount, t.growth);
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
