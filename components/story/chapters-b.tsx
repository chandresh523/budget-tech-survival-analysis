'use client';

import { useState } from 'react';
import {
  deviceKeysOf,
  kmComparisonOf,
  kmCurvesOf,
  kmOverallOf,
  modelsOf,
  type KmCurve,
  type PipelinePayload,
} from '@/lib/supabase-browser';

const SERIES = ['#00c2d1', '#7c5cff', '#22d07a', '#ffb020', '#ff4fa3',
                '#5ef2ff', '#b9a3ff', '#6bf0ab', '#ffd166', '#ff8fbf'];

/* ─────────────────────────────────────────────────────────── SURVIVAL ──── */

const W = 760;
const H = 300;
const PAD = { l: 44, r: 16, t: 12, b: 34 };

/** Step path. Survival changes only at observed event times, so a smoothed
 *  line would misstate the estimator — the horizontal-then-vertical shape is a
 *  correctness requirement, not a style choice. */
function stepPath(pts: { month: number; survival: number }[], maxX: number): string {
  if (!pts.length) return '';
  const x = (m: number) => PAD.l + (m / maxX) * (W - PAD.l - PAD.r);
  const y = (s: number) => PAD.t + (1 - s) * (H - PAD.t - PAD.b);
  let d = `M ${x(pts[0].month)} ${y(pts[0].survival)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${x(pts[i].month)} ${y(pts[i - 1].survival)} L ${x(pts[i].month)} ${y(pts[i].survival)}`;
  }
  return d;
}

function bandPath(pts: KmCurve['points'], maxX: number): string {
  const usable = pts.filter((p) => p.lower !== null && p.upper !== null);
  if (usable.length < 2) return '';
  const x = (m: number) => PAD.l + (m / maxX) * (W - PAD.l - PAD.r);
  const y = (s: number) => PAD.t + (1 - s) * (H - PAD.t - PAD.b);
  const up = usable.map((p) => `${x(p.month)},${y(p.upper!)}`).join(' L ');
  const dn = [...usable].reverse().map((p) => `${x(p.month)},${y(p.lower!)}`).join(' L ');
  return `M ${up} L ${dn} Z`;
}

