"use client";

import { motion } from "framer-motion";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type KMPoint = {
  month: number;
  twsEarbuds: number;
  wirelessMice: number;
  cables: number;
};

export type KMCurveChartProps = {
  data: KMPoint[];
};

const seriesMeta = [
  { key: "twsEarbuds", label: "TWS Earbuds", color: "#00C2D1" },
  { key: "wirelessMice", label: "Wireless Mice", color: "#7C5CFF" },
  { key: "cables", label: "Cables", color: "#FFB020" },
] as const;

export default function KMCurveChart({ data }: KMCurveChartProps) {
  return (
    <section className="relative bg-void px-6 py-28 md:px-14">
      <div className="mb-12 border-b border-white/[0.06] pb-8">
        <span className="eyebrow">BASELINE CURVES</span>
        <h2 className="mt-3 font-display text-4xl font-extrabold uppercase leading-none text-ink-100 md:text-6xl">
          Kaplan-Meier estimate
        </h2>
        <p className="mt-4 max-w-lg font-body text-sm text-ink-400">
          Probability of survival past a given month, stepped down at each observed failure event.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="glass-cyan rounded-2xl p-4 md:p-8"
      >
        <div
          className="h-[420px] w-full"
          style={{ filter: "drop-shadow(0 0 14px rgba(0,194,209,0.28))" }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="#8A8896"
                tick={{ fontFamily: "var(--font-numeric)", fontSize: 11 }}
                label={{
                  value: "Months (0–36)",
                  position: "insideBottom",
                  offset: -6,
                  fill: "#8A8896",
                  fontSize: 11,
                }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 1]}
                reversed
                stroke="#8A8896"
                tick={{ fontFamily: "var(--font-numeric)", fontSize: 11 }}
                label={{
                  value: "Probability (1.0–0.0)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#8A8896",
                  fontSize: 11,
                }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#0a0814",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontFamily: "var(--font-numeric)",
                  fontSize: 12,
                }}
                labelFormatter={(m) => `Month ${m}`}
              />
              <Legend
                wrapperStyle={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  color: "#B8B6C4",
                  paddingTop: 16,
                }}
              />
              {seriesMeta.map((s) => (
                <Line
                  key={s.key}
                  type="stepAfter"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </section>
  );
}
