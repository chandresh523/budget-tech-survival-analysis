"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export type OrbitScrollSectionProps = {
  eyebrow?: string;
  lines?: { label: string; value: string }[];
};

/**
 * A tall (300vh) pinned section. Three orbit-line layers move at different
 * scroll-linked speeds (parallax), and a central coverage readout scales +
 * fades in/out as it's scrubbed through. Layer speed is derived from
 * useTransform against scrollYProgress — no fixed-duration animation.
 */
export default function OrbitScrollSection({
  eyebrow = "COVERAGE MODEL",
  lines = [
    { label: "GROUND STATIONS LINKED", value: "38 / 41" },
    { label: "MEAN REVISIT TIME", value: "11.4 MIN" },
    { label: "ORBITAL DEBRIS FLAGS", value: "3 ACTIVE" },
  ],
}: OrbitScrollSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const layerFarX = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);
  const layerMidX = useTransform(scrollYProgress, [0, 1], ["6%", "-10%"]);
  const layerNearX = useTransform(scrollYProgress, [0, 1], ["-4%", "14%"]);

  const readoutScale = useTransform(scrollYProgress, [0.15, 0.5, 0.85], [0.85, 1, 0.85]);
  const readoutOpacity = useTransform(scrollYProgress, [0.1, 0.35, 0.65, 0.9], [0, 1, 1, 0]);

  return (
    <section ref={ref} className="relative h-[300vh] bg-void">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {/* parallax orbit-line layers */}
        <motion.div style={{ x: layerFarX }} className="absolute inset-0 opacity-20">
          <div className="absolute left-1/2 top-1/4 h-px w-[140%] -translate-x-1/2 bg-gradient-to-r from-transparent via-signal-violet to-transparent" />
        </motion.div>
        <motion.div style={{ x: layerMidX }} className="absolute inset-0 opacity-30">
          <div className="absolute left-1/2 top-1/2 h-px w-[160%] -translate-x-1/2 bg-gradient-to-r from-transparent via-signal-cyan to-transparent" />
        </motion.div>
        <motion.div style={{ x: layerNearX }} className="absolute inset-0 opacity-40">
          <div className="absolute left-1/2 top-3/4 h-px w-[130%] -translate-x-1/2 bg-gradient-to-r from-transparent via-signal-violet to-transparent" />
        </motion.div>

        {/* central readout */}
        <motion.div
          style={{ scale: readoutScale, opacity: readoutOpacity }}
          className="glass-cyan relative z-10 mx-6 w-full max-w-xl rounded-3xl p-10 text-center"
        >
          <span className="eyebrow">{eyebrow}</span>
          <div className="mt-8 flex flex-col divide-y divide-white/[0.06]">
            {lines.map((line) => (
              <div key={line.label} className="flex items-center justify-between py-4">
                <span className="text-left text-sm text-ink-400">{line.label}</span>
                <span className="numeral text-2xl text-ink-100">{line.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
