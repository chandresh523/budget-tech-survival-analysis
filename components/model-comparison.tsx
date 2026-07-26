"use client";

import { motion } from "framer-motion";
import CIndexRing from "@/components/ui/c-index-ring";

export default function ModelComparison() {
  return (
    <section className="relative bg-void px-6 py-28 md:px-14">
      <div className="mb-16 border-b border-white/[0.06] pb-8">
        <span className="eyebrow">MODEL EVALUATION</span>
        <h2 className="mt-3 font-display text-4xl font-extrabold uppercase leading-none text-ink-100 md:text-6xl">
          Traditional vs. ML
        </h2>
      </div>

      <div className="grid grid-cols-1 divide-y divide-white/[0.06] md:grid-cols-2 md:divide-x md:divide-y-0">
        {/* Cox — left */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-8 py-10 md:pr-12"
        >
          <div className="text-center">
            <span className="eyebrow">TRADITIONAL</span>
            <h3 className="mt-3 font-display text-2xl font-extrabold uppercase text-ink-100 md:text-3xl">
              Cox Proportional Hazards
            </h3>
            <p className="mx-auto mt-3 max-w-xs font-body text-sm text-ink-400">
              Semi-parametric baseline — assumes hazard ratios stay constant over time.
            </p>
          </div>
          <CIndexRing score={0.72} label="Cox Proportional Hazards" accent="cyan" delay={0.1} />
        </motion.div>

        {/* RSF — right */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-8 py-10 md:pl-12"
        >
          <div className="text-center">
            <span className="eyebrow text-signal-violet/90">MACHINE LEARNING</span>
            <h3 className="mt-3 font-display text-2xl font-extrabold uppercase text-ink-100 md:text-3xl">
              Random Survival Forest
            </h3>
            <p className="mx-auto mt-3 max-w-xs font-body text-sm text-ink-400">
              Ensemble of survival trees — captures non-linear interactions Cox misses.
            </p>
          </div>
          <CIndexRing score={0.84} label="Random Survival Forest (RSF)" accent="violet" delay={0.25} />
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-14 text-center font-body text-sm text-ink-400"
      >
        RSF improves concordance by{" "}
        <span className="numeral text-signal-violet">+0.12</span> over the Cox baseline.
      </motion.p>
    </section>
  );
}
