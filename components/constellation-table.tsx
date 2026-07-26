"use client";

import { motion } from "framer-motion";

export type SatelliteRow = {
  norad: string; // e.g. "44714"
  name: string;
  altitudeKm: number;
  inclinationDeg: number;
  status: "nominal" | "watch" | "critical";
};

export type ConstellationTableProps = {
  eyebrow?: string;
  title?: string;
  rows: SatelliteRow[]; // <- pipe your JSON array straight in here
};

const statusStyles: Record<SatelliteRow["status"], string> = {
  nominal: "text-signal-cyan border-signal-cyan/30 bg-signal-cyan/5",
  watch: "text-signal-amber border-signal-amber/30 bg-signal-amber/5",
  critical: "text-red-400 border-red-400/30 bg-red-400/5",
};

export default function ConstellationTable({
  eyebrow = "CATALOG",
  title = "Tracked assets",
  rows,
}: ConstellationTableProps) {
  return (
    <section className="relative bg-void px-6 py-28 md:px-14">
      <div className="mb-10">
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="mt-3 font-display text-4xl font-extrabold uppercase leading-none text-ink-100 md:text-6xl">
          {title}
        </h2>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        {/* header row */}
        <div className="hidden grid-cols-[120px_1fr_140px_140px_120px] gap-4 border-b border-white/[0.06] px-6 py-4 md:grid">
          {["NORAD ID", "ASSET", "ALTITUDE", "INCLINATION", "STATUS"].map((h) => (
            <span key={h} className="eyebrow">
              {h}
            </span>
          ))}
        </div>

        {rows.map((row, i) => (
          <motion.div
            key={row.norad}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.4, delay: i * 0.03 }}
            className="grid grid-cols-2 gap-3 border-b border-white/[0.04] px-6 py-4 last:border-0 md:grid-cols-[120px_1fr_140px_140px_120px] md:items-center md:gap-4"
          >
            <span className="numeral text-sm text-ink-600">{row.norad}</span>
            <span className="font-body text-sm text-ink-100">{row.name}</span>
            <span className="numeral text-sm text-ink-400">{row.altitudeKm} km</span>
            <span className="numeral text-sm text-ink-400">{row.inclinationDeg}°</span>
            <span
              className={`w-fit rounded-full border px-3 py-1 text-[10px] uppercase tracking-widest2 ${statusStyles[row.status]}`}
            >
              {row.status}
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
