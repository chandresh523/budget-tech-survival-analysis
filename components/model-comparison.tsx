"use client";

/**
 * Cox PH vs Random Survival Forest, as a pair of analogue concordance gauges.
 *
 * Critically, this no longer invents a score when a model did not fit. Three of
 * ten devices have zero recorded failures, which makes a survival model
 * unidentifiable — previously the UI displayed 0.72/0.84 placeholders for them,
 * indistinguishable from a real result. Now `fit_state` drives an explicit
 * unavailable state naming the reason.
 */

import { motion } from "framer-motion";
import type { FitState } from "@/lib/supabase-browser";
import { Unavailable } from "@/components/panel";
import CIndexRing from "@/components/c-index-ring";

interface ModelComparisonProps {
  coxScore: number | null;
  rsfScore: number | null;
  fitState?: FitState;
  fitNote?: string | null;
  device?: string;
}

export default function ModelComparison({
  coxScore,
  rsfScore,
  fitState = "ok",
  fitNote,
  device,
}: ModelComparisonProps) {
  const bothFitted = coxScore !== null && rsfScore !== null;
  const diff = bothFitted ? Number((rsfScore - coxScore).toFixed(3)) : null;

  return (
    <div className="w-full">
      {/* When nothing fitted, lead with why rather than showing empty gauges. */}
      {fitState !== "ok" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-lamp-amber/25 bg-lamp-amber/[0.06] px-4 py-3">
          <span className="mt-0.5 shrink-0 text-sm text-ink-amber">⚠</span>
          <div>
            <p className="silkscreen mb-1 text-ink-amber">
              {fitState === "no_events" && "no observed failures"}
              {fitState === "not_converged" && "models did not converge"}
              {fitState === "partial" && "partial fit"}
              {fitState === "no_features" && "no numeric covariates"}
            </p>
            <p className="max-w-prose text-xs leading-relaxed text-etch-dim">
              {fitNote ??
                "A concordance index could not be estimated for this device."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* ---- Cox PH ---- */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-12%" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-5"
        >
          <div className="text-center">
            <span className="silkscreen">traditional statistics</span>
            <h3 className="etched mt-1.5 font-display text-lg font-extrabold uppercase leading-tight md:text-xl">
              Cox Proportional Hazards
            </h3>
            <p className="mx-auto mt-2 max-w-xs text-[11px] leading-relaxed text-etch-faint">
              Semi-parametric baseline — assumes hazard ratios stay constant
              over time.
            </p>
          </div>
          {coxScore !== null ? (
            <CIndexRing score={coxScore} label="Cox PH" accent="cyan" delay={0.05} />
          ) : (
            <Unavailable label="c-index" reason="Cox PH did not fit." />
          )}
        </motion.div>

        {/* ---- RSF ---- */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-12%" }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-5"
        >
          <div className="text-center">
            <span className="silkscreen text-lamp-violet/80">machine learning</span>
            <h3 className="etched mt-1.5 font-display text-lg font-extrabold uppercase leading-tight md:text-xl">
              Random Survival Forest
            </h3>
            <p className="mx-auto mt-2 max-w-xs text-[11px] leading-relaxed text-etch-faint">
              Ensemble of survival trees — captures non-linear interactions Cox
              cannot express.
            </p>
          </div>
          {rsfScore !== null ? (
            <CIndexRing score={rsfScore} label="RSF" accent="violet" delay={0.18} />
          ) : (
            <Unavailable label="c-index" reason="RSF did not train." />
          )}
        </motion.div>
      </div>

      {diff !== null && (
        <p className="mt-8 text-center text-xs leading-relaxed text-etch-dim">
          On {device ? <span className="text-etch">{device}</span> : "this device"},
          RSF{" "}
          {diff === 0 ? (
            <>matches the Cox baseline</>
          ) : (
            <>
              {diff > 0 ? "improves" : "trails"} concordance by{" "}
              <span className="numeral text-ink-violet">
                {diff > 0 ? `+${diff}` : diff}
              </span>
            </>
          )}
          .{" "}
          {/* An in-sample c-index of exactly 1.0 is a red flag, not a triumph. */}
          {(coxScore === 1 || rsfScore === 1) && (
            <span className="text-ink-amber">
              A c-index of 1.000 here is in-sample and almost certainly
              overfitting on very few events — do not read it as accuracy.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
