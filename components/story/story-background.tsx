'use client';

/**
 * The story page's background — the same field the dive uses.
 *
 * Previously this page ran its own fluid shader, which meant the two routes had
 * different weather. This mounts the dive's Aurora instead, so crossing between
 * them is a change of layout rather than a change of world: the same
 * domain-warped liquid, the same cursor reactivity, the same slow breath.
 *
 * Two things carried over from the dive's Stage, both learned the hard way:
 *
 *   - The wrapper is z-index 0, NEVER -1. A negative z-index child paints before
 *     the in-flow block backgrounds of its stacking context, and <body> is an
 *     opaque #03020a — at -1 the whole canvas is invisible and what you see is a
 *     CSS fallback gradient.
 *   - The <Canvas> itself is not position:fixed. r3f measures its container, and
 *     a fixed element with no intrinsic size measures zero, silently producing a
 *     300x150 canvas that renders nothing. The wrapper is fixed; the canvas fills
 *     it.
 *
 * No canyon and no record cloud here: those encode the survival geometry, and
 * this page states its figures in type. Only the field and its electrons.
 */

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import Aurora from '@/components/cinematic/aurora-shader';
import ElectronField from '@/components/cinematic/electron-field';

export interface StoryBackgroundProps {
  /** Current chapter accents, so the field follows the story's colour. */
  accent: string;
  accent2: string;
  /** 0-1 statistical intensity; rotates the colour ramp. */
  heat?: number;
}

export default function StoryBackground({ accent, accent2, heat = 0 }: StoryBackgroundProps) {
  const host = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);

  // A backgrounded canvas burning GPU is pure waste.
  useEffect(() => {
    const onVis = () => setActive(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Some embedded webviews never fire ResizeObserver, so r3f leaves the canvas
  // at its 300x150 default with no error at all. One nudge recovers it.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const c = host.current?.querySelector('canvas');
      if (c && c.width <= 300) window.dispatchEvent(new Event('resize'));
    }, 260);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      ref={host}
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0 }}
    >
      <Canvas
        dpr={[1, 1.75]}
        frameloop={active ? 'always' : 'never'}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        camera={{ fov: 62, near: 0.1, far: 2400, position: [0, 24, 150] }}
        onCreated={({ scene, gl }) => {
          scene.fog = new THREE.FogExp2('#03020a', 0.0021);
          gl.setClearColor('#03020a', 1);
        }}
      >
        {/* crossover 1: this page has no archive to drain into, so the field
            stays in full colour throughout. */}
        <Aurora heat={heat} accent={accent} accent2={accent2} crossover={1} />
        <ElectronField accent={accent} accent2={accent2} crossover={1} count={2200} />
      </Canvas>
    </div>
  );
}
