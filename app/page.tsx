'use client';

/**
 * Lifespan Matrix — the cinematic cut. THE root route, and the deliverable.
 *
 * It used to live at /cinematic with nothing anywhere linking to it, so opening
 * the site showed the story cut and this was reachable only by typing the URL.
 * /cinematic now redirects here (see next.config.js) so older links still work.
 *
 * Eight acts flown through a data universe. The DOM carries editorial type only;
 * every figure is live from the pipeline, and the cloud you fly through is the
 * actual (time, event) pairs published by the watcher.
 *
 * The acts deliberately go past the headline numbers. A six-act highlight reel
 * of ~13 scalars looked cinematic but quietly dropped the analysis: the
 * per-category curves, the pairwise log-rank, the per-brand rates and the Cox
 * covariates were all published and none of them were on screen. Those now have
 * acts of their own, set as editorial ledgers rather than charts — see
 * `act-blocks.tsx` for why.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import PixelTransition, { type PixelTransitionHandle } from '@/components/cinematic/pixel-transition';
import Stage from '@/components/cinematic/stage';
import StatReveal from '@/components/cinematic/stat-reveal';
import {
  BrandLedger, ClassLedger, CovariateLedger, CurveLedger, DivergenceLedger, ImpactLedger,
  SkillLedger, type DeviceSkill,
} from '@/components/cinematic/act-blocks';
import {
  getServerSnapshot, getStreamSnapshot, startStream, streamBuffer, subscribeStream,
} from '@/lib/realtime-stream';
import { gsap, ScrollTrigger, scrollTo } from '@/lib/scroll-engine';
import { useLiveMetrics } from '@/hooks/use-live-metrics';
import {
  brandsOf, deviceKeysOf, impactOf, kmComparisonOf, kmCurvesOf, kmOverallOf, modelsOf,
} from '@/lib/supabase-browser';
import { RECORD_BEATS } from '@/lib/record-narrative';
import { resolveFigures } from '@/lib/record-figures';
import RecordShell, { crossoverFor } from '@/components/record/record-shell';

const ACTS = [
  { id: 'arrival',   label: 'Arrival',  accent: '#00c2d1', accent2: '#7c5cff' },
  { id: 'panel',     label: 'Panel',    accent: '#7c5cff', accent2: '#00c2d1' },
  { id: 'survival',  label: 'Survival', accent: '#00c2d1', accent2: '#22d07a' },
  { id: 'classes',   label: 'Classes',  accent: '#22d07a', accent2: '#00c2d1' },
  { id: 'logrank',   label: 'Log-rank', accent: '#5ef2ff', accent2: '#7c5cff' },
  { id: 'models',    label: 'Models',   accent: '#ffb020', accent2: '#ff4fa3' },
  { id: 'skill',     label: 'Skill',    accent: '#ffd166', accent2: '#ffb020' },
  { id: 'brands',    label: 'Brands',   accent: '#ff4fa3', accent2: '#ffb020' },
  { id: 'impact',    label: 'Impact',   accent: '#22d07a', accent2: '#00c2d1' },
];

/**
 * How the document is divided between the two movements.
 *
 * Movement I (the colour universe) owns the acts; Movement II (the monochrome
 * archive) owns the beats. Every act trigger below is expressed as a fraction of
 * MOVEMENT_I_SHARE rather than of the whole document, so adding the archive does
 * not silently rescale the act choreography underneath itself.
 */
const BEAT_COUNT = RECORD_BEATS.length;
const MOVEMENT_I_SHARE = crossoverFor(ACTS.length, BEAT_COUNT);

/**
 * Where the nav should land for act `i`.
 *
 * Not `(i / N) * scrollHeight` -- that is exactly the ScrollTrigger start of
 * the act's fade-in, i.e. the single position where it is still fully
 * transparent, so every nav click used to park the reader on a blank screen.
 *
 * Each act is fully opaque between (i + 0.34)/N and (i + 0.72)/N (the entry
 * scrub ends at the former, the exit begins at the latter), so aim at the
 * midpoint of that plateau. Measured against scrollHeight because that is the
 * basis ScrollTrigger's own percentage starts resolve against -- `scrollState.
 * progress` divides by the scrollable limit instead, and mixing the two is what
 * hid the discrepancy.
 */
