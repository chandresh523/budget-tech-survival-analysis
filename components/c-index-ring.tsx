"use client";

/**
 * Concordance index as an analogue panel meter.
 *
 * Skeuomorphic details that make it read as a real gauge: a recessed bezel with
 * a machined ring, engraved tick marks, a swept coloured arc, a needle with a
 * counterweight, a domed glass cover with a specular streak, and a digital
 * repeater below the dial.
 *
 * The scale starts at 0.5, not 0 — a concordance index of 0.5 is chance, so the
 * usable range for a survival model is 0.5-1.0 and a 0-1 scale would waste half
 * the dial and overstate every result.
 */

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useArrived } from "@/components/city/arrival-context";

export type CIndexRingProps = {
  /** 0-1, though only 0.5-1.0 is meaningful. */
  score: number;
  label: string;
  accent: "cyan" | "violet";
  delay?: number;
};

/* Brighter than the panel palette on purpose: these are emitted light on a dark
   dial face, not ink on metal. */
const ACCENT = {
  cyan: { stroke: "#2ad6f5", hot: "#8df0ff", glow: "rgba(42,214,245,0.7)" },
  violet: { stroke: "#9b7dff", hot: "#c8b4ff", glow: "rgba(155,125,255,0.7)" },
} as const;

const SIZE = 176;
const CENTER = SIZE / 2;
const RADIUS = 66;
// A 260-degree sweep leaves a gap at the bottom for the label, as on real meters.
const SWEEP = 260;
const START_ANGLE = -130;

/** Map a score in [0.5, 1] to its angle on the dial. */
function angleFor(score: number): number {
  const clamped = Math.min(1, Math.max(0.5, score));
  return START_ANGLE + ((clamped - 0.5) / 0.5) * SWEEP;
}

function polar(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

function arcPath(fromDeg: number, toDeg: number, r: number): string {
  const a = polar(fromDeg, r);
  const b = polar(toDeg, r);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export default function CIndexRing({ score, label, accent, delay = 0 }: CIndexRingProps) {
  const ref = useRef<HTMLDivElement>(null);
  // `once: false` — the needle should sweep every time you fly back in, not
  // once per page load.
  const inView = useInView(ref, { margin: "-12% 0px" });
  const arrived = useArrived();
  // Both must hold: in the viewport AND in the district being viewed.
  const play = inView && arrived;
  const tone = ACCENT[accent];

  const targetAngle = angleFor(score);
  const trackPath = arcPath(START_ANGLE, START_ANGLE + SWEEP, RADIUS);
  const valuePath = arcPath(START_ANGLE, targetAngle, RADIUS);

  // Ticks every 0.05, majors every 0.1.
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const value = 0.5 + i * 0.05;
    return { value, angle: angleFor(value), major: i % 2 === 0 };
  });

  return (
    <div ref={ref} className="flex flex-col items-center gap-3">
      <div
        className="metal-plate grain relative flex items-center justify-center rounded-full p-3"
        style={{ width: SIZE + 24, height: SIZE + 24 }}
      >
        {/* Recessed dial face inside the machined ring */}
        <div
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: SIZE,
            height: SIZE,
            // Dark dial in a light bezel, as on a real panel meter: the bright
            // arc, needle and digits need something to read against.
            background:
              'radial-gradient(120% 120% at 50% 8%, #3c4148 0%, #262a30 42%, #191c21 72%, #101317 100%)',
            boxShadow:
              '0 6px 14px rgba(30,24,16,0.55) inset, 0 20px 36px rgba(30,24,16,0.3) inset,' +
              '0 1px 0 rgba(255,255,255,0.9), 0 -1px 0 rgba(120,105,78,0.35)',
          }}
        >
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="absolute inset-0"
          >
            {/* Engraved track groove */}
            <path
              d={trackPath}
              fill="none"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d={trackPath}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
              strokeLinecap="round"
            />

            {/* Ticks */}
            {ticks.map((t) => {
              const outer = polar(t.angle, RADIUS - 8);
              const inner = polar(t.angle, RADIUS - (t.major ? 17 : 12));
              return (
                <line
                  key={t.value}
                  x1={outer.x}
                  y1={outer.y}
                  x2={inner.x}
                  y2={inner.y}
                  stroke={t.major ? "rgba(240,238,230,0.85)" : "rgba(200,196,184,0.45)"}
                  strokeWidth={t.major ? 1.6 : 1}
                />
              );
            })}

            {/* Engraved endpoint numerals */}
            <text
              x={polar(START_ANGLE, RADIUS - 30).x}
              y={polar(START_ANGLE, RADIUS - 30).y}
              fill="#9a9488"
              fontSize="9"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              .50
            </text>
            <text
              x={polar(START_ANGLE + SWEEP, RADIUS - 30).x}
              y={polar(START_ANGLE + SWEEP, RADIUS - 30).y}
              fill="#9a9488"
              fontSize="9"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              1.0
            </text>

            {/* Swept value arc */}
            <motion.path
              d={valuePath}
              fill="none"
              stroke={tone.stroke}
              strokeWidth="6"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${tone.glow})` }}
              initial={{ pathLength: 0 }}
              animate={play ? { pathLength: 1 } : { pathLength: 0 }}
              transition={{ duration: 1.3, delay, ease: [0.16, 1, 0.3, 1] }}
            />

            {/* Needle, pivoting from the hub with a short counterweight */}
            <motion.g
              initial={{ rotate: START_ANGLE }}
              animate={play ? { rotate: targetAngle } : { rotate: START_ANGLE }}
              transition={{ duration: 1.4, delay: delay + 0.1, ease: [0.16, 1, 0.3, 1] }}
              style={{ originX: `${CENTER}px`, originY: `${CENTER}px` }}
            >
              <line
                x1={CENTER}
                y1={CENTER + 12}
                x2={CENTER}
                y2={CENTER - RADIUS + 14}
                stroke={tone.hot}
                strokeWidth="2.2"
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 4px ${tone.glow})` }}
              />
              <line
                x1={CENTER}
                y1={CENTER + 12}
                x2={CENTER}
                y2={CENTER + 20}
                stroke="#6b7381"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
            </motion.g>

            {/* Machined hub cap */}
            <circle cx={CENTER} cy={CENTER} r="9" fill="#15181c" />
            <circle cx={CENTER} cy={CENTER} r="9" fill="url(#hub)" />
            <defs>
              <radialGradient id="hub" cx="36%" cy="30%">
                <stop offset="0%" stopColor="#9aa2ae" />
                <stop offset="45%" stopColor="#4d545e" />
                <stop offset="100%" stopColor="#1b1f25" />
              </radialGradient>
            </defs>
          </svg>

          {/* Digital repeater */}
          <div className="absolute bottom-7 flex flex-col items-center">
            <span
              className="numeral text-2xl font-semibold leading-none"
              style={{ color: tone.hot, textShadow: `0 0 14px ${tone.glow}` }}
            >
              {score.toFixed(3)}
            </span>
            <span className="silkscreen mt-1">c-index</span>
          </div>

          {/* Cover glass. Must be `glass-clear`, not `glass-cover` — the latter
              carries a backdrop blur that smears the digits and needle beneath it. */}
          <span
            aria-hidden
            className="glass-clear glass-glint pointer-events-none absolute inset-0 rounded-full"
          />
        </div>
      </div>
      <span className="silkscreen text-etch-dim!">{label}</span>
    </div>
  );
}
