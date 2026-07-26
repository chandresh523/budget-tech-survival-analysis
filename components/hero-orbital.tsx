"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export type HeroOrbitalProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  liveLabel?: string;
  catalogId?: string;
};

/**
 * Hero — accepts overrides via props so copy/data can be piped in later.
 * The orbit-ring HUD behind the headline is driven entirely by scroll
 * progress (useTransform), not a CSS loop — rings de-sync and the marker
 * advances along its path as the page scrolls past the hero.
 */
export default function HeroOrbital({
  eyebrow = "MERIDIAN // CONSTELLATION INTELLIGENCE",
  title = "Every orbit,\naccounted for.",
  subtitle = "Live telemetry, coverage modeling, and collision-risk scoring for a 214-satellite low-earth constellation.",
  liveLabel = "LIVE TELEMETRY FEED",
  catalogId = "NORAD 44714",
}: HeroOrbitalProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // rings rotate at different rates — parallax through rotation, not just Y
  const ringOuterRotate = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const ringMidRotate = useTransform(scrollYProgress, [0, 1], [0, -95]);
  const ringInnerRotate = useTransform(scrollYProgress, [0, 1], [0, 210]);

  const hudScale = useTransform(scrollYProgress, [0, 1], [1, 1.35]);
  const hudOpacity = useTransform(scrollYProgress, [0, 0.8, 1], [1, 0.4, 0]);
  const headlineY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const subtitleOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  // satellite marker travels along the mid ring as you scroll
  const markerAngle = useTransform(scrollYProgress, [0, 1], [0, 300]);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[130vh] overflow-hidden bg-void bg-void-radial"
    >
      <div className="sticky top-0 flex min-h-screen flex-col justify-between px-6 pt-28 pb-14 md:px-14">
        {/* orbit HUD, pinned behind headline */}
        <motion.div
          style={{ scale: hudScale, opacity: hudOpacity }}
          className="pointer-events-none absolute left-1/2 top-1/2 -z-0 -translate-x-1/2 -translate-y-1/2"
        >
          <svg width="720" height="720" viewBox="0 0 720 720" className="opacity-70">
            <motion.circle
              cx="360"
              cy="360"
              r="330"
              fill="none"
              stroke="rgba(124,92,255,0.18)"
              strokeWidth="1"
              strokeDasharray="2 10"
              style={{ rotate: ringOuterRotate, transformOrigin: "360px 360px" }}
            />
            <motion.circle
              cx="360"
              cy="360"
              r="250"
              fill="none"
              stroke="rgba(0,194,209,0.22)"
              strokeWidth="1"
              style={{ rotate: ringMidRotate, transformOrigin: "360px 360px" }}
            />
            <motion.circle
              cx="360"
              cy="360"
              r="170"
              fill="none"
              stroke="rgba(124,92,255,0.14)"
              strokeWidth="1"
              strokeDasharray="1 6"
              style={{ rotate: ringInnerRotate, transformOrigin: "360px 360px" }}
            />
            {/* satellite marker traveling the mid ring */}
            <motion.g style={{ rotate: markerAngle, transformOrigin: "360px 360px" }}>
              <circle cx="360" cy="110" r="4" fill="#00C2D1" />
              <circle cx="360" cy="110" r="9" fill="none" stroke="#00C2D1" strokeWidth="1" opacity="0.5" />
            </motion.g>
          </svg>
        </motion.div>

        {/* top bar */}
        <div className="relative z-10 flex items-center justify-between">
          <span className="eyebrow">{eyebrow}</span>
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-cyan opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal-cyan" />
            </span>
            <span className="eyebrow text-signal-cyan/90">{liveLabel}</span>
          </div>
        </div>

        {/* headline */}
        <motion.div style={{ y: headlineY }} className="relative z-10">
          <h1 className="font-display text-[15vw] font-extrabold uppercase leading-[0.82] tracking-tight text-ink-100 md:text-[9.5vw]">
            {title.split("\n").map((line, i) => (
              <span key={i} className="block">
                {i === 1 ? (
                  <span className="bg-gradient-to-r from-signal-violet to-signal-cyan bg-clip-text text-transparent">
                    {line}
                  </span>
                ) : (
                  line
                )}
              </span>
            ))}
          </h1>
          <motion.p
            style={{ opacity: subtitleOpacity }}
            className="mt-8 max-w-md font-body text-sm leading-relaxed text-ink-400 md:text-base"
          >
            {subtitle}
          </motion.p>
        </motion.div>

        {/* bottom readout strip */}
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-6 border-t border-white/[0.06] pt-5">
          <span className="eyebrow">{catalogId}</span>
          <span className="eyebrow">SCROLL TO EXPAND TELEMETRY ↓</span>
        </div>
      </div>
    </section>
  );
}
