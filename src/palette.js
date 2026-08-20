/**
 * Colour palette, sampled from the client reference: greens by weight,
 * cream for the long tail.
 *
 * Tiers are keyed to a word's share of the most-shared word, not to a raw
 * count. On a wall with three submissions the leader still reads as the darkest
 * green, so early walls are saturated rather than uniformly pale.
 */

const TIERS = [
  { min: 0.72, colors: ['#0b5622', '#0f6b2d', '#14472a'] },
  { min: 0.38, colors: ['#1f7a3c', '#2e8b57', '#177046'] },
  { min: 0.16, colors: ['#4aa36b', '#7fb98c', '#c2b581'] },
  { min: 0, colors: ['#a9c7ab', '#d5cb9e', '#a49a63', '#8fb79b'] }
];

export const HIGHLIGHT = '#0b5622';

/** Ghost words shown before anyone has contributed. */
export const PLACEHOLDER_INK = ['#e6eae6', '#dfe5e0', '#eceeea'];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Deterministic colour for a word, given its share of the top count (0–1).
 * The seed string may include the instance size so a word's repeats vary in
 * tone without the layout ever changing colour between renders.
 */
export function colorFor(seed, share) {
  const tier = TIERS.find((t) => share >= t.min);
  return tier.colors[hash(seed) % tier.colors.length];
}

/** Deterministic light-grey tone for a placeholder instance. */
export function placeholderColor(seed) {
  return PLACEHOLDER_INK[hash(seed) % PLACEHOLDER_INK.length];
}
