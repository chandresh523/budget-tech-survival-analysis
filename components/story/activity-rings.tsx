'use client';

/**
 * Apple's activity rings, rendered as SVG rather than WebGL.
 *
 * The look depends on four things layered in order, and dropping any one of
 * them is what makes homemade versions read as progress bars bent into a
 * circle: a recessed dark track tinted by the ring's own colour, a gradient
 * stroke that brightens toward the leading edge, fully round caps, and a soft
 * glow of the same hue spilling onto the void behind.
 *
 * Statistical honesty overrides the aesthetic: a ring with no value draws its
 * track and nothing else, and says why. A full sweep only ever means "at or
 * past the goal" — never "we had nothing to show".
 */

import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface ActivityRingDatum {
  id: string;
  label: string;
  /** Null draws the track alone. `unavailable` must then explain the absence. */
  value: number | null;
  /** Goal the sweep is measured against. Defaults to 100, i.e. percent-style. */
  max?: number;
  /** Any CSS colour, including `var(--accent)`. */
  color: string;
  /** Why the value is missing. Rendered verbatim next to the ring. */
  unavailable?: string;
  unit?: string;
  /** Overrides the default number formatting for this ring's readouts. */
  format?: (value: number) => string;
}

export interface ActivityRingsProps {
  /** Outermost first. Only the first three are drawn — Apple's own limit. */
  rings: ActivityRingDatum[];
  size?: number;
  thickness?: number;
  /** Gate the sweep on arrival; false holds every ring at zero. */
  play?: boolean;
  caption?: string;
}

const MAX_RINGS = 3;
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const SWEEP_SECONDS = 1.15;

