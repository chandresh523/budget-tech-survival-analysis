'use client';

/**
 * The blueprint overlay — technical framing, drawn as DOM SVG over the canvas.
 *
 * The reference's "architectural grid" is not a CSS background pattern and not
 * one big path: it is a scatter of tiny repeated glyphs, each its own
 * `viewBox="0 0 7 7"` drawing, sitting at the intersections of a few very thin
 * structural rules. That idiom is reproduced here as `<symbol viewBox="0 0 7 7">`
 * instanced with `<use>`, so a glyph is authored once at its own 7-unit scale and
 * repeated fifty-odd times without fifty-odd path strings.
 *
 * Two things separate this from decoration:
 *
 *   1. The rules are placed by the layout, not by taste. The inner verticals
 *      flank the 1024px measure the acts are set in (app/page.tsx), so the frame
 *      is a drawing OF this page rather than a texture laid over it.
 *   2. The corner readout prints live values only. The month comes from the
 *      camera's own z through `monthForZ`, the depth from `scrollState.progress`,
 *      the record count from the caller's live figure. No figure in here is a
 *      literal. Where a value cannot be read the readout says so and names why,
 *      because a dash or a zero sitting in a numeral slot reads as a measurement.
 *
 * LAYERING. z-index 5, deliberately between the two existing layers:
 *
 *     z   0  the persistent <Canvas> wrapper (components/cinematic/stage.tsx)
 *   → z   5  this frame — above the world, so it reads as an instrument scale
 *            laid on the flight; below the type, so it never crosses a figure
 *     z  10  the act / ledger overlay
 *     z  50  the act nav
 *     z 100  the magnetic cursor
 *
 * No negative z-index anywhere: <body> paints an opaque #03020a plus the accent
 * gradients, so anything at -1 is simply invisible.
 *
 * PER-FRAME WRITES, NEVER REACT STATE. The readout and the leader lines change
 * every frame; routing that through setState would re-render the tree sixty times
 * a second. React renders the nodes once and the loop mutates `textContent` and
 * SVG attributes on them directly. The loop is `gsap.ticker` — the page's single
 * rAF clock (lib/scroll-engine) — rather than a second `requestAnimationFrame`,
 * so the annotation samples the same frame as Lenis and the renderer.
 *
 * The one value that does go through state is the viewport size: it changes on
 * resize, not per frame, and the whole static frame is laid out in pixels from it.
 */

