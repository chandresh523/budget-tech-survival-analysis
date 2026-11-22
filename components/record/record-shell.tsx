'use client';

/**
 * Movement II — the record.
 *
 * Movement I flies a colour universe and prints headline figures over it.
 * Movement II is the archive: how the study was built, what was abandoned, and
 * what the result cannot support. It is deliberately a different register —
 * greyscale type, hairline rules, no cards, no gradients, and the accent
 * reserved for the one interactive thing on screen, which is the beat rail.
 *
 * WHAT THIS FILE OWNS, AND WHAT IT MUST NOT TOUCH
 *
 * The beats are laid down the scroll exactly the way `Act` in app/page.tsx lays
 * down the acts: one fixed, full-viewport section per beat, revealed and retired
 * by ONE gsap timeline driven by ONE ScrollTrigger. That shape is not stylistic.
 * This site has already been broken once by two independent scrubbed tweens
 * writing `autoAlpha` on the same element: past their shared range both sit at
 * progress 1, one asserting opacity 1 and the other opacity 0 on the same frame,
 * and once their scrub catch-up finishes neither writes again — so the losing
 * value sticks and sections pile up permanently visible. A single timeline has a
 * single writer, so opacity is a pure function of scroll position and scrubbing
 * backwards is exact.
 *
 * The split of authority with components/record/flowing-text is strict: this file
 * writes the SECTION's autoAlpha/y/filter, flowing-text writes the strata and the
 * runs of type INSIDE it. No property has two writers, and the two never animate
 * the same element.
 *
 * HONESTY
 *
 * Every live quantity arrives as a KEY, resolved here against the map the caller
 * publishes. Nothing numeric is typed in this file and nothing numeric is typed
 * in the prose it renders — see the rules at the head of lib/record-narrative.
 * When a key cannot be resolved the row renders an explicit unavailable state
 * that NAMES the reason and prints the key, because a blank, a zero or an
 * em-dash in a figure slot reads as a measurement that was taken and came back
 * empty. That is a strictly stronger claim than "the payload carried nothing
 * here", and it is the one failure mode this component exists to prevent.
 */

import { useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger, scrollTo } from '@/lib/scroll-engine';
import { BEAT_COUNT } from '@/lib/record-narrative';
import FlowingText, { type FlowingEvidence, type ResolvedFigure } from './flowing-text';

/* ───────────────────────────────────────────────────────────── crossover ──── */

/**
 * Acts in Movement I.
 *
 * This MUST equal `ACTS.length` in app/page.tsx. It lives here because the
 * crossover has to be one number owned by one module — the camera rig, the
 * aurora, the electron field, the canyon exit and the spark field all fade
 * across it, and two modules each deriving their own split is how the DOM ends
 * up crossing into the archive on a different frame from the canvas.
 *
 * A caller that knows its own act count should prefer `crossoverFor(ACTS.length)`
 * over the constant, so the two cannot drift.
 */
const MOVEMENT_I_ACTS = 9;

/**
 * Document fraction at which Movement II begins.
 *
 * Equal weight per section: an act and a beat each own the same slice of scroll.
 * The alternative — weighting a beat more heavily because it carries more type —
 * was rejected because the reveal schedule is expressed in fractions of a
 * section's own range, so a longer beat already spends longer revealing and does
 * not also need a longer range.
 *
 * Returns 1 when there are no beats: Movement I then owns the whole document and
 * every consumer's `crossover >= 1` branch correctly reports that there is no
 * archive to cross into.
 */
export function crossoverFor(acts: number, beats: number = BEAT_COUNT): number {
  const total = acts + beats;
  return total > 0 ? acts / total : 1;
}

/**
 * Where Movement II begins, as a fraction of the document. THE crossover — this
 * is the constant a caller passes to `Stage` so the canvas drains its colour on
 * the same frame the archive arrives.
 */
