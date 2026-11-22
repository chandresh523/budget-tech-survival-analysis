'use client';

/**
 * The journey: a tall scroll container, a fixed WebGL city behind it, and one
 * DOM panel per district that fades in as you arrive.
 *
 * Scroll is read into a ref and only *coarse* derived state (which district we
 * are at) is pushed into React. Putting raw scroll in state would re-render the
 * whole tree on every wheel event.
 *
 * Falls back to `children` — the plain stacked layout — whenever WebGL is
 * missing or the reader prefers reduced motion. A scroll-driven flythrough must
 * not be the only route to the numbers.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ArrivalProvider } from '@/components/city/arrival-context';
import CityScene from '@/components/city/city-scene';
import type { CityData } from '@/components/city/districts';
import Minimap from '@/components/city/minimap';
import { DISTRICTS, SCROLL_VIEWPORTS, scrollToPath, type DistrictId } from '@/lib/city-plan';

export interface CityJourneyProps {
  data: CityData;
  /** One panel per district, keyed by id. */
  panels: Partial<Record<DistrictId, ReactNode>>;
  /** Fixed chrome (status rail) rendered above everything. */
  chrome?: ReactNode;
  /** Fallback layout for reduced-motion / no-WebGL. */
  children: ReactNode;
}

type Mode = 'probing' | 'city' | 'fallback';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/* Whether this browser can render the city at all. Probed once and cached:
   getSnapshot is called often and must be cheap, and creating a throwaway
   canvas per call would be neither cheap nor stable. */
let webglSupport: boolean | null = null;
function supportsWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const probe = document.createElement('canvas');
    webglSupport = Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/* Read as an external store rather than probed in an effect: the value lives in
   the browser, not in React, and this way flipping the OS reduced-motion
   setting swaps to the stacked layout live instead of needing a reload. */
