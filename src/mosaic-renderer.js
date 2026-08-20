/**
 * Rendering layer. Owns the mask, the wordcloud2 layout and the crossfade.
 * It never mutates data — callers pass a frequency list in and get pixels out.
 *
 * How the silhouette is enforced: the mask PNG is opaque white outside the
 * lungs and transparent inside them. It is painted first, then wordcloud2 runs
 * with `clearCanvas: false`, which only places words on transparent pixels.
 * No word can cross the central gap because those pixels are not transparent.
 *
 * How words are kept from disappearing: wordcloud2 silently skips any word it
 * cannot place — `putWord()` returns false and the loop simply moves on. Two
 * mechanisms stop an accepted submission from being lost that way:
 *
 *   1. `shrinkToFit` — wordcloud2 retries an unplaceable word at 3/4 size,
 *      recursing until it fits or reaches `minSize`. This happens INSIDE one
 *      layout pass, which matters: every WordCloud() call fires a
 *      `wordcloudstart` that tears down the previous call's hover listener, so
 *      hand-rolled multi-pass retries would cost the tooltip on every word not
 *      placed by the final pass.
 *   2. A bounded global-scale fallback — the `wordclouddrawn` event reports
 *      which words actually landed, so if any word still failed the whole real
 *      layer is laid out again at a smaller scale. Each attempt is a single
 *      WordCloud() call, so hover stays intact.
 *
 * Anything still unplaced after that is reported through `onPlacement` rather
 * than being swallowed.
 */

import { colorForCount, placeholderColor, HIGHLIGHT } from './palette.js';
import { buildGhostInstances, buildRealInstances, instanceBudget } from './instances.js';

/** Bounding box of the mask asset, so the canvas keeps the lungs' proportions. */
export const ASPECT = 1458 / 1417;

/** Layout sizes are computed against this canvas width, then scaled. */
const REFERENCE_WIDTH = 1400;

/* -------------------------------------------------------- real-word geometry */

/** A word with count 1, as a fraction of canvas height. */
const REAL_MIN_HEIGHT = 0.032;

/** A word at or above COUNT_CEIL, as a fraction of canvas height. */
const REAL_MAX_HEIGHT = 0.105;

/**
 * Absolute legibility floors, in CSS pixels. On a narrow viewport the canvas
 * is short enough that the height fractions alone would produce unreadable
 * text, so these take over.
 */
const REAL_MIN_CSS = 13;
const REAL_FLOOR_CSS = 9;

/**
 * Hard lower bound, in CSS pixels. Only the global-scale fallback can push a
 * word below REAL_FLOOR_CSS, and only when the wall is too crowded to place it
 * otherwise — a very small word still communicates more than a missing one.
 */
const ABSOLUTE_FLOOR_CSS = 4;

/** A single instance may span this fraction of the canvas width. */
const MAX_WORD_WIDTH = 0.46;

/** Global-scale fallback when a layout cannot place every word. */
const MAX_ATTEMPTS = 4;
const SCALE_STEP = 0.82;
const MIN_SCALE = 0.45;

/* ------------------------------------------------------------- ghost geometry */

/** The largest placeholder is drawn at this fraction of the canvas height. */
const GHOST_TOP_HEIGHT = 0.1;

/**
 * Instances offered to the ghost wall.
 *
 * Generous on purpose: the client reference is a lung packed solid with words
 * from edge to edge, and the real layer draws only ONE instance per unique
 * word, so even a busy wall of 35 distinct submissions covers a small fraction
 * of the silhouette. The ghost is what makes the lungs look complete.
 *
 * This is a budget, not a guarantee — placeholders that find no free space are
 * simply skipped, which is exactly the intended behaviour: the ghost recedes on
 * its own as real contributions take up more of the lungs, with no opacity fade
 * needed. A word that cannot be placed costs a wasted grid scan, so the budget
 * and grid below are a deliberate speed/density trade, measured rather than
 * guessed.
 */