function actAnchor(i: number): number {
  return ((i + 0.53) / ACTS.length) * MOVEMENT_I_SHARE
    * document.documentElement.scrollHeight;
}

/**
 * The way out of the dive.
 *
 * Revealed by its own ScrollTrigger on the last stretch of the document, so it
 * belongs to neither an act nor a beat. It fades rather than scrubs: a control
 * should never be half-present.
 */
function Outro({ onNavigate }: { onNavigate: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let st: ScrollTrigger | null = null;
    const ctx = gsap.context(() => {
      gsap.set(el, { autoAlpha: 0, y: 14 });
      st = ScrollTrigger.create({
        trigger: document.documentElement,
        start: '94% bottom',
        end: 'bottom bottom',
        onEnter: () => gsap.to(el, {
          autoAlpha: 1, y: 0, duration: 0.5, ease: 'apple', overwrite: true,
        }),
        onLeaveBack: () => gsap.to(el, {
          autoAlpha: 0, y: 14, duration: 0.35, ease: 'apple', overwrite: true,
        }),
      });
    }, el);
    return () => { st?.kill(); ctx.revert(); };
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-x-0 bottom-9 z-50 flex flex-col items-center gap-3 px-6"
    >
      <p className="eyebrow">End of the record</p>
      <button
        type="button"
        onClick={onNavigate}
        data-magnetic="Story"
        className="pill pointer-events-auto border-white/15 bg-white/[0.07] backdrop-blur-2xl backdrop-saturate-[1.8] hover:border-white/30"
      >
        Read it as a story
        <span aria-hidden className="text-ink-400">&rarr;</span>
      </button>
    </div>
  );
}

