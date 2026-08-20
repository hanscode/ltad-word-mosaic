/**
 * Sample data for demos and design review.
 *
 * A live deployment starts from an empty store and fills it from the
 * submissions endpoint; this list only exists so the wall can be shown and
 * tested without a backend.
 */

export const SEED_WORDS = [
  { word: 'HOPE', count: 25 },
  { word: 'STRENGTH', count: 18 },
  { word: 'BREATH', count: 14 },
  { word: 'FAMILY', count: 10 },
  { word: 'DETERMINATION', count: 9 },
  { word: 'COURAGE', count: 7 },
  { word: 'LOVE', count: 6 },
  { word: 'LIFE', count: 5 },
  { word: 'FAITH', count: 5 },
  { word: 'PATIENCE', count: 4 },
  { word: 'GRATITUDE', count: 4 },
  { word: 'TOMORROW', count: 4 },
  { word: 'RESILIENCE', count: 3 },
  { word: 'DONORS', count: 3 },
  { word: 'AIR', count: 3 },
  { word: 'PEACE', count: 3 },
  { word: 'FIGHT', count: 2 },
  { word: 'CALM', count: 2 },
  { word: 'JOY', count: 2 },
  { word: 'TRUST', count: 2 },
  { word: 'FEAR', count: 2 },
  { word: 'GRACE', count: 2 },
  { word: 'ONWARD', count: 1 },
  { word: 'STILL', count: 1 },
  { word: 'HOME', count: 1 },
  { word: 'MOTHER', count: 1 },
  { word: 'STEADY', count: 1 },
  { word: 'LIGHTER', count: 1 },
  { word: 'SUNDAY', count: 1 },
  { word: 'WALK', count: 1 },
  { word: 'AGAIN', count: 1 },
  { word: 'ENOUGH', count: 1 },
  { word: 'CLARITY', count: 1 },
  { word: 'MERCY', count: 1 },
  { word: 'FOREVER', count: 1 }
];

/**
 * Vocabulary for the decorative lung frame — NOT submissions.
 *
 * The frame has to repeat something: a lung cannot be drawn from three words,
 * or from thirty-five unique words at one instance each, and the client
 * reference builds its lungs out of repeated words too. The rule that a
 * duplicate grows instead of repeating applies to CONTRIBUTIONS.
 *
 * These are drawn from the campaign's own language on
 * lungtransplantawarenessday.org/share — the campaign name and abbreviation,
 * the date, the tagline, and the founding sponsor. Deliberately not the
 * feeling-words people submit: when the frame borrowed SEED_WORDS it produced a
 * grey HOPE beside a green HOPE, which read both as a duplicate contribution
 * and as a suggestion of what to type.
 *
 * Multi-word phrases are doing real work here. Every entry is either branding
 * or a phrase, so none of them can be mistaken for a one-word submission, even
 * where a phrase happens to contain a word somebody might send in.
 *
 * `count` drives size and how often a phrase repeats, exactly as it does for
 * real words — it is a weighting for the layout, not a submission tally.
 */
export const FRAME_WORDS = [
  { word: 'LTAD 2026', count: 20 },
  { word: 'OCTOBER 9', count: 15 },
  { word: 'LUNG TRANSPLANT', count: 13 },
  { word: 'INHALE GRATITUDE', count: 11 },
  { word: 'EXHALE HOPE', count: 11 },
  { word: 'AWARENESS DAY', count: 10 },
  { word: 'LUNG BIOENGINEERING', count: 9 },
  { word: 'ONE BREATH', count: 8 },
  { word: 'LTAD', count: 8 },
  { word: 'OCT 9', count: 7 },
  { word: 'TRANSPLANT AWARENESS', count: 6 },
  { word: 'LUNG TRANSPLANT AWARENESS', count: 4 },
  { word: 'OCTOBER 9, 2026', count: 4 },
  { word: 'INHALE GRATITUDE EXHALE HOPE', count: 3 },
  { word: 'LUNG TRANSPLANT AWARENESS DAY', count: 2 },
  { word: 'LUNGTRANSPLANTAWARENESSDAY.ORG', count: 2 }
];

/** Words the live-submission simulator draws from. */
export const DEMO_POOL = [
  'HOPE', 'BREATH', 'STRENGTH', 'FAMILY', 'AIR', 'PATIENCE',
  'DONORS', 'TOMORROW', 'STEADY', 'GRATITUDE', 'FAITH', 'COURAGE'
];
