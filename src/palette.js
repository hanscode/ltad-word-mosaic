/**
 * Colour palette, sampled from the client reference: campaign greens for real
 * submissions, light grey for the decorative ghost layer.
 *
 * Tiers are keyed to a word's ABSOLUTE count, not to its share of the current
 * leader. A share-based scale paints the first submission in the darkest green
 * simply because it is the only word on the wall; keying to the count means a
 * word starts light and visibly deepens as it is shared, which is the behaviour
 * the campaign is trying to communicate.
 *
 * Ordered lightest → darkest. Every colour here already existed in the
 * reference palette; no new hues are introduced.
 */

/**
 * Count 1 starts at a clear mid-light green rather than the palest tint in the
 * range. The ghost behind it is a readable grey that carries the lung shape, so
 * a very pale first submission sinks into that texture instead of reading as
 * somebody's contribution. Each tier is darker than the one above, so a word
 * still visibly deepens every time it is shared.
 */
/**
 * Greens by weight, cream for the long tail — the split the reference uses.
 *
 * Lightness is what encodes the count: each tier is darker than the one above,
 * so a word visibly deepens every time it is shared. Within the low tiers a
 * word is deterministically either green or cream, which is where the
 * reference's warm accent comes from. The cream ramp only has two usable steps,
 * so words graduate into the greens once they gain real traction — the long
 * tail is cream, popular words go green and keep darkening.
 *
 * `#d5cb9e`, the palest cream in the supplied palette, is deliberately unused:
 * at count 1 it is too close in weight to the grey frame behind it, and a first
 * submission has to read as a contribution. Add it to the `min: 0` tier if the
 * client would rather have the extra warmth than the extra contrast.
 */
const COUNT_TIERS = [
  { min: 32, colors: ['#0b5622', '#14472a'] },
  { min: 16, colors: ['#0f6b2d'] },
  { min: 8, colors: ['#177046'] },
  { min: 4, colors: ['#1f7a3c'] },
  { min: 2, colors: ['#2e8b57', '#a49a63'] },
  { min: 0, colors: ['#4aa36b', '#c2b581'] }
];

/** Momentary colour for a word that was just submitted. */
export const HIGHLIGHT = '#0b5622';

/**
 * Ghost words shown behind the real wall.
 *
 * Watermark weight, deliberately. These sit BEHIND the contributions and must
 * not read as another colour in the word palette alongside the greens and
 * creams — they are the paper, not the ink.
 *
 * This is only affordable because the frame is dense: DENSITY carries the lung
 * shape, so darkness does not have to. The original frame looked washed out at
 * this lightness because it was also sparse (80 instances on a coarse grid);
 * at ~240 tightly packed instances the silhouette reads clearly even in a tone
 * this faint. Darkening these values makes the grey compete with the real words
 * again — see GHOST_BUDGET in mosaic-renderer.js before reaching for a darker
 * grey to fix a thin-looking lung.
 */
export const PLACEHOLDER_INK = ['#e6eae6', '#e0e5e1', '#ebeeeb', '#e3e7e3'];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Deterministic colour for a real word, from its own count.
 *
 * The seed is the word alone — deliberately NOT the rendered size. wordcloud2
 * may shrink an instance to make it fit, and seeding on size would let a word
 * change colour between two renders that have identical data.
 */
export function colorForCount(word, count) {
  const n = Math.max(1, Number(count) || 1);
  const tier = COUNT_TIERS.find((t) => n >= t.min);
  return tier.colors[hash(word) % tier.colors.length];
}

/** Deterministic light-grey tone for a placeholder instance. */
export function placeholderColor(seed) {
  return PLACEHOLDER_INK[hash(seed) % PLACEHOLDER_INK.length];
}
