'use client';

/**
 * Flowing text — the editorial motion of Movement II.
 *
 * Movement I pins a slab of type per act and crossfades it. Eight beats in a row
 * done that way reads as a slide deck, so the archive moves differently: the
 * three strata of a beat travel at different rates while it is on screen, so the
 * argument, the measurements and the citations drift against one another and the
 * block reads as flowing past the reader rather than being swapped in.
 *
 * ONE timeline, ONE ScrollTrigger, and it never touches a property the shell
 * owns.
 *
 * Two independent scrubbed tweens on one property is the specific mistake that
 * once left every section of this site permanently visible: past their shared
 * range both sit at progress 1, each asserting a different value on the same
 * frame, and whichever GSAP rendered last stuck for good because neither ever
 * wrote again. So there is exactly one animation per beat here, and the split of
 * authority is strict — record-shell writes the SECTION's autoAlpha/y/filter,
 * this file writes the STRATA's y and the individual runs of type. One writer
 * per property, on separate elements.
 *
 * The drift is deliberately linear (ease 'none'): a scrubbed parallax has to
 * track the scroll exactly or it reads as lag. The reveals use the 'editorial'
 * ease that lib/scroll-engine creates — slow at both ends, fast through the
 * middle — which is what makes type feel unveiled rather than slid.
 *
 * NO NUMBER IS TYPED IN THIS FILE, and none is typed in the prose it renders.
 * lib/record-narrative is written under the rule that anything the pipeline
 * computes travels as a figure KEY, never as a literal in a sentence, because
 * the watcher republishes on every survey submission and a baked-in figure
 * becomes a wrong figure the moment a response arrives. This component therefore
 * has no substitution machinery for body copy at all: body paragraphs are
 * authored prose, and every live quantity arrives already resolved in `figures`.
 * Adding a `{token}` substitution here would be an invitation to put statistics
 * back into sentences, which is the failure the split exists to prevent.
 *
 * Colour: none. Movement II is the monochrome register, so the type is greyscale
 * and the rules are hairlines; the accent belongs to the page's controls, and the
 * only control on this screen is the shell's beat rail.
 */

import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '@/lib/scroll-engine';

/* ──────────────────────────────────────────────────────────────── model ──── */

/**
 * One citation. `detail` names the file, constant or artefact that supports the
 * beat, printed next to the claim rather than hidden in a footnote.
 *
 * Structurally the same shape as `BeatEvidence` in lib/record-narrative, but
 * declared locally and read-only so this component depends on a shape rather
 * than on the narrative module. A `RecordBeat` is assignable to `FlowingBeat`
 * as-is.
 */
export interface FlowingEvidence {
  label: string;
  detail: string;
}

/** A beat's authored prose. No figures, by contract — see the header. */
export interface FlowingBeat {
  id: string;
  /** Set as an eyebrow, in the monochrome override. */
  kicker: string;
  /** Set as display-2. */
  title: string;
  /** Paragraphs, in order. */
  body: ReadonlyArray<string>;
  evidence: ReadonlyArray<FlowingEvidence>;
}

/**
 * A live quantity, already looked up against the published payload by the shell.
 *
 * `value` and `reason` are mutually exclusive and jointly exhaustive: exactly one
 * of them is non-null. That is enforced by construction in record-shell rather
 * than by a type, because the alternative — a nullable value with an optional
 * reason — permits the one state this page must never render, which is a figure
 * slot that is empty and says nothing about why.
 */
export interface ResolvedFigure {
  /** Editorial name of the quantity. */
  label: string;
  /** The lookup key, printed with the unavailable state so the absence is auditable. */
  key: string;
  /** Formatted and ready to print. Null when the payload carried nothing. */
  value: string | null;
  /** Why there is no value. Non-null exactly when `value` is null. */
  reason: string | null;
}

export interface FlowingTextProps {
  beat: FlowingBeat;
  /**
   * Human ordinal, 1-based. Derived by the shell from the beat's position in the
   * array it was handed, so it cannot disagree with the scroll range the same
   * position produced.
   */
  ordinal: number;
  /** Live figures, already resolved against the figures map by the shell. */
  figures: ReadonlyArray<ResolvedFigure>;
  /**
   * The document-progress window this beat owns, 0-1. The shell's section
   * timeline resolves against the same two numbers, so the type and the section
   * it sits in move on one range.
   */
  start: number;
  end: number;
}

