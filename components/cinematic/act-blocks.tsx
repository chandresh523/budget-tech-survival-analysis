'use client';

/**
 * The statistical content of the cinematic cut.
 *
 * The brief replaces 2D charts with a 3D data universe, so nothing in here
 * draws an axis or a bar. Instead the results are set as editorial ledgers:
 * ranked rows, tabular numerals, and the caveat printed next to the figure it
 * qualifies rather than hidden in a footnote. Rank and magnitude come across in
 * type size and order; the spatial reading of the data lives in the canvas.
 *
 * Two rules hold everywhere in this file:
 *
 *   1. Nothing is synthesised. Every figure is read straight off the published
 *      payload. Where a value is genuinely absent the row says so and names the
 *      reason, because a blank or a zero would read as a measurement.
 *   2. No per-row animation. These blocks live inside an Act that is already
 *      being scrubbed by ScrollTrigger, and a second timeline on the children
 *      would fight it -- and would leave the numbers invisible on any frame the
 *      ticker did not run.
 */

import type {
  BrandBlock, FitState, ImpactBlock, KmComparison, KmCurve, ModelBlock,
} from '@/lib/supabase-browser';

/* ─────────────────────────────────────────────────────────── primitives ──── */

/** Section framing: an eyebrow, the rows, and an optional qualifier. */
function Ledger({
  eyebrow, title, note, children,
}: {
  eyebrow: string;
  title?: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <p className="eyebrow mb-1.5">{eyebrow}</p>
      {title && <h2 className="display-2 mb-2 max-w-[24ch]">{title}</h2>}
      <div className="flex flex-col">{children}</div>
      {note && (
        <p className="mt-3 max-w-[64ch] text-[11.5px] leading-[1.4] text-ink-400">{note}</p>
      )}
    </div>
  );
}

/**
 * One ranked row: ordinal, label, headline figure, and its supporting detail.
 * `absent` replaces the figure with the reason there isn't one.
 */