export const MOVEMENT_II_START = crossoverFor(MOVEMENT_I_ACTS);

/**
 * A crossover of 1 leaves the archive no scroll to live in, which would silently
 * render eight sections that can never be reached. Clamped instead, so a
 * mis-wired caller gets a squeezed archive it can see and diagnose rather than an
 * absence it cannot.
 */
const MAX_CROSSOVER = 0.98;

/**
 * Midpoint of a beat's fully-opaque plateau, as a fraction of its own range.
 *
 * Not 0 — that is the ScrollTrigger start of the beat's fade-in, i.e. the single
 * position where it is still completely transparent, so a rail click aimed there
 * would park the reader on a blank screen. The entry scrub ends at ENTER_END and
 * the exit begins at EXIT_START, so aim between them. Same reasoning, and the
 * same numbers, as `actAnchor` in app/page.tsx.
 */
const ENTER_END = 0.34;
const HOLD_DUR = 0.38;
const EXIT_START = 0.72;
const EXIT_DUR = 0.28;
const PLATEAU_MID = 0.53;

/* ───────────────────────────────────────────────────────────────── model ──── */

/**
 * A beat as this shell needs it. Structurally satisfied by `RecordBeat` from
 * lib/record-narrative; declared locally and read-only so the container depends
 * on a shape rather than on the narrative module's exact type.
 */
export interface RecordShellBeat {
  id: string;
  kicker: string;
  title: string;
  body: ReadonlyArray<string>;
  evidence: ReadonlyArray<FlowingEvidence>;
  /** Live quantities the beat prints. `key` is a lookup, never a value. */
  figures?: ReadonlyArray<{ label: string; key: string }>;
}

export interface RecordShellProps {
  beats: ReadonlyArray<RecordShellBeat>;
  /**
   * Published figures, already formatted for print: key -> string, or null where
   * the pipeline published the field with nothing in it. A key the caller has not
   * published at all should be ABSENT from the map rather than mapped to null —
   * the two are different failures and the reader is told which one happened.
   */
  figures: Record<string, string | null>;
  /**
   * Override the crossover. Defaults to `MOVEMENT_II_START`; pass
   * `crossoverFor(ACTS.length)` from the page that owns the acts so the split
   * tracks the act count instead of the constant.
   */
  crossover?: number;
}

/* ────────────────────────────────────────────────────── figure resolution ──── */

/**
 * Resolve one figure key, or explain the absence.
 *
 * `value` and `reason` come back mutually exclusive and jointly exhaustive: there
 * is no path out of here that yields a null value with no reason attached.
 *
 * An empty string counts as missing. A zero-length figure would paint as a blank
 * slot, which is exactly the state the unavailable branch exists to replace, so
 * it is routed there rather than printed.
 */
function resolveFigure(
  spec: { label: string; key: string },
  figures: Record<string, string | null>,
  published: boolean,
): ResolvedFigure {
  const present = Object.prototype.hasOwnProperty.call(figures, spec.key);
  const raw = present ? figures[spec.key] : undefined;

  if (typeof raw === 'string' && raw.length > 0) {
    return { label: spec.label, key: spec.key, value: raw, reason: null };
  }

  // The three reasons are genuinely distinct and a reader needs to know which
  // one applies: nothing has been published at all, the payload does not carry
  // this field, or the field arrived empty. None of them asserts WHY the
  // pipeline could not produce the number — that would be a claim about the
  // analysis this component has no evidence for.
  const reason = !published
    ? 'No publish read yet. The pipeline has not written a payload this page could resolve.'
    : !present
      ? `Not in the last publish. The payload carried no ${spec.key} field.`
      : `The last publish carried ${spec.key} with no value.`;

  return { label: spec.label, key: spec.key, value: null, reason };
}

/* ─────────────────────────────────────────────────────────────── section ──── */

