'use client';

/**
 * Pixelated route transition.
 *
 * Clicking through to the story used to be a hard cut: the whole world vanished
 * in one frame. This dissolves the screen into blocks first, navigates behind the
 * cover, and dissolves back in on the other side — so the two pages read as one
 * continuous place rather than two documents.
 *
 * Pixelation, and nothing else, on purpose. The alternative — a fade or a wipe —
 * says "new page". Blocks say "same world, resolving", which is the same language
 * the specimen plates already speak when the cursor focuses them.
 *
 * It does NOT screenshot the page. Capturing live DOM plus a WebGL canvas needs a
 * library and a frame of jank, and the effect does not need it: filling the
 * viewport with void-coloured cells in scattered order reads as the image
 * breaking up, because the cells are what the eye tracks, not what is behind them.
 *
 * Drawn on one canvas with a cell grid sized to the viewport, so the cost is a
 * few hundred fillRect calls per frame and nothing is allocated mid-animation.
 */

import { useCallback, useEffect, useRef } from 'react';

/** Target cell size in CSS pixels. Large enough to read as blocks rather than
 *  noise; small enough that the grid does not look like a bad table. */
const CELL_PX = 26;
const COVER_MS = 460;
const REVEAL_MS = 620;

type Phase = 'idle' | 'covering' | 'revealing';

export interface PixelTransitionHandle {
  /** Cover the screen, then run `then` once it is fully covered. */
  cover: (then: () => void) => void;
  /** Dissolve the cover away. Safe to call when nothing is covered. */
  reveal: () => void;
}

/**
 * Deterministic shuffle of cell indices.
 *
 * Cells must fill in scattered order or the effect reads as a wipe. Seeded rather
 * than Math.random so the same transition looks the same every time, which
 * matters when the reader goes back and forth.
 */
function scatter(count: number): Uint32Array<ArrayBufferLike> {
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  let seed = 0x9e3779b9;
  for (let i = count - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  return order;
}

export default function PixelTransition({
  onReady,
}: {
  onReady?: (handle: PixelTransitionHandle) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    phase: 'idle' as Phase,
    start: 0,
    raf: 0,
    cols: 0,
    rows: 0,
    order: new Uint32Array(0) as Uint32Array<ArrayBufferLike>,
    done: null as null | (() => void),
    reduced: false,
  });

  const measure = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.ceil(window.innerWidth * dpr);
    c.height = Math.ceil(window.innerHeight * dpr);
    c.style.width = '100%';
    c.style.height = '100%';
    const s = stateRef.current;
    s.cols = Math.max(1, Math.ceil(window.innerWidth / CELL_PX));
    s.rows = Math.max(1, Math.ceil(window.innerHeight / CELL_PX));
    s.order = scatter(s.cols * s.rows);
  }, []);

  useEffect(() => {
    const s = stateRef.current;
    s.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(s.raf);
    };
  }, [measure]);

  const draw = useCallback((filled: number) => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const s = stateRef.current;
    const dpr = c.width / window.innerWidth;
    const w = (window.innerWidth / s.cols) * dpr;
    const h = (window.innerHeight / s.rows) * dpr;

    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#03020a';
    for (let i = 0; i < filled; i++) {
      const idx = s.order[i];
      const cx = idx % s.cols;
      const cy = Math.floor(idx / s.cols);
      // +1 on the size closes the sub-pixel seams that would otherwise show as a
      // grid of hairlines over the cover.
      ctx.fillRect(Math.floor(cx * w), Math.floor(cy * h), Math.ceil(w) + 1, Math.ceil(h) + 1);
    }
  }, []);

  /**
   * Runs one phase to completion.
   *
   * The rAF loop is a LOCAL function rather than a self-referencing useCallback.
   * A callback that schedules itself has to name itself inside its own
   * initialiser, which is both a temporal-dead-zone hazard and, more practically,
   * a stale-closure trap: the scheduled frame keeps whichever copy existed when
   * it was queued. A local closure created per run has neither problem.
   */
  const run = useCallback((phase: Exclude<Phase, 'idle'>, done?: () => void) => {
    const s = stateRef.current;
    cancelAnimationFrame(s.raf);
    s.phase = phase;
    s.start = performance.now();

    const total = s.cols * s.rows;
    const dur = phase === 'covering' ? COVER_MS : REVEAL_MS;

    const loop = () => {
      const t = Math.min(1, (performance.now() - s.start) / dur);
      // Fast out of the gate and soft on landing, matching the site's curve.
      const e = phase === 'covering' ? t * t : 1 - (1 - t) * (1 - t);
      draw(phase === 'covering' ? Math.floor(total * e) : Math.floor(total * (1 - e)));

      if (t < 1) {
        s.raf = requestAnimationFrame(loop);
        return;
      }
      s.phase = 'idle';
      if (phase === 'covering') {
        // Navigate while fully covered, so the swap is never seen.
        done?.();
      } else {
        draw(0);
        const c = canvasRef.current;
        if (c) c.style.pointerEvents = 'none';
      }
    };

    s.raf = requestAnimationFrame(loop);
  }, [draw]);

  const cover = useCallback((then: () => void) => {
    if (stateRef.current.reduced) { then(); return; }
    const c = canvasRef.current;
    if (c) c.style.pointerEvents = 'auto';
    run('covering', then);
  }, [run]);

  const reveal = useCallback(() => {
    if (stateRef.current.reduced) return;
    run('revealing');
  }, [run]);

  useEffect(() => {
    onReady?.({ cover, reveal });
  }, [onReady, cover, reveal]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 200 }}
    />
  );
}