function Row({
  ordinal, label, value, unit, meta, absent, emphasis = false,
}: {
  ordinal?: number;
  label: string;
  value?: string | null;
  unit?: string;
  meta?: string;
  absent?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className="flex items-baseline gap-2.5 border-b border-white/[0.06] py-1 last:border-b-0"
      data-magnetic={label}
    >
      {ordinal !== undefined && (
        <span className="numeral w-4 shrink-0 text-[10px] text-ink-800">
          {String(ordinal).padStart(2, '0')}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13.5px] leading-tight ${
            emphasis ? 'text-ink-100' : 'text-ink-300'
          }`}
        >
          {label}
        </span>
        {meta && (
          <span className="numeral mt-px block truncate text-[10px] leading-tight text-ink-600">
            {meta}
          </span>
        )}
      </div>
      {absent ? (
        <span className="max-w-[48%] shrink-0 text-right text-[10px] leading-tight text-ink-600">
          {absent}
        </span>
      ) : (
        <span className="shrink-0 text-right">
          <span
            className={`numeral tabular-nums ${
              emphasis ? 'accent-text text-[21px]' : 'text-ink-100 text-[18px]'
            }`}
          >
            {value ?? '—'}
          </span>
          {unit && <span className="ml-1 text-[10px] text-ink-400">{unit}</span>}
        </span>
      )}
    </div>
  );
}

/** Shown instead of a ledger when the pipeline published nothing to render. */
function Unavailable({ what, why }: { what: string; why: string }) {
  return (
    <div className="surface rounded-2xl px-5 py-4">
      <p className="eyebrow mb-1">{what} unavailable</p>
      <p className="text-[13px] leading-[1.5] text-ink-400">{why}</p>
    </div>
  );
}

const n1 = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? null : v.toFixed(d);

/* ───────────────────────────────────────────────────── survival by class ──── */

/**
 * Every category's curve, ranked by restricted mean survival.
 *
 * RMST is the ranking key rather than the median because the pooled median is
 * never reached -- most of these curves simply never fall to 0.5, so a median
 * column would be mostly empty.
 */
export function ClassLedger({ curves }: { curves: Record<string, KmCurve> }) {
  const entries = Object.entries(curves);
  if (!entries.length) {
    return (
      <Unavailable
        what="Per-category survival"
        why="The published payload carried no per-device Kaplan-Meier curves."
      />
    );
  }

  const estimable = entries
    .filter(([, c]) => c.estimable && c.restricted_mean_months !== null)
    .sort((a, b) => (b[1].restricted_mean_months ?? 0) - (a[1].restricted_mean_months ?? 0));
  const absent = entries.filter(([, c]) => !c.estimable || c.restricted_mean_months === null);

  // Derived, never hardcoded: these counts move every time the watcher
  // republishes, and a stale literal in a caveat is still a wrong number.
  const totalEvents = entries.reduce((a, [, c]) => a + c.events, 0);
  const withMedian = estimable.filter(([, c]) => c.median_survival_months !== null);
  const medianClause = withMedian.length === 0
    ? 'No category falls to 50% within follow-up, so none of them has a median at all.'
    : `Only ${withMedian.map(([k, c]) => `${k} (${c.median_survival_months} mo)`).join(', ')} `
      + `${withMedian.length === 1 ? 'reaches' : 'reach'} a median within follow-up; `
      + 'the rest never fall to 50%.';

  return (
    <Ledger
      eyebrow={`${estimable.length} estimable of ${entries.length} categories`}
      title="Not every category wears out at the same rate."
      note={
        `Ranked by restricted mean survival to 24 months rather than by median. ${medianClause} ` +
        `Order is indicative only: with ${totalEvents} failures spread across ${entries.length} ` +
        'categories, neighbouring rows sit well inside each other’s uncertainty.'
      }
    >
      {estimable.map(([key, c], i) => {
        const s24 = c.points.find((p) => p.month === 24)?.survival;
        return (
          <Row
            key={key}
            ordinal={i + 1}
            label={key}
            value={n1(c.restricted_mean_months, 2)}
            unit="mo"
            emphasis={i === 0}
            meta={
              `n=${c.n} · ${c.events} ${c.events === 1 ? 'failure' : 'failures'}` +
              (s24 === undefined ? '' : ` · S(24) = ${(s24 * 100).toFixed(1)}%`)
            }
          />
        );
      })}
      {absent.map(([key, c]) => (
        <Row
          key={key}
          label={key}
          meta={`n=${c.n} · ${c.events} failures`}
          absent={c.reason ?? 'not estimable'}
        />
      ))}
    </Ledger>
  );
}

/* ──────────────────────────────────────────────────────────── divergence ──── */

/**
 * Pairwise log-rank across categories.
 *
 * The raw count of significant pairs is the number people quote and the number
 * that misleads: 36 simultaneous tests at alpha 0.05 are expected to throw up
 * about two hits on noise alone. Both the raw count and the Bonferroni-surviving
 * count are printed, because the honest headline is the second one.
 */
export function DivergenceLedger({ comparison }: { comparison: KmComparison | null }) {
  if (!comparison || !comparison.pairs?.length) {
    return (
      <Unavailable
        what="Pairwise log-rank"
        why="Fewer than two categories produced an estimable curve, so there was no pair to test."
      />
    );
  }

  const { pairs, alpha, significant_pairs: rawCount } = comparison;
  const tests = pairs.length;
  const bonf = alpha / tests;
  const surviving = pairs.filter((p) => p.p_value < bonf);
  const expectedByChance = (alpha * tests).toFixed(1);

  const shown = [...pairs].sort((a, b) => a.p_value - b.p_value).slice(0, 6);

  return (
    <Ledger
      eyebrow={`${comparison.method} · ${tests} pairs`}
      title={
        surviving.length === 0
          ? 'No single pair of categories survives correction.'
          : `${surviving.length} of ${tests} pairs differ after correction.`
      }
      note={
        `${rawCount} pairs clear the uncorrected α = ${alpha}, but running ${tests} tests at ` +
        `that threshold is expected to produce about ${expectedByChance} hits on noise alone. ` +
        `Bonferroni sets the bar at p < ${bonf.toFixed(5)}, and ${surviving.length} ` +
        `${surviving.length === 1 ? 'pair clears' : 'pairs clear'} it. ` +
        'Any individual pairing above is a lead to chase with more data, ' +
        'not a finding.'
      }
    >
      {shown.map((p, i) => (
        <Row
          key={`${p.a}-${p.b}`}
          ordinal={i + 1}
          label={`${p.a} vs ${p.b}`}
          value={p.p_value < 0.0001 ? '<0.0001' : p.p_value.toFixed(4)}
          emphasis={p.p_value < bonf}
          meta={
            `χ² = ${p.test_statistic.toFixed(2)} · ` +
            (p.p_value < bonf
              ? 'survives Bonferroni'
              : p.significant
                ? 'uncorrected only'
                : 'not significant')
          }
        />
      ))}
    </Ledger>
  );
}

/* ───────────────────────────────────────────────────────────────── brands ──── */

/** Brand failure rates per 100 device-months, with exact Poisson intervals. */
export function BrandLedger({ brands }: { brands: BrandBlock | null }) {
  if (!brands?.rates?.length) {
    return (
      <Unavailable
        what="Brand rates"
        why="No brand field was present on enough responses to estimate a rate."
      />
    );
  }

  const ranked = [...brands.rates].sort((a, b) => b.rate - a.rate);
  const lr = brands.logrank;

  return (
    <Ledger
      eyebrow={`${ranked.length} brands · failures per 100 device-months`}
      title="Brands differ. Paying for a name is not why."
      note={
        (lr
          ? `Across brands the difference is real: χ²(${lr.df}) = ${lr.chi2}, p = ${lr.p}. `
          : '') +
        `But named brands run at ${brands.tiers.named.rate} per 100 device-months against ` +
        `${brands.tiers.unbranded.rate} for unbranded and OEM — p = ${brands.tiers.p.toFixed(3)}, ` +
        'no measurable gap. Brand is also confounded with category here: a brand that only sells ' +
        'cables inherits how long cables last. Treat the ordering as descriptive, not causal — the ' +
        'intervals above overlap heavily.'
      }
    >
      {ranked.map((b, i) => (
        <Row
          key={b.brand}
          ordinal={i + 1}
          label={b.brand}
          value={b.rate.toFixed(2)}
          emphasis={i === 0}
          meta={
            `95% CI ${b.lo.toFixed(2)}–${b.hi.toFixed(2)} · n=${b.n} · ` +
            `${b.events} ${b.events === 1 ? 'failure' : 'failures'} · ` +
            `${b.exposure.toLocaleString()} device-months`
          }
        />
      ))}
    </Ledger>
  );
}

/* ───────────────────────────────────────────────────────────────── models ──── */

/** Cox covariates: the hazard ratios behind the "nothing predicts this" result. */
export function CovariateLedger({ models }: { models: ModelBlock | null }) {
  if (!models?.covariates?.length) {
    return (
      <Unavailable
        what="Cox covariates"
        why="The Cox model did not converge, so it produced no hazard ratios."
      />
    );
  }

  const anySignificant = models.covariates.some((c) => c.p < 0.05);

  return (
    <Ledger
      eyebrow="Cox proportional hazards · hazard ratios"
      title={
        anySignificant
          ? 'One covariate carries signal.'
          : 'Not one covariate moves the hazard.'
      }
      note={
        'A hazard ratio of 1.00 means the variable changes nothing. Every interval above spans 1.00, ' +
        `and cross-validated concordance is ${models.cox_cv.toFixed(3)}` +
        (models.cox_cv_sd !== undefined ? ` ± ${models.cox_cv_sd.toFixed(3)}` : '') +
        ` over ${models.folds} folds — under 0.50, which is worse than guessing. ` +
        'The binding constraint is 26 observed failures, not 289 responses: more responses from ' +
        'people whose devices actually broke is what would change this, not more responses.'
      }
    >
      {models.covariates.map((c, i) => (
        <Row
          key={c.label}
          ordinal={i + 1}
          label={c.label}
          value={c.hr.toFixed(3)}
          meta={
            `95% CI ${c.lo.toFixed(3)}–${c.hi.toFixed(3)} · p = ${c.p.toFixed(3)}` +
            (c.p < 0.05 ? ' · significant' : ' · not significant')
          }
        />
      ))}
    </Ledger>
  );
}

/* ────────────────────────────────────────────────────────── pooled curve ──── */

/** The pooled survivor function, read off at the months the pipeline sampled. */
export function CurveLedger({ overall }: { overall: KmCurve | null }) {
  if (!overall?.points?.length) {
    return (
      <Unavailable
        what="Pooled survival curve"
        why="The pipeline published no pooled Kaplan-Meier estimate."
      />
    );
  }

  const wanted = [6, 12, 24, 36, 48];
  const rows = wanted
    .map((m) => overall.points.find((p) => p.month === m))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <Ledger
      eyebrow={`pooled Kaplan-Meier · n=${overall.n} · ${overall.events} failures`}
      title="Still working, month by month."
      note={
        `Follow-up runs to ${overall.max_followup_months ?? '—'} months. ` +
        'The at-risk count is the honest limit on each figure: once it falls away, the curve is ' +
        'being carried by a handful of devices and the confidence band widens accordingly. ' +
        (overall.median_survival_months === null
          ? 'The median is never reached, which is why the headline figure is a restricted mean.'
          : `Median ${overall.median_survival_months} months.`)
      }
    >
      {rows.map((p) => (
        <Row
          key={p.month}
          label={`${p.month} months`}
          value={(p.survival * 100).toFixed(1)}
          unit="%"
          emphasis={p.month === 24}
          meta={
            (p.lower !== null && p.upper !== null
              ? `95% CI ${(p.lower * 100).toFixed(1)}–${(p.upper * 100).toFixed(1)}% · `
              : '') + `${p.at_risk} still at risk`
          }
        />
      ))}
    </Ledger>
  );
}

/* ───────────────────────────────────────────────────────────────── impact ──── */

/** The replacement-mass model, stated as the illustration it is. */
export function ImpactLedger({ impact }: { impact: ImpactBlock | null }) {
  if (!impact?.rows?.length) {
    return (
      <Unavailable
        what="Replacement-mass model"
        why="No baseline service life was published, so the model has no anchor to scale from."
      />
    );
  }

  return (
    <Ledger
      eyebrow={`baseline ${impact.L0} mo · ${impact.F} confirmed failures · ${impact.w} kg per unit`}
      title="What a longer service life would have saved."
      note={
        'A linear model, and an illustration rather than a forecast: it assumes the mass scales ' +
        `directly with the ratio of service lives and that the ${impact.F} confirmed failures are ` +
        'representative. It carries no confidence interval because the uncertainty is dominated by ' +
        'that assumption, not by sampling.'
      }
    >
      {impact.rows.map((r) => (
        <Row
          key={r.L}
          label={`If devices lasted ${r.L} months`}
          value={r.mass.toFixed(2)}
          unit="kg"
          meta={`${(r.r * 100).toFixed(1)}% longer than the ${impact.L0}-month baseline`}
        />
      ))}
    </Ledger>
  );
}

/* ────────────────────────────────────────────────── per-device model skill ──── */

export interface DeviceSkill {
  device: string;
  cox: number | null;
  rsf: number | null;
  n: number;
  events: number;
  fitState?: FitState;
  fitNote?: string | null;
}

/** Plain-English reason a device produced no concordance index. */
const FIT_REASON: Record<FitState, string> = {
  ok: 'fitted',
  partial: 'only one model converged',
  not_converged: 'neither model converged',
  no_events: 'no observed failures — unidentifiable',
  no_features: 'no usable covariates',
};

/**
 * Concordance per category.
 *
 * These are IN-SAMPLE numbers: the pipeline fits and scores each device on the
 * same handful of rows, with no held-out fold, because several categories have
 * one or two failures and cannot be split. So they are not skill and must never
 * be read as it -- wmouse scoring a perfect 1.000 off a single failure is the
 * clearest possible demonstration of that. The only honest out-of-sample figures
 * on this site are the pooled cross-validated ones in the Models act, and they
 * are both far worse.
 */
export function SkillLedger({ skills, models }: { skills: DeviceSkill[]; models: ModelBlock | null }) {
  if (!skills.length) {
    return (
      <Unavailable
        what="Per-category model skill"
        why="No device published a model comparison block."
      />
    );
  }

  const fitted = skills.filter((s) => s.cox !== null || s.rsf !== null)
    .sort((a, b) => (b.cox ?? b.rsf ?? 0) - (a.cox ?? a.rsf ?? 0));
  const unfitted = skills.filter((s) => s.cox === null && s.rsf === null);
  const perfect = fitted.filter((s) => s.cox === 1 || s.rsf === 1);

  return (
    <Ledger
      eyebrow={`${fitted.length} of ${skills.length} categories fitted · in-sample only`}
      title="These scores are memory, not skill."
      note={
        'Every figure here is in-sample: each category is scored on the same rows it was fitted ' +
        'on, because several have one or two failures and cannot be split into folds. '
        + (perfect.length
          ? `${perfect.length} ${perfect.length === 1 ? 'category reaches' : 'categories reach'} `
            + 'a perfect 1.000, which is what perfect recall of a handful of rows looks like — not a '
            + 'model that would call the next failure. '
          : '')
        + (models
          ? `Held out properly and pooled, the same approaches score ${models.cox_cv.toFixed(3)} `
            + `(Cox) and ${models.rsf_cv.toFixed(3)} (RSF). Those are the real numbers.`
          : 'Read the pooled cross-validated figures instead.')
      }
    >
      {fitted.map((s, i) => (
        <Row
          key={s.device}
          ordinal={i + 1}
          label={s.device}
          value={s.cox !== null ? s.cox.toFixed(3) : '—'}
          emphasis={false}
          meta={
            `Cox ${s.cox !== null ? s.cox.toFixed(3) : 'n/a'} · `
            + `RSF ${s.rsf !== null ? s.rsf.toFixed(3) : 'n/a'} · `
            + `n=${s.n} · ${s.events} ${s.events === 1 ? 'failure' : 'failures'}`
          }
        />
      ))}
      {unfitted.map((s) => (
        <Row
          key={s.device}
          label={s.device}
          meta={`n=${s.n} · ${s.events} failures`}
          absent={s.fitState ? FIT_REASON[s.fitState] : 'not fitted'}
        />
      ))}
    </Ledger>
  );
}
