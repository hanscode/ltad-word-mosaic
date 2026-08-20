/**
 * UI controller for the standalone page. Wires the DOM to the engine and owns
 * nothing else: validation lives in word-store, layout in mosaic-renderer.
 *
 * Query flags for testing:
 *   ?empty=1   start with no words at all
 *   ?demo=0    disable the simulated incoming submissions
 */

import { ASPECT, MosaicRenderer } from './mosaic-renderer.js';
import { WordStore, validate, REJECTIONS } from './word-store.js';
import { SEED_WORDS, DEMO_POOL, FRAME_WORDS } from './seed-data.js';

const HELPER_DEFAULT = 'Enter 1 word • Max 20 characters';
const DEMO_INTERVAL = 7000;
const HIGHLIGHT_HOLD = 1600;

const params = new URLSearchParams(location.search);
const el = (id) => document.getElementById(id);

const dom = {
  stage: el('stage'),
  mask: el('mask'),
  canvasA: el('layer-a'),
  canvasB: el('layer-b'),
  tip: el('tip'),
  empty: el('empty'),
  input: el('word-input'),
  submit: el('submit'),
  helper: el('helper'),
  stats: el('stats'),
  toggleData: el('toggle-data'),
  toggleDemo: el('toggle-demo')
};

const state = {
  demo: params.get('demo') !== '0',
  focused: false,
  timers: { demo: null, highlight: null, resize: null }
};

const store = new WordStore(params.get('empty') === '1' ? [] : SEED_WORDS);

const renderer = new MosaicRenderer({
  canvasA: dom.canvasA,
  canvasB: dom.canvasB,
  maskEl: dom.mask,
  // The frame is campaign branding, not the submission vocabulary: reusing
  // SEED_WORDS here put a grey HOPE beside a green one, which read as a
  // duplicate contribution and as a suggestion of what to type.
  placeholders: FRAME_WORDS,
  onHover: showTip,
  onSwap: (front) => {
    dom.canvasA.dataset.front = String(front === 0);
    dom.canvasB.dataset.front = String(front === 1);
  },
  // The renderer shrinks and then re-lays-out to fit every accepted word. If a
  // word still could not be placed, say so rather than losing it silently —
  // the wall would otherwise disagree with the counters.
  onPlacement: ({ placed, missing, scale }) => {
    if (missing.length) {
      console.warn(
        `[mosaic] ${missing.length} word(s) could not be placed at scale ${scale.toFixed(2)}:`,
        missing.join(', ')
      );
    }
    dom.stage.dataset.placed = String(placed.length);
    dom.stage.dataset.unplaced = String(missing.length);
  }
});

function sizeStage() {
  dom.stage.style.height = `${dom.stage.clientWidth / ASPECT}px`;
}

function setHelper(text, isError = false) {
  dom.helper.textContent = text;
  dom.helper.dataset.error = String(isError);
}

function syncChrome() {
  const total = store.total();
  const unique = store.unique();
  dom.stats.textContent = `${total} ${total === 1 ? 'word' : 'words'} today · ${unique} unique`;
  dom.empty.hidden = total > 0;
  dom.toggleData.textContent = total > 0 ? 'Start empty' : 'Load sample data';
  dom.toggleDemo.textContent = state.demo ? 'Pause live submissions' : 'Resume live submissions';
}

function draw(opts = {}) {
  return renderer.render(store.list(), opts);
}

function commit(word, { silent = false } = {}) {
  const display = store.add(word);
  if (!display) return false;
  syncChrome();
  draw({ highlight: display });
  clearTimeout(state.timers.highlight);
  // Hold the highlight, then let the word settle into its palette colour.
  state.timers.highlight = setTimeout(() => draw(), HIGHLIGHT_HOLD);
  if (!silent) {
    const count = store.countOf(display);
    dom.input.value = '';
    setHelper(`${display} is on the wall — now ${count} ${count === 1 ? 'voice' : 'voices'}`);
  }
  return true;
}

function submit() {
  const raw = dom.input.value.trim();
  const problem = validate(raw);
  if (problem) return setHelper(REJECTIONS[problem], true);
  commit(raw);
}

function showTip(item, dim) {
  if (!item || !dim) {
    dom.tip.hidden = true;
    return;
  }
  // item[1] is the instance's pixel size, not a frequency.
  const count = store.countOf(item[0]);
  const scale = dom.stage.getBoundingClientRect().width / (dom.canvasA.width || 1);
  dom.tip.hidden = false;
  dom.tip.textContent = `${item[0]} · ${count} ${count === 1 ? 'voice' : 'voices'}`;
  dom.tip.style.transform =
    `translate(${Math.round(dim.x * scale + (dim.w * scale) / 2 - 40)}px, ${Math.round(dim.y * scale - 32)}px)`;
}

function runDemo() {
  clearInterval(state.timers.demo);
  if (!state.demo) return;
  state.timers.demo = setInterval(() => {
    if (state.focused || renderer.busy || !store.total()) return;
    commit(DEMO_POOL[Math.floor(Math.random() * DEMO_POOL.length)], { silent: true });
  }, DEMO_INTERVAL);
}

dom.submit.addEventListener('click', submit);
dom.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submit();
});
dom.input.addEventListener('focus', () => { state.focused = true; });
dom.input.addEventListener('blur', () => { state.focused = false; });

dom.toggleData.addEventListener('click', () => {
  if (store.total() > 0) {
    store.clear();
    setHelper('Wall reset. Add the first word.');
  } else {
    store.merge(SEED_WORDS);
    setHelper(HELPER_DEFAULT);
  }
  syncChrome();
  draw();
});

dom.toggleDemo.addEventListener('click', () => {
  state.demo = !state.demo;
  syncChrome();
  runDemo();
});

/**
 * Observes the stage only after the first paint, and only reacts to a real
 * width change: ResizeObserver fires once on observe() with no change, and a
 * layout queued during startup would sit behind the first one on every load.
 */
function watchResize() {
  let lastWidth = dom.stage.clientWidth;
  new ResizeObserver(() => {
    const width = dom.stage.clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    clearTimeout(state.timers.resize);
    state.timers.resize = setTimeout(() => {
      sizeStage();
      draw();
    }, 260);
  }).observe(dom.stage);
}

(async function start() {
  setHelper(HELPER_DEFAULT);
  sizeStage();
  syncChrome();
  await renderer.ready();
  await renderer.renderEmpty(); // ghost wall on screen first; words land over it
  // No per-word stagger: wordcloud2 implements `wait` with one timer per word,
  // and a throttled tab clamps those to ~1s each, stretching a layout to minutes.
  await draw();
  watchResize();
  runDemo();
})();
