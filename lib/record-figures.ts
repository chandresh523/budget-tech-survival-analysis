'use client';

/**
 * Resolves the narrative's figure keys against the live payload.
 *
 * lib/record-narrative.ts deliberately contains no numbers: every figure the
 * prose refers to is a key, and this is the only place those keys become values.
 * That separation is the whole point — the watcher republishes whenever a survey
 * response lands, and a number typed into a sentence would be wrong the moment
 * it did.
 *
 * A key that cannot be resolved returns null, never a zero, a dash or a
 * plausible-looking default. The shell renders nulls as an explicit unavailable
 * state that names the reason, because a figure quietly rendered as "0" in a
 * research narrative is worse than no figure at all.
 */

import {
  brandsOf, deviceKeysOf, impactOf, kmComparisonOf, kmCurvesOf, kmOverallOf, modelsOf,
  type PipelinePayload,
} from '@/lib/supabase-browser';

export interface FigureContext {
  data: PipelinePayload | null;
  sourceRows: number | null;
  analyzedRows: number | null;
  pipelineMs: number | null;
  updatedAt: Date | null;
}

const int = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v).toLocaleString();

const dec = (v: number | null | undefined, d: number) =>
  v === null || v === undefined || !Number.isFinite(v) ? null : v.toFixed(d);

/** p-values below the smallest value the pipeline can distinguish are reported
 *  as a bound rather than as a suspiciously precise zero. */
const pval = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return v < 0.0001 ? '<0.0001' : v.toFixed(4);
};

export function resolveFigures(ctx: FigureContext): Record<string, string | null> {
  const { data, sourceRows, analyzedRows, pipelineMs, updatedAt } = ctx;

  const devices = deviceKeysOf(data);
  const curves = kmCurvesOf(data);
  const overall = kmOverallOf(data);
  const comparison = kmComparisonOf(data);
  const models = modelsOf(data);
  const brands = brandsOf(data);
  const impact = impactOf(data);

  const curveList = Object.values(curves);
  const estimable = curveList.filter((c) => c.estimable);
  const events = curveList.reduce((a, c) => a + c.events, 0);
  const s24 = overall?.points.find((p) => p.month === 24)?.survival ?? null;

  // Bonferroni over however many pairs were actually tested, not a literal: the
  // pair count is (k choose 2) and moves the instant a category becomes
  // estimable or stops being one.
  const pairs = comparison?.pairs ?? [];
  const alpha = comparison?.alpha ?? null;
  const bonf = alpha !== null && pairs.length ? alpha / pairs.length : null;
  const survivingBonf = bonf === null ? null : pairs.filter((p) => p.p_value < bonf).length;
  const nominal = comparison?.significant_pairs ?? null;

  const covariates = models?.covariates ?? [];
  const minCovariateP = covariates.length
    ? covariates.reduce((m, c) => Math.min(m, c.p), Number.POSITIVE_INFINITY)
    : null;

  return {
    /* ---- the panel -------------------------------------------------- */
    'panel.records': int(sourceRows),
    'panel.analyzed': int(analyzedRows),
    'panel.categories': devices.length ? String(devices.length) : null,
    'panel.events': events > 0 || curveList.length ? String(events) : null,
    'panel.censored': int(overall?.censored ?? null),
    'panel.followup_months': dec(overall?.max_followup_months ?? null, 0),

    /* ---- pooled survival -------------------------------------------- */
    'survival.rmst_months': dec(overall?.restricted_mean_months ?? null, 2),
    'survival.s24': s24 === null ? null : `${(s24 * 100).toFixed(1)}%`,
    // Null here is not missing data: it means the curve never fell to 0.5 within
    // follow-up, so the shell must say "not reached" rather than "unavailable".
    'survival.median': overall
      ? (overall.median_survival_months === null
        ? 'not reached'
        : `${overall.median_survival_months} mo`)
      : null,

    /* ---- per-category ----------------------------------------------- */
    'curves.total': curveList.length ? String(curveList.length) : null,
    'curves.estimable': curveList.length ? String(estimable.length) : null,

    /* ---- pairwise log-rank ------------------------------------------ */
    'logrank.pairs': pairs.length ? String(pairs.length) : null,
    'logrank.nominal': nominal === null ? null : String(nominal),
    'logrank.bonferroni_alpha': bonf === null ? null : bonf.toFixed(5),
    'logrank.bonferroni_pairs': survivingBonf === null ? null : String(survivingBonf),

    /* ---- models ----------------------------------------------------- */
    'models.cox_in': dec(models?.cox_in, 3),
    'models.cox_cv': dec(models?.cox_cv, 3),
    'models.cox_cv_sd': dec(models?.cox_cv_sd, 3),
    'models.rsf_in': dec(models?.rsf_in, 3),
    'models.rsf_cv': dec(models?.rsf_cv, 3),
    'models.rsf_cv_sd': dec(models?.rsf_cv_sd, 3),
    'models.folds': models?.folds ? String(models.folds) : null,
    'models.covariates': covariates.length ? String(covariates.length) : null,
    'models.min_covariate_p': minCovariateP === null || !Number.isFinite(minCovariateP)
      ? null : pval(minCovariateP),

    /* ---- brands ----------------------------------------------------- */
    'brands.count': brands?.rates?.length ? String(brands.rates.length) : null,
    'brands.logrank_p': pval(brands?.logrank?.p),
    'brands.tier_p': pval(brands?.tiers?.p),

    /* ---- the pipeline ----------------------------------------------- */
    'pipeline.ms': int(pipelineMs),
    'pipeline.updated_at': updatedAt ? updatedAt.toLocaleString() : null,

    /* ---- impact ------------------------------------------------------ */
    'impact.baseline_months': dec(impact?.L0, 2),
    'impact.failures': impact ? String(impact.F) : null,
  };
}