import {
  useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import { CANYON_END_MONTH, monthForZ } from '@/lib/canyon-space';
import { gsap, scrollState } from '@/lib/scroll-engine';

/* ──────────────────────────────────────────────────────────────── contract ── */

export interface BlueprintAnchor {
  /** Stable across renders: it keys the DOM node the frame loop writes into. */
  id: string;
  label: string;
  /** World-space point, the space defined by lib/canyon-space. */
  position: [number, number, number];
}

export interface ProjectedPoint {
  /** Viewport CSS pixels, origin at the window's top-left. */
  x: number;
  y: number;
  /** False when the point is behind the camera or otherwise not on screen. */
  visible: boolean;
}

export interface BlueprintOverlayProps {
  /** Live record count. Printed as supplied; the caller owns the figure. */
  records: number;
  /**
   * Scroll progress at which Movement I hands over. The leaders annotate canyon
   * geometry, so they leave when it does — a label still pointing at a wall that
   * has faded out is captioning something the reader cannot see.
   */
  crossover?: number;
  /**
   * Camera z, sampled per frame. A getter rather than a number because this is a
   * DOM component: it cannot subscribe to the r3f camera, and a prop rewritten
   * every frame from React would be a re-render every frame.
   */
  cameraZ?: () => number;
  anchors?: BlueprintAnchor[];
  /**
   * World -> screen. Supplied by a component mounted INSIDE the <Canvas>, which
   * is the only place `useThree` exists. Absent means no projection is available,
   * and with no projection there are simply no leader lines: inventing screen
   * positions for world anchors would draw labels pointing at nothing.
   */
  project?: (p: [number, number, number]) => ProjectedPoint | null;
}

/* ─────────────────────────────────────────────────────────────── constants ── */

/**
 * Stroke alphas for the drawn frame. The band is narrow on purpose: below ~0.09
 * a hairline disappears into #03020a on a dim laptop panel, and above ~0.2 the
 * grid starts competing with the type it is supposed to frame. Expressed over
 * #ffffff only as an alpha — nothing here ever paints an opaque white.
 */
const RULE_ALPHA = 0.14;
const INNER_ALPHA = 0.1;
const BRACKET_ALPHA = 0.18;
const GLYPH_ALPHA = 0.13;
const CROSS_ALPHA = 0.16;

/** Glyph box, and its half — a `<use>` is placed by its top-left corner. */
const GLYPH = 7;
const GLYPH_HALF = GLYPH / 2;

/** Readout type. Held here so the three rows cannot drift apart. */
const LABEL = 'font-numeric w-[62px] shrink-0 text-[9px] uppercase tracking-[0.24em] text-ink-600';
const VALUE = 'numeral text-[12.5px] leading-none text-ink-100';

/** Half of the content measure the acts are capped at (1024px), plus a gutter. */
const MEASURE_HALF = 512 + 40;
/**
 * How much clear space a measure rule needs inside the frame rule to earn its
 * place. Measured: at 1280px wide the two would sit 58px apart, which reads as
 * one doubled edge rather than two pieces of structure — so below this they are
 * dropped and the frame is just the outer box.
 */
const MEASURE_CLEARANCE = 110;

/** Corner bracket arm length, and how far outside the rule crossing it sits. */
const BRACKET_ARM = 18;
const BRACKET_OUT = 8;

/** The 45-degree kick a leader takes off its rule before running to the point. */
const LEAD_KICK = 14;
/** A leader shorter than this is unreadable and one crossing the frame reads as
 *  a mistake, so anchors this close to a rule are dropped rather than drawn. */
const MIN_CLEARANCE = 30;
/** Estimated advance width per character of the 10px numeral face. Estimated on
 *  purpose: `getComputedTextLength` forces a layout, and calling it per anchor
 *  per frame is exactly the reflow this component is built to avoid. */
const CHAR_W = 6.1;

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const getReduced = () => window.matchMedia(REDUCED_QUERY).matches;
/** No matchMedia on the server; the client re-reads it on mount. */
const getReducedServer = () => false;

/* ──────────────────────────────────────────────────────────────── geometry ── */

interface FrameGeometry {
  w: number;
  h: number;
  inset: number;
  /** y of each horizontal rule. */
  hRules: number[];
  /** x of each vertical rule, frame edges first. */
  vRules: number[];
  /** The subset of vRules inside the frame box — drawn fainter. */
  innerV: number[];
  brackets: string[];
  crosses: Array<[number, number]>;
  ticks: Array<[number, number]>;
}

/**
 * Lay the frame out in CSS pixels.
 *
 * The scatter is deterministic (`i % 3`), never random. A random scatter would
 * differ between the server and client render, and would reshuffle itself on
 * every resize — which turns a static drawing into a flicker.
 */
function buildFrame(w: number, h: number): FrameGeometry {
  // 30px reads as a margin on a laptop; on a phone it would eat the viewport,
  // and the nav already owns the top 68px there.
  const inset = w < 720 ? 16 : 30;

  const hRules = [inset, h - inset];
  const innerV: number[] = [];

  // Flank the content measure, but only where those rules land clear of the
  // frame box. Any narrower and they crowd it, and the drawing gains a doubled
  // edge instead of a second piece of structure.
  if (w / 2 - inset > MEASURE_HALF + MEASURE_CLEARANCE) {
    innerV.push(w / 2 - MEASURE_HALF, w / 2 + MEASURE_HALF);
  }
  const vRules = [inset, w - inset, ...innerV];

  const crosses: Array<[number, number]> = [];
  for (const y of hRules) for (const x of vRules) crosses.push([x, y]);

  // Step chosen so a 1440px frame carries roughly a dozen glyphs per rule:
  // enough to read as a repeated scale, few enough to stay quiet.
  const step = w < 720 ? 64 : 108;
  const ticks: Array<[number, number]> = [];

  let i = 0;
  for (let x = inset + step; x < w - inset - step * 0.5; x += step, i++) {
    if (i % 3 === 1) continue;
    for (const y of hRules) ticks.push([x, y]);
  }
  i = 0;
  for (let y = inset + step; y < h - inset - step * 0.5; y += step, i++) {
    if (i % 3 === 1) continue;
    for (const x of vRules) ticks.push([x, y]);
  }

  // Registration brackets, offset outward so their arms are not hidden under
  // the rules they mark. Path data because the corners are known in pixels.
  const l = inset - BRACKET_OUT;
  const r = w - inset + BRACKET_OUT;
  const t = inset - BRACKET_OUT;
  const b = h - inset + BRACKET_OUT;
  const a = BRACKET_ARM;
  const brackets = [
    `M${l} ${t + a}V${t}H${l + a}`,
    `M${r - a} ${t}H${r}V${t + a}`,
    `M${l} ${b - a}V${b}H${l + a}`,
    `M${r - a} ${b}H${r}V${b - a}`,
  ];

  return { w, h, inset, hRules, vRules, innerV, brackets, crosses, ticks };
}

interface Leader {
  /** `points` for the polyline: foot on the rule, 45-degree elbow, the point. */
  points: string;
  labelX: number;
  labelY: number;
  labelAnchor: 'start' | 'end';
}

/**
 * Route a leader from the NEAREST frame rule to a projected point.
 *
 * Nearest rather than a fixed rule so the line is always the shortest it can be;
 * one that crosses the whole frame to reach a point sitting near its own edge
 * reads as a wire rather than an annotation.
 */
function leaderFor(px: number, py: number, label: string, f: FrameGeometry): Leader | null {
  const left = f.inset;
  const right = f.w - f.inset;
  const top = f.inset;
  const bottom = f.h - f.inset;

  if (px < left + MIN_CLEARANCE || px > right - MIN_CLEARANCE
    || py < top + MIN_CLEARANCE || py > bottom - MIN_CLEARANCE) return null;

  const candidates = [
    { axis: 'v' as const, at: left, d: px - left },
    { axis: 'v' as const, at: right, d: right - px },
    { axis: 'h' as const, at: top, d: py - top },
    { axis: 'h' as const, at: bottom, d: bottom - py },
  ];
  let best = candidates[0];
  for (const c of candidates) if (c.d < best.d) best = c;

  const n = (v: number) => v.toFixed(1);
  let points: string;

  if (best.axis === 'v') {
    // Off a vertical rule: kick down the rule, 45 degrees in, then a straight
    // horizontal run to the crosshair.
    const dir = best.at < px ? 1 : -1;
    points = `${n(best.at)},${n(py + LEAD_KICK)} `
      + `${n(best.at + dir * LEAD_KICK)},${n(py)} `
      + `${n(px)},${n(py)}`;
  } else {
    const dir = best.at < py ? 1 : -1;
    points = `${n(px + LEAD_KICK)},${n(best.at)} `
      + `${n(px)},${n(best.at + dir * LEAD_KICK)} `
      + `${n(px)},${n(py)}`;
  }

  // Label past the crosshair so it never sits on its own leader, flipped to the
  // other side when the estimated run would overhang the frame.
  const width = label.length * CHAR_W;
  let labelAnchor: 'start' | 'end' = 'start';
  let labelX = px + 11;
  if (labelX + width > right - 4) {
    labelAnchor = 'end';
    labelX = px - 11;
  }
  return { points, labelX, labelY: py - 9, labelAnchor };
}

/** The nodes the frame loop writes into, resolved once when React mounts them. */
interface TraceNodes {
  group: SVGGElement;
  line: SVGPolylineElement | null;
  cross: SVGGElement | null;
  text: SVGTextElement | null;
  lastPoints: string;
  lastCross: string;
  shown: boolean;
}

/* ─────────────────────────────────────────────────────────────── component ── */

export default function BlueprintOverlay({
  records, crossover = 1, cameraZ, anchors, project,
}: BlueprintOverlayProps) {
  // Ids are per-instance. A fixed `#bp-cross` would mean two mounted overlays
  // both define it and every `<use>` in the document resolves to whichever
  // mounted first. Stripped to [A-Za-z0-9_-] because React's generated ids carry
  // delimiter characters, and these end up inside a `href="#..."` fragment.
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const crossId = `${uid}-cross`;
  const tickId = `${uid}-tick`;

  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getReducedServer);

  // null until measured, on the server as well as on the client, so the first
  // client render matches the server's markup and hydration is clean.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const measure = () => setSize((prev) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Same size, same object: mobile browsers fire resize on every toolbar
      // nudge, and a new object each time would rebuild the whole frame.
      return prev && prev.w === w && prev.h === h ? prev : { w, h };
    });
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  const frame = useMemo(() => (size ? buildFrame(size.w, size.h) : null), [size]);

  /* Live props, mirrored into a ref so the ticker reads current values without
     being torn down and rebuilt — and never holds a stale `project` closure. */
  const live = useRef({ records, crossover, cameraZ, anchors, project });
  useEffect(() => {
    live.current = { records, crossover, cameraZ, anchors, project };
  });

  const monthRef = useRef<HTMLSpanElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const noteRef = useRef<HTMLSpanElement>(null);
  const depthRef = useRef<HTMLSpanElement>(null);
  const recordsRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<SVGLineElement>(null);
  const tracesRef = useRef<SVGGElement>(null);

  const nodes = useRef(new Map<string, TraceNodes>());

  /**
   * Resolve one anchor's nodes once, when React mounts its group.
   *
   * A re-render hands React a new inline ref closure, so it detaches and
   * re-registers; that is harmless here because the record it rebuilds is pure
   * cache — the next frame re-asserts `display` and rewrites every attribute.
   */
  const registerTrace = useCallback((id: string, el: SVGGElement | null) => {
    if (!el) {
      nodes.current.delete(id);
      return;
    }
    nodes.current.set(id, {
      group: el,
      // Queried by role rather than by child position, so the loop keeps writing
      // to the right node if this markup ever gains a child.
      line: el.querySelector<SVGPolylineElement>('[data-role="leader"]'),
      cross: el.querySelector<SVGGElement>('[data-role="cross"]'),
      text: el.querySelector<SVGTextElement>('[data-role="label"]'),
      lastPoints: '',
      lastCross: '',
      // React renders the group with display="none"; the loop reveals it.
      shown: false,
    });
  }, []);

  useEffect(() => {
    // Reduce Motion degrades to the static frame: no loop, no leaders, and the
    // readout says why rather than showing a figure frozen at mount — a stale
    // number presented as live is a wrong number.
    if (reduced || !frame) return;

    // Last written strings. Assigning `textContent` is a mutation even when the
    // value is identical, and the readouts are quantised to a tenth of a month
    // and a whole percent, so most frames have nothing new to say.
    const last = { month: '', note: '', depth: '', records: '', progress: -1 };

    const tick = () => {
      const p = live.current;

      /* ---- month at the camera ---------------------------------------- */
      let month = 'unavailable';
      let note = 'no camera reported';
      if (p.cameraZ) {
        const z = p.cameraZ();
        if (Number.isFinite(z)) {
          const m = monthForZ(z);
          // Signed and unclamped on purpose. The camera starts back from the
          // canyon mouth (CAM_START_Z), so before month zero the honest readout
          // is negative; printing 0.0 there would be a fabricated position.
          month = m.toFixed(1);
          note = m < 0
            ? 'approach — before month zero'
            : m > CANYON_END_MONTH
              // Derived from the constant, never typed as a literal: the canyon
              // length is a build decision that can change.
              ? `beyond the sampled grid (${CANYON_END_MONTH} mo)`
              : '';
        } else {
          note = 'camera z not finite';
        }
      }
      if (month !== last.month && monthRef.current) {
        monthRef.current.textContent = month;
        // Inline, not a class swap: two Tailwind colour utilities on one element
        // resolve by source order, which is not something to bet a state on.
        monthRef.current.style.color = month === 'unavailable' ? '#8a8896' : '';
        // "unavailable mo" is not a sentence: the unit belongs to a number, so
        // it goes away with the number.
        if (unitRef.current) {
          unitRef.current.style.display = month === 'unavailable' ? 'none' : '';
        }
        last.month = month;
      }
      if (note !== last.note && noteRef.current) {
        noteRef.current.textContent = note;
        last.note = note;
      }

      /* ---- depth and records ------------------------------------------ */
      const prog = Math.min(1, Math.max(0, scrollState.progress));
      const depth = `${Math.round(prog * 100)}%`;
      if (depth !== last.depth && depthRef.current) {
        depthRef.current.textContent = depth;
        last.depth = depth;
      }

      const rec = Number.isFinite(p.records)
        ? Math.round(p.records).toLocaleString()
        : 'unavailable';
      if (rec !== last.records && recordsRef.current) {
        recordsRef.current.textContent = rec;
        recordsRef.current.style.color = rec === 'unavailable' ? '#8a8896' : '';
        last.records = rec;
      }

      /* ---- progress span along the bottom rule ------------------------ */
      if (progressRef.current) {
        const x2 = frame.inset + (frame.w - frame.inset * 2) * prog;
        // Sub-half-pixel changes cannot be seen; skipping them keeps the
        // attribute write (and its style invalidation) off most frames.
        if (Math.abs(x2 - last.progress) >= 0.5) {
          progressRef.current.setAttribute('x2', x2.toFixed(1));
          last.progress = x2;
        }
      }

      /* ---- leaders ----------------------------------------------------- */
      const list = p.anchors;
      if (!p.project || !list || !list.length) return;

      // Mirrors km-canyon's exit ramp exactly, so a label and the wall it points
      // at leave together rather than a beat apart.
      const exit = !Number.isFinite(p.crossover) || p.crossover >= 1
        ? 1
        : Math.max(0, 1 - Math.max(0, prog - (p.crossover - 0.06)) / 0.08);
      if (tracesRef.current) tracesRef.current.setAttribute('opacity', exit.toFixed(3));

      for (const a of list) {
        const node = nodes.current.get(a.id);
        if (!node) continue;

        // Don't pay for projection once the group is invisible anyway.
        const proj = exit > 0.02 ? p.project(a.position) : null;
        const lead = proj && proj.visible
          ? leaderFor(proj.x, proj.y, a.label, frame)
          : null;

        if (!lead || !proj) {
          if (node.shown) {
            node.group.setAttribute('display', 'none');
            node.shown = false;
          }
          continue;
        }
        if (!node.shown) {
          node.group.removeAttribute('display');
          node.shown = true;
        }
        if (lead.points !== node.lastPoints) {
          node.line?.setAttribute('points', lead.points);
          node.lastPoints = lead.points;
        }
        const t = `translate(${proj.x.toFixed(1)} ${proj.y.toFixed(1)})`;
        if (t !== node.lastCross) {
          node.cross?.setAttribute('transform', t);
          node.text?.setAttribute('x', lead.labelX.toFixed(1));
          node.text?.setAttribute('y', lead.labelY.toFixed(1));
          node.text?.setAttribute('text-anchor', lead.labelAnchor);
          node.lastCross = t;
        }
      }
    };

    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [reduced, frame]);

  const showCrossoverMark = Number.isFinite(crossover) && crossover > 0 && crossover < 1;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: 5 }}>
      {frame && (
        <>
          <svg
            className="absolute inset-0 block h-full w-full"
            width={frame.w}
            height={frame.h}
            viewBox={`0 0 ${frame.w} ${frame.h}`}
            /* The viewBox matches the measured viewport, so this is 1:1 and
               nothing is scaled. `none` only matters during a resize frame where
               the element box and the last measurement disagree: it keeps the
               rules pinned to the edges instead of letterboxing them inward. */
            preserveAspectRatio="none"
            fill="none"
          >
            <defs>
              {/* The reference's glyph scale, kept: authored in a 7-unit box and
                  instanced at 7px, so a stroke of 1 unit lands on 1 device-ish
                  pixel with no scaling maths. */}
              <symbol id={crossId} viewBox="0 0 7 7">
                <path d="M3.5 0V7M0 3.5H7" />
              </symbol>
              <symbol id={tickId} viewBox="0 0 7 7">
                <path d="M3.5 1.4V5.6" />
              </symbol>
            </defs>

            {/* Static structure. crispEdges because every line in here is axis
                aligned: antialiasing a 1px hairline onto two rows of half-alpha
                is what makes technical grids look smeared. */}
            <g fill="none" strokeWidth={1} shapeRendering="crispEdges">
              {/* Full-bleed rules, inset from the edges. They run past the corner
                  crossings rather than closing a box — the reference frames with
                  rules, not with a border. */}
              {frame.hRules.map((y) => (
                <line
                  key={`h${y}`} x1={0} y1={y} x2={frame.w} y2={y}
                  stroke={`rgba(255,255,255,${RULE_ALPHA})`}
                />
              ))}
              <line
                x1={frame.inset} y1={0} x2={frame.inset} y2={frame.h}
                stroke={`rgba(255,255,255,${RULE_ALPHA})`}
              />
              <line
                x1={frame.w - frame.inset} y1={0} x2={frame.w - frame.inset} y2={frame.h}
                stroke={`rgba(255,255,255,${RULE_ALPHA})`}
              />
              {/* The measure rules, fainter: they mark where the type column
                  ends, so they must not read as strongly as the frame itself. */}
              {frame.innerV.map((x) => (
                <line
                  key={`v${x}`} x1={x} y1={frame.inset} x2={x} y2={frame.h - frame.inset}
                  stroke={`rgba(255,255,255,${INNER_ALPHA})`}
                />
              ))}

              {/* Corner brackets — the brightest element, so the eye finds the
                  frame's extent before it reads any of the ticks. */}
              <g stroke={`rgba(255,255,255,${BRACKET_ALPHA})`}>
                {frame.brackets.map((d) => <path key={d} d={d} />)}
              </g>

              {/* The scatter: one tiny instanced glyph per intersection. */}
              <g stroke={`rgba(255,255,255,${CROSS_ALPHA})`}>
                {frame.crosses.map(([x, y]) => (
                  <use
                    key={`c${x},${y}`} href={`#${crossId}`}
                    x={x - GLYPH_HALF} y={y - GLYPH_HALF} width={GLYPH} height={GLYPH}
                  />
                ))}
              </g>
              <g stroke={`rgba(255,255,255,${GLYPH_ALPHA})`}>
                {frame.ticks.map(([x, y]) => (
                  <use
                    key={`t${x},${y}`} href={`#${tickId}`}
                    x={x - GLYPH_HALF} y={y - GLYPH_HALF} width={GLYPH} height={GLYPH}
                  />
                ))}
              </g>

              {/* Scroll depth, drawn as a span along the bottom rule. Accent
                  tinted because it is live state rather than structure — the
                  0.10-0.18 white band is reserved for the drawing. Not drawn
                  under Reduce Motion: nothing would ever advance it, and a span
                  frozen at zero length is a readout claiming the top of the
                  document. */}
              {!reduced && (
                <>
                  <line
                    ref={progressRef}
                    x1={frame.inset} y1={frame.h - frame.inset}
                    x2={frame.inset} y2={frame.h - frame.inset}
                    stroke="var(--accent)" strokeOpacity={0.55} strokeWidth={1.5}
                  />
                  {showCrossoverMark && (
                    /* Where Movement I hands over, marked on the same scale the
                       progress span runs along. */
                    <line
                      x1={frame.inset + (frame.w - frame.inset * 2) * crossover}
                      y1={frame.h - frame.inset - 4}
                      x2={frame.inset + (frame.w - frame.inset * 2) * crossover}
                      y2={frame.h - frame.inset + 4}
                      stroke={`rgba(255,255,255,${BRACKET_ALPHA})`}
                    />
                  )}
                </>
              )}
            </g>

            {/* Tracing lines. Mounted only when there is a projector to place
                them — see the `project` prop: no projection, no leaders — and
                never under Reduce Motion, which degrades to the static frame. */}
            {!reduced && project && anchors && anchors.length > 0 && (
              <g ref={tracesRef} fill="none" shapeRendering="geometricPrecision">
                {anchors.map((a) => (
                  // display="none" until the loop has a projection for it, so a
                  // group never flashes at 0,0 on its first frame.
                  <g key={a.id} ref={(el) => registerTrace(a.id, el)} display="none">
                    <polyline
                      data-role="leader" points=""
                      stroke="rgba(245,245,247,0.22)" strokeWidth={1}
                    />
                    <g
                      data-role="cross"
                      stroke="var(--accent)" strokeOpacity={0.72} strokeWidth={1}
                    >
                      <line x1={-5} y1={0} x2={5} y2={0} />
                      <line x1={0} y1={-5} x2={0} y2={5} />
                      <circle cx={0} cy={0} r={2.6} />
                    </g>
                    <text
                      data-role="label" className="numeral" x={0} y={0}
                      fontSize={10} letterSpacing="0.06em"
                      fill="#f5f5f7" fillOpacity={0.78}
                      /* A void-coloured outline under the glyphs. Ten-pixel type
                         over a live aurora is otherwise legible only half the
                         time, and this costs nothing per frame. */
                      stroke="#03020a" strokeWidth={3} strokeOpacity={0.85}
                      paintOrder="stroke"
                    >
                      {a.label}
                    </text>
                  </g>
                ))}
              </g>
            )}
          </svg>

          {/* Live readout, bottom-left inside the frame. HTML rather than SVG
              text so it can use the page's own type utilities directly. */}
          <div
            className="absolute"
            style={{ left: frame.inset + 14, bottom: frame.inset + 16, width: 232 }}
          >
            <p className="eyebrow mb-2">Flight readout</p>

            {reduced ? (
              <p className="max-w-[30ch] text-[11px] leading-[1.45] text-ink-400">
                Live readout paused — this system asks for reduced motion, so the
                frame is drawn static. A figure frozen at load would still look live.
              </p>
            ) : (
              <div className="flex flex-col gap-[3px]">
                {/* Values start empty and are filled on the first frame. An
                    em-dash placeholder would sit in a numeral slot looking like
                    a measured absence. */}
                <div className="flex items-baseline gap-2">
                  <span className={LABEL}>Month</span>
                  <span ref={monthRef} className={VALUE} />
                  <span ref={unitRef} className="text-[9px] text-ink-600">mo</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={LABEL}>Depth</span>
                  <span ref={depthRef} className={VALUE} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={LABEL}>Records</span>
                  <span ref={recordsRef} className={VALUE} />
                </div>
                {/* Reserved height, so the note appearing does not shift the rows. */}
                <span
                  ref={noteRef}
                  className="mt-0.5 min-h-[12px] text-[10px] leading-[1.2] text-ink-600"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

