"use client";

/**
 * One device readout module, styled as a plug-in instrument card: brushed
 * housing, silkscreened ident, backlit LCD digits and a status lamp.
 *
 * Handles the unavailable case explicitly — a device whose model did not fit
 * shows unlit segments and the reason, never a substituted number.
 */

import { motion } from "framer-motion";
import type { FitState } from "@/lib/supabase-browser";
import { Lamp, type LampTone } from "@/components/panel";

export type TelemetryStatProps = {
  /** Structural ident silkscreened on the housing. */
  id: string;
  label: string;
  /** Null renders unlit segments rather than a placeholder value. */
  value: number | string | null;
  unit?: string;
  /** Secondary count, e.g. observed failures. */
  delta?: number;
  deltaLabel?: string;
  status?: "nominal" | "watch" | "critical" | "unavailable";
  fitState?: FitState;
  fitNote?: string | null;
  selected?: boolean;
  onSelect?: () => void;
  index?: number;
};

const STATUS: Record<
  NonNullable<TelemetryStatProps["status"]>,
  { tone: LampTone; text: string; glow: string }
> = {
  nominal: { tone: "emerald", text: "text-lamp-emerald-hot", glow: "rgba(34,208,122,0.5)" },
  watch: { tone: "amber", text: "text-lamp-amber-hot", glow: "rgba(255,176,32,0.5)" },
  critical: { tone: "red", text: "text-lamp-red-hot", glow: "rgba(255,82,69,0.5)" },
  unavailable: { tone: "neutral", text: "text-chassis-300", glow: "transparent" },
};

export default function TelemetryStat({
  id,
  label,
  value,
  unit,
  delta,
  deltaLabel = "events",
  status = "nominal",
  fitNote,
  selected = false,
  onSelect,
  index = 0,
}: TelemetryStatProps) {
  const s = STATUS[status];
  const unavailable = value === null || status === "unavailable";

  const Wrapper = onSelect ? motion.button : motion.div;

  return (
    <Wrapper
      {...(onSelect ? { type: "button" as const, onClick: onSelect } : {})}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8%" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.32), ease: [0.22, 1, 0.36, 1] }}
      title={fitNote ?? undefined}
      aria-pressed={onSelect ? selected : undefined}
      className={`metal-plate grain relative w-full rounded-xl p-[3px] text-left transition-transform duration-300 ${
        onSelect ? "cursor-pointer hover:-translate-y-0.5" : ""
      } ${selected ? "ring-2 ring-brass-hot/70" : ""}`}
    >
      <div className="rounded-[10px] px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="silkscreen truncate">{id}</span>
          <Lamp tone={s.tone} size={6} pulse={status === "critical"} title={status} />
        </div>

        {/* Recessed LCD window — flat background keeps digits legible. */}
        <div className="lcd glass-glint rounded-md px-2.5 py-2">
          <div className="flex items-baseline gap-1">
            {unavailable ? (
              <span className="numeral text-xl font-semibold leading-none text-chassis-300">
                — —
              </span>
            ) : (
              <span
                className={`numeral text-xl font-semibold leading-none ${s.text}`}
                style={{ textShadow: `0 0 14px ${s.glow}` }}
              >
                {typeof value === "number" ? value.toFixed(3) : value}
              </span>
            )}
            {unit && !unavailable && <span className="silkscreen pb-0.5">{unit}</span>}
            {unavailable && <span className="silkscreen pb-0.5 text-lamp-amber/80">n/a</span>}
          </div>
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="truncate text-[10px] uppercase tracking-wider text-etch-dim">
            {label}
          </span>
          {delta !== undefined && (
            <span className="numeral shrink-0 text-[10px] text-etch-faint">
              {delta} <span className="silkscreen">{deltaLabel}</span>
            </span>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
