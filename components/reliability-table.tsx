'use client';

/**
 * The survival summary table — an engraved data plate.
 *
 * Columns report what the pipeline actually estimates: median survival from the
 * Kaplan-Meier fit (with "not reached" spelled out rather than blanked, since
 * that is a finding), restricted mean survival time, observed events, and the
 * concordance index only where a model genuinely fitted.
 */

import { Lamp, type LampTone } from '@/components/panel';
import type { FitState } from '@/lib/supabase-browser';

export interface ReliabilityRow {
  assetId: string;
  name: string;
  records: number;
  events: number;
  /** Null means the median was never reached within follow-up. */
  medianMonths: number | null;
  rmstMonths: number | null;
  cIndex: number | null;
  fitState: FitState;
  fitNote?: string | null;
  estimable: boolean;
}

export interface ReliabilityTableProps {
  rows: ReliabilityRow[];
  selectedDevice?: string;
  onSelect?: (device: string) => void;
}

function toneFor(row: ReliabilityRow): LampTone {
  if (!row.estimable || row.fitState === 'no_events') return 'neutral';
  if (row.cIndex === null) return 'amber';
  return row.cIndex >= 0.8 ? 'emerald' : 'amber';
}

const HEADS: Array<[string, string]> = [
  ['', ''],
  ['ident', ''],
  ['device', ''],
  ['n', 'records analysed'],
  ['events', 'observed failures'],
  ['median', 'Kaplan-Meier median survival'],
  ['rmst', 'restricted mean survival time'],
  ['c-index', 'model concordance'],
];

export default function ReliabilityTable({
  rows,
  selectedDevice,
  onSelect,
}: ReliabilityTableProps) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-xs text-etch-faint">No devices to report.</p>;
  }

  return (
    // Wide table scrolls inside its own container so the page body never
    // scrolls sideways on a phone.
    <div className="metal-well overflow-x-auto rounded-xl">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-black/60">
            {HEADS.map(([head, title], i) => (
              <th
                key={i}
                title={title || undefined}
                className={`silkscreen whitespace-nowrap px-3 py-2.5 font-normal ${
                  i >= 3 ? 'text-right' : ''
                }`}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.name === selectedDevice;
            return (
              <tr
                key={row.assetId}
                onClick={onSelect ? () => onSelect(row.name) : undefined}
                className={`border-b border-etch/10 transition-colors duration-200 last:border-0 ${
                  onSelect ? 'cursor-pointer hover:bg-white/40' : ''
                } ${selected ? 'bg-brass/[0.09]' : ''}`}
              >
                <td className="px-3 py-2.5">
                  <Lamp tone={toneFor(row)} size={6} title={row.fitState} />
                </td>
                <td className="numeral whitespace-nowrap px-3 py-2.5 text-[11px] text-etch-faint">
                  {row.assetId}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 text-[12px] uppercase tracking-wider ${
                    selected ? 'text-etch-bright' : 'text-etch'
                  }`}
                >
                  {row.name}
                </td>
                <td className="numeral px-3 py-2.5 text-right text-[12px] text-etch-dim">
                  {row.records}
                </td>
                <td className="numeral px-3 py-2.5 text-right text-[12px]">
                  <span className={row.events === 0 ? 'text-chassis-300' : 'text-ink-amber'}>
                    {row.events}
                  </span>
                </td>
                <td className="numeral px-3 py-2.5 text-right text-[12px]">
                  {!row.estimable ? (
                    <span className="text-chassis-300" title={row.fitNote ?? undefined}>
                      —
                    </span>
                  ) : row.medianMonths === null ? (
                    // Distinct from missing: over half the units outlived follow-up.
                    <span className="text-[10px] uppercase tracking-wide text-etch-faint">
                      not reached
                    </span>
                  ) : (
                    <span className="text-etch-bright">
                      {row.medianMonths}
                      <span className="silkscreen ml-1">mo</span>
                    </span>
                  )}
                </td>
                <td className="numeral px-3 py-2.5 text-right text-[12px] text-etch-dim">
                  {row.rmstMonths === null ? (
                    <span className="text-chassis-300">—</span>
                  ) : (
                    <>
                      {row.rmstMonths}
                      <span className="silkscreen ml-1">mo</span>
                    </>
                  )}
                </td>
                <td className="numeral px-3 py-2.5 text-right text-[12px]">
                  {row.cIndex === null ? (
                    <span
                      className="text-[10px] uppercase tracking-wide text-ink-amber"
                      title={row.fitNote ?? undefined}
                    >
                      n/a
                    </span>
                  ) : (
                    <span className={row.cIndex >= 0.8 ? 'text-ink-emerald' : 'text-etch'}>
                      {row.cIndex.toFixed(3)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
