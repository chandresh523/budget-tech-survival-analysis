"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export default function HeroTunnel() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // "unhinge": the whole card rotates back on X as if hinged at the top,
  // then scale collapses and z-blur increases — reads as being sucked
  // down a 3D tunnel rather than a plain fade/scale.
  const rotateX = useTransform(scrollYProgress, [0, 1], [0, 62]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.35]);
  const translateZ = useTransform(scrollYProgress, [0, 1], [0, -900]);
  const blur = useTransform(scrollYProgress, [0, 0.6, 1], [0, 4, 16]);
  const opacity = useTransform(scrollYProgress, [0, 0.75, 1], [1, 1, 0]);
  const filter = useTransform(blur, (b) => `blur(${b}px)`);

  // tunnel ring set — expands outward and fades as you scroll, reinforcing depth
  const ringScale = useTransform(scrollYProgress, [0, 1], [1, 2.6]);
  const ringOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.5, 0.25, 0]);

  return (
    <section ref={sectionRef} className="relative h-[220vh] bg-void bg-void-radial">
      <div className="perspective-container sticky top-0 flex h-screen items-center justify-center overflow-hidden px-6">
        {/* tunnel rings */}
        <motion.div
          style={{ scale: ringScale, opacity: ringOpacity }}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute rounded-full border border-signal-cyan/20"
              style={{ width: 260 + i * 180, height: 260 + i * 180 }}
            />
          ))}
        </motion.div>

        <motion.div
          style={{
            rotateX,
            scale,
            z: translateZ,
            opacity,
            filter,
            transformStyle: "preserve-3d",
            transformOrigin: "top center",
          }}
          className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center"
        >
          <span className="eyebrow text-signal-cyan/90">SDG 12: RESPONSIBLE CONSUMPTION</span>
          <h1 className="mt-6 font-display text-[16vw] font-extrabold uppercase leading-[0.85] tracking-tight text-ink-100 md:text-[8.5vw]">
            <span className="block">Lifespan</span>
            <span className="block bg-gradient-to-r from-signal-cyan to-signal-violet bg-clip-text text-transparent">
              Matrix
            </span>
          </h1>
          <p className="mt-8 max-w-lg font-body text-sm leading-relaxed text-ink-400 md:text-base">
            Survival analysis on budget peripherals — modeling time-to-failure across earbuds, mice, and
            cables to quantify what &ldquo;disposable&rdquo; actually costs.
          </p>
          <span className="eyebrow mt-14">SCROLL TO ENTER THE DATASET ↓</span>
        </motion.div>
      </div>
    </section>
  );
}