/** Significant figures that suit the magnitude, so 9.04% keeps its decimals. */
function defaultFormat(value: number): string {
  const abs = Math.abs(value);
  if (Number.isInteger(value)) return String(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

interface ResolvedRing {
  datum: ActivityRingDatum;
  radius: number;
  /** The goal actually used, once defaults and validation are applied. */
  scale: number;
  /** value / scale, unclamped, so overshoot survives to the readouts. */
  ratio: number;
  /** The drawn sweep, clamped into [0, 1]. */
  fraction: number;
  usable: boolean;
  reason: string;
  text: string;
}

export default function ActivityRings({
  rings,
  size = 224,
  thickness = 18,
  play = true,
  caption,
}: ActivityRingsProps) {
  const reduceMotion = useReducedMotion() === true;
  // useId's delimiters are legal in an id but awkward inside url(#…); strip them.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const center = size / 2;
  const gap = thickness * 0.42;
  const pad = thickness * 0.3; // keeps the outer glow inside the viewBox
  const floor = thickness * 0.8; // below this a ring collapses through its own centre
  const outerRadius = Math.max(floor, (size - thickness) / 2 - pad);

  const resolved: ResolvedRing[] = rings.slice(0, MAX_RINGS).map((datum, i) => {
    const scale = datum.max ?? 100;
    const measured = datum.value !== null && Number.isFinite(datum.value) ? datum.value : null;
    const scaled = Number.isFinite(scale) && scale > 0;
    const usable = measured !== null && scaled;
    const ratio = usable ? measured / scale : 0;
    const format = datum.format ?? defaultFormat;

    return {
      datum,
      radius: Math.max(floor, outerRadius - i * (thickness + gap)),
      scale,
      ratio,
      fraction: Math.min(1, Math.max(0, ratio)),
      usable,
      // A missing figure always names its own cause, even when the caller
      // forgot to supply one.
      reason: usable
        ? ''
        : (datum.unavailable ??
          (measured === null ? 'no value reported' : 'no goal to measure against')),
      text: usable ? format(measured) : '',
    };
  });

  if (resolved.length === 0) return null;

  const primary = resolved[0];
  const holeRadius = Math.max(0, resolved[resolved.length - 1].radius - thickness / 2);
  const centreFont = Math.max(18, Math.min(46, holeRadius * 0.68));
  // Reduced motion means the final state, immediately — never a hidden ring.
  const settled = reduceMotion || play;

  return (
    <figure className="flex flex-col items-center gap-4">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size, maxWidth: '100%' }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-full w-full overflow-visible"
          aria-hidden
        >
          <defs>
            {resolved.map(({ datum, radius }) => (
              <linearGradient
                key={datum.id}
                id={`${uid}-${datum.id}`}
                gradientUnits="userSpaceOnUse"
                // Chosen so that after the group's -90deg rotation the bright
                // end of the gradient sits at the leading cap, not the tail.
                x1={center - radius}
                y1={center - radius}
                x2={center + radius}
                y2={center + radius}
              >
                <stop offset="0%" style={{ stopColor: datum.color, stopOpacity: 0.5 }} />
                <stop offset="45%" style={{ stopColor: datum.color, stopOpacity: 1 }} />
                <stop
                  offset="100%"
                  style={{
                    stopColor: `color-mix(in oklab, ${datum.color} 58%, #ffffff)`,
                    stopOpacity: 1,
                  }}
                />
              </linearGradient>
            ))}
          </defs>

          {/* An SVG circle starts at 3 o'clock and runs clockwise; rotating the
              whole group is what puts the start of every sweep at 12. */}
          <g transform={`rotate(-90 ${center} ${center})`}>
            {resolved.map(({ datum, radius }) => (
              <g key={`${datum.id}-track`}>
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth={thickness + 2}
                />
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={`color-mix(in oklab, ${datum.color} 20%, #05040e)`}
                  strokeWidth={thickness}
                />
                {/* Bright lip on the inner wall — reads as a machined groove. */}
                <circle
                  cx={center}
                  cy={center}
                  r={Math.max(0, radius - thickness / 2)}
                  fill="none"
                  stroke="rgba(255,255,255,0.07)"
                  strokeWidth={1}
                />
              </g>
            ))}

            {resolved.map(({ datum, radius, fraction, ratio, usable }, i) => {
              if (!usable) return null;
              const delay = reduceMotion ? 0 : i * 0.11;
              const target = settled ? fraction : 0;

              return (
                <g key={`${datum.id}-arc`}>
                  <motion.circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={`url(#${uid}-${datum.id})`}
                    strokeWidth={thickness}
                    strokeLinecap="round"
                    initial={{ pathLength: reduceMotion ? fraction : 0 }}
                    animate={{ pathLength: target }}
                    transition={{
                      duration: reduceMotion ? 0 : SWEEP_SECONDS,
                      delay,
                      ease: EASE,
                    }}
                    style={{
                      // --velocity swells the bloom while the reader is in
                      // transit, so the rings breathe with the rest of the page.
                      filter: `drop-shadow(0 0 calc(${(thickness * 0.5).toFixed(
                        1,
                      )}px + var(--velocity) * 10px) color-mix(in oklab, ${
                        datum.color
                      } 55%, transparent))`,
                    }}
                  />

                  {/* Past the goal the arc has nowhere left to go, so the cap
                      brightens and lifts instead of silently pinning at 100%. */}
                  {ratio > 1 && (
                    <motion.circle
                      cx={center + radius}
                      cy={center}
                      r={thickness / 2}
                      fill={`color-mix(in oklab, ${datum.color} 30%, #ffffff)`}
                      initial={{ opacity: reduceMotion ? 1 : 0 }}
                      animate={{ opacity: settled ? 1 : 0 }}
                      transition={{
                        duration: reduceMotion ? 0 : 0.35,
                        delay: reduceMotion ? 0 : delay + SWEEP_SECONDS * 0.85,
                      }}
                      style={{
                        filter: `drop-shadow(0 0 ${(thickness * 0.7).toFixed(
                          1,
                        )}px color-mix(in oklab, ${datum.color} 85%, transparent))`,
                      }}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
          <span
            className="eyebrow"
            style={{ color: `color-mix(in oklab, ${primary.datum.color} 70%, #ffffff)` }}
          >
            {primary.datum.label}
          </span>

          {primary.usable ? (
            <>
              <span
                className="numeral mt-1 font-semibold leading-none"
                style={{
                  fontSize: centreFont,
                  color: `color-mix(in oklab, ${primary.datum.color} 45%, #ffffff)`,
                  textShadow: `0 0 24px color-mix(in oklab, ${primary.datum.color} 60%, transparent)`,
                }}
              >
                {primary.text}
                {primary.datum.unit && (
                  <span className="ml-0.5 text-[0.42em] text-ink-400">
                    {primary.datum.unit}
                  </span>
                )}
              </span>
              <span className="numeral mt-1.5 text-[10px] text-ink-600">
                of {defaultFormat(primary.scale)}
                {primary.datum.unit ? ` ${primary.datum.unit}` : ''}
              </span>
            </>
          ) : (
            <>
              <span
                className="numeral mt-1 font-semibold leading-none text-ink-600"
                style={{ fontSize: centreFont * 0.62 }}
              >
                n/a
              </span>
              <span className="mt-1.5 max-w-[13ch] text-[10px] leading-snug text-signal-amber/85">
                {primary.reason}
              </span>
            </>
          )}
        </div>
      </div>

      <ul className="w-full space-y-1.5">
        {resolved.map(({ datum, text, ratio, usable, reason }) => (
          <li
            key={datum.id}
            className="flex items-baseline justify-between gap-3 text-[11px]"
          >
            <span className="flex min-w-0 items-center gap-2 text-ink-400">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{
                  background: usable
                    ? datum.color
                    : `color-mix(in oklab, ${datum.color} 22%, #05040e)`,
                  boxShadow: usable
                    ? `0 0 8px color-mix(in oklab, ${datum.color} 70%, transparent)`
                    : 'none',
                }}
              />
              <span className="truncate">{datum.label}</span>
            </span>

            {usable ? (
              <span className="numeral shrink-0 text-ink-100">
                {text}
                {datum.unit && <span className="text-ink-600"> {datum.unit}</span>}
                <span className={ratio > 1 ? 'text-signal-amber' : 'text-ink-600'}>
                  {' '}
                  · {Math.round(ratio * 100)}%
                </span>
              </span>
            ) : (
              <span className="shrink-0 text-right text-signal-amber/85">{reason}</span>
            )}
          </li>
        ))}
      </ul>

      {caption && (
        <figcaption className="text-center text-[11px] leading-snug text-ink-600">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/* ---------------------------------------------------------------- RingStat */

export type RingStatTone = 'accent' | 'cyan' | 'violet' | 'amber' | 'green' | 'pink';

export interface RingStatProps {
  label: string;
  /** Null renders an explicit unavailable state, never a substitute figure. */
  value: number | string | null;
  unit?: string;
  tone?: RingStatTone;
  /** Caption under the number; when the value is missing, say why here. */
  sub?: string;
}

const TONE: Record<RingStatTone, string> = {
  accent: 'var(--accent)',
  cyan: 'var(--color-signal-cyan-hot)',
  violet: 'var(--color-signal-violet-hot)',
  amber: 'var(--color-signal-amber-hot)',
  green: 'var(--color-signal-green-hot)',
  pink: 'var(--color-signal-pink)',
};

/**
 * A watch-face complication: one number, one caption, on an elevated chip.
 *
 * `surface`, not `glass`, despite the tile reading as glass in the mock — the
 * content layer in globals.css is opaque by rule, since a readout is content
 * rather than chrome and a blurred card behind digits is what makes this
 * language collapse into frosted plastic.
 */
export function RingStat({ label, value, unit, tone = 'accent', sub }: RingStatProps) {
  const color = TONE[tone];
  const missing = value === null || (typeof value === 'number' && !Number.isFinite(value));
  const display = typeof value === 'number' ? defaultFormat(value) : value;
  const note = sub ?? (missing ? 'no value reported' : undefined);

  return (
    <div className="glass-panel grain rounded-2xl px-3.5 py-3">
      <span className="eyebrow block" style={{ color: `color-mix(in oklab, ${color} 72%, #ffffff)` }}>
        {label}
      </span>

      <div className="mt-1.5 flex items-baseline gap-1">
        {missing ? (
          <span className="numeral text-xl leading-none font-semibold text-ink-600">n/a</span>
        ) : (
          <span
            className="numeral text-2xl leading-none font-semibold"
            style={{
              color,
              textShadow: `0 0 18px color-mix(in oklab, ${color} 45%, transparent)`,
            }}
          >
            {display}
          </span>
        )}
        {unit && !missing && <span className="text-[11px] text-ink-600">{unit}</span>}
      </div>

      {note && (
        <p
          className={`mt-1.5 text-[11px] leading-snug ${
            missing ? 'text-signal-amber/85' : 'text-ink-600'
          }`}
        >
          {note}
        </p>
      )}
    </div>
  );
}
