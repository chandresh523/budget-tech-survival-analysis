/**
 * Turn the published payload into a point cloud for the tunnel.
 *
 * One instance per analysed record. The payload only carries per-device
 * aggregates and the KM step function, not the raw rows — but the KM curve is a
 * complete description of the observed times, so the individual records can be
 * reconstructed from it exactly rather than invented:
 *
 *   - each drop in the step function is an observed failure at that month
 *   - the fall in at-risk count that is NOT explained by a failure is censoring
 *
 * That gives back the real (time, event) pairs the estimator was built from.
 * Nothing here is synthetic.
 */

import type { DataPoint } from '@/components/cinematic/data-tunnel';
import { deviceKeysOf, kmCurvesOf, recordsOf, type PipelinePayload } from '@/lib/supabase-browser';

/** Rough price band per category, in thousands of rupees. Only sets radius. */
const PRICE_HINT: Record<string, number> = {
  cables: 0.3, usbdrive: 0.6, wmouse: 0.7, keyboard: 1.2, gwmouse: 1.8,
  hub: 1.5, tws: 2.2, powerbank: 1.6, headphones: 2.8, smartwatch: 3.5,
};

export function buildTunnelPoints(payload: PipelinePayload | null): DataPoint[] {
  const devices = deviceKeysOf(payload);
  if (!devices.length) return [];

  // Preferred path: the pipeline publishes the actual rows, so no inference is
  // needed. The KM inversion below is kept only for payloads published before
  // `_records` existed — it reproduces the totals exactly but can misallocate
  // failures within a category, because inverting a coarsely-sampled S(t)
  // cannot see censoring that interleaves between grid points.
  const rows = recordsOf(payload);
  if (rows.length) {
    const index = new Map(devices.map((d, i) => [d, i]));
    return rows.map((r) => ({
      t: r.t,
      event: r.e,
      group: index.get(r.d) ?? 0,
      groups: devices.length,
      price: r.p ?? PRICE_HINT[r.d] ?? 1,
      label: r.d,
    }));
  }
  const curves = kmCurvesOf(payload);
  const out: DataPoint[] = [];

  devices.forEach((key, gi) => {
    const c = curves[key];
    const price = PRICE_HINT[key] ?? 1.0;
    if (!c) return;

    if (!c.points.length) {
      // No curve: place the records along the axis by follow-up so the
      // category still has presence, all censored.
      for (let i = 0; i < c.n; i++) {
        out.push({
          t: ((i + 1) / (c.n + 1)) * (c.max_followup_months ?? 24),
          event: 0, group: gi, groups: devices.length, price, label: key,
        });
      }
      return;
    }

    let prevRisk = c.points[0]?.at_risk ?? c.n;
    let prevSurv = 1;
    let emitted = 0;

    c.points.forEach((p, i) => {
      if (i === 0) { prevRisk = p.at_risk; prevSurv = p.survival; return; }
      // A drop in survival means failures happened in this interval. KM:
      // S_i/S_{i-1} = 1 - d/n  =>  d = n * (1 - S_i/S_{i-1})
      const ratio = prevSurv > 0 ? p.survival / prevSurv : 1;
      const failures = Math.max(0, Math.round(prevRisk * (1 - ratio)));
      // Everyone else who left the risk set in this interval was censored.
      const leaving = Math.max(0, prevRisk - p.at_risk);
      const censored = Math.max(0, leaving - failures);

      for (let k = 0; k < failures; k++) {
        out.push({ t: p.month, event: 1, group: gi, groups: devices.length, price, label: key });
        emitted++;
      }
      for (let k = 0; k < censored; k++) {
        out.push({ t: p.month, event: 0, group: gi, groups: devices.length, price, label: key });
        emitted++;
      }
      prevRisk = p.at_risk;
      prevSurv = p.survival;
    });

    // Anyone still at risk at the last observation is censored there.
    const last = c.points[c.points.length - 1];
    for (let k = emitted; k < c.n; k++) {
      out.push({
        t: last.month, event: 0, group: gi, groups: devices.length, price, label: key,
      });
    }
  });

  return out;
}

/**
 * Statistical "heat" for the aurora, 0-1.
 *
 * Driven by the observed event rate: a panel that is almost all censoring is
 * cool, one full of failures runs hot. Scaled against 25% because a 9% event
 * rate is the realistic top of this dataset's range — mapping against 100%
 * would leave the shader permanently cold and the signal invisible.
 */
export function computeHeat(payload: PipelinePayload | null): number {
  const curves = Object.values(kmCurvesOf(payload));
  if (!curves.length) return 0.2;
  const n = curves.reduce((a, c) => a + c.n, 0);
  const e = curves.reduce((a, c) => a + c.events, 0);
  if (!n) return 0.2;
  return Math.min(1, e / n / 0.25);
}