function Act({ index, id, children }: { index: number; id: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isFirst = index === 0;

    const ctx = gsap.context(() => {
      // ONE timeline per act, driven by ONE ScrollTrigger spanning the act's
      // whole range.
      //
      // This used to be two independent scrubbed tweens -- a fromTo to fade in
      // and a to to fade out -- both writing autoAlpha on the same element.
      // Past an act's exit both tweens sit at progress 1, so one asserts
      // "opacity 1" and the other "opacity 0" on the same frame, and whichever
      // GSAP happens to render last wins. Once their scrub catch-up finishes
      // neither writes again, so the losing value sticks: acts piled up on
      // screen, several visible at once, and which ones was a race. Verified
      // before the fix -- `panel` stayed at opacity 1 from 35% of the document
      // all the way to the bottom, printed over every act that followed.
      //
      // A single timeline has a single writer, so opacity is a pure function of
      // scroll position and scrubbing backwards is exact.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: document.documentElement,
          // Scaled into Movement I's share, not the whole document. Without
          // this every act's trigger spans the full scroll while the acts only
          // occupy the first ~53% of it, so each one fires roughly 1.9x too late
          // and never reaches full opacity at its own nav anchor.
          start: () => `${(index / ACTS.length) * MOVEMENT_I_SHARE * 100}% top`,
          end: () => `${((index + 1) / ACTS.length) * MOVEMENT_I_SHARE * 100}% top`,
          scrub: 0.6,
        },
      });

      if (isFirst) {
        // The landing frame cannot be scrubbed in: at progress 0 a scrub is by
        // definition at its start value, so the page would open on an empty
        // screen until the visitor happened to scroll. Introduce it on the clock
        // instead, and let the timeline own only its exit.
        gsap.set(el, { autoAlpha: 0, y: 24, filter: 'blur(10px)' });
        gsap.to(el, {
          autoAlpha: 1, y: 0, filter: 'blur(0px)',
          duration: reduced ? 0 : 1.1,
          delay: reduced ? 0 : 0.15,
          ease: 'editorial',
        });
        tl.set(el, {}, 0.72);
      } else {
        tl.fromTo(el,
          { autoAlpha: 0, y: 60, filter: 'blur(14px)' },
          { autoAlpha: 1, y: 0, filter: 'blur(0px)', ease: 'none', duration: 0.34 }, 0);
        // Hold, so the act sits still and readable through the middle of its range.
        tl.to(el, { autoAlpha: 1, duration: 0.38 }, 0.34);
      }

      // EVERY act fades out, the last one included.
      //
      // It used to be exempt, and that was right when the acts were the whole
      // document: an exit on the final act scrubbed the closing figures away and
      // left the reader on a blank screen at the bottom. Movement II changed the
      // premise. There is now an entire archive after the acts, so exempting
      // `impact` left it pinned at full opacity on top of every beat that
      // followed -- the closing figures printed straight over "The question".
      // The exemption belongs to whatever is genuinely last on the page, which is
      // the final beat, and RecordShell owns that.
      tl.to(el, {
        autoAlpha: 0, y: -50, filter: 'blur(14px)', ease: 'none', duration: 0.28,
      }, 0.72);
    }, el);
    return () => ctx.revert();
  }, [index]);

  return (
    <section ref={ref} id={id}
      className="pointer-events-none fixed inset-0 flex items-center justify-center px-6 pt-20 opacity-0">
      {/* Capped and scrollable rather than clipped. A fixed act cannot grow, and
          the data-heavy ones (ten brands, ten categories) exceed a short
          viewport once the ledger is shown at every width. Crushing the
          typography to fit would cost legibility on every screen to satisfy the
          smallest; this keeps the type honest and lets the rare overflow case
          scroll. Same approach as the story chapters. `overscroll-contain` stops
          the inner scroll from chaining into Lenis at the ends. */}
      <div className="pointer-events-auto max-h-[calc(100svh-150px)] w-full max-w-[1024px] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}

export default function CinematicPage() {
  // Two separate data paths, on purpose:
  //   - the 3D cloud reads `streamBuffer` directly inside useFrame, so a burst
  //     of realtime messages never re-renders this component;
  //   - `useLiveMetrics` supplies the figures the DOM prints, which change at
  //     human speed.
  const { data, sourceRows, analyzedRows, pipelineMs, updatedAt } = useLiveMetrics();
  const live = useSyncExternalStore(subscribeStream, getStreamSnapshot, getServerSnapshot);
  const [act, setAct] = useState(0);
  // Whether the reader has crossed into the monochrome archive. A boolean rather
  // than a per-frame number on purpose: the aurora and the electron field ease
  // toward whatever saturation they are handed, so flipping a flag that changes a
  // handful of times gives a smooth drain without a re-render per frame.
  const router = useRouter();
  const pixels = useRef<PixelTransitionHandle | null>(null);
  const onPixelsReady = useCallback((h: PixelTransitionHandle) => { pixels.current = h; }, []);

  // Prefetch, so the pixel cover is not hiding a network wait.
  useEffect(() => { router.prefetch('/story'); }, [router]);

  const toStory = useCallback(() => {
    const go = () => router.push('/story');
    if (pixels.current) pixels.current.cover(go);
    else go();
  }, [router]);

  useEffect(() => {
    const handle = startStream();
    return handle.stop;
  }, []);

  const devices = deviceKeysOf(data);
  const curves = kmCurvesOf(data);
  const overall = kmOverallOf(data);
  const comparison = kmComparisonOf(data);
  const models = modelsOf(data);
  const brands = brandsOf(data);
  const impact = impactOf(data);

  // Note there is no useMemo building a point array here any more: the cloud
  // lives in the mutable buffer and is uploaded to the GPU from the frame loop.
  const heat = streamBuffer.heat;
  const events = Object.values(curves).reduce((a, c) => a + c.events, 0);
  const s24 = overall?.points.find((p) => p.month === 24)?.survival ?? null;

  // Per-device concordance. Falls back to the legacy flat fields so an older
  // payload still renders rather than showing an empty act.
  const skills: DeviceSkill[] = devices.map((k) => {
    const d = data?.[k];
    const mc = d?.model_comparison;
    const c = curves[k];
    return {
      device: k,
      cox: mc?.cox_ph_c_index ?? d?.cox_c_index ?? null,
      rsf: mc?.rsf_c_index ?? d?.rsf_c_index ?? null,
      n: c?.n ?? d?.total_records ?? 0,
      events: c?.events ?? d?.active_failures ?? 0,
      fitState: mc?.fit_state,
      fitNote: mc?.fit_note ?? null,
    };
  });

  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: document.documentElement,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        const i = Math.min(
          ACTS.length - 1,
          Math.floor((self.progress / MOVEMENT_I_SHARE) * ACTS.length),
        );
        setAct((prev) => (prev === i ? prev : i));
        // No archive flag here any more. Colour drain and vignette are pure
        // functions of scroll inside the shader and the scrim, because a boolean
        // flipped at the crossover clamped the ramp to its end value the instant
        // it changed — measured: saturation went 0.87 -> 0.02 between two
        // adjacent samples, which is the step this was meant to remove.
      },
    });
    return () => st.kill();
  }, []);

  const palette = ACTS[act];

  // Every number the archive's prose refers to is resolved here, live. The
  // narrative itself contains no figures — see lib/record-figures.
  const figures = resolveFigures({ data, sourceRows, analyzedRows, pipelineMs, updatedAt });

  return (
    <main className="relative">
      <Stage streaming={streamBuffer} heat={heat} accent={palette.accent}
             accent2={palette.accent2} curves={curves} devices={devices}
             maxMonth={overall?.max_followup_months ?? 48}
             records={sourceRows ?? live.rows}
             crossover={MOVEMENT_I_SHARE}
             viewports={ACTS.length * 1.25 + BEAT_COUNT * 1.5}>
        <nav aria-label="Acts"
          className="glass-thick pointer-events-auto fixed left-1/2 top-5 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full px-2 py-1.5">
          {ACTS.map((a, i) => (
            <button key={a.id} type="button" data-magnetic={a.label}
              onClick={() => scrollTo(actAnchor(i))}
              aria-current={i === act ? 'true' : undefined}
              className={`pill shrink-0 ${i === act ? 'pill-active' : ''}`}>
              {a.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0 bg-white/10" aria-hidden />
          <span className="flex shrink-0 items-center gap-1.5 pr-2">
            <span className="h-1.5 w-1.5 rounded-full"
              style={{ background: live.status === 'live' ? '#22d07a' : '#8a8896',
                       boxShadow: live.status === 'live' ? '0 0 8px #22d07a' : 'none' }} />
            <span className="numeral text-[11px] text-ink-400">{live.rows || sourceRows || '—'}</span>
          </span>
        </nav>

        <Act index={0} id="arrival">
          <div className="text-center">
            <p className="eyebrow mb-5">Lifespan Matrix · live</p>
            <h1 className="display accent-text mx-auto max-w-[14ch]">
              Every device, every month, every failure.
            </h1>
            <p className="subhead mx-auto mt-6 max-w-[46ch]">
              {live.rows.toLocaleString()} records placed by their real survival time.
              Scroll to fly through {devices.length} categories of consumer hardware.
            </p>
            {/* The story cut is a second reading of the same live data. Without
                this it would sit at /story unlinked — exactly the state that
                kept this route invisible in the first place. */}
            {/* No link here any more. The way through to the story sits at the
                END of the dive — see Outro — so the hero asks for a scroll and
                nothing else. */}
          </div>
        </Act>

        <Act index={1} id="panel">
          <div className="grid gap-12 md:grid-cols-3">
            <StatReveal value={sourceRows ?? live.rows} label="Responses on record"
              note={updatedAt ? `Last publish ${updatedAt.toLocaleTimeString()}` : undefined} />
            <StatReveal value={devices.length}
              label="Hardware categories, each its own sector of the tunnel" />
            <StatReveal value={events}
              label="Observed failures — the only points carrying statistical weight"
              note={overall
                ? `${overall.censored ?? 0} censored, still working when last seen. `
                  + `Follow-up runs to ${overall.max_followup_months ?? '—'} months.`
                : undefined} />
          </div>
        </Act>

        <Act index={2} id="survival">
          <div className="grid items-center gap-6 lg:gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-6 sm:grid-cols-2 lg:gap-10 lg:grid-cols-1">
              <StatReveal value={overall?.restricted_mean_months ?? null} suffix="mo" precision={2}
                label="Mean service life across the panel"
                note="RMST at 24 months. The pooled median is never reached, so there is none to quote." />
              <StatReveal value={s24 === null ? null : s24 * 100} suffix="%" precision={1}
                label="Still working at two years"
                note="Kaplan–Meier, pooled across every category." />
            </div>
            <div>
              <CurveLedger overall={overall} />
            </div>
          </div>
        </Act>

        <Act index={3} id="classes">
          <ClassLedger curves={curves} />
        </Act>

        <Act index={4} id="logrank">
          <DivergenceLedger comparison={comparison} />
        </Act>

        <Act index={5} id="models">
          <div className="grid items-center gap-6 lg:gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-6 sm:grid-cols-2 lg:gap-10 lg:grid-cols-1">
              <StatReveal value={models ? models.cox_cv : null} precision={3}
                label="Cox proportional hazards, cross-validated"
                note="Below 0.50 is worse than a coin flip. This model does not generalise." />
              <StatReveal value={models ? models.rsf_cv : null} precision={3}
                label="Random survival forest, cross-validated"
                note={models ? `In-sample it scores ${models.rsf_in.toFixed(3)} — that gap is memorisation, not skill.` : undefined} />
            </div>
            <div>
              <CovariateLedger models={models} />
            </div>
          </div>
        </Act>

        <Act index={6} id="skill">
          <SkillLedger skills={skills} models={models} />
        </Act>

        <Act index={7} id="brands">
          <div className="grid items-center gap-6 lg:gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="hidden gap-10 lg:grid lg:grid-cols-1">
              <StatReveal value={brands ? brands.tiers.named.rate : null} precision={2}
                label="Named brands — failures per 100 device-months" />
              <StatReveal value={brands ? brands.tiers.unbranded.rate : null} precision={2}
                label="Unbranded and OEM — failures per 100 device-months"
                note={brands ? `Log-rank p = ${brands.tiers.p.toFixed(3)}. No measurable difference: paying for a name bought nothing here.` : undefined} />
            </div>
            <div>
              <BrandLedger brands={brands} />
            </div>
          </div>
        </Act>

        <Act index={8} id="impact">
          <div className="grid items-center gap-6 lg:gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-6 sm:grid-cols-2 lg:gap-10 lg:grid-cols-1">
              <StatReveal value={impact ? impact.L0 : null} suffix="mo" precision={2}
                label="Baseline service life"
                note="Restricted mean survival time, used because no median exists." />
              <StatReveal value={impact ? impact.F * impact.w : null} suffix="kg" precision={2}
                label="Replacement mass already discarded by this panel"
                note="A linear model over confirmed failures — an illustration, not a forecast." />
            </div>
            <div>
              <ImpactLedger impact={impact} />
            </div>
          </div>
        </Act>
        {/* Movement II — the monochrome archive. Same scroll, same dive; the
            canvas drains its colour as the reader crosses into it. */}
        <RecordShell beats={RECORD_BEATS} figures={figures} crossover={MOVEMENT_I_SHARE} />

        {/* End of the tunnel. Bottom-anchored rather than centred so it can sit
            over the final beat without competing for the middle of the screen —
            that beat deliberately never fades, being what is genuinely last.
            Liquid Glass because this is chrome: a floating capsule island over
            content, no drop shadow, one tinted action. */}
        <Outro onNavigate={toStory} />
      </Stage>

      <PixelTransition onReady={onPixelsReady} />
    </main>
  );
}
