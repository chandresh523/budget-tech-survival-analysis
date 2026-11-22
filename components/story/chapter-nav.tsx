'use client';

/**
 * The floating chapter bar — Apple's floating tab bar.
 *
 * The detail that makes it read as Apple rather than "pills in a rounded box"
 * is that the selection capsule SLIDES between chapters instead of fading in
 * and out. framer-motion's shared `layoutId` does that with one element, so the
 * highlight is a single object that moves rather than N objects cross-fading.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { LiveStatus } from '@/hooks/use-live-metrics';
import { CHAPTERS } from '@/lib/story';

export interface ChapterNavProps {
  activeIndex: number;
  /** 0 at rest, ->1 mid-transition. The bar tightens as it rises. */
  velocity: number;
  onJump: (index: number) => void;
  status: LiveStatus;
  updatedAt: Date | null;
  sourceRows: number | null;
  onRefresh?: () => void;
}

const STATUS_DOT: Record<LiveStatus, { color: string; label: string; pulse: boolean }> = {
  connecting: { color: '#ffb020', label: 'connecting', pulse: true },
  live: { color: '#22d07a', label: 'live', pulse: true },
  polling: { color: '#00c2d1', label: 'polling', pulse: false },
  static: { color: '#8a8896', label: 'snapshot', pulse: false },
  error: { color: '#ff5245', label: 'offline', pulse: false },
};

function ago(then: Date, now: number): string {
  const s = Math.max(0, Math.round((now - then.getTime()) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export default function ChapterNav({
  activeIndex,
  velocity,
  onJump,
  status,
  updatedAt,
  sourceRows,
  onRefresh,
}: ChapterNavProps) {
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);

  // Only to keep the relative timestamp honest.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Keep the active chapter in view when the bar has to scroll on narrow screens.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeIndex]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = Math.min(
      CHAPTERS.length - 1,
      Math.max(0, activeIndex + (e.key === 'ArrowRight' ? 1 : -1)),
    );
    if (next !== activeIndex) onJump(next);
  };

  const dot = STATUS_DOT[status];

  return (
    <nav
      aria-label="Chapters"
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-4"
      style={{
        // Contracts slightly while the reader is moving, so the chrome gets out
        // of the way of the content it floats over.
        transform: `scale(${1 - velocity * 0.03})`,
        transition: 'transform 320ms var(--ease-glass)',
      }}
    >
      <div className="glass-thick specular grain flex max-w-[min(96vw,64rem)] items-center gap-2 rounded-full py-1.5 pl-2 pr-2.5">
        <div
          ref={listRef}
          onKeyDown={onKey}
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CHAPTERS.map((c, i) => {
            const active = i === activeIndex;
            return (
              <button
                key={c.id}
                type="button"
                data-index={i}
                onClick={() => onJump(i)}
                aria-current={active ? 'true' : undefined}
                className={`pill relative shrink-0 ${active ? 'pill-active' : ''}`}
              >
                {active && (
                  // One element that moves between chapters, not six that fade.
                  <motion.span
                    layoutId="chapter-capsule"
                    aria-hidden
                    className="absolute inset-0 -z-10 rounded-full"
                    style={{
                      background:
                        'linear-gradient(180deg, color-mix(in oklab, var(--accent) 32%, transparent), color-mix(in oklab, var(--accent) 12%, transparent))',
                      boxShadow:
                        '0 1px 0 color-mix(in oklab, #fff 30%, transparent) inset, 0 6px 20px -8px color-mix(in oklab, var(--accent) 75%, transparent)',
                    }}
                    transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.7 }}
                  />
                )}
                <span className="relative">{c.label}</span>
              </button>
            );
          })}
        </div>

        <span aria-hidden className="h-6 w-px shrink-0 bg-white/10" />

        {/* Live indicator. Monochrome except the status dot — the HIG reserves
            tint for interactivity, and this is the one genuine state signal. */}
        <div className="flex shrink-0 items-center gap-2 pl-0.5 pr-1">
          <span className="relative flex h-2 w-2" title={dot.label}>
            {dot.pulse && (
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: dot.color }}
              />
            )}
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: dot.color, boxShadow: `0 0 8px ${dot.color}` }}
            />
          </span>
          {sourceRows !== null && (
            <span className="numeral hidden text-[12px] leading-none text-ink-300 sm:inline">
              {sourceRows}
            </span>
          )}
          {updatedAt && (
            <span className="numeral hidden text-[12px] leading-none text-ink-600 md:inline">
              {ago(updatedAt, now)}
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Re-read the latest published results"
              aria-label="Refresh data"
              className="pill min-h-0! px-2! py-1! text-[11px]"
            >
              ↻
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
