'use client';

/**
 * Kaplan-Meier survival chart.
 *
 * Plots the estimator the pipeline actually computes: a step function (survival
 * only changes at observed failure times, so `stepAfter` is a correctness
 * requirement, not a style choice), with the 95% confidence band behind it and
 * at-risk counts in the tooltip.
 *
 * Devices with too few observed failures are named as unavailable rather than
 * drawn — previously the chart synthesised a straight line from the RSF
 * concordance index, which is an accuracy metric, not a survival estimate.
 */

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { KmCurve } from '@/lib/supabase-browser';

/* Saturated and mid-dark: neon reads as washed-out pastel on a light cavity,
   and these still have to be distinguishable from one another at 2px. */
const SERIES_COLORS = [
  '#c26a00', '#0a8f4f', '#0a7ea3', '#6039d4', '#c2186f',
  '#8a5a12', '#3d8f2f', '#1a6fb5', '#8f3fb8', '#b53a5e',
];

const OVERALL_KEY = 'all devices';

export interface KmChartProps {
  curves: Record<string, KmCurve>;
  /** Highlighted device; the rest fade back. */
  selectedDevice?: string;
  /** Pooled all-device baseline, drawn dashed. */
  overall?: KmCurve | null;
  height?: number;
}

type Row = Record<string, number | null> & { month: number };

/**
 * Merge every curve onto a shared month axis.
 *
 * Each curve steps at its own event times, so we take the union of months and
 * carry each series' last known value forward — which is what a step function
 * means. Past a curve's final observation we emit null and stop drawing, since
 * a KM estimate is undefined beyond the end of follow-up.
 */
function buildRows(entries: [string, KmCurve][]): Row[] {
  const months = new Set<number>();
  entries.forEach(([, c]) => c.points.forEach((p) => months.add(p.month)));
  const sorted = [...months].sort((a, b) => a - b);

  const carried: Record<string, number | null> = {};
  const carriedRisk: Record<string, number | null> = {};

  return sorted.map((month) => {
    const row = { month } as Row;
    entries.forEach(([name, curve]) => {
      const last = curve.points[curve.points.length - 1];
      const beyond = !last || month > last.month;
      const point = curve.points.find((p) => p.month === month);

      if (point) {
        carried[name] = point.survival;
        carriedRisk[name] = point.at_risk;
      }

      row[name] = beyond ? null : carried[name] ?? null;
      row[`${name}__atRisk`] = beyond ? null : carriedRisk[name] ?? null;

      // Floating ribbon out of recharts' stacked Area: an invisible lower
      // bound, then the band height stacked on top of it.
      const lower = point?.lower ?? null;
      const upper = point?.upper ?? null;
      row[`${name}__lower`] = beyond || lower === null ? null : lower;
      row[`${name}__range`] =
        beyond || lower === null || upper === null ? null : upper - lower;
    });
    return row;
  });
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number | string; payload?: Row }>;
  label?: number | string;
  selectedDevice?: string;
}

function KmTooltip({ active, payload, label, selectedDevice }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const series = payload.filter(
    (p) =>
      typeof p.dataKey === 'string' &&
      !p.dataKey.includes('__') &&
      p.value !== null &&
      p.value !== undefined,
  );
  if (!series.length) return null;

  return (
    <div className="metal-plate grain rounded-lg px-3 py-2 text-[11px]">
      <div className="silkscreen mb-1.5">month {label}</div>
      <ul className="space-y-1">
        {series
          .sort((a, b) => Number(b.value) - Number(a.value))
          .map((p) => {
            const name = String(p.dataKey);
            const risk = row[`${name}__atRisk`];
            const isSel = name === selectedDevice;
            return (
              <li key={name} className="flex items-baseline gap-2 whitespace-nowrap">
                <span
                  className={`numeral ${isSel ? 'text-etch-bright' : 'text-etch-dim'}`}
                >
                  {(Number(p.value) * 100).toFixed(1)}%
                </span>
                <span className={isSel ? 'text-etch' : 'text-etch-faint'}>{name}</span>
                {risk != null && <span className="ml-auto pl-3 text-etch-faint">n={risk}</span>}
              </li>
            );
          })}
      </ul>
      <p className="mt-1.5 border-t border-etch/15 pt-1.5 text-[9.5px] leading-tight text-etch-faint">
        n = still under observation
      </p>
    </div>
  );
}

