'use client';

/**
 * Instrument panel primitives — the chrome every other component sits in.
 *
 * Division of labour, which is what keeps skeuomorphism readable:
 *   Panel      brushed metal frame + grain + corner screws   (texture lives here)
 *   Well       recessed cavity a readout sits inside          (flat, high contrast)
 *   Readout    LCD face for numbers                           (flat, no gradient)
 *
 * Nothing that carries a number is ever painted on a gradient.
 */

import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ Panel */

interface PanelProps {
  children: ReactNode;
  /** Engraved label across the top rail. */
  label?: string;
  /** Right-aligned secondary text on the rail. */
  meta?: ReactNode;
  screws?: boolean;
  className?: string;
}

export function Panel({ children, label, meta, screws = true, className = '' }: PanelProps) {
  return (
    <section
      className={`metal-plate grain relative rounded-2xl p-[3px] ${className}`}
    >
      {screws && (
        <>
          <span className="screw absolute left-2.5 top-2.5 h-2.5 w-2.5" />
          <span className="screw absolute right-2.5 top-2.5 h-2.5 w-2.5" />
          <span className="screw absolute bottom-2.5 left-2.5 h-2.5 w-2.5" />
          <span className="screw absolute bottom-2.5 right-2.5 h-2.5 w-2.5" />
        </>
      )}

      <div className="relative rounded-[13px] px-5 py-4 md:px-7 md:py-5">
        {(label || meta) && (
          <header className="mb-3 flex items-baseline justify-between gap-4">
            {label && (
              <h2 className="silkscreen etched leading-none">{label}</h2>
            )}
            {meta && <div className="shrink-0">{meta}</div>}
          </header>
        )}
        {(label || meta) && <div className="groove mb-4" />}
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- Well */

export function Well({
  children,
  className = '',
  deep = false,
}: {
  children: ReactNode;
  className?: string;
  deep?: boolean;
}) {
  return (
    <div
      className={`${deep ? 'metal-well-deep' : 'metal-well'} rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Readout */

const LAMP_TONE = {
  amber: { text: 'text-lamp-amber-hot', glow: 'rgba(255,176,32,0.55)' },
  emerald: { text: 'text-lamp-emerald-hot', glow: 'rgba(34,208,122,0.5)' },
  cyan: { text: 'text-lamp-cyan-hot', glow: 'rgba(34,201,232,0.5)' },
  violet: { text: 'text-lamp-violet-hot', glow: 'rgba(139,107,255,0.5)' },
  magenta: { text: 'text-lamp-magenta-hot', glow: 'rgba(255,79,163,0.5)' },
  red: { text: 'text-lamp-red-hot', glow: 'rgba(255,82,69,0.5)' },
  neutral: { text: 'text-etch-bright', glow: 'rgba(255,255,255,0.28)' },
} as const;

export type LampTone = keyof typeof LAMP_TONE;

interface ReadoutProps {
  value: ReactNode;
  label?: string;
  unit?: string;
  tone?: LampTone;
  /** Backlit digits. Off reads as an unpowered segment. */
  lit?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'text-lg md:text-xl',
  md: 'text-2xl md:text-3xl',
  lg: 'text-4xl md:text-5xl',
} as const;

export function Readout({
  value,
  label,
  unit,
  tone = 'neutral',
  lit = true,
  size = 'md',
  className = '',
}: ReadoutProps) {
  const t = LAMP_TONE[tone];
  return (
    <div className={`lcd glass-glint rounded-lg px-3 py-2.5 ${className}`}>
      {label && <div className="silkscreen mb-1 leading-none">{label}</div>}
      <div className="flex items-baseline gap-1.5">
        <span
          className={`numeral font-semibold leading-none ${SIZES[size]} ${
            lit ? t.text : 'text-chassis-300'
          }`}
          // A real backlit display bleeds light into its own housing.
          style={lit ? { textShadow: `0 0 18px ${t.glow}, 0 0 4px ${t.glow}` } : undefined}
        >
          {value}
        </span>
        {unit && <span className="silkscreen shrink-0 pb-0.5">{unit}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Lamp */

export function Lamp({
  tone = 'emerald',
  pulse = false,
  size = 7,
  title,
}: {
  tone?: LampTone;
  pulse?: boolean;
  size?: number;
  title?: string;
}) {
  const COLOR: Record<LampTone, string> = {
    amber: '#ffb020',
    emerald: '#22d07a',
    cyan: '#22c9e8',
    violet: '#8b6bff',
    magenta: '#ff4fa3',
    red: '#ff5245',
    neutral: '#6b7381',
  };
  const c = COLOR[tone];
  return (
    <span
      title={title}
      className={`lamp inline-block shrink-0 ${pulse ? 'lamp-pulse' : ''}`}
      style={{
        width: size,
        height: size,
        // Domed LED: hot core, coloured body, light spilling onto the panel.
        background: `radial-gradient(circle at 35% 30%, #fff 0%, ${c} 42%, ${c} 70%, rgba(0,0,0,0.45) 100%)`,
        boxShadow: `0 0 8px ${c}, 0 0 16px ${c}66, 0 1px 0 rgba(255,255,255,0.3) inset`,
      }}
    />
  );
}

/* ----------------------------------------------------------------- Button */

const KEY_CLASS = {
  dark: 'key-dark',
  amber: 'key-amber',
  emerald: 'key-emerald',
  cyan: 'key-cyan',
  violet: 'key-violet',
  magenta: 'key-magenta',
  brass: 'key-brass',
} as const;

export type KeyTone = keyof typeof KEY_CLASS;

export function Key({
  children,
  tone = 'dark',
  active = false,
  onClick,
  title,
  className = '',
}: {
  children: ReactNode;
  tone?: KeyTone;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`btn-tactile ${KEY_CLASS[tone]} px-3 py-1.5 text-[11px] font-semibold ${
        // A latched key sits lower in its housing and keeps a bright ring.
        active ? 'translate-y-[2px] ring-2 ring-brass-hot/70' : ''
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------- Not-available note */

/**
 * Shown where a statistic genuinely could not be computed. Deliberately styled
 * as an unlit segment rather than a value, so a missing estimate can never be
 * mistaken for a real one.
 */
export function Unavailable({ reason, label }: { reason?: string | null; label?: string }) {
  return (
    <div className="lcd rounded-lg px-3 py-2.5" title={reason ?? undefined}>
      {label && <div className="silkscreen mb-1 leading-none">{label}</div>}
      <div className="flex items-baseline gap-2">
        <span className="numeral text-2xl font-semibold leading-none text-chassis-300 md:text-3xl">
          — — —
        </span>
        <span className="silkscreen pb-0.5 text-lamp-amber/80">N/A</span>
      </div>
      {reason && (
        <p className="mt-1.5 max-w-[26ch] text-[10px] leading-snug text-etch-faint">{reason}</p>
      )}
    </div>
  );
}
