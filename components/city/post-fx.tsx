'use client';

/**
 * Post-processing — the single biggest step from "WebGL demo" to "game".
 *
 * Everything here is driven by flight state rather than being a static grade,
 * so the image itself reports where you are:
 *
 *   travelling  → bloom lifts, chromatic aberration opens, vignette closes in.
 *                 Reads as speed and lens strain.
 *   arrived     → the grade settles, aberration drops to almost nothing so the
 *                 numbers beside the district stay clean.
 *
 * Effect order matters: SSAO must run before bloom (it darkens crevices, which
 * bloom would otherwise smear over), and SMAA runs last so it antialiases the
 * final composite instead of being blurred by later passes.
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  BrightnessContrast,
  ChromaticAberration,
  EffectComposer,
  HueSaturation,
  N8AO,
  SMAA,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { scrollToPath } from '@/lib/city-plan';

export interface PostFxProps {
  scrollRef: React.RefObject<number>;
  /** Written each frame with the smoothed 0-1 travel signal. */
  travelOut: React.RefObject<number>;
  /** Turn the heavier passes off on weak hardware. */
  quality?: 'high' | 'low';
}

export default function PostFx({ scrollRef, travelOut, quality = 'high' }: PostFxProps) {
  const { size } = useThree();

  // Smoothed travel signal, 0 at rest and 1 mid-leg.
  const travel = useRef(0);
  const lastScroll = useRef(0);
  const speed = useRef(0);

  // A stable Vector2 mutated in the frame loop, NOT a ref read during render:
  // the effect keeps a live handle on this object, so writing into it each frame
  // updates the pass without React re-rendering (and without tripping the
  // refs-during-render rule).
  const aberration = useMemo(() => new THREE.Vector2(0, 0), []);

  /* NOTE: do NOT put a ref on an effect here.
     EffectComposer JSON.stringify()s its children to build a memo key, and a
     ref holding a live effect instance is circular (parent -> children ->
     parent), which throws during render and takes the whole canvas down.
     Animate by mutating a prop *value* (as with `aberration` below), or move
     the animation somewhere outside the composer entirely. */

  /* eslint-disable react-hooks/immutability -- Everything below runs once per
     animation frame. Mutating refs, the camera and uniform values in place is
     the required r3f pattern: routing 60fps values through setState would
     re-render the tree every frame and defeat the point of using WebGL. */
  useFrame((_state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const s = scrollRef.current ?? 0;

    // Raw scroll velocity, normalised per second, then heavily damped: the
    // grade should swell over a leg, not flicker on every wheel tick.
    const raw = Math.abs(s - lastScroll.current) / Math.max(dt, 1e-4);
    lastScroll.current = s;
    speed.current += (Math.min(raw * 2.2, 1) - speed.current) * (1 - Math.pow(0.02, dt));

    // Being between districts matters as much as raw speed — a slow drift down
    // a leg should still read as travel.
    const { arrivedAt, legProgress } = scrollToPath(s);
    // Peaks mid-leg and falls to nothing at either end.
    const midLeg = arrivedAt === null ? Math.sin(legProgress * Math.PI) : 0;
    const target = Math.max(speed.current, midLeg * 0.85);
    travel.current += (target - travel.current) * (1 - Math.pow(0.05, dt));

    const t = travel.current;

    // Chromatic aberration scaled by viewport width so it looks the same on a
    // laptop and an ultrawide. Mutating this Vector2 in place is safe: it is a
    // prop value the pass reads each frame, not a ref into the effect graph.
    const px = 1 / Math.max(size.width, 1);
    aberration.set(px * (0.4 + t * 5.5), px * (0.2 + t * 3.2));

    // Publish the travel signal for the camera rig's FOV kick, which lives
    // outside the composer and can therefore be animated freely.
    travelOut.current = t;
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <EffectComposer
      // Depth is needed by N8AO; disabling normal pass keeps the cost down.
      enableNormalPass={false}
      multisampling={0}
    >
      {/* Ambient occlusion: without it nothing sits ON the ground, which is the
          single loudest "this is untextured geometry" tell. */}
      {quality === 'high' ? (
        <N8AO
          aoRadius={9}
          intensity={2.4}
          distanceFalloff={1.2}
          screenSpaceRadius
          halfRes
          color="#4a3f2c"
        />
      ) : (
        <></>
      )}

      {/* Bloom on the emissive signage and lit windows only — a high threshold
          keeps pale concrete from blooming into mush. */}
      <Bloom
        intensity={0.62}
        luminanceThreshold={0.72}
        luminanceSmoothing={0.24}
        mipmapBlur
        radius={0.72}
      />

      {/* Slight warmth and contrast, so the daylight grade is not flat. */}
      <HueSaturation saturation={0.06} hue={0} />
      <BrightnessContrast brightness={0.01} contrast={0.09} />

      <ChromaticAberration
        offset={aberration}
        radialModulation
        modulationOffset={0.35}
        blendFunction={BlendFunction.NORMAL}
      />

      <Vignette offset={0.28} darkness={0.4} eskil={false} />

      {/* Last: antialias the final composite. */}
      <SMAA />
    </EffectComposer>
  );
}