export default function KmCurveChart({
  curves,
  selectedDevice,
  overall,
  height = 340,
}: KmChartProps) {
  const deviceEntries = Object.entries(curves);
  const estimable = deviceEntries.filter(([, c]) => c.estimable && c.points.length > 0);
  const notEstimable = deviceEntries.filter(([, c]) => !c.estimable);

  if (estimable.length === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="silkscreen text-ink-amber">no estimable curves</span>
        <p className="max-w-sm text-xs leading-relaxed text-etch-faint">
          Every device currently has too few observed failures for a Kaplan-Meier
          estimate. Curves appear as failures are reported.
        </p>
      </div>
    );
  }

  const entries: [string, KmCurve][] =
    overall && overall.estimable ? [...estimable, [OVERALL_KEY, overall]] : estimable;
  const rows = buildRows(entries);

  const colorFor = (name: string, i: number) =>
    name === OVERALL_KEY ? '#6b6459' : SERIES_COLORS[i % SERIES_COLORS.length];

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 14, bottom: 18, left: -14 }}>
          <CartesianGrid stroke="rgba(52,43,30,0.14)" strokeDasharray="2 4" />
          <XAxis
            dataKey="month"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fill: '#5a5346', fontSize: 10 }}
            stroke="rgba(52,43,30,0.3)"
            label={{
              value: 'MONTHS SINCE PURCHASE',
              position: 'insideBottom',
              offset: -10,
              fill: '#5a5346',
              fontSize: 9,
              letterSpacing: '0.22em',
            }}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={{ fill: '#5a5346', fontSize: 10 }}
            stroke="rgba(52,43,30,0.3)"
          />
          <Tooltip
            content={<KmTooltip selectedDevice={selectedDevice} />}
            cursor={{ stroke: 'rgba(52,43,30,0.35)', strokeDasharray: '3 3' }}
          />

          {/* Band only for the focused series — banding all ten is unreadable. */}
          {entries.flatMap(([name], i) => {
            if (selectedDevice && name !== selectedDevice) return [];
            return [
              <Area
                key={`${name}-ci-base`}
                dataKey={`${name}__lower`}
                stackId={`ci-${name}`}
                stroke="none"
                fill="none"
                isAnimationActive={false}
              />,
              <Area
                key={`${name}-ci-band`}
                dataKey={`${name}__range`}
                stackId={`ci-${name}`}
                stroke="none"
                fill={colorFor(name, i)}
                fillOpacity={0.2}
                isAnimationActive={false}
              />,
            ];
          })}

          {entries.map(([name], i) => {
            const isOverall = name === OVERALL_KEY;
            const dim = selectedDevice ? name !== selectedDevice : false;
            return (
              <Line
                key={name}
                type="stepAfter"
                dataKey={name}
                stroke={colorFor(name, i)}
                strokeWidth={dim ? 1.1 : isOverall ? 1.6 : 2.4}
                strokeOpacity={dim ? 0.3 : 1}
                strokeDasharray={isOverall ? '5 4' : undefined}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {entries.map(([name, curve], i) => {
          const median = curve.median_survival_months;
          return (
            <span key={name} className="flex items-center gap-1.5" title={
              median === null
                ? `${name}: median not reached within ${curve.max_followup_months ?? '?'} months`
                : `${name}: median survival ${median} months`
            }>
              <span
                className="h-[3px] w-4 rounded-full"
                style={{
                  background: colorFor(name, i),
                  boxShadow: `0 0 6px ${colorFor(name, i)}88`,
                }}
              />
              <span
                className={`text-[10px] uppercase tracking-wider ${
                  name === selectedDevice ? 'text-etch-bright' : 'text-etch-faint'
                }`}
              >
                {name}
              </span>
            </span>
          );
        })}
      </div>

      {notEstimable.length > 0 && (
        <p className="mt-2.5 text-[10px] leading-relaxed text-etch-faint">
          <span className="text-ink-amber">Not plotted — </span>
          {notEstimable.map(([name, c], i) => (
            <span key={name}>
              {i > 0 && '; '}
              <span className="text-etch-dim">{name}</span> ({c.reason})
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