export function SurvivalChapter({
  data,
  selected,
  onSelect,
}: {
  data: PipelinePayload | null;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const curves = kmCurvesOf(data);
  const overall = kmOverallOf(data);
  const comparison = kmComparisonOf(data);
  const devices = deviceKeysOf(data).filter((k) => curves[k]?.estimable);
  const [local, setLocal] = useState<string | null>(null);
  // The orbital cluster and this chapter share one selection, so picking a
  // device in the hero carries through to its curve here.
  const shown = selected ?? local;
  const setShown = (v: string | null) => (onSelect ? onSelect(v) : setLocal(v));

  const active = shown ? curves[shown] : overall;
  const maxX = Math.max(
    24,
    ...(active?.points.map((p) => p.month) ?? [24]),
  );

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="flex flex-col gap-6 px-2">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Chapter 03</span>
        <h2 className="display text-[clamp(2rem,5vw,3.4rem)] text-ink-100">Survival</h2>
        <p className="body-17 max-w-[60ch]">
          Kaplan–Meier estimates, stepping down at each observed failure. The shaded
          band is the 95% confidence interval.
        </p>
      </header>

      <div className="glass-panel-2 rounded-3xl p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
             aria-label="Kaplan-Meier survival curve">
          {ticks.map((t) => {
            const y = PAD.t + (1 - t) * (H - PAD.t - PAD.b);
            return (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="rgb(255 255 255 / 0.07)" />
                <text x={PAD.l - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="#8a8896">
                  {Math.round(t * 100)}%
                </text>
              </g>
            );
          })}
          {[0, 6, 12, 18, 24, 36, 48].filter((m) => m <= maxX).map((m) => {
            const x = PAD.l + (m / maxX) * (W - PAD.l - PAD.r);
            return (
              <text key={m} x={x} y={H - 12} textAnchor="middle" fontSize="10" fill="#8a8896">
                {m}
              </text>
            );
          })}

          {active && (
            <>
              <path d={bandPath(active.points, maxX)} fill="var(--accent)" opacity="0.14" />
              <path
                d={stepPath(active.points, maxX)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0 0 8px color-mix(in oklab, var(--accent) 60%, transparent))' }}
              />
            </>
          )}
          <text x={W / 2} y={H - 1} textAnchor="middle" fontSize="9"
                letterSpacing="0.22em" fill="#4a4856">
            MONTHS SINCE PURCHASE
          </text>
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShown(null)}
          className={`pill ${shown === null ? 'pill-active' : ''}`}
        >
          All devices
        </button>
        {devices.map((k, i) => (
          <button
            key={k}
            type="button"
            onClick={() => setShown(k === shown ? null : k)}
            className={`pill capitalize ${k === shown ? 'pill-active' : ''}`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
            {k}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="glass-panel rounded-2xl px-4 py-3">
          <p className="text-[11px] text-ink-600">Median survival</p>
          <p className="numeral mt-1 text-xl text-ink-100">
            {active?.median_survival_months ?? 'Not reached'}
            {active?.median_survival_months ? ' mo' : ''}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-ink-600">
            {active?.median_survival_months
              ? 'Half the units had failed by this point.'
              : 'Fewer than half the units failed within follow-up, so no median exists to quote.'}
          </p>
        </div>
        <div className="glass-panel rounded-2xl px-4 py-3">
          <p className="text-[11px] text-ink-600">RMST (24 mo)</p>
          <p className="numeral mt-1 text-xl text-ink-100">
            {active?.restricted_mean_months ?? '—'} mo
          </p>
          <p className="mt-1 text-[11px] leading-snug text-ink-600">
            Mean service life over the first two years. Used instead of the median.
          </p>
        </div>
        <div className="glass-panel rounded-2xl px-4 py-3">
          <p className="text-[11px] text-ink-600">Log-rank across categories</p>
          <p className="numeral mt-1 text-xl text-ink-100">
            {comparison ? `${comparison.significant_pairs}/${comparison.pairs.length}` : '—'}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-ink-600">
            pairs separating at p &lt; {comparison?.alpha ?? 0.05}.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── MODELS ──── */

function SkillCard({
  title, blurb, inSample, cv, tone,
}: { title: string; blurb: string; inSample: number; cv: number; tone: string }) {
  const useless = cv < 0.5;
  return (
    <div className="glass-panel flex flex-col gap-4 rounded-3xl px-6 py-6">
      <div>
        <h3 className="text-lg font-semibold text-ink-100">{title}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-600">{blurb}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-panel-2 rounded-2xl px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-ink-600">In-sample</p>
          <p className="numeral mt-1 text-2xl" style={{ color: tone }}>{inSample.toFixed(3)}</p>
        </div>
        <div className="glass-panel-2 rounded-2xl px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-ink-600">Cross-validated</p>
          <p className={`numeral mt-1 text-2xl ${useless ? 'text-signal-red' : 'text-ink-100'}`}>
            {cv.toFixed(3)}
          </p>
        </div>
      </div>
      {useless && (
        <p className="text-[12px] leading-relaxed text-signal-amber">
          Below 0.50 out of sample — worse than a coin flip. The in-sample figure is
          the model memorising the training rows, not predicting.
        </p>
      )}
    </div>
  );
}

export function ModelsChapter({ data }: { data: PipelinePayload | null }) {
  const m = modelsOf(data);

  return (
    <div className="flex flex-col gap-6 px-2">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Chapter 04</span>
        <h2 className="display text-[clamp(2rem,5vw,3.4rem)] text-ink-100">Can we predict it?</h2>
        <p className="body-17 max-w-[60ch]">
          Cox proportional hazards against a random survival forest — scored both on
          the data they were fitted to and, honestly, on data they never saw.
        </p>
      </header>

      {!m ? (
        <div className="glass-panel rounded-3xl px-6 py-10 text-center">
          <p className="text-sm text-ink-400">Model results not yet published.</p>
          <p className="mt-1 text-[12px] text-ink-600">
            They appear here after the next pipeline run.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <SkillCard
              title="Cox proportional hazards"
              blurb="Semi-parametric, linear in the log-hazard, assumes hazard ratios hold over time."
              inSample={m.cox_in}
              cv={m.cox_cv}
              tone="#00c2d1"
            />
            <SkillCard
              title="Random survival forest"
              blurb="Non-parametric ensemble. No proportionality assumption, no linearity."
              inSample={m.rsf_in}
              cv={m.rsf_cv}
              tone="#7c5cff"
            />
          </div>

          <div className="glass-panel rounded-3xl px-6 py-5">
            <h3 className="text-[13px] font-semibold text-ink-100">Cox covariates</h3>
            <table className="mt-3 w-full text-left text-[12px]">
              <thead>
                <tr className="text-ink-600">
                  <th className="pb-2 font-medium">Covariate</th>
                  <th className="pb-2 text-right font-medium">HR</th>
                  <th className="pb-2 text-right font-medium">95% CI</th>
                  <th className="pb-2 text-right font-medium">p</th>
                </tr>
              </thead>
              <tbody>
                {m.covariates.map((c) => (
                  <tr key={c.label} className="border-t border-white/6">
                    <td className="py-2 text-ink-300">{c.label}</td>
                    <td className="numeral py-2 text-right text-ink-100">{c.hr.toFixed(3)}</td>
                    <td className="numeral py-2 text-right text-ink-600">
                      ({c.lo.toFixed(2)}, {c.hi.toFixed(2)})
                    </td>
                    <td className={`numeral py-2 text-right ${c.p < 0.05 ? 'text-signal-green' : 'text-ink-600'}`}>
                      {c.p.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-600">
              Every interval contains 1 and no p-value clears 0.05: on the covariates
              available, none of price, care or brand tier measurably changes failure
              risk. With {m.folds}-fold validation the honest conclusion is that this
              panel cannot yet predict which device fails next.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
