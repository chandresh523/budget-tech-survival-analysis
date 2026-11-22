'use client';

/**
 * Compact operations view — the same live feed as `/`, laid out as a dense
 * single-screen panel rather than a scrolling narrative. Previously this route
 * was a near-duplicate of the home page; it now earns its own URL by showing
 * every device at once instead of one selected device.
 */

import HeroTunnel from '@/components/hero-tunnel';
import KmCurveChart from '@/components/km-curve-chart';
import ReliabilityTable from '@/components/reliability-table';
import LogrankPanel from '@/components/logrank-panel';
import LiveStatus from '@/components/live-status';
import FluidField from '@/components/fluid-field';
import { Panel, Readout, Well } from '@/components/panel';
import { useLiveMetrics } from '@/hooks/use-live-metrics';
import {
  deviceKeysOf,
  kmComparisonOf,
  kmCurvesOf,
  kmOverallOf,
} from '@/lib/supabase-browser';

export default function DashboardPage() {
  const { data, status, updatedAt, sourceRows, analyzedRows, pipelineMs, revision, refresh } =
    useLiveMetrics();

  const devices = deviceKeysOf(data);
  const curves = kmCurvesOf(data);
  const overall = kmOverallOf(data);
  const comparison = kmComparisonOf(data);

  // Fleet-wide totals: this view is about the whole set, not one device.
  // `responses` and `analysed` differ — a row missing numeric covariates is
  // dropped from the model fit but is still a response, so conflating them
  // undercounts the survey.
  const totals = devices.reduce(
    (acc, key) => {
      const m = data[key];
      const c = m.km_curve;
      acc.responses += c?.n ?? m.total_records ?? 0;
      acc.analysed += m.analyzed_records ?? c?.n ?? 0;
      acc.events += c?.events ?? m.active_failures ?? 0;
      if (m.model_comparison?.rsf_c_index === null) acc.unfitted += 1;
      return acc;
    },
    { responses: 0, analysed: 0, events: 0, unfitted: 0 },
  );

  const tableRows = devices.map((key, i) => {
    const m = data[key];
    const c = m.km_curve;
    return {
      assetId: `HW-44${700 + i}`,
      name: key,
      records: m.analyzed_records ?? c?.n ?? 0,
      events: c?.events ?? m.active_failures ?? 0,
      medianMonths: c?.median_survival_months ?? null,
      rmstMonths: c?.restricted_mean_months ?? null,
      cIndex: m.model_comparison?.rsf_c_index ?? null,
      fitState: m.model_comparison?.fit_state ?? 'ok',
      fitNote: m.model_comparison?.fit_note ?? null,
      estimable: c?.estimable ?? false,
    };
  });

  return (
    <main className="relative min-h-screen">
      {/* Calmer fluid on the dense view — motion behind small numbers is noise. */}
      <FluidField intensity={0.45} />

      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-5">
        <Panel screws={false}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="silkscreen">operations view · all channels</span>
            <LiveStatus
              status={status}
              updatedAt={updatedAt}
              sourceRows={sourceRows}
              pipelineMs={pipelineMs}
              revision={revision}
              onRefresh={refresh}
            />
          </div>
        </Panel>

        {devices.length === 0 ? (
          <Panel label="standby">
            <div className="py-10">
              <HeroTunnel />
            </div>
            <p className="pb-6 text-center text-sm text-etch-dim">
              Waiting for the first pipeline publish…
            </p>
          </Panel>
        ) : (
          <>
            <Panel label="fleet totals">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {/* In snapshot mode the DB metadata is null, so fall back to the
                    totals summed from the payload rather than showing 0. */}
                <Readout label="responses" value={sourceRows ?? totals.responses} tone="amber" />
                <Readout label="records analysed" value={analyzedRows ?? totals.analysed} tone="cyan" />
                <Readout label="observed failures" value={totals.events} tone="emerald" />
                <Readout
                  label="models unfitted"
                  value={totals.unfitted}
                  tone={totals.unfitted > 0 ? 'red' : 'neutral'}
                />
              </div>
            </Panel>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr_1fr]">
              <Panel
                label="survival functions — all devices"
                meta={<span className="silkscreen">kaplan-meier</span>}
              >
                <Well className="px-3 pb-3 pt-4">
                  {/* No selectedDevice: every curve at equal weight. */}
                  <KmCurveChart curves={curves} overall={overall} height={380} />
                </Well>
              </Panel>

              <Panel label="curve separation">
                <LogrankPanel comparison={comparison} />
              </Panel>
            </div>

            <Panel label="reliability register">
              <ReliabilityTable rows={tableRows} />
            </Panel>
          </>
        )}
      </div>
    </main>
  );
}
