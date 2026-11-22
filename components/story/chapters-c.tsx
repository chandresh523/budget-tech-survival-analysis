'use client';

import { useMemo, useState } from 'react';
import { brandsOf, impactOf, type PipelinePayload } from '@/lib/supabase-browser';

/* ─────────────────────────────────────────────────────────────  BRANDS ──── */

export function BrandsChapter({ data }: { data: PipelinePayload | null }) {
  const b = brandsOf(data);

  if (!b) {
    return (
      <div className="glass-panel rounded-3xl px-6 py-10 text-center">
        <p className="text-sm text-ink-400">Brand analysis not yet published.</p>
      </div>
    );
  }

  const max = Math.max(...b.rates.map((r) => r.hi), 0.1);
  const tiersDiffer = b.tiers.p < 0.05;

  return (
    <div className="flex flex-col gap-6 px-2">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Chapter 05</span>
        <h2 className="display text-[clamp(2rem,5vw,3.4rem)] text-ink-100">Does the badge matter?</h2>
        <p className="body-17 max-w-[60ch]">
          Failures per 100 device-months, with exact Poisson intervals. The whiskers
          are wide and they overlap — that uncertainty is the finding, not a flaw.
        </p>
      </header>

      {/* The headline comparison, stated as the result rather than buried. */}
      <div className="glass-panel grain flex flex-col gap-4 rounded-3xl px-6 py-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-8">
          {([['Named brand', b.tiers.named], ['Unbranded / OEM', b.tiers.unbranded]] as const).map(
            ([label, t]) => (
              <div key={label}>
                <p className="text-[11px] text-ink-600">{label}</p>
                <p className="numeral mt-1 text-3xl text-ink-100">{t.rate.toFixed(2)}</p>
                <p className="numeral text-[11px] text-ink-600">
                  ({t.lo.toFixed(2)} – {t.hi.toFixed(2)}) · n={t.n}, {t.events} events
                </p>
              </div>
            ),
          )}
        </div>
        <div className="md:max-w-[34ch]">
          <p className={`text-sm font-semibold ${tiersDiffer ? 'text-signal-amber' : 'text-signal-green'}`}>
            {tiersDiffer ? 'They differ.' : 'No measurable difference.'}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
            Log-rank χ²(1) = {b.tiers.chi2.toFixed(2)}, p = {b.tiers.p.toFixed(3)}.
            {!tiersDiffer && ' Paying for a name did not buy longer life in this panel.'}
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-3xl px-6 py-6">
        <div className="flex flex-col gap-3">
          {b.rates.map((r) => (
            <div key={r.brand} className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-3">
              <span className="truncate text-[12px] text-ink-300" title={r.brand}>
                {r.brand}
              </span>
              <div className="relative h-5">
                {/* Whisker = the confidence interval; dot = the point estimate.
                    Drawing the interval first keeps the eye on the uncertainty. */}
                <div
                  className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                  style={{
                    left: `${(r.lo / max) * 100}%`,
                    width: `${Math.max(((r.hi - r.lo) / max) * 100, 0.6)}%`,
                    background: 'color-mix(in oklab, var(--accent) 35%, transparent)',
                  }}
                />
                <div
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${(r.rate / max) * 100}%`,
                    background: 'var(--accent)',
                    boxShadow: '0 0 10px color-mix(in oklab, var(--accent) 80%, transparent)',
                    opacity: 0.55 + 0.45 * Math.min(1, r.events / 4),
                  }}
                  title={`${r.rate} per 100 device-months`}
                />
              </div>
              <span className="numeral text-right text-[12px] text-ink-400">
                {r.events}/{r.n}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[12px] leading-relaxed text-ink-600">
          Log-rank across {b.logrank.k} brands: χ²({b.logrank.df}) = {b.logrank.chi2},
          p = {b.logrank.p}. The brands do differ overall — but brand is confounded with
          device category here, so the rank order of any two individual brands is not
          something this panel can settle.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────  IMPACT ──── */

export function ImpactChapter({ data }: { data: PipelinePayload | null }) {
  const im = impactOf(data);
  const [L, setL] = useState<number | null>(null);

  const current = L ?? (im ? Math.round(im.L0) : 24);

  // Interpolate between published points rather than recomputing the model in
  // the browser — the published rows are the authority.
  const mass = useMemo(() => {
    if (!im) return 0;
    if (current <= im.L0) return 0;
    return im.F * im.w * (1 - im.L0 / current);
  }, [im, current]);

  if (!im) {
    return (
      <div className="glass-panel rounded-3xl px-6 py-10 text-center">
        <p className="text-sm text-ink-400">Impact model not yet published.</p>
      </div>
    );
  }

  const maxMass = im.F * im.w;
  const pct = Math.max(0, Math.min(1, mass / maxMass));

  return (
    <div className="flex flex-col gap-6 px-2">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Chapter 06</span>
        <h2 className="display text-[clamp(2rem,5vw,3.4rem)] text-ink-100">What it costs</h2>
        <p className="body-17 max-w-[60ch]">
          A linear replacement-mass model: how much material this panel would stop
          discarding if devices lasted longer. An illustration, not a forecast.
        </p>
      </header>

      <div className="glass-panel grain grid gap-6 rounded-3xl px-6 py-7 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-7">
            <div>
              <p className="text-[11px] text-ink-600">Baseline service life (L₀)</p>
              <p className="numeral mt-1 text-2xl text-ink-100">{im.L0} mo</p>
              <p className="text-[11px] text-ink-600">RMST — the median is never reached</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-600">Failures on record</p>
              <p className="numeral mt-1 text-2xl text-ink-100">{im.F}</p>
              <p className="text-[11px] text-ink-600">at {im.w} kg mean unit mass</p>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between text-[12px]">
              <span className="text-ink-400">Counterfactual service life</span>
              <span className="numeral text-ink-100">{current} months</span>
            </span>
            <input
              type="range"
              min={6}
              max={48}
              step={1}
              value={current}
              onChange={(e) => setL(Number(e.target.value))}
              aria-label="Counterfactual service life in months"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent)]"
            />
          </label>

          <p className="text-[12px] leading-relaxed text-ink-600">
            {current <= im.L0
              ? 'At or below the observed baseline, so nothing is averted — the model only measures extension.'
              : `Extending service life to ${current} months averts ${((current / im.L0 - 1) * 100).toFixed(0)}% of replacements for this panel.`}
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          {/* A single ring: one idea, one hero element. */}
          <svg viewBox="0 0 160 160" className="h-40 w-40" role="img"
               aria-label={`Averted mass ${mass.toFixed(2)} kilograms`}>
            <circle cx="80" cy="80" r="66" fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="14" />
            <circle
              cx="80" cy="80" r="66" fill="none"
              stroke="var(--accent)" strokeWidth="14" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 66}
              strokeDashoffset={2 * Math.PI * 66 * (1 - pct)}
              transform="rotate(-90 80 80)"
              style={{
                transition: 'stroke-dashoffset 420ms var(--ease-glass)',
                filter: 'drop-shadow(0 0 10px color-mix(in oklab, var(--accent) 65%, transparent))',
              }}
            />
            <text x="80" y="76" textAnchor="middle" fontSize="26" fill="#f5f5f7"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
              {mass.toFixed(2)}
            </text>
            <text x="80" y="96" textAnchor="middle" fontSize="11" fill="#8a8896">kg averted</text>
          </svg>
          <p className="text-[11px] text-ink-600">of {maxMass.toFixed(2)} kg discarded</p>
        </div>
      </div>
    </div>
  );
}
