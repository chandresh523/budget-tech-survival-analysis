"use client";

import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

export type TelemetryPoint = { t: string | number; v: number };

export type TelemetryStatProps = {
  id: string; // e.g. catalog / NORAD id — doubles as the card's structural label
  label: string;
  value: number | string;
  unit?: string;
  delta?: number; // signed, e.g. +2.4 or -0.8
  status?: "nominal" | "watch" | "critical";
  series?: TelemetryPoint[]; // sparkline data — pipe in real telemetry here
  accent?: "violet" | "cyan";
  index?: number; // used only for stagger timing, not displayed
};

const statusColor: Record<NonNullable<TelemetryStatProps["status"]>, string> = {
  nominal: "text-signal-cyan",
  watch: "text-signal-amber",
  critical: "text-red-400",
};

const statusDot: Record<NonNullable<TelemetryStatProps["status"]>, string> = {
  nominal: "bg-signal-cyan",
  watch: "bg-signal-amber",
  critical: "bg-red-400",
};

export default function TelemetryStat({
  id,
  label,
  value,
  unit,
  delta,
  status = "nominal",
  series,
  accent = "violet",
  index = 0,
}: TelemetryStatProps) {
  const glassClass = accent === "violet" ? "glass-violet" : "glass-cyan";
  const strokeColor = accent === "violet" ? "#7C5CFF" : "#00C2D1";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className={`${glassClass} flex flex-col justify-between rounded-2xl p-5`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="eyebrow">{id}</span>
          <p className="mt-1 text-sm text-ink-400">{label}</p>
        </div>
        <span className={`h-1.5 w-1.5 rounded-full ${statusDot[status]} mt-1`} />
      </div>

      <div className="mt-6 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1">
          <span className="numeral text-4xl font-medium text-ink-100">{value}</span>
          {unit && <span className="numeral text-sm text-ink-600">{unit}</span>}
        </div>
        {typeof delta === "number" && (
          <span className={`numeral text-xs ${delta >= 0 ? statusColor[status] : "text-red-400"}`}>
            {delta >= 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>

      {series && series.length > 1 && (
        <div className="mt-4 h-12 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Area
                type="monotone"
                dataKey="v"
                stroke={strokeColor}
                strokeWidth={1.5}
                fill={`url(#spark-${id})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
