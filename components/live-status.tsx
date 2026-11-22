'use client';

import { useEffect, useState } from 'react';
import type { LiveStatus as Status } from '@/hooks/use-live-metrics';
import { Lamp, type LampTone } from '@/components/panel';

interface LiveStatusProps {
  status: Status;
  updatedAt: Date | null;
  sourceRows: number | null;
  pipelineMs: number | null;
  /** Bumped by the hook on every push — drives the flash. */
  revision: number;
  onRefresh?: () => void;
}

const PRESENTATION: Record<Status, { label: string; tone: LampTone; pulse: boolean }> = {
  connecting: { label: 'LINK', tone: 'amber', pulse: true },
  live: { label: 'LIVE', tone: 'emerald', pulse: true },
  polling: { label: 'POLL', tone: 'cyan', pulse: false },
  static: { label: 'SNAP', tone: 'neutral', pulse: false },
  error: { label: 'DOWN', tone: 'red', pulse: false },
};

function timeAgo(then: Date, now: number): string {
  const seconds = Math.max(0, Math.floor((now - then.getTime()) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function LiveStatus({
  status,
  updatedAt,
  sourceRows,
  pipelineMs,
  revision,
  onRefresh,
}: LiveStatusProps) {
  // Re-render once a second purely so the elapsed label stays honest.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const p = PRESENTATION[status];

  return (
    <div className="metal-plate grain relative flex items-center gap-2.5 rounded-xl px-2.5 py-1.5">
      {/* Fresh-data flash. Keyed on revision so React remounts it and the CSS
          animation replays — no state, no timers, nothing to clean up. */}
      {revision > 0 && (
        <span
          key={revision}
          aria-hidden
          className="flash-once pointer-events-none absolute inset-0 rounded-xl bg-lamp-emerald/25"
        />
      )}

      <span className="relative flex items-center gap-1.5">
        <Lamp tone={p.tone} pulse={p.pulse} size={7} title={status} />
        <span className="silkscreen text-etch! leading-none">{p.label}</span>
      </span>

      <span className="groove h-4 w-[2px] shrink-0" />

      {sourceRows !== null && (
        <span className="numeral text-[11px] leading-none text-ink-amber">
          {sourceRows}
          <span className="silkscreen ml-1">resp</span>
        </span>
      )}

      {updatedAt && (
        <span className="numeral text-[11px] leading-none text-etch-dim">
          {timeAgo(updatedAt, now)}
        </span>
      )}

      {pipelineMs !== null && (
        <span className="numeral hidden text-[11px] leading-none text-etch-faint sm:inline">
          {pipelineMs}ms
        </span>
      )}

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          title="Re-read the latest pipeline results"
          className="btn-tactile key-dark ml-0.5 rounded-md px-2 py-1 text-[9.5px] leading-none"
        >
          sync
        </button>
      )}
    </div>
  );
}
