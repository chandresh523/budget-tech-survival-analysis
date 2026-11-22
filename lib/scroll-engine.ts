'use client';

/**
 * One clock for the whole page.
 *
 * Lenis, GSAP's ScrollTrigger and the Three.js render loop each want to own the
 * frame. Left alone they run three independent rAF loops, and the DOM ends up a
 * frame or two ahead of the canvas — which reads as the text sliding *against*
 * the 3D rather than with it. The fix is a strict ordering, driven once:
 *
 *     gsap.ticker  ->  lenis.raf(t)  ->  ScrollTrigger.update()  ->  r3f render
 *
 * Lenis integrates its smoothing first, ScrollTrigger reads the already-settled
 * scroll position, and r3f (whose loop we leave alone) samples the same values
 * from refs on the same frame. gsap.ticker.lagSmoothing(0) is essential: GSAP's
 * default lag smoothing silently fudges deltas after a stall, which desyncs
 * scrub animations from Lenis's own integration.
 */

import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
import { advancePointer } from '@/lib/pointer-state';
import { CustomEase } from 'gsap/dist/CustomEase';

let registered = false;
let lenis: Lenis | null = null;
let refCount = 0;

/** Shared, mutable frame state. Read from useFrame; never put in React state. */
export interface ScrollState {
  /** 0-1 document progress. */
  progress: number;
  /** Pixels scrolled. */
  scroll: number;
  /** Signed velocity, roughly px/frame, smoothed by Lenis. */
  velocity: number;
  /** 0-1 absolute speed, normalised and damped — the "energy" signal. */
  energy: number;
  /** Monotonic seconds since engine start. */
  time: number;
}

export const scrollState: ScrollState = {
  progress: 0,
  scroll: 0,
  velocity: 0,
  energy: 0,
  time: 0,
};

/** The ease the whole site moves on. Matches the brief's control points. */
export const EDITORIAL_EASE = 'M0,0 C0.7,0 0.3,1 1,1';

function registerOnce() {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger, CustomEase);
  // A slow-in/slow-out with a fast middle: numbers land rather than drift.
  CustomEase.create('editorial', EDITORIAL_EASE);
  // Apple-ish standard curve, for chrome.
  CustomEase.create('apple', 'M0,0 C0.28,0.11 0.32,1 1,1');
  registered = true;
}

// Registered at module scope, NOT from startScrollEngine's effect.
//
// React runs child effects before parent effects. The engine is started from
// Stage's effect, but the Acts and StatReveals are Stage's descendants, so
// their effects ran first and built their `scrollTrigger` tweens while GSAP
// still had no idea the plugin existed. GSAP does not throw for that — it warns
// and silently drops the scrollTrigger config, which turns a scrubbed reveal
// into a plain tween that fires instantly on mount. Two of those per act (in,
// then out) meant the out-tween landed last and every act sat at autoAlpha 0:
// a permanently blank editorial layer over a perfectly healthy canvas.
//
// Module evaluation always precedes any render, so registering here removes the
// ordering hazard entirely rather than papering over it with effect priorities.
if (typeof window !== 'undefined') registerOnce();

export interface EngineOptions {
  /** Lenis smoothing; higher is looser. */
  lerp?: number;
  /** Multiplies wheel delta. */
  wheelMultiplier?: number;
}

/**
 * Start the engine. Reference-counted so several components may call it; only
 * the first actually boots, and it shuts down when the last releases.
 */
export function startScrollEngine(opts: EngineOptions = {}): () => void {
  registerOnce();
  refCount += 1;

  if (!lenis) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    lenis = new Lenis({
      // Reduce Motion must still scroll — it just must not glide. lerp 1 makes
      // Lenis pass wheel input straight through with no smoothing.
      lerp: reduced ? 1 : (opts.lerp ?? 0.085),
      wheelMultiplier: opts.wheelMultiplier ?? 1,
      smoothWheel: !reduced,
      // Native scrollbar position stays authoritative, so window.scrollY,
      // anchors, and the browser's own restore all keep working.
      autoRaf: false,
    });

    let energy = 0;
    const start = performance.now();

    let ticks = 0;
    const tick = (time: number) => {
      ticks++;
      // gsap.ticker reports seconds; Lenis wants milliseconds.
      lenis!.raf(time * 1000);

      // Read Lenis's state directly rather than subscribing to its 'scroll'
      // event. The event only fires when Lenis itself processes a delta, so a
      // programmatic window.scrollTo — or any frame where the position is
      // already settled — leaves subscribers stale while lenis.scroll is
      // correct. Sampling here is one less moving part and is guaranteed to be
      // the same frame ScrollTrigger and the renderer see.
      scrollState.scroll = lenis!.scroll;
      scrollState.progress = lenis!.limit > 0 ? lenis!.scroll / lenis!.limit : 0;
      scrollState.velocity = lenis!.velocity ?? 0;

      ScrollTrigger.update();

      // Damped energy: |velocity| normalised, fast to rise and slow to fall so
      // the shader swells on a flick and eases back rather than strobing.
      const target = Math.min(1, Math.abs(scrollState.velocity) / 45);
      energy += (target - energy) * (target > energy ? 0.22 : 0.045);
      scrollState.energy = energy;
      scrollState.time = (performance.now() - start) / 1000;

      // Pointer decay rides this same tick rather than a second rAF loop, so
      // pointer velocity, Lenis and the renderer all sample one frame. Two
      // clocks is exactly how the DOM ends up a frame ahead of the canvas.
      advancePointer(Math.min(0.05, ticks > 1 ? 1 / 60 : 0));
    };

    gsap.ticker.add(tick);
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __engine?: unknown }).__engine = {
        get lenis() { return lenis; },
        get ticks() { return ticks; },
        scrollState,
        gsap,
      };
    }
    // Without this, GSAP fabricates deltas after a stall and scrub animations
    // drift out of step with Lenis's own integration.
    gsap.ticker.lagSmoothing(0);

    (lenis as unknown as { __tick?: (t: number) => void }).__tick = tick;
  }

  return () => {
    refCount -= 1;
    if (refCount > 0 || !lenis) return;
    const tick = (lenis as unknown as { __tick?: (t: number) => void }).__tick;
    if (tick) gsap.ticker.remove(tick);
    lenis.destroy();
    lenis = null;
    ScrollTrigger.getAll().forEach((t) => t.kill());
  };
}

/** Programmatic scroll that respects the smoothing. */
export function scrollTo(target: number | string | HTMLElement, duration = 1.4) {
  lenis?.scrollTo(target, {
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration,
    easing: (t: number) => 1 - Math.pow(1 - t, 4),
  });
}

export function getLenis(): Lenis | null {
  return lenis;
}

export { gsap, ScrollTrigger, CustomEase };
