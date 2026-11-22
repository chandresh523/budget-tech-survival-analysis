'use client';

/**
 * The live data bus that feeds WebGL — deliberately outside React.
 *
 * The rule this whole module exists to enforce: **incoming realtime data never
 * touches React state.** A Supabase stream that setState's on every message
 * re-renders the component tree at the message rate; at a few hundred points
 * that is a dropped frame per message, and the 3D scene stutters exactly when
 * data is most interesting.
 *
 * Instead:
 *
 *   Supabase channel  ->  mutable buffer (module scope)  ->  dirty flag
 *                                                              |
 *                            useFrame reads the buffer  <------+
 *                            and writes instanceMatrix directly
 *
 * React is told only about things a human reads at human speed — connection
 * status and the row count — and those are throttled to at most one update a
 * second. The point cloud itself flows straight to the GPU.
 *
 * The socket is also moved onto a Web Worker heartbeat. Browsers clamp timers
 * in background tabs to roughly once a minute, which is longer than the
 * server's heartbeat window: the connection dies silently and the page looks
 * connected while receiving nothing. `worker: true` runs the heartbeat off the
 * main thread where the clamp does not apply.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import {
  METRICS_CHANNEL,
  METRICS_EVENT,
  SURVEY_CHANNEL,
  SURVEY_EVENT,
  fetchMeta,
  fetchPayload,
  type MetricsMeta,
  type PipelinePayload,
} from '@/lib/supabase-browser';
import { buildTunnelPoints, computeHeat } from '@/lib/tunnel-data';
import type { DataPoint } from '@/components/cinematic/data-tunnel';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* ────────────────────────────────────────────────── the mutable buffer ──── */

export interface StreamBuffer {
  /** Current cloud. Mutated in place; never replaced while the GPU reads it. */
  points: DataPoint[];
  /** Bumped whenever `points` changes. useFrame compares against its own copy. */
  version: number;
  /** Instances appended since the last GPU upload, for the arrival animation. */
  pending: number[];
  /** 0-1 statistical intensity for the shader. */
  heat: number;
  /** Wall-clock of the last accepted publish, for de-duplication. */
  publishedAt: string | null;
}

export const streamBuffer: StreamBuffer = {
  points: [],
  version: 0,
  pending: [],
  heat: 0.2,
  publishedAt: null,
};

/* ─────────────────────────────────────────────── low-frequency UI state ──── */

export type StreamStatus = 'idle' | 'connecting' | 'live' | 'polling' | 'error';

export interface StreamSnapshot {
  status: StreamStatus;
  rows: number;
  updatedAt: string | null;
  /** Increments only when a publish is applied — safe to render. */
  revision: number;
}

let snapshot: StreamSnapshot = { status: 'idle', rows: 0, updatedAt: null, revision: 0 };
const listeners = new Set<() => void>();

/** Coalesce UI notifications: humans cannot read faster than this, and each
 *  notification is a full React render. */
let notifyQueued = false;
function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  setTimeout(() => {
    notifyQueued = false;
    listeners.forEach((l) => l());
  }, 250);
}

function setSnapshot(patch: Partial<StreamSnapshot>) {
  // A NEW object each time: useSyncExternalStore compares by identity, and
  // mutating in place would make it skip the update entirely.
  snapshot = { ...snapshot, ...patch };
  notify();
}

export function subscribeStream(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getStreamSnapshot(): StreamSnapshot {
  return snapshot;
}
// One frozen instance, not a fresh literal per call. useSyncExternalStore
// compares snapshots by identity, so returning a new object every time makes
// the server/hydration snapshot look perpetually changed and React warns about
// an infinite loop.
const SERVER_SNAPSHOT: StreamSnapshot = Object.freeze({
  status: 'idle', rows: 0, updatedAt: null, revision: 0,
}) as StreamSnapshot;

export function getServerSnapshot(): StreamSnapshot {
  return SERVER_SNAPSHOT;
}

/* ──────────────────────────────────────────────────────── the client ──── */

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!url || !anon) return null;
  if (client) return client;
  client = createClient(url, anon, {
    auth: { persistSession: false },
    realtime: {
      // Heartbeat on a Web Worker. Background tabs clamp main-thread timers to
      // ~60s, which exceeds the server's heartbeat window — the socket then
      // dies quietly and the UI keeps claiming it is live. The worker thread
      // is not clamped, so the connection survives being backgrounded.
      worker: true,
      // Cap the inbound rate. Without this a burst of survey submissions can
      // deliver faster than a frame, and every message would queue work.
      params: { eventsPerSecond: 10 },
      heartbeatIntervalMs: 15_000,
    },
  });
  return client;
}

