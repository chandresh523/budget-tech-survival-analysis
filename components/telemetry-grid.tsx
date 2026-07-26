"use client";

import TelemetryStat, { TelemetryStatProps } from "./telemetry-stat";

export type TelemetryGridProps = {
  eyebrow?: string;
  title?: string;
  data: Omit<TelemetryStatProps, "index">[]; // <- pipe your JSON array straight in here
};

export default function TelemetryGrid({
  eyebrow = "SYSTEM STATUS",
  title = "Constellation telemetry",
  data,
}: TelemetryGridProps) {
  return (
    <section className="relative bg-void px-6 py-28 md:px-14">
      <div className="mb-12 flex flex-col gap-3 border-b border-white/[0.06] pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="mt-3 font-display text-4xl font-extrabold uppercase leading-none text-ink-100 md:text-6xl">
            {title}
          </h2>
        </div>
        <span className="numeral text-xs text-ink-600">{data.length} ACTIVE STREAMS</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.map((item, i) => (
          <TelemetryStat key={item.id} {...item} index={i} />
        ))}
      </div>
    </section>
  );
}
