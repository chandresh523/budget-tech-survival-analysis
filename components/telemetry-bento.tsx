"use client";

import { motion } from "framer-motion";
import { useCountUp } from "@/hooks/use-count-up";

export type TelemetryBentoProps = {
  tracked?: number;
  confirmedFail?: number;
  censorPoints?: number;
};

function BentoStat({
  id,
  label,
  value,
  suffix,
  accent,
  className,
  delay,
}: {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  accent: "cyan" | "violet";
  className?: string;
  delay: number;
}) {
  const { ref, value: display } = useCountUp(value, { duration: 1.6 });
  const glassClass = accent === "cyan" ? "glass-cyan" : "glass-violet";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`${glassClass} flex flex-col justify-between rounded-2xl p-6 ${className ?? ""}`}
    >
      <span className="eyebrow">{id}</span>
      <div>
        <p className="mb-2 font-body text-sm text-ink-400">{label}</p>
        <span ref={ref} className="numeral text-5xl font-medium text-ink-100 md:text-6xl">
          {display.toLocaleString()}
          {suffix}
        </span>
      </div>
    </motion.div>
  );
}

export default function TelemetryBento({
  tracked = 48213,
  confirmedFail = 9842,
  censorPoints = 12109,
}: TelemetryBentoProps) {
  return (
    <section className="relative bg-void px-6 py-28 md:px-14">
      <div className="mb-12 border-b border-white/[0.06] pb-8">
        <span className="eyebrow">TELEMETRY INGESTION NODE</span>
        <h2 className="mt-3 font-display text-4xl font-extrabold uppercase leading-none text-ink-100 md:text-6xl">
          Dataset intake
        </h2>
      </div>

      {/* asymmetric bento: large tracked panel, two stacked panels beside it */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5 md:grid-rows-2">
        <BentoStat
          id="STREAM-01"
          label="Units tracked across the panel"
          value={tracked}
          accent="cyan"
          className="md:col-span-3 md:row-span-2"
          delay={0}
        />
        <BentoStat
          id="STREAM-02"
          label="Confirmed failure events"
          value={confirmedFail}
          accent="violet"
          className="md:col-span-2"
          delay={0.1}
        />
        <BentoStat
          id="STREAM-03"
          label="Censored — still active or exited early"
          value={censorPoints}
          accent="cyan"
          className="md:col-span-2"
          delay={0.2}
        />
      </div>
    </section>
  );
}