/* ──────────────────────────────────────────────────────────── constants ──── */

/**
 * Total travel of each stratum across the beat's whole range, in px.
 *
 * Three rates, each about 1.6x the one above it: enough that they read as
 * separate depths drifting past, little enough that the deepest one's half-travel
 * stays well inside the shell's capped content box. All three are symmetric about
 * the middle of the range, so a beat sits exactly on its layout position through
 * the plateau where it is fully opaque and only leans as it arrives and leaves.
 *
 * The citation band gets the most travel because it is the smallest type and the
 * furthest "back" in the reading order; giving the headline the largest offset
 * instead makes the whole block feel like it is sliding rather than settling.
 */
const PROSE_DRIFT = 34;
const FIGURE_DRIFT = 56;
const CITATION_DRIFT = 88;

/**
 * Reveal schedule, in fractions of the beat's range.
 *
 * Everything has to be fully revealed before the shell starts the beat's exit at
 * 0.72, or the last line would still be arriving while the whole section fades.
 * The stagger is solved from the run count so a long beat finishes where a short
 * one does, and capped so a two-line beat does not crawl.
 */
const REVEAL_START = 0.02;
const REVEAL_DUR = 0.24;
const REVEAL_DONE = 0.46;
const MAX_STAGGER = 0.05;