function subscribeMode(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getMode(): Mode {
  if (window.matchMedia(REDUCED_MOTION).matches) return 'fallback';
  return supportsWebGL() ? 'city' : 'fallback';
}

/* On the server there is no way to know, and guessing 'city' would render a
   canvas the client might immediately discard. */
function getServerMode(): Mode {
  return 'probing';
}

export default function CityJourney({ data, panels, chrome, children }: CityJourneyProps) {
  const mode = useSyncExternalStore(subscribeMode, getMode, getServerMode);
  const [active, setActive] = useState(true);

  // Coarse state only — changes at most a handful of times per journey.
  const [arrivedAt, setArrivedAt] = useState<number | null>(0);
  const [targetIndex, setTargetIndex] = useState(0);
  const [mapT, setMapT] = useState(0);

  const scrollRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const trackRef = useRef<HTMLDivElement>(null);

  /* ---- pause when hidden ---- */
  useEffect(() => {
    const onVis = () => setActive(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* ---- scroll + pointer ---- */
  useEffect(() => {
    if (mode !== 'city') return;

    // Cached so the scroll handler never has to touch scrollHeight, which
    // forces a synchronous layout. Recomputed only when the page can change size.
    let total = 0;
    const measure = () => {
      const track = trackRef.current;
      total = track ? track.scrollHeight - window.innerHeight : 0;
    };

    // Read synchronously rather than inside requestAnimationFrame.
    //
    // The rAF version latched on `if (!frame)` and only cleared the latch from
    // inside the callback, so a single dropped frame disabled scrolling for the
    // rest of the session — which is exactly what happened in an embedded
    // webview whose rAF had stalled. Scroll events are already delivered at most
    // once per frame, and with `total` cached this does no layout work.
    const read = () => {
      if (total <= 0) measure();
      const progress = total > 0 ? window.scrollY / total : 0;
      scrollRef.current = Math.min(1, Math.max(0, progress));

      const state = scrollToPath(scrollRef.current);

      // Publish flight state as CSS custom properties.
      //
      // This is what ties the panels to the scene: the same numbers driving the
      // camera and the post-processing also drive the DOM, so the dashboard
      // banks and settles with the city instead of floating over it, and the
      // accent colour of every panel is the district you are standing in.
      // Written straight to the style attribute — routing per-frame values
      // through React state would re-render the tree on every wheel tick.
      const root = document.documentElement.style;
      const district = DISTRICTS[state.arrivedAt ?? state.targetIndex];
      root.setProperty('--district-accent', district.accent);
      // 1 mid-leg, 0 when parked. Mirrors PostFx's own travel signal.
      const inTransit = state.arrivedAt === null ? Math.sin(state.legProgress * Math.PI) : 0;
      root.setProperty('--travel', inTransit.toFixed(3));
      root.setProperty('--arrived', state.arrivedAt === null ? '0' : '1');
      // Only commit to React when the coarse position actually changes.
      setArrivedAt((prev) => (prev === state.arrivedAt ? prev : state.arrivedAt));
      setTargetIndex((prev) => (prev === state.targetIndex ? prev : state.targetIndex));
      // Quantised so the minimap head moves smoothly without a render per pixel.
      setMapT((prev) => (Math.abs(prev - state.t) < 0.004 ? prev : state.t));
    };

    const onScroll = () => read();
    const onResize = () => {
      measure();
      read();
    };
    const onPointer = (e: PointerEvent) => {
      pointerRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -((e.clientY / window.innerHeight) * 2 - 1),
      };
    };

    measure();
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [mode]);

  /* ---- jump to a district ---- */
  const navigate = useCallback((target: number) => {
    const track = trackRef.current;
    if (!track) return;
    const total = track.scrollHeight - window.innerHeight;
    window.scrollTo({ top: target * total, behavior: 'smooth' });
  }, []);

  /* ---- keyboard: page between districts ---- */
  useEffect(() => {
    if (mode !== 'city') return;
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing, or arrow keys inside a control.
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'PageDown' && e.key !== 'PageUp')
        return;
      const forward = e.key === 'ArrowDown' || e.key === 'PageDown';
      const from = arrivedAt ?? targetIndex;
      const next = Math.min(DISTRICTS.length - 1, Math.max(0, from + (forward ? 1 : -1)));
      if (next === from) return;
      e.preventDefault();
      import('@/lib/city-plan').then(({ scrollForDistrict }) => navigate(scrollForDistrict(next)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, arrivedAt, targetIndex, navigate]);

  if (mode === 'probing') return null;

  if (mode === 'fallback') {
    return (
      <>
        {chrome}
        {children}
      </>
    );
  }

  return (
    <>
      <CityScene data={data} scrollRef={scrollRef} pointerRef={pointerRef} active={active} />

      {chrome}

      {/* Minimap, out of the way of the panels */}
      <div className="fixed bottom-4 left-4 z-40 hidden w-[212px] lg:block">
        <Minimap
          t={mapT}
          arrivedAt={arrivedAt}
          targetIndex={targetIndex}
          onNavigate={navigate}
        />
      </div>

      {/* The scroll track. Its height is what gives the journey its length; the
          panels inside are fixed and cross-fade rather than scrolling past. */}
      <div ref={trackRef} style={{ height: `${SCROLL_VIEWPORTS * 100}vh` }} aria-hidden />

      {/* Arrival panels.
          Held to the right half on wide screens so the district you just flew
          into stays visible beside its data — a full-width panel hides the
          place entirely and the journey stops meaning anything. */}
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-4 pb-24 pt-28 lg:justify-end lg:pr-8">
        {DISTRICTS.map((district, i) => {
          const here = arrivedAt === i;
          const panel = panels[district.id];
          if (!panel) return null;
          return (
            <section
              key={district.id}
              aria-hidden={!here}
              // Kept mounted so charts do not re-animate on every arrival, but
              // pulled out of the a11y tree and hit-testing when not current.
              className={`flight-panel absolute w-full max-w-3xl transition-all duration-700 ease-out lg:right-8 ${
                here
                  ? 'pointer-events-auto translate-y-0 opacity-100 blur-0'
                  : 'pointer-events-none translate-y-6 opacity-0 blur-sm'
              }`}
              style={{ visibility: here ? 'visible' : 'hidden' }}
            >
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="accent-district-bar h-[3px] w-8 shrink-0 rounded-full" />
                <span
                  className="silkscreen text-[10px]!"
                  style={{ color: district.accent }}
                >
                  {district.name}
                </span>
                <span className="silkscreen">{district.tagline}</span>
              </div>
              <div className="flight-streaks max-h-[72vh] overflow-y-auto rounded-2xl">
                {/* Gate entrance animations on actually arriving here. */}
                <ArrivalProvider active={here}>{panel}</ArrivalProvider>
              </div>
            </section>
          );
        })}
      </div>

      {/* Scroll affordance, only before the reader has moved */}
      {arrivedAt === 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <span className="silkscreen animate-pulse">scroll to fly in</span>
        </div>
      )}
    </>
  );
}