const GHOST_BUDGET = 240;

/** Ghost packing precision. Coarser than the real layer to bound the cost. */
const GHOST_GRID_SCALE = 1.3;

const FONT_STACK = 'Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif';

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`mask failed to load: ${src}`));
    img.src = src;
  });
}

function whenDecoded(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve(img);
  return new Promise((res, rej) => {
    img.addEventListener('load', () => res(img), { once: true });
    img.addEventListener('error', () => rej(new Error('mask failed to decode')), { once: true });
  });
}

function waitFor(test, label, timeout = 12000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => {
      if (test()) return res();
      if (Date.now() - t0 > timeout) return rej(new Error(`timeout waiting for ${label}`));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export class MosaicRenderer {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.canvasA        front/back pair for the crossfade
   * @param {HTMLCanvasElement} opts.canvasB
   * @param {string}  [opts.maskSrc]                mask URL, or…
   * @param {HTMLImageElement} [opts.maskEl]        …an <img> already in the document
   * @param {Array}   [opts.placeholders]           {word,count} list for the ghost layer
   * @param {Function} [opts.onHover]               wordcloud2 hover callback
   * @param {Function} [opts.onSwap]                called with the new front index
   * @param {Function} [opts.onPlacement]           called with {placed, missing, scale}
   */
  constructor(opts) {
    this.canvases = [opts.canvasA, opts.canvasB];
    this.maskSrc = opts.maskSrc;
    this.maskEl = opts.maskEl || null;
    this.placeholders = (opts.placeholders || []).map((e) => ({
      display: String(e.word || e.display).toUpperCase(),
      count: e.count
    }));
    this.onHover = opts.onHover;
    this.onSwap = opts.onSwap || (() => {});
    this.onPlacement = opts.onPlacement || (() => {});
    this.front = 0;
    this.mask = null;
    this.busy = false;
    this.pending = null;
    /** Result of the most recent real-word layout, for diagnostics. */
    this.lastPlacement = { placed: [], missing: [], scale: 1 };
    this.options = { rotateRatio: 0.2, density: 1 };
  }

  async ready() {
    this.mask = this.maskEl ? await whenDecoded(this.maskEl) : await loadImage(this.maskSrc);
    await waitFor(() => typeof window.WordCloud === 'function', 'wordcloud2');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return this;
  }

  setOptions(patch) {
    Object.assign(this.options, patch);
    return this;
  }

  /** Sizes a canvas to its container, keeping the lung aspect ratio. */
  measure(canvas) {
    const cssW = Math.max(240, canvas.parentNode.clientWidth);
    const cssH = cssW / ASPECT;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return { cssW, cssH, w: Math.round(cssW * dpr), h: Math.round(cssH * dpr), pr: dpr };
  }

  /** Sizes a canvas to the container and paints the mask into it. */
  prepare(canvas = this.canvases[1 - this.front]) {
    const { cssW, cssH, w, h, pr } = this.measure(canvas);
    this.canvases.forEach((c) => {
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    });
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.mask, 0, 0, w, h);
    return { canvas, ctx, w, h, pr };
  }

  /** Size bounds for the real layer at a given canvas size. */
  realGeometry(w, h, pr) {
    const minSize = Math.max(REAL_MIN_CSS * pr, REAL_MIN_HEIGHT * h);
    const maxSize = Math.max(minSize, REAL_MAX_HEIGHT * h);
    return {
      minSize,
      maxSize,
      maxWidth: w * MAX_WORD_WIDTH,
      // wordcloud2 refuses any word whose size drops to or below this, which
      // bounds how far shrinkToFit may go before we fall back to a re-layout.
      floor: Math.max(REAL_FLOOR_CSS * pr, minSize * 0.5)
    };
  }

  swap() {
    this.front = 1 - this.front;
    this.onSwap(this.front);
  }

  /** Copies the finished layer into its partner, so both layers match. */
  mirror(source) {
    const other = this.canvases[this.canvases.indexOf(source) === 0 ? 1 : 0];
    other.width = source.width;
    other.height = source.height;
    other.getContext('2d').drawImage(source, 0, 0);
  }

  /**
   * Runs one wordcloud2 pass over an already-prepared canvas.
   * Resolves with the words the library reports as drawn and as skipped.
   */
  layout(canvas, instances, { color, wait = 0, hover = null, gridScale = 1, shrinkToFit = false, minSize = 6 }) {
    const scale = canvas.width / REFERENCE_WIDTH;
    return new Promise((resolve) => {
      const placed = [];
      const missing = [];
      const onDrawn = (e) => {
        const word = e.detail.item[0];
        (e.detail.drawn ? placed : missing).push(word);
      };
      const done = () => {
        canvas.removeEventListener('wordcloudstop', done);
        canvas.removeEventListener('wordclouddrawn', onDrawn);
        resolve({ placed, missing });
      };
      canvas.addEventListener('wordcloudstop', done);
      canvas.addEventListener('wordclouddrawn', onDrawn);
      window.WordCloud(canvas, {
        // The tuple's weight IS the pixel size: instance sizes are computed
        // up-front from each word's own count, so a word starts small and grows
        // as it is shared.
        list: instances.map((it) => [it.text, it.size]),
        weightFactor: (size) => size,
        // A coarse grid is the single biggest lever on layout cost: every
        // instance that cannot be placed scans the whole grid before giving up.
        gridSize: Math.max(6, Math.round(12 * scale * this.options.density * gridScale)),
        fontFamily: FONT_STACK,
        fontWeight: (word, size) => (size > 52 * scale ? '900' : size > 22 * scale ? '800' : '700'),
        color,
        minSize,
        rotateRatio: this.options.rotateRatio,
        rotationSteps: 1,
        minRotation: -Math.PI / 2,
        maxRotation: -Math.PI / 2,
        ellipticity: 1,
        shuffle: false,
        // Real words shrink to fit rather than being dropped; the ghost layer
        // leaves this off, where a skipped placeholder costs nothing and the
        // shrink cycle would be paid on many more instances.
        shrinkToFit,
        drawOutOfBound: false,
        backgroundColor: 'rgba(255,255,255,0)',
        clearCanvas: false,
        wait,
        hover,
        origin: [canvas.width / 2, canvas.height * 0.45]
      });
    });
  }

  /**
   * Fills whatever the real words did not take with light-grey placeholders,
   * so the lungs read as a solid mass of type in every state.
   *
   * The ghost is laid out on a scratch canvas SEEDED with the finished real
   * layer, and that is the whole trick: with `clearCanvas: false` wordcloud2
   * rebuilds its occupancy grid from the canvas pixels, so seeding it with the
   * mask *and* the real words makes both act as obstacles and a placeholder can
   * never be positioned across a submission.
   *
   * Laying the two layers out independently — which is what a ghost cached per
   * canvas size has to do — places grey words in the same space as the green
   * ones. `destination-over` then stops the grey from covering the green, but
   * not from being interleaved through and around it, which reads as collided,
   * unreadable text. The pale ghost this replaced merely hid that.
   *
   * Running on a scratch canvas rather than the visible one also protects the
   * tooltip: every WordCloud() call fires a `wordcloudstart` that tears down
   * the previous call's hover listener on THAT element, so the real layer stays
   * interactive only while it is the last layout run on the visible canvas.
   *
   * Consequence: the ghost cannot be cached between renders any more, since it
   * depends on where the real words landed. GHOST_BUDGET and GHOST_GRID_SCALE
   * are tuned for a cost paid on every render.
   */
  async paintGhost(source, ctx, w, h) {
    if (!this.placeholders.length) return;
    const scratch = this.scratch || (this.scratch = document.createElement('canvas'));
    scratch.width = w;
    scratch.height = h;
    const sctx = scratch.getContext('2d');
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(source, 0, 0);

    const instances = buildGhostInstances(this.placeholders, w / REFERENCE_WIDTH, {
      maxSize: h * GHOST_TOP_HEIGHT,
      budget: GHOST_BUDGET,
      maxWidth: w * MAX_WORD_WIDTH
    });
    await this.layout(scratch, instances, {
      gridScale: GHOST_GRID_SCALE,
      color: (word, size) => placeholderColor(word + Math.round(size))
    });

    // `destination-over` paints only where the visible canvas is still
    // transparent — inside the lungs and clear of every real word — so the
    // seeded mask and real words in the scratch copy are ignored, and the
    // contributions always stay on top.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
  }

  /**
   * The wall before anyone has contributed: the composition drawn in light
   * grey, so the lungs read as words waiting to be filled in. Both layers are
   * painted, so a reset can never leave a stale word canvas showing.
   */
  async renderEmpty() {
    if (!this.mask) return;
    if (this.busy) {
      this.pending = { list: [], highlight: null, wait: 0 };
      return;
    }
    this.busy = true;
    const { canvas, ctx, w, h } = this.prepare();
    // Nothing submitted yet, so the ghost has the whole silhouette to itself.
    await this.paintGhost(canvas, ctx, w, h);
    this.lastPlacement = { placed: [], missing: [], scale: 1 };
    this.mirror(canvas);
    this.swap();
    this.busy = false;
    return this.drain();
  }

  /**
   * Lays out `list` into the back canvas, then brings it forward.
   * Concurrent calls coalesce: the newest request runs after the current one.
   */
  async render(list, { highlight = null, wait = 0 } = {}) {
    if (!this.mask) return;
    if (this.busy) {
      this.pending = { list, highlight, wait };
      return;
    }
    if (!list.length) return this.renderEmpty();
    this.busy = true;

    const target = this.canvases[1 - this.front];
    const counts = new Map(list.map((e) => [e.display, e.count]));
    const color = (word) =>
      highlight && word === highlight ? HIGHLIGHT : colorForCount(word, counts.get(word) || 1);

    let scale = 1;
    let result = { placed: [], missing: [] };
    let ctx;
    let w;
    let h;

    // Attempt the real layer at full size; if wordcloud2 still could not place
    // every word after shrinking, lay the whole layer out again smaller. The
    // canvas is re-prepared each time, so a failed attempt leaves nothing behind.
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const prepared = this.prepare(target);
      ctx = prepared.ctx;
      w = prepared.w;
      h = prepared.h;
      const geom = this.realGeometry(w, h, prepared.pr);
      const instances = buildRealInstances(list, { ...geom, scale });
      result = await this.layout(target, instances, {
        wait,
        hover: this.onHover,
        shrinkToFit: true,
        // The floor scales with the instances. Holding it fixed would let the
        // fallback reject the very words it is trying to rescue: a scaled-down
        // word would fall under the floor and wordcloud2 would refuse it
        // outright, so shrinking the layer would lose more words than it saved.
        minSize: Math.max(ABSOLUTE_FLOOR_CSS * prepared.pr, geom.floor * scale),
        color
      });
      if (!result.missing.length || scale <= MIN_SCALE) break;
      scale = Math.max(MIN_SCALE, scale * SCALE_STEP);
    }

    this.lastPlacement = { placed: result.placed, missing: result.missing, scale };
    this.onPlacement(this.lastPlacement);

    // Placeholders fill the space the submissions left over, so the lungs read
    // as full from the first word onward. They are laid out against the real
    // words, so nothing is drawn across a contribution.
    await this.paintGhost(target, ctx, w, h);

    // Visibility is owned by the caller: a React host would otherwise clobber
    // inline opacity on its next render.
    this.swap();
    this.busy = false;
    return this.drain();
  }

  /** Runs the most recent request that arrived while a layout was in flight. */
  drain() {
    if (!this.pending) return;
    const next = this.pending;
    this.pending = null;
    return this.render(next.list, next);
  }
}
