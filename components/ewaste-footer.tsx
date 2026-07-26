"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

const UNIT_WEIGHT_KG = 0.045; // mock avg weight per peripheral unit (earbuds/mice/cables blend)
const BASELINE_LIFESPAN_MONTHS = 14; // current observed median across the panel
const FAILED_UNITS = 9842; // mirrors "Confirmed Fail" from the telemetry node

function calcKgSaved(lifespanMonths: number) {
  const extensionRatio = Math.max(0, (lifespanMonths - BASELINE_LIFESPAN_MONTHS) / BASELINE_LIFESPAN_MONTHS);
  return FAILED_UNITS * UNIT_WEIGHT_KG * extensionRatio;
}

export default function EwasteFooter() {
  const [lifespanMonths, setLifespanMonths] = useState(BASELINE_LIFESPAN_MONTHS);
  const kgSaved = useMemo(() => calcKgSaved(lifespanMonths), [lifespanMonths]);

  return (
    <motion.footer
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full overflow-hidden bg-void bg-risk-radial px-6 py-28 md:px-14"
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="eyebrow" style={{ color: "#FF8A3D" }}>
          E-WASTE CALCULUS
        </span>
        <h2 className="mt-4 font-display text-4xl font-extrabold uppercase leading-none text-ink-100 md:text-6xl">
          What extending lifespan buys back
        </h2>

        <div className="glass-risk mt-14 w-full rounded-3xl p-10">
          <span className="eyebrow">ESTIMATED KG SAVED</span>
          <div className="mt-3 flex items-baseline justify-center gap-2">
            <motion.span
              key={kgSaved.toFixed(0)}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="numeral bg-gradient-to-r from-[#FF3D3D] to-[#FFB020] bg-clip-text text-6xl font-medium text-transparent md:text-7xl"
            >
              {kgSaved.toFixed(1)}
            </motion.span>
            <span className="numeral text-lg text-ink-400">kg / year</span>
          </div>
          <p className="mx-auto mt-4 max-w-sm font-body text-sm text-ink-400">
            Projected e-waste avoided if the {FAILED_UNITS.toLocaleString()} confirmed failures in this
            panel had instead lasted this long.
          </p>

          <div className="mt-10 flex flex-col gap-3 text-left">
            <div className="flex items-center justify-between">
              <label htmlFor="lifespan-slider" className="eyebrow">
                AVERAGE HARDWARE LIFESPAN
              </label>
              <span className="numeral text-sm text-ink-100">{lifespanMonths} mo</span>
            </div>
            <input
              id="lifespan-slider"
              type="range"
              min={6}
              max={48}
              step={1}
              value={lifespanMonths}
              onChange={(e) => setLifespanMonths(Number(e.target.value))}
              className="w-full"
              aria-label="Average hardware lifespan in months"
            />
            <div className="flex justify-between font-numeric text-[10px] text-ink-600">
              <span>6 MO</span>
              <span>BASELINE · {BASELINE_LIFESPAN_MONTHS} MO</span>
              <span>48 MO</span>
            </div>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
