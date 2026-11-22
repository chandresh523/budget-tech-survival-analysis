import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client.
 *
 * Uses the ANON key only. That key is safe to ship to the browser — it is
 * already public in the survey pages — and Row Level Security limits it to
 * reading `dashboard_metrics`. The service_role key stays in the Python
 * watcher's .env and must never appear in this app.
 *
 * NEXT_PUBLIC_ values are inlined at build time, so these must be set in the
 * Vercel project settings for the deployed site, not just in .env.local.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Results are published to a public Storage bucket and announced over Realtime
 * Broadcast. Neither needs any SQL — no table, no publication membership, no RLS
 * policy — which is why the live path works with nothing but the keys.
 */
export const METRICS_BUCKET = 'dashboard';
export const METRICS_OBJECT = 'dashboard_data.json';
export const META_OBJECT = 'meta.json';
export const METRICS_CHANNEL = 'uhrs-metrics';
export const METRICS_EVENT = 'metrics';

/** Channel the survey page posts to so the watcher can react immediately. */
export const SURVEY_CHANNEL = 'uhrs-survey';
export const SURVEY_EVENT = 'submitted';

/** Public CDN URL for an object in the results bucket. */
export function storageUrl(object: string): string | null {
  if (!url) return null;
  return `${url.replace(/\/$/, '')}/storage/v1/object/public/${METRICS_BUCKET}/${object}`;
}

/** Small object describing the current publish. Drives cache-busting. */
export interface MetricsMeta {
  updated_at: string;
  source_rows: number;
  analyzed_rows: number;
  device_count: number;
  pipeline_ms: number | null;
}

/** True when the app has enough config to attempt a live connection. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/**
 * Returns a singleton client, or null when unconfigured.
 *
 * A single instance matters: every call to createClient opens its own realtime
 * websocket, so creating one per render would leak sockets on every re-render.
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}

/** One sampled point on a Kaplan-Meier step function. */
export interface KmPoint {
  month: number;
  survival: number;
  /** 95% confidence bounds; null where lifelines could not produce them. */
  lower: number | null;
  upper: number | null;
  /** Units still under observation at this month. */
  at_risk: number;
}

/** A per-device Kaplan-Meier estimate, or an explanation of its absence. */
export interface KmCurve {
  label: string;
  /** False when there were too few records/events to estimate. */
  estimable: boolean;
  /** Human-readable reason when `estimable` is false. */
  reason: string | null;
  n: number;
  events: number;
  censored?: number;
  points: KmPoint[];
  /** Null means the median was never reached within follow-up. */
  median_survival_months: number | null;
  /** Restricted mean survival time, robust when the median is unreached. */
  restricted_mean_months: number | null;
  max_followup_months?: number;
}

/** Pairwise log-rank comparison between two devices' curves. */
export interface KmComparison {
  method: string;
  alpha: number;
  pairs: Array<{
    a: string;
    b: string;
    p_value: number;
    test_statistic: number;
    significant: boolean;
  }>;
  significant_pairs: number;
}

/**
 * Why a model has no concordance index.
 *   ok            both models fitted
 *   partial       one of the two converged
 *   not_converged neither converged despite having events
 *   no_events     zero observed failures — survival models are unidentifiable
 *   no_features   no numeric stress covariates available
 */
export type FitState = 'ok' | 'partial' | 'not_converged' | 'no_events' | 'no_features';

/** Shape of one device's entry in the pipeline payload. */
export interface DeviceMetrics {
  model_comparison?: {
    cox_ph_c_index: number | null;
    rsf_c_index: number | null;
    fit_state?: FitState;
    fit_note?: string | null;
  };
  km_curve?: KmCurve;
  hazard_ratios?: Record<string, number>;
  total_records?: number;
  analyzed_records?: number;
  active_failures?: number;
  censored_data?: number;
  analyzed_failures?: number;
  analyzed_censored?: number;

  // Legacy flat shape emitted by earlier versions of model_engine.py. The
  // dashboard still falls back to these, so they stay in the type.
  rsf_c_index?: number | null;
  cox_c_index?: number | null;
  valid_records?: number;
}

/**
 * The published payload. Device names sit at the top level alongside reserved
 * keys prefixed with "_" that hold cross-device extras — always enumerate
 * devices with `deviceKeysOf` rather than Object.keys, or `_km_overall` and
 * `_km_comparison` will be rendered as if they were devices.
 */
export type PipelinePayload = Record<string, DeviceMetrics>;

/** One brand's failure rate, with an exact Poisson interval. */
export interface BrandRate {
  brand: string;
  n: number;
  events: number;
  exposure: number;
  /** Failures per 100 device-months. */
  rate: number;
  lo: number;
  hi: number;
}

/** Named-brand vs unbranded/OEM comparison. */
export interface BrandTiers {
  named: { n: number; events: number; rate: number; lo: number; hi: number };
  unbranded: { n: number; events: number; rate: number; lo: number; hi: number };
  chi2: number;
  p: number;
}

