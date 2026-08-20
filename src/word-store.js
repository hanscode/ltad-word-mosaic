/**
 * Data layer. Owns word counts and nothing else — no DOM, no rendering.
 *
 * To move this to a live backend, keep the same public surface and replace the
 * in-memory Map: `add()` POSTs a submission, and a poll or socket message
 * merges the authoritative counts back in via `merge()`.
 */

export const MAX_LENGTH = 20;
const VALID = /^[\p{L}\p{N}'’-]+$/u;

const key = (w) => String(w).toLowerCase().replace(/[’']/g, "'");

export const REJECTIONS = {
  empty: 'Add a word first — one word, up to 20 characters.',
  multiword: 'One word only, please.',
  tooLong: `Max ${MAX_LENGTH} characters.`,
  characters: 'Letters and numbers only.'
};

/** Returns null when acceptable, otherwise a key of REJECTIONS. */
export function validate(raw) {
  const clean = String(raw || '').trim();
  if (!clean) return 'empty';
  if (/\s/.test(clean)) return 'multiword';
  if (clean.length > MAX_LENGTH) return 'tooLong';
  if (!VALID.test(clean)) return 'characters';
  return null;
}

export class WordStore {
  constructor(seed = []) {
    this.map = new Map();
    this.merge(seed);
  }

  /** Bulk-loads {word, count} entries, replacing any existing count. */
  merge(entries) {
    entries.forEach(({ word, count }) => {
      this.map.set(key(word), { display: String(word).toUpperCase(), count });
    });
    return this;
  }

  /** Adds one submission. Returns the display form, or null if invalid. */
  add(raw) {
    if (validate(raw)) return null;
    const clean = String(raw).trim();
    const k = key(clean);
    const existing = this.map.get(k);
    if (existing) {
      existing.count += 1;
      return existing.display;
    }
    const display = clean.toUpperCase();
    this.map.set(k, { display, count: 1 });
    return display;
  }

  clear() {
    this.map.clear();
    return this;
  }

  /** Sorted descending — a stable order keeps successive layouts similar. */
  list() {
    return [...this.map.values()].sort(
      (a, b) => b.count - a.count || a.display.localeCompare(b.display)
    );
  }

  total() {
    return [...this.map.values()].reduce((s, e) => s + e.count, 0);
  }

  unique() {
    return this.map.size;
  }

  countOf(display) {
    const e = this.map.get(key(display));
    return e ? e.count : 0;
  }
}