/* ─────────────────────────────────────────────────── applying a publish ──── */

/**
 * Swap in a new payload. Writes to the buffer only — no React state, no
 * re-render of anything holding the 3D scene.
 */
function applyPayload(payload: PipelinePayload, meta: MetricsMeta | null) {
  const next = buildTunnelPoints(payload);
  const prevCount = streamBuffer.points.length;

  // Mutate in place. Replacing the array would leave useFrame holding the old
  // reference for a frame, and the GPU would upload a stale cloud.
  streamBuffer.points.length = 0;
  for (const p of next) streamBuffer.points.push(p);

  // Anything beyond the previous length is new, and gets the arrival animation.
  streamBuffer.pending.length = 0;
  for (let i = prevCount; i < next.length; i++) streamBuffer.pending.push(i);

  streamBuffer.heat = computeHeat(payload);
  streamBuffer.version += 1;
  streamBuffer.publishedAt = meta?.updated_at ?? streamBuffer.publishedAt;

  setSnapshot({
    rows: meta?.source_rows ?? next.length,
    updatedAt: meta?.updated_at ?? null,
    revision: snapshot.revision + 1,
  });
}

/** Pull the current publish. Skips the download when the version is unchanged. */
async function sync(known?: MetricsMeta | null): Promise<boolean> {
  const meta = known ?? (await fetchMeta());
  if (!meta?.updated_at) return false;
  if (meta.updated_at === streamBuffer.publishedAt) return true;
  const payload = await fetchPayload(meta.updated_at);
  if (!payload || !Object.keys(payload).length) return false;
  applyPayload(payload, meta);
  return true;
}

/* ────────────────────────────────────────────────────────── lifecycle ──── */

export interface StreamHandle {
  stop: () => void;
  refresh: () => void;
}

const POLL_MS = 15_000;

export function startStream(): StreamHandle {
  const supabase = getClient();
  let metrics: RealtimeChannel | null = null;
  let survey: RealtimeChannel | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const startPolling = () => {
    if (poll) return;
    poll = setInterval(() => void sync().catch(() => {}), POLL_MS);
  };
  const stopPolling = () => {
    if (poll) clearInterval(poll);
    poll = null;
  };

  setSnapshot({ status: supabase ? 'connecting' : 'error' });

  void (async () => {
    try {
      await sync();
    } catch {
      if (!stopped) setSnapshot({ status: 'error' });
    }
    if (stopped || !supabase) return;

    metrics = supabase
      .channel(METRICS_CHANNEL)
      // The broadcast carries only the small meta object, so the payload
      // download is versioned and the socket stays light regardless of how
      // large the dataset grows.
      .on('broadcast', { event: METRICS_EVENT }, ({ payload }) => {
        void sync(payload as MetricsMeta).catch(() => {});
      })
      .subscribe((state) => {
        if (stopped) return;
        if (state === 'SUBSCRIBED') {
          setSnapshot({ status: 'live' });
          stopPolling();
          void sync().catch(() => {});
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          setSnapshot({ status: 'polling' });
          startPolling();
        }
      });

    // Also listen to the survey page directly. The watcher needs a few seconds
    // to recompute; hearing the submission lets the UI acknowledge it instantly
    // rather than looking inert until the results land.
    survey = supabase
      .channel(SURVEY_CHANNEL)
      .on('broadcast', { event: SURVEY_EVENT }, () => {
        setSnapshot({ status: 'live' });
      })
      .subscribe();
  })();

  // A socket suspended while backgrounded can miss a publish even with the
  // worker heartbeat; re-reading on return is cheap insurance.
  const onVisible = () => {
    if (document.visibilityState === 'visible') void sync().catch(() => {});
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    stop() {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      stopPolling();
      if (metrics) supabase?.removeChannel(metrics);
      if (survey) supabase?.removeChannel(survey);
    },
    refresh() {
      streamBuffer.publishedAt = null; // force a re-read
      void sync().catch(() => {});
    },
  };
}
