'use client';

import { useEffect, useRef, useState } from 'react';
import { RingStat } from '@/components/story/activity-rings';
import {
  deviceKeysOf,
  kmCurvesOf,
  kmOverallOf,
  type PipelinePayload,
} from '@/lib/supabase-browser';

export interface ChapterData {
  data: PipelinePayload | null;
  meta: { sourceRows: number | null; analyzedRows: number | null; updatedAt: Date | null };
}

/** Counts to a target once, respecting Reduce Motion. */
function useCountUp(target: number, play: boolean, ms = 1100) {
  // Reduce Motion is known before the first paint, so start AT the target
  // rather than setting it from an effect (which is both a lint error and a
  // wasted frame showing 0).
  const [v, setV] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? target
      : 0,
  );
  const raf = useRef(0);
  useEffect(() => {
    if (!play) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      // easeOutExpo — fast start, long settle, which reads as a counter landing.
      setV(Math.round(target * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, play, ms]);
  return v;
}

function Counter({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const shown = useCountUp(value, true);
  return (
    <div className="flex flex-col gap-1">
      <span className="numeral text-5xl font-semibold leading-none text-ink-100 md:text-6xl">
        {shown.toLocaleString()}
      </span>
      <span className="text-[13px] font-medium text-ink-400">{label}</span>
      {sub && <span className="text-[12px] text-ink-600">{sub}</span>}
    </div>
  );
}

function ago(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'moments ago';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

/* ─────────────────────────────────────────────────────────── OVERVIEW ──── */

export function OverviewChapter({ data, meta }: ChapterData) {
  const devices = deviceKeysOf(data);
  const curves = kmCurvesOf(data);
  const overall = kmOverallOf(data);

  // Fall back to summing the payload when the meta counters are absent, rather
  // than showing a misleading zero.
  const responses =
    meta.sourceRows ??
    devices.reduce((a, k) => a + (data![k].km_curve?.n ?? data![k].total_records ?? 0), 0);
  const failures =
    overall?.events ??
    Object.values(curves).reduce((a, c) => a + c.events, 0);

  const survival24 = overall?.points.find((p) => p.month === 24)?.survival ?? null;
  const rmst = overall?.restricted_mean_months ?? null;

  return (
    <div className="flex flex-col items-center gap-10 px-2 text-center">
      <div className="flex flex-col items-center gap-5">
        <span className="eyebrow">Lifespan Matrix · live</span>
        <h2 className="display accent-text max-w-[16ch] text-[clamp(2.6rem,8vw,6.2rem)]">
          How long does it actually last?
        </h2>
        <p className="body-17 max-w-[52ch]">
          Survival analysis on budget consumer hardware. Every figure on this page is
          computed from the survey database and refreshes as new responses arrive.
        </p>
      </div>

      <div className="glass-panel grain flex w-full max-w-4xl flex-wrap items-center justify-around gap-8 rounded-3xl px-8 py-8">
        <Counter value={responses} label="Responses" sub="devices on record" />
        <Counter value={devices.length} label="Categories" sub="hardware types" />
        <Counter value={failures} label="Observed failures" sub="drive every estimate" />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <RingStat
          label="24-month survival"
          value={survival24 === null ? null : `${(survival24 * 100).toFixed(1)}%`}
          tone="cyan"
          sub="pooled across all categories"
        />
        <RingStat
          label="Mean service life"
          value={rmst === null ? null : `${rmst}`}
          unit="mo"
          tone="violet"
          sub="RMST — the median is never reached"
        />
        {meta.updatedAt && (
          <RingStat label="Last publish" value={ago(meta.updatedAt)} tone="green" sub="pipeline run" />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── PANEL ──── */

export function PanelChapter({ data, meta }: ChapterData) {
  const devices = deviceKeysOf(data);
  const curves = kmCurvesOf(data);
  const maxEvents = Math.max(1, ...devices.map((k) => curves[k]?.events ?? 0));

  return (
    <div className="flex flex-col gap-7 px-2">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Chapter 02</span>
        <h2 className="display text-[clamp(2rem,5vw,3.4rem)] text-ink-100">The panel</h2>
        <p className="body-17 max-w-[58ch]">
          {devices.length} categories, {meta.analyzedRows ?? '—'} analysed records. Categories
          are shaded by how many observed failures they carry — those are what the
          estimates actually rest on.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {devices.map((key) => {
          const c = curves[key];
          const events = c?.events ?? data![key].active_failures ?? 0;
          const n = c?.n ?? data![key].total_records ?? 0;
          const weight = events / maxEvents;
          const dead = events === 0;
          return (
            <article
              key={key}
              className="glass-panel relative overflow-hidden rounded-2xl px-4 py-4"
              style={{
                // Information density made visible: categories carrying real
                // events glow, censoring-only categories stay flat.
                borderColor: dead
                  ? 'rgb(255 255 255 / 0.06)'
                  : `color-mix(in oklab, var(--accent) ${18 + weight * 46}%, transparent)`,
                background: dead
                  ? undefined
                  : `radial-gradient(130% 100% at 0% 0%, color-mix(in oklab, var(--accent) ${
                      5 + weight * 13
                    }%, transparent) 0%, transparent 70%), #0e0d16`,
              }}
            >
              <h3 className="text-[13px] font-semibold capitalize text-ink-100">{key}</h3>
              <p className="numeral mt-2 text-2xl leading-none text-ink-100">{n}</p>
              <p className="mt-0.5 text-[11px] text-ink-600">records</p>

              <dl className="mt-3 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <dt className="text-ink-600">events</dt>
                  <dd className={`numeral ${dead ? 'text-ink-800' : 'text-ink-300'}`}>{events}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-600">RMST₂₄</dt>
                  <dd className="numeral text-ink-300">
                    {c?.restricted_mean_months ?? '—'}
                    {c?.restricted_mean_months ? ' mo' : ''}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-600">S(24)</dt>
                  <dd className="numeral text-ink-300">
                    {(() => {
                      const p = c?.points.find((x) => x.month === 24)?.survival;
                      return p === undefined ? '—' : `${(p * 100).toFixed(0)}%`;
                    })()}
                  </dd>
                </div>
              </dl>

              {dead && (
                <p className="mt-2.5 text-[10px] leading-snug text-ink-800">
                  No failures observed — contributes censoring only.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