export default function FlowingText({
  beat, ordinal, figures, start, end,
}: FlowingTextProps) {
  const root = useRef<HTMLDivElement>(null);
  const prose = useRef<HTMLDivElement>(null);
  const ledger = useRef<HTMLDivElement>(null);
  const citations = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const colA = prose.current;
    if (!el || !colA) return;
    // Either may legitimately be absent: a beat with no live figures does not
    // render the ledger column at all rather than standing it empty, and the
    // same holds for the citation band.
    const colB = ledger.current;
    const colC = citations.current;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const runs = Array.from(el.querySelectorAll<HTMLElement>('[data-flow]'));
    const strata = [colA, colB, colC].filter((n): n is HTMLDivElement => n !== null);

    // Reduce Motion: statically visible, nothing transformed, no trigger at all.
    //
    // Note that the SECTION around this still crossfades on scroll even here —
    // see record-shell. Eight fixed sections stacked on one another with no
    // opacity handoff print through each other, so that fade is legibility, not
    // decoration, and under Reduce Motion it is opacity only.
    if (reduced) {
      gsap.set(strata, { clearProps: 'transform' });
      if (runs.length) gsap.set(runs, { autoAlpha: 1, y: 0 });
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true });

      // ---- drift: one tween per stratum, on the stratum's own element -------
      const drifts: Array<[HTMLDivElement | null, number]> = [
        [colA, PROSE_DRIFT], [colB, FIGURE_DRIFT], [colC, CITATION_DRIFT],
      ];
      for (const [node, travel] of drifts) {
        if (!node) continue;
        tl.fromTo(node,
          { y: travel / 2 },
          { y: -travel / 2, ease: 'none', duration: 1 }, 0);
      }

      // ---- reveal: one staggered tween over the runs inside the strata ------
      // Different elements from the drift, so no property has two writers.
      if (runs.length) {
        const each = Math.min(
          MAX_STAGGER,
          Math.max(0, (REVEAL_DONE - REVEAL_START - REVEAL_DUR) / Math.max(1, runs.length - 1)),
        );
        tl.fromTo(runs,
          { autoAlpha: 0, y: 14 },
          { autoAlpha: 1, y: 0, ease: 'editorial', duration: REVEAL_DUR, stagger: each },
          REVEAL_START);
      }

      // The trigger is created last and exactly once, after every tween is on
      // the timeline, so there is no way to end up with a second one scrubbing
      // the same animation. The percentage range resolves against
      // documentElement, the same basis the shell's section timeline uses.
      ScrollTrigger.create({
        id: `beat-${beat.id}`,
        trigger: document.documentElement,
        start: () => `${(start * 100).toFixed(4)}% top`,
        end: () => `${(end * 100).toFixed(4)}% top`,
        scrub: 0.55,
        animation: tl,
      });
    }, el);

    return () => ctx.revert();
    // Keyed on the beat's identity and range, not on the resolved content: the
    // runs only ever animate opacity and offset, so a republished figure changing
    // a row's text must not tear down and re-register a ScrollTrigger. The run
    // COUNT can change with the content, which only re-solves the stagger on the
    // next genuine remount — a slightly stale stagger is invisible, a torn-down
    // trigger is a section stuck at whatever opacity it last held.
  }, [beat.id, start, end]);

  const hasFigures = figures.length > 0;
  const hasEvidence = beat.evidence.length > 0;

  return (
    <div ref={root} className="w-full">
      <div className={`grid gap-9 ${hasFigures ? 'md:grid-cols-[1.1fr_0.9fr] md:gap-14' : ''}`}>
        <div ref={prose} style={{ willChange: 'transform' }}>
          {/* `eyebrow` carries the form — 10px numeric caps at 0.32em — but its
              colour is the live accent, and Movement II is monochrome. Overridden
              with Tailwind v4's important SUFFIX (`text-ink-400!`), which is the
              only way to beat another utility that also sets `color`. */}
          <p data-flow className="eyebrow text-ink-400! mb-2 flex items-center gap-2">
            {/* Zero-padded so the rail and the beat head agree at a glance, and
                so the column does not reflow between single and double digits. */}
            <span className="text-ink-600!">{String(ordinal).padStart(2, '0')}</span>
            <span aria-hidden className="h-px w-6 bg-white/15" />
            {beat.kicker}
          </p>
          <h2 data-flow className="display-2 mb-4 max-w-[22ch] text-ink-100">{beat.title}</h2>

          {beat.body.map((para, i) => (
            <p
              key={`${beat.id}-p${i}`}
              data-flow
              className={`max-w-[58ch] [text-wrap:pretty] ${
                i === 0
                  // The opening paragraph is set a step above body copy: it is
                  // the beat's claim, and the paragraphs after it are support.
                  ? 'text-[19px] leading-[1.5] tracking-[-0.003em] text-ink-100'
                  : 'body-17 mt-4'
              }`}
            >
              {para}
            </p>
          ))}
        </div>

        {hasFigures && (
          <div ref={ledger} style={{ willChange: 'transform' }}>
            {/* Names the provenance rather than the quantity. Every row under
                this heading is read off the payload at paint time, and saying so
                is what separates it from the citations below, which are facts
                about files and do not move when the pipeline reruns. */}
            <p data-flow className="eyebrow text-ink-400! mb-1.5">From the last publish</p>
            <ul className="flex flex-col">
              {figures.map((f) => (
                <li
                  key={`${beat.id}-f-${f.key}`}
                  data-flow
                  data-magnetic={f.label}
                  className="flex items-baseline gap-3 border-b border-white/[0.07] py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-[13px] leading-tight text-ink-300">
                    {f.label}
                  </span>
                  {f.value === null ? (
                    /* Explicit unavailable state, naming the reason in the
                       figure's own slot. Never a bare em-dash and never a zero:
                       both read as a measurement that was taken and came back
                       empty, which is a different and much stronger claim than
                       "the pipeline published nothing here". */
                    <span className="max-w-[56%] shrink-0 text-right text-[10px] leading-[1.35] text-ink-600">
                      {f.reason}
                    </span>
                  ) : (
                    <span className="numeral shrink-0 text-right text-[18px] text-ink-100">
                      {f.value}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {hasEvidence && (
        /* The citations sit under both columns rather than beside them: they are
           the beat's apparatus, they are set at the smallest size on the page,
           and a third column of 11px type at this measure would be unreadable on
           anything narrower than a desktop. A hairline is the only separator —
           Movement II has no cards. */
        <div
          ref={citations}
          style={{ willChange: 'transform' }}
          className="mt-9 border-t border-white/[0.08] pt-4"
        >
          <p data-flow className="eyebrow text-ink-400! mb-2">Evidence</p>
          <ul className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
            {beat.evidence.map((e, i) => (
              <li key={`${beat.id}-e${i}`} data-flow data-magnetic={e.label}>
                <span className="numeral block text-[10.5px] uppercase leading-tight tracking-[0.16em] text-ink-400">
                  {e.label}
                </span>
                <span className="mt-1 block max-w-[62ch] text-[11.5px] leading-[1.45] text-ink-600 [text-wrap:pretty]">
                  {e.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
