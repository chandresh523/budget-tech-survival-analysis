"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export type CIndexRingProps = {
  score: number; // 0-1
  label: string;
  accent: "cyan" | "violet";
  delay?: number;
};

export default function CIndexRing({ score, label, accent, delay = 0 }: CIndexRingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-15% 0px" });

  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const strokeColor = accent === "cyan" ? "#00C2D1" : "#7C5CFF";
  const glassClass = accent === "cyan" ? "glass-cyan" : "glass-violet";

  return (
    <div ref={ref} className="flex flex-col items-center gap-6">
      <div className={`${glassClass} relative flex h-44 w-44 items-center justify-center rounded-full`}>
        <svg width="176" height="176" viewBox="0 0 176 176" className="-rotate-90">
          <circle cx="88" cy="88" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <motion.circle
            cx="88"
            cy="88"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={isInView ? { strokeDashoffset: circumference * (1 - score) } : {}}
            transition={{ duration: 1.4, delay, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="numeral text-3xl font-medium text-ink-100">{score.toFixed(2)}</span>
          <span className="eyebrow mt-1">C-INDEX</span>
        </div>
      </div>
      <span className="font-body text-sm text-ink-400">{label}</span>
    </div>
  );
}
