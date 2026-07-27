"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export default function HeroTunnel() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  return (
    <section ref={sectionRef} className="relative w-full flex items-center justify-center bg-transparent">
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center text-center px-4">
        <span className="eyebrow text-signal-cyan/90 mb-4">SDG 12: RESPONSIBLE CONSUMPTION</span>
        <h1 className="font-display text-[12vw] md:text-[7.5vw] font-extrabold uppercase leading-[0.85] tracking-tight text-ink-100 whitespace-nowrap">
          <span className="block">Lifespan</span>
          <span className="block bg-gradient-to-r from-signal-cyan to-signal-violet bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(124,92,255,0.4)]">
            Matrix
          </span>
        </h1>
        <p className="mt-6 max-w-xl font-body text-sm md:text-base leading-relaxed text-ink-400">
          Survival analysis on budget peripherals — modeling time-to-failure across earbuds, mice, and
          cables to quantify what &ldquo;disposable&rdquo; actually costs.
        </p>
        <span className="eyebrow mt-10 text-cyan-400 animate-pulse">SCROLL TO ROTATE CYLINDER ↓</span>
      </div>
    </section>
  );
}
