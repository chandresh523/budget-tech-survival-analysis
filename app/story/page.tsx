'use client';

/**
 * Lifespan Matrix — the story cut, served at /story.
 *
 * The cinematic cut is the root route; this is the alternate reading of the same
 * live data: six chapters over a fluid field, with the inside-the-globe category
 * viewer. Reachable from the hero of the root route.
 *
 * Six chapters flown through on scroll, over a WebGL fluid field. The layout
 * follows Apple's two-layer split: the chapters are the content layer (opaque,
 * scrolling under everything) and the nav is the functional layer (Liquid Glass,
 * floating above it). Data is the live pipeline feed — nothing here is static.
 */

import { useCallback, useState } from 'react';
import StoryShell from '@/components/story/story-shell';
import PixelTransition, { type PixelTransitionHandle } from '@/components/cinematic/pixel-transition';
import { OverviewChapter, PanelChapter } from '@/components/story/chapters-a';
import { SurvivalChapter, ModelsChapter } from '@/components/story/chapters-b';
import { BrandsChapter, ImpactChapter } from '@/components/story/chapters-c';
import { useLiveMetrics } from '@/hooks/use-live-metrics';
import { deviceKeysOf, kmCurvesOf } from '@/lib/supabase-browser';
import type { OrbitNode } from '@/components/story/orbital-cluster';

export default function StoryPage() {
  // Arrive through the same pixelated dissolve the dive leaves on, so the two
  // routes read as one place. Everything else on this page is unchanged.
  const onPixelsReady = useCallback((h: PixelTransitionHandle) => { h.reveal(); }, []);
  const { data, status, updatedAt, sourceRows, analyzedRows, error, refresh } = useLiveMetrics();

  // Only the explicit pick is stored; which device is *shown* is derived, so an
  // arriving payload can never leave a stale selection pointing at a device
  // that no longer exists.
  const [picked, setPicked] = useState<string | null>(null);
  const devices = deviceKeysOf(data);
  const selected = picked && devices.includes(picked) ? picked : null;

  const curves = kmCurvesOf(data);
  const orbit: OrbitNode[] = devices.map((k) => {
    const c = curves[k];
    return {
      id: k,
      label: k,
      value: c?.points.find((p) => p.month === 24)?.survival ?? null,
      weight: c?.n ?? data![k].total_records ?? 1,
      caption: `${c?.n ?? 0} records, ${c?.events ?? 0} failures`,
      hollow: (c?.events ?? 0) === 0,
    };
  });

  const meta = { sourceRows, analyzedRows, updatedAt };

  return (
    <main className="relative min-h-screen bg-void">
      <StoryShell
        status={status}
        updatedAt={updatedAt}
        sourceRows={sourceRows}
        onRefresh={refresh}
        orbit={orbit}
        selected={selected}
        onSelect={setPicked}
        chapters={[
          <OverviewChapter key="overview" data={data} meta={meta} />,
          <PanelChapter key="panel" data={data} meta={meta} />,
          <SurvivalChapter key="survival" data={data} selected={selected} onSelect={setPicked} />,
          <ModelsChapter key="models" data={data} />,
          <BrandsChapter key="brands" data={data} />,
          <ImpactChapter key="impact" data={data} />,
        ]}
      />

      {error && (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit rounded-full bg-signal-red/15 px-4 py-2 text-[12px] text-signal-red backdrop-blur"
        >
          {error}
        </div>
      )}
      <PixelTransition onReady={onPixelsReady} />
    </main>
  );
}
