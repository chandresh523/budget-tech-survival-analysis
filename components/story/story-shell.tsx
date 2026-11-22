'use client';

/**
 * The shell: owns scroll, and is the single publisher of "where are we".
 *
 * Everything downstream reads from one place — the WebGL background through
 * refs, the DOM through CSS custom properties, React through coarse state.
 * That is what keeps the shader, the panels and the nav from disagreeing.
 *
 * Two things learned the hard way in this project and deliberately preserved:
 *  - scroll is read SYNCHRONOUSLY, not inside requestAnimationFrame. An earlier
 *    version latched on `if (!frame)` and cleared the latch only inside the
 *    callback, so one dropped frame killed scrolling for the whole session.
 *  - per-frame values go to refs and CSS vars, never to setState. Only the
 *    chapter index — which changes a handful of times per journey — is state.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import ChapterNav from '@/components/story/chapter-nav';
import StoryBackground from '@/components/story/story-background';
import OrbitalCluster, { type OrbitNode } from '@/components/story/orbital-cluster';
import type { LiveStatus } from '@/hooks/use-live-metrics';
import {
  CHAPTERS,
  SCROLL_VIEWPORTS,
  scrollForChapter,
  scrollToStory,
} from '@/lib/story';

const REDUCED = '(prefers-reduced-motion: reduce)';

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const getMotion = () => window.matchMedia(REDUCED).matches;
const getServerMotion = () => false;

export interface StoryShellProps {
  /** One node per chapter, in CHAPTERS order. */
  chapters: ReactNode[];
  /** Live-status props forwarded to the nav. */
  status: LiveStatus;
  updatedAt: Date | null;
  sourceRows: number | null;
  onRefresh?: () => void;
  /** Nodes for the surrounding globe. */
  orbit: OrbitNode[];
  selected: string | null;
  onSelect: (id: string) => void;
}

/**
 * Composition lives here rather than being injected via render props.
 *
 * The render-prop version passed `scrollRef`/`storyRef` into a function called
 * during render, which trips react-hooks/refs — a ref must not be *read* during
 * render, and the lint rule cannot tell reading from forwarding. Rendering the
 * children as elements and passing the refs as props is both legal and simpler.
 */
export default function StoryShell({
  chapters,
  status,
  updatedAt,
  sourceRows,
  onRefresh,
  orbit,
  selected,
  onSelect,
}: StoryShellProps) {
  const reduced = useSyncExternalStore(subscribeMotion, getMotion, getServerMotion);

  const [activeIndex, setActiveIndex] = useState(0);
  const [velocityState, setVelocityState] = useState(0);

  const scrollRef = useRef(0);
  const storyRef = useRef({
    accent: CHAPTERS[0].accent,
    accent2: CHAPTERS[0].accent2,
    velocity: 0,
  });
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let total = 0;
    const measure = () => {
      const t = trackRef.current;
      total = t ? t.scrollHeight - window.innerHeight : 0;
    };

    // Coarse velocity buckets: the nav only needs to know "moving" vs "still",
    // and quantising stops a per-pixel re-render of the whole tree.
    let lastBucket = 0;

    const read = () => {
      if (total <= 0) measure();
      const p = total > 0 ? window.scrollY / total : 0;
      scrollRef.current = Math.min(1, Math.max(0, p));

      const st = scrollToStory(scrollRef.current);
      const from = CHAPTERS[st.from];
      const to = CHAPTERS[st.index];

      // Interpolate the accent across a transition so the whole page — glass
      // tint, headline gradient, shader — crossfades rather than snapping.
      const mix = st.restingAt !== null ? 0 : st.progress;
      const accent = mix < 0.5 ? from.accent : to.accent;
      const accent2 = mix < 0.5 ? from.accent2 : to.accent2;

      storyRef.current.accent = accent;
      storyRef.current.accent2 = accent2;
      storyRef.current.velocity = st.velocity;

      const root = document.documentElement.style;
      root.setProperty('--accent', accent);
      root.setProperty('--accent-2', accent2);
      root.setProperty('--velocity', st.velocity.toFixed(3));

      setActiveIndex((prev) => (prev === st.index ? prev : st.index));
      const bucket = Math.round(st.velocity * 4) / 4;
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        setVelocityState(bucket);
      }
    };

    const onScroll = () => read();
    const onResize = () => {
      measure();
      read();
    };

    measure();
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const jump = useCallback((index: number) => {
    const t = trackRef.current;
    if (!t) return;
    const total = t.scrollHeight - window.innerHeight;
    window.scrollTo({
      top: scrollForChapter(index) * total,
      behavior: window.matchMedia(REDUCED).matches ? 'auto' : 'smooth',
    });
  }, []);

  return (
    <>
      {/* The same field the dive runs, so the two routes share one world. Driven
          off the active chapter's accents rather than the per-frame ref: Aurora
          already lerps toward whatever colour it is handed, so a value that
          changes once per chapter is smooth and costs no re-render per frame. */}
      {!reduced && (
        <StoryBackground
          accent={CHAPTERS[activeIndex].accent}
          accent2={CHAPTERS[activeIndex].accent2}
        />
      )}

      {/* The globe is the room, not an element in it: fixed, full-viewport,
          behind the chapter panels. The reader sits at its centre and the
          categories are pinned to the inner surface all around them. */}
      {!reduced && orbit.length > 0 && (
        <OrbitalCluster
          nodes={orbit}
          selectedId={selected}
          onSelect={onSelect}
          className="fixed inset-0 z-10"
        />
      )}

      {/* Scroll edge effect: the HIG asks for a progressive blur between
          floating chrome and the content passing beneath it, not a hairline. */}
      <div className="scroll-edge" aria-hidden />

      <ChapterNav
        activeIndex={activeIndex}
        velocity={velocityState}
        onJump={jump}
        status={status}
        updatedAt={updatedAt}
        sourceRows={sourceRows}
        onRefresh={onRefresh}
      />

      {/* The scroll track gives the story its length. Chapters are fixed and
          cross-fade in place rather than scrolling past. */}
      <div ref={trackRef} style={{ height: `${SCROLL_VIEWPORTS * 100}vh` }} aria-hidden />

      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-5 pb-16 pt-32">
        {chapters.map((node, i) => {
          const here = activeIndex === i;
          return (
            <section
              key={CHAPTERS[i].id}
              id={CHAPTERS[i].id}
              aria-hidden={!here}
              // Kept mounted so charts do not re-animate on every visit, but
              // removed from hit-testing and the a11y tree when not current.
              className={`absolute inset-x-0 mx-auto w-full max-w-6xl transition-[opacity,transform,filter] duration-700 ease-out ${
                here
                  ? 'pointer-events-auto translate-y-0 opacity-100 blur-0'
                  : 'pointer-events-none translate-y-8 opacity-0 blur-md'
              }`}
              style={{ visibility: here ? 'visible' : 'hidden' }}
            >
              <div
                className="chapter-panel max-h-[76vh] overflow-y-auto overscroll-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{
                  // Fade the cut edges so a long chapter reads as continuing
                  // rather than being sliced off.
                  maskImage:
                    'linear-gradient(to bottom, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%)',
                }}
              >
                {node}
              </div>
            </section>
          );
        })}
      </div>

      {activeIndex === 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-7 z-30 flex justify-center">
          <span className="eyebrow breathe">scroll</span>
        </div>
      )}
    </>
  );
}
