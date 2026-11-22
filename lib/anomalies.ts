'use client';

/**
 * Data-quality figures for the archive's closing beat.
 *
 * Two sources, in order of preference:
 *
 *   1. A `_quality` block, if the pipeline publishes one. It can see the whole
 *      flattened frame — ages, care scores, free text — and so can count things
 *      the browser cannot.
 *   2. Otherwise, whatever is derivable from `_records`, which carries only
 *      `{ d, t, e, p }`: device, months, event flag, price. That is enough for
 *      price and service-life checks and nothing else, and this module says so
 *      rather than implying the list is complete.
 *
 * PRIVACY IS ABSOLUTE HERE. The survey collects full names and email addresses.
 * Nothing in this module returns a row, an id, or any value traceable to one
 * respondent — only counts, ranges, and the rule that produced them. The rule is
 * carried alongside the count on purpose: "14 implausible prices" is a number a
 * reader has to take on trust, while "14 records priced at zero" is a claim they
 * can argue with.
 */

import { recordsOf, type PipelinePayload, type SurvivalRecord } from '@/lib/supabase-browser';

/** One flagged group. Never a list of the rows themselves. */
export interface QualityCheck {
  key: string;
  /** What was counted. */
  label: string;
  count: number;
  /** The criterion, in words. Printed next to the count. */
  rule: string;
}

export interface QualityBlock {
  source_rows: number | null;
  analyzed_rows: number | null;
  checks: QualityCheck[];
  /** True when this came from the pipeline and can see more than the browser. */
  complete: boolean;
  /** Named limitation when it did not. */
  limitation: string | null;
}

/** The pipeline's block, if it publishes one. */
export function publishedQualityOf(payload: PipelinePayload | null): QualityBlock | null {
  const block = (payload as unknown as { _quality?: Partial<QualityBlock> } | null)?._quality;
  if (!block || !Array.isArray(block.checks)) return null;
  return {
    source_rows: block.source_rows ?? null,
    analyzed_rows: block.analyzed_rows ?? null,
    checks: block.checks,
    complete: true,
    limitation: null,
  };
}

/**
 * A plausible upper bound on the service life of a budget peripheral, in months.
 *
 * Thirteen years. Set deliberately high: the point of the check is to surface
 * recall failures — a respondent reaching for a date they do not remember — not
 * to police unusual but possible answers. A tighter bound would flag genuine
 * long-lived cables as errors.
 */
const IMPLAUSIBLE_MONTHS = 156;

/** What can be checked from the published records alone. */
export function derivedQualityOf(
  payload: PipelinePayload | null,
  sourceRows: number | null,
  analyzedRows: number | null,
): QualityBlock | null {
  const rows: SurvivalRecord[] = recordsOf(payload);
  if (!rows.length) return null;

  const priced = rows.filter((r) => r.p !== null && Number.isFinite(r.p));
  const zeroPrice = priced.filter((r) => (r.p as number) <= 0).length;
  const noPrice = rows.length - priced.length;
  const zeroMonths = rows.filter((r) => r.t <= 0).length;
  const tooLong = rows.filter((r) => r.t > IMPLAUSIBLE_MONTHS).length;

  const checks: QualityCheck[] = [
    {
      key: 'price_missing',
      label: 'Records with no usable price',
      count: noPrice,
      rule: 'the price field was absent or could not be parsed as a number',
    },
    {
      key: 'price_zero',
      label: 'Records priced at zero or less',
      count: zeroPrice,
      rule: 'a parsed price of 0 or below, which no purchased device has',
    },
    {
      key: 'zero_months',
      label: 'Records with no elapsed service life',
      count: zeroMonths,
      rule: 'purchase and observation dates fall in the same month, so the '
        + 'device contributes no exposure',
    },
    {
      key: 'implausible_life',
      label: 'Reported service lives beyond a plausible bound',
      count: tooLong,
      rule: `more than ${IMPLAUSIBLE_MONTHS} months, which for budget hardware `
        + 'more likely reflects a remembered date than a measured one',
    },
  ];

  const dropped = sourceRows !== null && analyzedRows !== null
    ? sourceRows - analyzedRows
    : null;
  if (dropped !== null && dropped > 0) {
    checks.unshift({
      key: 'dropped',
      label: 'Responses excluded before analysis',
      count: dropped,
      rule: 'preprocessing could not derive both a duration and an event status',
    });
  }

  return {
    source_rows: sourceRows,
    analyzed_rows: analyzedRows,
    checks,
    complete: false,
    limitation:
      'Derived in the browser from the published records, which carry only '
      + 'device, duration, event and price. Checks on age, care score and free '
      + 'text need the pipeline and are not included.',
  };
}

/** Prefer the pipeline's block; fall back to what the browser can see. */
export function qualityOf(
  payload: PipelinePayload | null,
  sourceRows: number | null,
  analyzedRows: number | null,
): QualityBlock | null {
  return publishedQualityOf(payload) ?? derivedQualityOf(payload, sourceRows, analyzedRows);
}

/** Service-life range actually observed, for the limits beat. */
export function serviceLifeRange(payload: PipelinePayload | null): [number, number] | null {
  const rows = recordsOf(payload);
  if (!rows.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) {
    if (r.t < lo) lo = r.t;
    if (r.t > hi) hi = r.t;
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
}