/**
 * One fixed, scrub-revealed beat.
 *
 * Identical choreography to `Act` in app/page.tsx, with two deliberate
 * differences: there is no first-section special case (the archive is never the
 * landing frame, so it can always be scrubbed in), and the section's range is an
 * absolute document fraction rather than a fraction of Movement I.
 */
function BeatSection({
  id, start, end, isLast, children,
}: {
  id: string;
  start: number;
  end: number;
  isLast: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = gsap.context(() => {
      // ONE timeline, ONE ScrollTrigger, spanning the beat's whole range.
      //
      // The three tweens below are sequential members of a single timeline, which
      // is a different thing from three independent tweens: a timeline renders
      // its children in order on every tick, so `autoAlpha` remains a pure
      // function of the timeline's own progress and scrubbing backwards through
      // the exit exactly undoes it.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: document.documentElement,
          // Percentage starts resolve against documentElement's height, which is
          // the same basis flowing-text's own trigger uses. `scrollState.progress`
          // divides by the scrollable limit instead; mixing the two puts the type
          // and the section it sits in on ranges that differ by one viewport.
          start: () => `${(start * 100).toFixed(4)}% top`,
          end: () => `${(end * 100).toFixed(4)}% top`,
          scrub: 0.6,
        },
      });

      if (reduced) {
        // Opacity only. This is not decoration and cannot be dropped: eight
        // fixed sections stacked on one another with no handoff print through
        // each other into unreadable mush. Nothing translates, nothing blurs.
        tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, ease: 'none', duration: ENTER_END }, 0);
        tl.to(el, { autoAlpha: 1, duration: HOLD_DUR }, ENTER_END);
        if (!isLast) {
          tl.to(el, { autoAlpha: 0, ease: 'none', duration: EXIT_DUR }, EXIT_START);
        }
        return;
      }

      tl.fromTo(el,
        { autoAlpha: 0, y: 60, filter: 'blur(14px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', ease: 'none', duration: ENTER_END }, 0);
      // Hold, so the beat sits still and readable through the middle of its
      // range while flowing-text finishes unveiling the type inside it.
      tl.to(el, { autoAlpha: 1, duration: HOLD_DUR }, ENTER_END);

      // The last beat has nothing following it, so it must not fade: an exit here
      // scrubs the closing paragraph away over the final stretch of the document
      // and leaves the reader on a blank screen at the bottom of the page. Same
      // rule as the last act.
      if (!isLast) {
        tl.to(el, {
          autoAlpha: 0, y: -50, filter: 'blur(14px)', ease: 'none', duration: EXIT_DUR,
        }, EXIT_START);
      }
    }, el);

    return () => ctx.revert();
  }, [start, end, isLast]);

  return (
    <section
      ref={ref}
      id={id}
      className="pointer-events-none fixed inset-0 flex items-center justify-center px-6 pt-20 opacity-0 md:pr-20"
    >
      {/* Capped and scrollable rather than clipped — the same cap the acts use,
          and Movement II needs it more than they do. A fixed section cannot grow,
          and the dense beats (five paragraphs, eight figures, seven citations)
          exceed a short viewport at every width. Crushing the type to fit would
          cost legibility on every screen to satisfy the smallest, so the type
          stays honest and the rare overflow scrolls. `overscroll-contain` stops
          that inner scroll from chaining into Lenis at the ends, which otherwise
          reads as the page jumping a beat. */}
      <div className="pointer-events-auto max-h-[calc(100dvh-104px)] w-full max-w-[1024px] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────── shell ──── */

export default function RecordShell({ beats, figures, crossover }: RecordShellProps) {
  // Which beat the reader is in, or -1 while they are still in Movement I. React
  // state is correct here precisely because it changes a handful of times over
  // the whole document — the per-frame signals live in the mutable module state
  // of lib/scroll-engine and never go through a render.
  const [active, setActive] = useState(-1);

  const cross = Math.min(MAX_CROSSOVER, Math.max(0, crossover ?? MOVEMENT_II_START));
  const span = 1 - cross;
  const n = beats.length;

  // An empty map means nothing has been published yet, which is a different
  // reason from a key being absent from a payload that did arrive. Derived rather
  // than passed as a flag so the caller cannot hand over a map and a
  // contradicting claim about whether it is real.
  const published = Object.keys(figures).length > 0;

  useEffect(() => {
    if (n === 0) return;
    const st = ScrollTrigger.create({
      trigger: document.documentElement,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        const k = span > 0 ? (self.progress - cross) / span : 0;
        const i = k < 0 ? -1 : Math.min(n - 1, Math.floor(k * n));
        setActive((prev) => (prev === i ? prev : i));
      },
    });
    return () => st.kill();
  }, [cross, span, n]);

  if (n === 0) return null;

  /** Where the rail should land for beat `i` — the middle of its plateau. */
  const anchorFor = (i: number) =>
    (cross + ((i + PLATEAU_MID) / n) * span) * document.documentElement.scrollHeight;

  return (
    <>
      {beats.map((beat, i) => {
        const start = cross + (i / n) * span;
        const end = cross + ((i + 1) / n) * span;

        // Resolved here rather than inside FlowingText so that the component
        // which PAINTS a figure never also decides whether there is one. One
        // place makes the decision, one place renders the consequence.
        const resolved = (beat.figures ?? []).map((f) => resolveFigure(f, figures, published));

        return (
          <BeatSection
            key={beat.id}
            id={`beat-${beat.id}`}
            start={start}
            end={end}
            isLast={i === n - 1}
          >
            <FlowingText
              beat={beat}
              // Ordinal from the array position, not from any index the content
              // carries: the same number produced this beat's scroll range, so
              // the two cannot disagree about which beat this is.
              ordinal={i + 1}
              figures={resolved}
              start={start}
              end={end}
            />
          </BeatSection>
        );
      })}

      {/* The only accent on this screen, because it is the only control on it.
          Eight fixed sections give a reader no sense of position — the scrollbar
          is hidden and the sections do not stack visibly — so the rail is
          orientation, not chrome. Hidden on narrow screens: at that width it
          would either overlap the measure or shrink below the 44px hit target,
          and the section ids remain anchorable either way. */}
      <nav
        aria-label="Record beats"
        aria-hidden={active < 0}
        className={`fixed right-3 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-0.5 transition-opacity duration-500 md:flex ${
          active < 0 ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'
        }`}
        /* The curve is read from the theme token rather than restated as a
           literal, which is also how the rest of the site references it — the
           project has exactly one ease and it is defined once, in globals.css. */
        style={{ transitionTimingFunction: 'var(--ease-apple)' }}
      >
        <span className="numeral mb-1 mr-2 text-[9px] uppercase tracking-[0.28em] text-ink-600">
          Record
        </span>
        {beats.map((beat, i) => (
          <button
            key={beat.id}
            type="button"
            data-magnetic={beat.title}
            aria-label={`${beat.title} — ${beat.kicker}`}
            aria-current={i === active ? 'true' : undefined}
            onClick={() => scrollTo(anchorFor(i))}
            /* `pill` supplies the 44px hit target and the press-dim; the capsule
               fill is left to `pill-active`, which is the accent's one appearance
               in Movement II. */
            className={`pill justify-end px-2 py-0 ${i === active ? 'pill-active' : ''}`}
          >
            <span className="numeral text-[10px] tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
            {/* A rule that grows on the active beat, so position reads without
                the reader having to compare two small numbers. */}
            <span
              aria-hidden
              className="h-px transition-all duration-300"
              style={{
                width: i === active ? 22 : 10,
                background: i === active ? 'currentColor' : 'rgb(255 255 255 / 0.22)',
                transitionTimingFunction: 'var(--ease-apple)',
              }}
            />
          </button>
        ))}
      </nav>
    </>
  );
}