/** Cross-brand block published under the reserved `_brands` key. */
export interface BrandBlock {
  rates: BrandRate[];
  tiers: BrandTiers;
  logrank: { chi2: number; df: number; p: number; k: number };
}

/** Out-of-sample model skill. Published under `_models`. */
export interface ModelBlock {
  cox_in: number;
  rsf_in: number;
  cox_cv: number;
  rsf_cv: number;
  /** Spread of the per-fold concordances. Published; quote it with the mean --
   *  a c-index of 0.398 +/- 0.114 over 5 folds is a very different claim from a
   *  tight 0.398, and omitting it overstates the precision. */
  cox_cv_sd?: number;
  rsf_cv_sd?: number;
  folds: number;
  /** Cox covariate hazard ratios. */
  covariates: Array<{ label: string; hr: number; lo: number; hi: number; p: number }>;
}

/** Replacement-mass model. Published under `_impact`. */
export interface ImpactBlock {
  /** Baseline service life in months (RMST, since the median is never reached). */
  L0: number;
  /** Confirmed failures. */
  F: number;
  /** Mean unit mass, kg. */
  w: number;
  rows: Array<{ L: number; r: number; mass: number }>;
}

/** One analysed survey record: the raw (time, event) pair behind the curves. */
export interface SurvivalRecord {
  /** device_type */
  d: string;
  /** months to event or censoring */
  t: number;
  /** 1 = observed failure, 0 = censored */
  e: 0 | 1;
  /** price in thousands of rupees, null when unparseable */
  p: number | null;
}

/** Device names only, with the reserved "_"-prefixed extras filtered out. */
export function deviceKeysOf(payload: PipelinePayload | null): string[] {
  if (!payload) return [];
  return Object.keys(payload).filter((k) => !k.startsWith('_'));
}

/** Collect every device's KM curve, keyed by device name. */
export function kmCurvesOf(payload: PipelinePayload | null): Record<string, KmCurve> {
  const out: Record<string, KmCurve> = {};
  deviceKeysOf(payload).forEach((key) => {
    const curve = payload?.[key]?.km_curve;
    if (curve) out[key] = curve;
  });
  return out;
}

/* The reserved keys hold cross-device extras whose shape differs from
   DeviceMetrics. The casts are confined to these two accessors so that no
   consumer has to know about the flat-payload compromise. */

/** The pooled all-device KM curve, if the pipeline produced one. */
export function kmOverallOf(payload: PipelinePayload | null): KmCurve | null {
  return (payload as unknown as { _km_overall?: KmCurve } | null)?._km_overall ?? null;
}

/** Pairwise log-rank results across devices, if available. */
export function kmComparisonOf(payload: PipelinePayload | null): KmComparison | null {
  return (
    (payload as unknown as { _km_comparison?: KmComparison } | null)?._km_comparison ?? null
  );
}

/** Brand failure rates and the named-vs-unbranded test. */
export function brandsOf(payload: PipelinePayload | null): BrandBlock | null {
  return (payload as unknown as { _brands?: BrandBlock } | null)?._brands ?? null;
}

/** Cross-validated model skill and Cox covariates. */
export function modelsOf(payload: PipelinePayload | null): ModelBlock | null {
  return (payload as unknown as { _models?: ModelBlock } | null)?._models ?? null;
}

/** The raw survival rows, for the spatial view. */
export function recordsOf(payload: PipelinePayload | null): SurvivalRecord[] {
  return (payload as unknown as { _records?: SurvivalRecord[] } | null)?._records ?? [];
}

/** Replacement-mass counterfactuals. */
export function impactOf(payload: PipelinePayload | null): ImpactBlock | null {
  return (payload as unknown as { _impact?: ImpactBlock } | null)?._impact ?? null;
}

/**
 * Read the meta object, always bypassing every cache.
 *
 * It is tiny (~120 bytes) so an uncached fetch is cheap, and it must be current:
 * its `updated_at` is the version used to cache-bust the much larger payload.
 */
export async function fetchMeta(): Promise<MetricsMeta | null> {
  const base = storageUrl(META_OBJECT);
  if (!base) return null;
  const res = await fetch(`${base}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`meta HTTP ${res.status}`);
  return (await res.json()) as MetricsMeta;
}

/**
 * Read the payload for a specific publish.
 *
 * Versioned by `updated_at` rather than uncached: each version is immutable, so
 * the CDN can serve it while a new version is still guaranteed to be a miss.
 */
export async function fetchPayload(version: string): Promise<PipelinePayload> {
  const base = storageUrl(METRICS_OBJECT);
  if (!base) throw new Error('Supabase URL not configured');
  const res = await fetch(`${base}?v=${encodeURIComponent(version)}`);
  if (!res.ok) throw new Error(`payload HTTP ${res.status}`);
  return (await res.json()) as PipelinePayload;
}
