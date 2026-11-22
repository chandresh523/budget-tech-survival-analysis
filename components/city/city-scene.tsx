'use client';

/**
 * The WebGL city. Owns the Canvas, lighting and atmosphere; the camera is
 * driven by CameraRig and the geometry lives in Districts.
 *
 * Deliberately excluded: the data panels. Those stay as DOM overlays so the
 * numbers remain real text — selectable, translatable, screen-reader legible,
 * and crisp at any DPR. Baking them into textures would make the city prettier
 * and the dashboard unusable.
 */

import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import CameraRig from '@/components/city/camera-rig';
import PostFx from '@/components/city/post-fx';
import Districts, { type CityData } from '@/components/city/districts';

export interface CitySceneProps {
  data: CityData;
  scrollRef: React.RefObject<number>;
  pointerRef: React.RefObject<{ x: number; y: number }>;
  /** Paused when the tab is hidden. */
  active: boolean;
}

export default function CityScene({ data, scrollRef, pointerRef, active }: CitySceneProps) {
  const host = useRef<HTMLDivElement>(null);
  /* Shared 0-1 travel signal. PostFx computes it (it already smooths scroll for
     the grade) and CameraRig reads it for the FOV kick, so the lens and the
     grade surge together instead of drifting out of step. */
  const travelRef = useRef(0);

  /* r3f sizes its canvas from a ResizeObserver. Some embedded webviews never
     fire one, and r3f then leaves the canvas at its default 300x150 and never
     creates the renderer at all — a silently blank scene with no error.
     react-use-measure also listens to window resize, so one nudge after mount
     recovers it. Harmless where the observer works: the size is unchanged. */
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const id = window.setTimeout(() => {
      const canvas = el.querySelector('canvas');
      if (canvas && canvas.width <= 300 && canvas.height <= 150) {
        window.dispatchEvent(new Event('resize'));
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, []);

  return (
    /* The fixed positioning lives on this wrapper, NOT on the Canvas.
       Making the Canvas itself `position: fixed` breaks r3f's size measurement:
       it reports 0, the renderer is never created, `onCreated` never fires and
       the canvas sits at its default 300x150 rendering nothing. */
    <div ref={host} className="pointer-events-none fixed inset-0 z-0">
      <Canvas
      shadows="soft"
      // Fragment cost scales with the square of DPR; 1.6 is ample for a scene
      // this dark and saves roughly half the pixels on a 3x display.
      dpr={[1, 1.6]}
      frameloop={active ? 'always' : 'never'}
      gl={{
        // Antialiasing is SMAA's job in the composer now; the built-in MSAA
        // would be resolved away by the post stack and paid for twice.
        antialias: false,
        powerPreference: 'high-performance',
        // Physically-correct-ish response so the emissive signage reads as light
        // rather than as flat bright paint.
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      // Initial position matches the Approach anchor so the first frame is
      // already composed, rather than lurching there once scroll is read.
      camera={{ fov: 58, near: 0.5, far: 1400, position: [0, 120, 300] }}
      onCreated={(state) => {
        // Dev-only handle so the scene can be inspected from the console.
        if (process.env.NODE_ENV !== 'production') {
          (window as unknown as { __city?: unknown }).__city = state;
        }
        const { scene } = state;
        // Background is the sky dome's job; this only shows if the dome fails.
        // Daylight now: aerial perspective washes distance toward pale sky rather
        // than swallowing it in black.
        scene.background = new THREE.Color('#cfdcea');
        // Exponential fog: depth on the approach, and it culls the far skyline
        // instead of paying draw calls for 2px buildings. Density is tuned to the
        // route length (~674 units) — at 0.0042 the entire city sat beyond the
        // fog's reach and the approach rendered as a black void.
        scene.fog = new THREE.FogExp2('#dfe6ee', 0.0018);
      }}
    >
      <CameraRig scrollRef={scrollRef} pointerRef={pointerRef} travelRef={travelRef} />

      {/* Daylight. The hemisphere light does most of the work: cool sky from
          above, warm bounce off the ground, which is what makes pale concrete
          read as lit by an actual sky rather than by a lamp. */}
      <ambientLight intensity={0.55} color="#e8eef6" />
      <hemisphereLight args={['#bcd8f5', '#d9cfae', 1.15]} />
      {/* Sun: warm, high, raking across the route so facades get real modelling.
          It casts too — an unshadowed scene never looks grounded. The shadow
          camera is a long thin box fitted to the route corridor rather than a
          giant square, which keeps texel density usable at 2048. */}
      <directionalLight
        position={[130, 190, 70]}
        intensity={2.1}
        color="#fff4dd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.6}
        shadow-camera-near={1}
        shadow-camera-far={900}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={420}
        shadow-camera-bottom={-420}
      />
      {/* Weak opposing fill so shadowed faces do not go flat black. */}
      <directionalLight position={[-90, 60, -120]} intensity={0.45} color="#c8d8ee" />

        <Suspense fallback={null}>
          <Districts data={data} />
        </Suspense>

        {/* Grade reacts to the flight: bloom and aberration swell on the legs
            and settle on arrival, so the image reports speed. */}
        <PostFx scrollRef={scrollRef} travelOut={travelRef} />
      </Canvas>
    </div>
  );
}
