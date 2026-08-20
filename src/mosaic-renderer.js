/**
 * Rendering layer. Owns the mask, the wordcloud2 layout and the crossfade.
 * It never mutates data — callers pass a frequency list in and get pixels out.
 *
 * How the silhouette is enforced: the mask PNG is opaque white outside the
 * lungs and transparent inside them. It is painted first, then wordcloud2 runs
 * with `clearCanvas: false`, which only places words on transparent pixels.
 * No word can cross the central gap because those pixels are not transparent.
 */

import { colorFor, placeholderColor, HIGHLIGHT } from './palette.js';
import { buildInstances, instanceBudget } from './instances.js';

/** Bounding box of the mask asset, so the canvas keeps the lungs' proportions. */
export const ASPECT = 1458 / 1417;

/** Layout sizes are computed against this canvas width, then scaled. */
const REFERENCE_WIDTH = 1400;

/** The most-shared word is always drawn at this fraction of the canvas height. */
const TOP_WORD_HEIGHT = 0.1;

/** A single instance may span this fraction of the canvas width. */
const MAX_WORD_WIDTH = 0.46;

/** Instances used for the ghost wall — enough to read, cheap to lay out. */
const PLACEHOLDER_BUDGET = 80;

/** Submissions at which the ghost wall has faded out completely. */
const GHOST_FADE_AT = 60;

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
   * @param {Array}   [opts.placeholders]           {word,count} list for the empty wall
   * @param {Function} [opts.onHover]               wordcloud2 hover callback
   * @param {Function} [opts.onSwap]                called with the new front index
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
    this.front = 0;
    this.mask = null;
    this.busy = false;
    this.pending = null;
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
    return { cssW, cssH, w: Math.round(cssW * dpr), h: Math.round(cssH * dpr) };
  }

  /** Sizes a canvas to the container and paints the mask into it. */
  prepare(canvas = this.canvases[1 - this.front]) {
    const { cssW, cssH, w, h } = this.measure(canvas);
    this.canvases.forEach((c) => {
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    });
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.mask, 0, 0, w, h);
    return { canvas, ctx, w, h };
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

  /** Runs one wordcloud2 pass over an already-prepared canvas. */
  layout(canvas, instances, { color, wait = 0, hover = null, gridScale = 1 }) {
    const scale = canvas.width / REFERENCE_WIDTH;
    return new Promise((resolve) => {
      const done = () => {
        canvas.removeEventListener('wordcloudstop', done);
        resolve();
      };
      canvas.addEventListener('wordcloudstop', done);
      window.WordCloud(canvas, {
        // The tuple's weight IS the pixel size: instance sizes are computed
        // up-front so a word's repeats step down the way the reference does,
        // and so early walls compose instead of rendering as specks.
        list: instances.map((it) => [it.text, it.size]),
        weightFactor: (size) => size,
        // A coarse grid is the single biggest lever on layout cost: every
        // instance that cannot be placed scans the whole grid before giving up.
        gridSize: Math.max(6, Math.round(12 * scale * this.options.density * gridScale)),
        fontFamily: FONT_STACK,
        fontWeight: (word, size) => (size > 52 * scale ? '900' : size > 22 * scale ? '800' : '700'),
        color,
        minSize: 6,
        rotateRatio: this.options.rotateRatio,
        rotationSteps: 1,
        minRotation: -Math.PI / 2,
        maxRotation: -Math.PI / 2,
        ellipticity: 1,
        shuffle: false,
        shrinkToFit: false,
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
   * Builds (and caches) the ghost layer: the placeholder composition in light
   * grey, on a transparent ground. Cached because it is laid out once per size
   * and then composited under every subsequent render for a few pixels of cost.
   */
  async buildGhost(w, h) {
    if (this.ghost && this.ghost.width === w && this.ghost.height === h) return this.ghost;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.mask, 0, 0, w, h);
    const instances = buildInstances(this.placeholders, w / REFERENCE_WIDTH, {
      maxSize: h * TOP_WORD_HEIGHT,
      budget: PLACEHOLDER_BUDGET,
      maxWidth: w * MAX_WORD_WIDTH
    });
    await this.layout(canvas, instances, {
      // Coarser grid: the ghost is background texture, so it does not need the
      // packing precision (or the cost) of the real wall.
      gridScale: 1.6,
      color: (word, size) => placeholderColor(word + Math.round(size))
    });
    // Knock the mask's opaque surround back out, leaving only the ghost words.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(this.mask, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    this.ghost = canvas;
    return canvas;
  }

  /** Paints the ghost layer beneath whatever words already landed. */
  async compositeGhost(ctx, w, h, alpha) {
    if (!this.placeholders.length || alpha <= 0) return;
    const ghost = await this.buildGhost(w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.globalAlpha = alpha;
    ctx.drawImage(ghost, 0, 0);
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
    await this.compositeGhost(ctx, w, h, 1);
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

    const { ctx, w, h } = this.prepare();
    const counts = new Map(list.map((e) => [e.display, e.count]));
    const total = list.reduce((sum, e) => sum + e.count, 0);
    const topCount = list[0].count;
    const instances = buildInstances(list, w / REFERENCE_WIDTH, {
      maxSize: h * TOP_WORD_HEIGHT,
      budget: instanceBudget(total),
      maxWidth: w * MAX_WORD_WIDTH
    });

    await this.layout(this.canvases[1 - this.front], instances, {
      wait,
      hover: this.onHover,
      color: (word, size) =>
        highlight && word === highlight
          ? HIGHLIGHT
          : colorFor(word + Math.round(size), (counts.get(word) || 1) / topCount)
    });

    // The ghost wall shows through wherever no word landed, fading out as
    // submissions accumulate, so a sparse wall still reads as lungs.
    await this.compositeGhost(ctx, w, h, Math.max(0, 1 - total / GHOST_FADE_AT));

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
