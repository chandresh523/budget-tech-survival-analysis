"use client";

import { useRef, ReactNode } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";

interface SmoothCylinderProps {
  children: ReactNode;
  sliceCount?: number;
  panelHeight?: number;
}

export default function SmoothCylinder({
  children,
  sliceCount = 300,
  panelHeight = 4500,
}: SmoothCylinderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  // Adding spring physics to give the heavy DOM tree smooth inertia
  const smoothProgress = useSpring(scrollYProgress, { damping: 20, stiffness: 90, mass: 0.5 });
  
  // Rotating positively to pull the bottom slices UP as we scroll down
  const rotateX = useTransform(smoothProgress, [0, 1], [0, 360]);

  // 4500 / 300 = exactly 15px per slice. No sub-pixel gaps.
  const sliceHeight = panelHeight / sliceCount;
  const segmentAngle = 360 / sliceCount;
  const radius = sliceHeight / (2 * Math.tan(Math.PI / sliceCount));

  const slices = Array.from({ length: sliceCount }, (_, i) => i);

  return (
    <div ref={trackRef} className="relative h-[500vh] bg-black">
      <div
        className="fixed inset-0 w-screen h-screen overflow-hidden flex items-center justify-center"
        style={{ perspective: '2000px' }}
      >
        <motion.div
          style={{
            position: "relative",
            width: "100%",
            height: panelHeight,
            transformStyle: "preserve-3d",
            rotateX,
            z: -radius, // THE FIX: Pushes the massive cylinder behind the camera lens
          }}
        >
          {slices.map((index) => (
            <div
              key={index}
              className="absolute left-0 top-1/2 w-full"
              style={{
                height: sliceHeight,
                marginTop: -sliceHeight / 2,
                // THE FIX: Negative angle wraps the UI downward under the equator
                transform: `rotateX(${-segmentAngle * index}deg) translateZ(${radius}px)`,
                transformStyle: "preserve-3d",
                backfaceVisibility: "hidden",
              }}
            >
              <div
                className="relative w-full overflow-hidden"
                style={{ height: sliceHeight }}
              >
                <div
                  className="absolute left-0 top-0 w-full"
                  style={{ marginTop: -(sliceHeight * index) }}
                >
                  {children}
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
