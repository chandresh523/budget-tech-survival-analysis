'use client';

import React, { Children, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, MotionValue } from 'framer-motion';

interface CylinderWrapperProps {
  children: React.ReactNode;
  scrollHeight?: string;
}

interface FaceProps {
  child: React.ReactNode;
  index: number;
  totalPanels: number;
  segmentAngle: number;
  radius: number;
  parentRotateY: MotionValue<number>;
}

function CylinderFace({ child, index, totalPanels, segmentAngle, radius, parentRotateY }: FaceProps) {
  // Staggered vertical helix spacing
  const verticalSpacing = 450;
  const basePosY = (index - (totalPanels - 1) / 2) * verticalSpacing;

  // Ultra-smooth Gaussian fade curve
  const opacity = useTransform(parentRotateY, (val) => {
    let worldAngle = (val + index * segmentAngle) % 360;
    if (worldAngle > 180) worldAngle -= 360;
    if (worldAngle < -180) worldAngle += 360;
    const distance = Math.abs(worldAngle);
    
    if (distance >= 85) return 0;
    const normalized = distance / 85;
    return Number(Math.max(0, Math.cos(normalized * (Math.PI / 2))).toFixed(3));
  });

  const scale = useTransform(parentRotateY, (val) => {
    let worldAngle = (val + index * segmentAngle) % 360;
    if (worldAngle > 180) worldAngle -= 360;
    if (worldAngle < -180) worldAngle += 360;
    const distance = Math.abs(worldAngle);
    
    return Number(Math.max(0.8, 1 - (distance / 90) * 0.2).toFixed(3));
  });

  const blur = useTransform(parentRotateY, (val) => {
    let worldAngle = (val + index * segmentAngle) % 360;
    if (worldAngle > 180) worldAngle -= 360;
    if (worldAngle < -180) worldAngle += 360;
    const distance = Math.abs(worldAngle);
    
    if (distance < 12) return 'blur(0px)';
    const b = Math.min((distance - 12) / 8, 8);
    return `blur(${b.toFixed(1)}px)`;
  });

  return (
    <div
      className="absolute inset-0 h-full w-full flex items-center justify-center overflow-visible pointer-events-none"
      style={{
        transformStyle: 'preserve-3d',
        transform: `rotateY(${segmentAngle * index}deg) translateZ(${radius}px) translateY(${basePosY}px)`,
      }}
    >
      <motion.div
        className="w-full h-full flex items-center justify-center overflow-visible px-4 md:px-12 pointer-events-auto"
        style={{ opacity, scale, filter: blur }}
      >
        {child}
      </motion.div>
    </div>
  );
}

export default function CylinderWrapper({
  children,
  scrollHeight = '1500vh',
}: CylinderWrapperProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState<number>(1440);

  useEffect(() => {
    function handleResize() {
      setPanelWidth(Math.max(window.innerWidth, 1200));
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const panels = useMemo(() => Children.toArray(children), [children]);
  const numberOfPanels = panels.length;

  const radius = useMemo(() => {
    if (numberOfPanels < 2) return 0;
    return (panelWidth / 2 / Math.tan(Math.PI / numberOfPanels)) * 1.45;
  }, [panelWidth, numberOfPanels]);

  const segmentAngle = numberOfPanels > 0 ? 360 / numberOfPanels : 0;

  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ['start start', 'end end'],
  });
  
  const smoothProgress = useSpring(scrollYProgress, { 
    damping: 45, 
    stiffness: 50, 
    mass: 1.2 
  });
  
  // Multi-step stair-step interpolation so EVERY panel pauses and centers in the viewport
  // before transitioning to the next section in a spiral helix arc.
  const stepSize = 1 / numberOfPanels;
  const rotationStops = panels.map((_, i) => -i * segmentAngle);
  const verticalStops = panels.map((_, i) => {
    const verticalSpacing = 450;
    const basePosY = (i - (numberOfPanels - 1) / 2) * verticalSpacing;
    return -basePosY;
  });

  const scrollPercents = panels.map((_, i) => i * stepSize);
  // Ensure the final stop is exactly 1.0
  scrollPercents[scrollPercents.length - 1] = 1.0;

  const rotateY = useTransform(smoothProgress, scrollPercents, rotationStops);
  const containerTranslateY = useTransform(smoothProgress, scrollPercents, verticalStops);

  return (
    <div ref={scrollRef} className="relative w-full bg-void" style={{ height: scrollHeight }}>
      <div
        className="fixed inset-0 h-screen w-screen overflow-hidden pointer-events-none flex items-center justify-center"
        style={{ perspective: '3500px' }}
      >
        <div className="flex h-full w-full items-center justify-center relative">
          <motion.div
            className="relative h-full flex items-center justify-center pointer-events-none"
            style={{
              transformStyle: 'preserve-3d',
              width: panelWidth,
              rotateY,
              y: containerTranslateY,
              z: -radius, 
            }}
          >
            {panels.map((child, index) => (
              <CylinderFace
                key={index}
                child={child}
                index={index}
                totalPanels={numberOfPanels}
                segmentAngle={segmentAngle}
                radius={radius}
                parentRotateY={rotateY}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
