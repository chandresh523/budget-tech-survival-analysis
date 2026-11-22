'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  METRICS_CHANNEL,
  METRICS_EVENT,
  fetchMeta,
  fetchPayload,
  getSupabaseBrowser,
  isSupabaseConfigured,
  type MetricsMeta,
  type PipelinePayload,
} from '@/lib/supabase-browser';

export type LiveStatus =
  | 'connecting' // first load in flight
  | 'live'       // broadcast channel joined; updates arrive as pushes
  | 'polling'    // broadcast unavailable, falling back to an interval refetch
  | 'static'     // reading the bundled JSON snapshot only
  | 'error';

export interface LiveMetrics {
  data: PipelinePayload | null;
  status: LiveStatus;
  updatedAt: Date | null;
  sourceRows: number | null;
  analyzedRows: number | null;
  pipelineMs: number | null;
  /** Increments on every applied update, so the UI can flash on change. */
  revision: number;
  error: string | null;
  refresh: () => void;
}

/** Interval used only when the broadcast channel could not be joined. */
const POLL_MS = 15_000;

/**
 * Subscribes the dashboard to the live pipeline results.
 *
 * Flow: read `meta.json` (uncached) → read the payload for that version → join
 * the broadcast channel. When a survey response arrives the watcher recomputes,
 * republishes to Storage, and broadcasts the new meta; this hook then pulls the
 * new version and swaps state. No reload, no database table involved.
 *
 * Degrades in three steps so the dashboard is never blank:
 *   broadcast push → interval polling → bundled /dashboard_data.json
 */
export function useLiveMetrics(): LiveMetrics {
  const [data, setData] = useState<PipelinePayload | null>(null);
  const [status, setStatus] = useState<LiveStatus>(() =>
    isSupabaseConfigured ? 'connecting' : 'static',
  );
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [sourceRows, setSourceRows] = useState<number | null>(null);
  const [analyzedRows, setAnalyzedRows] = useState<number | null>(null);
  const [pipelineMs, setPipelineMs] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  // The version currently displayed, so a repeated broadcast for the same
  // publish does not trigger a redundant payload download.
  const appliedVersion = useRef<string | null>(null);
  const joined = useRef(false);

  const loadStaticFallback = useCallback(async () => {
    try {
      const res = await fetch('/dashboard_data.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as PipelinePayload;
      if (!mounted.current) return;
      setData(json);
      setRevision((n) => n + 1);
    } catch (err) {
      if (!mounted.current) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load telemetry');
    }
  }, []);

  /**
   * Pull the published payload if it is newer than what is displayed.
   * `meta` may be supplied by a broadcast to skip the meta round trip.
   */
  const sync = useCallback(
    async (fromBroadcast?: MetricsMeta | null) => {
      const meta = fromBroadcast ?? (await fetchMeta());
      if (!meta?.updated_at) return false;
      if (appliedVersion.current === meta.updated_at) return true; // already current

      const payload = await fetchPayload(meta.updated_at);
      if (!mounted.current) return false;
      if (!payload || Object.keys(payload).length === 0) return false;

      appliedVersion.current = meta.updated_at;
      setData(payload);
      setUpdatedAt(new Date(meta.updated_at));
      setSourceRows(meta.source_rows ?? null);
      setAnalyzedRows(meta.analyzed_rows ?? null);
      setPipelineMs(meta.pipeline_ms ?? null);
      setRevision((n) => n + 1);
      setError(null);
      if (joined.current) setStatus('live');
      return true;
    },
    [],
  );

  const refresh = useCallback(() => {
    // A manual sync should always re-read, even if the version looks unchanged.
    appliedVersion.current = null;
    sync().catch(() => loadStaticFallback());
  }, [sync, loadStaticFallback]);

  useEffect(() => {
    mounted.current = true;

    if (!isSupabaseConfigured) {
      void (async () => {
        await loadStaticFallback();
      })();
      return () => {
        mounted.current = false;
      };
    }

    let channel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        sync().catch(() => {});
      }, POLL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    (async () => {
      // 1. Initial read. Fall back to the bundled snapshot if Storage is
      //    unreachable, so the dashboard is never empty.
      try {
        const ok = await sync();
        if (!ok) await loadStaticFallback();
      } catch {
        await loadStaticFallback();
      }
      if (!mounted.current) return;

      // 2. Join the broadcast channel for pushes.
      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      channel = supabase
        .channel(METRICS_CHANNEL)
        .on('broadcast', { event: METRICS_EVENT }, ({ payload }) => {
          // The broadcast carries the meta, so this skips straight to fetching
          // the new payload version.
          sync(payload as MetricsMeta).catch(() => {});
        })
        .subscribe((state) => {
          if (!mounted.current) return;
          if (state === 'SUBSCRIBED') {
            joined.current = true;
            setStatus('live');
            stopPolling();
            // Catch a publish that landed during the handshake.
            sync().catch(() => {});
          } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
            joined.current = false;
            setStatus('polling');
            startPolling();
          }
        });
    })();

    // A backgrounded tab can have its socket suspended; re-read on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted.current = false;
      joined.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      stopPolling();
      if (channel) getSupabaseBrowser()?.removeChannel(channel);
    };
  }, [sync, loadStaticFallback]);

  return {
    data,
    status,
    updatedAt,
    sourceRows,
    analyzedRows,
    pipelineMs,
    revision,
    error,
    refresh,
  };
}
