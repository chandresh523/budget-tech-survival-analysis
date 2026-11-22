'use client';

/**
 * The dual-layer stage.
 *
 *   z  0 : one persistent <Canvas>. Mounted once, never unmounted — the aurora,
 *          the canyon and the record field keep their state while the DOM above
 *          them swaps entirely. Remounting the canvas on navigation is what
 *          makes most WebGL sites flash.
 *   z  5 : the blueprint overlay (DOM SVG), above the world and below the type.
 *   z 10 : the DOM overlay — editorial type, pinned per act.
 *   z 50 : the floating nav.  z 100 : the cursor.
 *
 * Two things here are load-bearing and were each learned the hard way:
 *
 *   - The canvas wrapper is z-index 0, NOT -1. A negative z-index child is
 *     painted before the in-flow block backgrounds of its stacking context, and
 *     <body> carries an opaque #03020a. At -1 the entire WebGL layer sat behind
 *     the page background and nothing in it was ever visible; what looked like
 *     the aurora was a CSS fallback gradient.
 *   - The canvas is NOT position:fixed itself. r3f measures its container, and a
 *     fixed element with no intrinsic size measures zero, which silently
 *     produces a 300x150 canvas that renders nothing. The wrapper is fixed; the
 *     canvas fills it.
 */

import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Aurora from '@/components/cinematic/aurora-shader';
import DataTunnel, { type DataPoint } from '@/components/cinematic/data-tunnel';
import KmCanyon from '@/components/cinematic/km-canyon';
import ElectronField from '@/components/cinematic/electron-field';
import BlueprintOverlay from '@/components/cinematic/blueprint-overlay';
import SparkField from '@/components/record/spark-field';
import PlateGrid from '@/components/record/plate-grid';
import { specimensFor } from '@/lib/specimens';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import CameraRig from '@/components/cinematic/camera-rig';
import MagneticCursor from '@/components/cinematic/magnetic-cursor';
import type { KmCurve } from '@/lib/supabase-browser';
import { scrollState, startScrollEngine } from '@/lib/scroll-engine';
import { pointerState } from '@/lib/pointer-state';
import { CAM_REST_Y, CAM_START_Z } from '@/lib/canyon-space';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const getReduced = () => window.matchMedia(REDUCED_QUERY).matches;
const getReducedServer = () => false;

export interface StageProps {
  /** Static cloud, for the non-streaming case. */
  points?: DataPoint[];
  /** Live buffer, read every frame. Never goes through React state. */
  streaming?: { points: DataPoint[]; version: number; pending: number[] };
  /** 0-1 statistical intensity, drives the aurora's colour rotation. */
  heat: number;
  accent: string;
  accent2: string;
  /** Per-category Kaplan-Meier curves — the canyon walls. */
  curves?: Record<string, KmCurve>;
  /** `deviceKeysOf` order. Lane index must match the cloud's group index. */
  devices?: string[];
  /** Scroll progress at which Movement I hands over to the archive. */
  crossover?: number;
  /** 1 = full colour, 0 = greyscale. */
  saturation?: number;
  /** Deepest month any record occupies, so the far plane contains the field. */
  maxMonth?: number;
  /** Total scroll length in viewports. */
  viewports?: number;
  /** Live record count, for the blueprint readout. */
  records?: number;
  children: ReactNode;
}

/**
 * Hands the r3f camera out to the DOM.
 *
 * `useThree` only exists inside the <Canvas>, but the blueprint overlay is DOM
 * SVG that has to project world anchors into screen space. Rather than lift the
 * camera into React state — a re-render every frame — this stores it on a ref the
 * overlay reads through plain function props.
 */
/**
 * The archive's vignette, in the DOM.
 *
 * Opacity is written from `scrollState` in a rAF rather than bound to React
 * state: the whole point is that it darkens gradually across a band of scroll,
 * and a value that only changes when a boolean flips cannot do that. One element,
 * one style write per frame.
 */
function ArchiveScrim({ crossover }: { crossover: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const band = 0.3;
    const loop = () => {
      const el = ref.current;
      if (el) {
        const t = crossover >= 1 ? 0
          : Math.min(1, Math.max(0,
            (scrollState.progress - (crossover - band * 0.55)) / band));
        // Same smoothstep as the shader, so the two layers darken in step
        // instead of one leading the other.
        el.style.opacity = String(t * t * (3 - 2 * t));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [crossover]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        zIndex: 9,
        opacity: 0,
        background:
          'radial-gradient(48% 42% at 50% 48%, rgba(3,2,10,0.10) 0%, rgba(3,2,10,0.72) 56%, rgba(3,2,10,0.96) 100%)',
      }}
    />
  );
}

function CameraBridge({ targetRef }: { targetRef: { current: THREE.Camera | null } }) {
  const { camera } = useThree();
  useEffect(() => {
    targetRef.current = camera;
    return () => { targetRef.current = null; };
  }, [camera, targetRef]);
  return null;
}

export default function Stage({
  points,
  streaming,
  heat,
  accent,
  accent2,
  curves,
  devices,
  crossover = 1,
  saturation = 1,
  maxMonth = 48,
  viewports = 12,
  records = 0,
  children,
}: StageProps) {
  const host = useRef<HTMLDivElement>(null);
  const camRef = useRef<THREE.Camera | null>(null);
  // Only build plates for categories the pipeline actually published; a plate
  // with no live figures behind it is decoration pretending to be evidence.
  const specimens = useMemo(() => specimensFor(devices ?? []), [devices]);
  const [active, setActive] = useState(true);
  // Read as an external store rather than set from an effect: the value lives in
  // the browser, and this way toggling the OS setting drops the motion live
  // instead of needing a reload.
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getReducedServer);

  // A heavier wheel multiplier and a slightly looser lerp: the dive is long, and
  // at the default one notch moved a fraction of a section. This covers more
  // ground per gesture without making the scrub feel loose.
  useEffect(() => startScrollEngine({ wheelMultiplier: 1.5, lerp: 0.1 }), []);

  // A backgrounded canvas burning GPU is pure waste.
  useEffect(() => {
    const onVis = () => setActive(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Some embedded webviews never fire ResizeObserver, so r3f leaves the canvas
  // at its 300x150 default with no error at all. One nudge recovers it, and it
  // is a no-op where the observer works.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const c = host.current?.querySelector('canvas');
      if (c && c.width <= 300) window.dispatchEvent(new Event('resize'));
    }, 260);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
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
          camera={{ fov: 62, near: 0.1, far: 2400, position: [0, CAM_REST_Y, CAM_START_Z] }}
          onCreated={({ scene, gl, camera }) => {
            scene.fog = new THREE.FogExp2('#03020a', 0.0021);
            gl.setClearColor('#03020a', 1);
            if (process.env.NODE_ENV !== 'production') {
              // Dev-only handle so the scene, camera and clocks can be inspected
              // from the console.
              (window as unknown as { __stage?: unknown }).__stage = {
                scene,
                gl,
                get camera() {
                  return camera;
                },
                scrollState,
                pointerState,
              };
            }
          }}
        >
          <Aurora heat={heat} accent={accent} accent2={accent2}
                  saturation={saturation} crossover={crossover} level={0.36} />

          {!reduced && (
            <>
              {/* Nothing else in the tree may write the camera. */}
              <CameraBridge targetRef={camRef} />
              <CameraRig crossover={crossover} maxMonth={maxMonth} reduced={reduced} />
              <ElectronField
                accent={accent}
                accent2={accent2}
                crossover={crossover}
                saturation={saturation}
              />
              <DataTunnel
                points={points}
                streaming={streaming}
                accent={accent}
                accent2={accent2}
              />
              {curves && devices && devices.length > 0 && (
                <KmCanyon
                  curves={curves}
                  devices={devices}
                  accent={accent}
                  accent2={accent2}
                  crossover={crossover}
                />
              )}

              {/* Movement II's colour sparks. Mounted here rather than in the
                  archive's DOM because they are THREE.Points and the canvas is
                  the only place they can exist; they fade themselves in as the
                  scroll crosses over. */}
              <SparkField crossover={crossover} />

              {/* Suspense because the plate textures load asynchronously; the
                  rest of the world must not be held back waiting for them. */}
              <Suspense fallback={null}>
                <PlateGrid plates={specimens} crossover={crossover} />
              </Suspense>

              {/* Bloom, and note what is NOT here: a ref on the effect.
                  EffectComposer JSON.stringifies its children to build a memo
                  key, so a live effect ref is circular and throws during render,
                  taking the whole canvas down with it. Every value below is a
                  static prop for exactly that reason — if any of this ever needs
                  to animate, animate a memoised value, never a ref.

                  Everything in this scene is additive and untonemapped, so the
                  threshold must sit above the aurora's own brightness or the
                  whole backdrop blooms and the world turns to milk. Measured: at
                  0.42 the void went pale lavender and lost all depth. 0.82 sits
                  above the backdrop and keeps bloom on the crests and the failure
                  nodes, which are the only things that should read as emitting
                  light. */}
              <EffectComposer>
                <Bloom
                  intensity={0.55}
                  luminanceThreshold={0.82}
                  luminanceSmoothing={0.18}
                  mipmapBlur
                />
              </EffectComposer>
            </>
          )}
        </Canvas>
      </div>

      <BlueprintOverlay
        records={records}
        crossover={crossover}
        cameraZ={() => camRef.current?.position.z ?? 0}
        project={(pt) => {
          const cam = camRef.current;
          if (!cam) return null;
          const v = new THREE.Vector3(pt[0], pt[1], pt[2]).project(cam);
          // Behind the camera projects to a valid-looking point on the far side
          // of the screen, so it has to be rejected explicitly or leader lines
          // fly off to annotate geometry the reader cannot see.
          const visible = v.z > -1 && v.z < 1
            && Math.abs(v.x) <= 1.2 && Math.abs(v.y) <= 1.2;
          return {
            x: (v.x * 0.5 + 0.5) * window.innerWidth,
            y: (-v.y * 0.5 + 0.5) * window.innerHeight,
            visible,
          };
        }}
      />

      {/* Legibility scrim.
          The canyon and the record field are additive, so they add light exactly
          where the editorial column sits and the hero was competing with its own
          world. A soft radial darkening centred on the type buys back contrast
          without hiding the geometry — the walls still read at the edges, where
          they are the whole point. z-9: above the canvas, below the overlay. */}
      {/* Movement I legibility scrim: constant, and only strong enough to hold
          contrast behind the editorial column. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: 9,
          background:
            'radial-gradient(62% 50% at 50% 46%, rgba(3,2,10,0.72) 0%, rgba(3,2,10,0.44) 48%, rgba(3,2,10,0) 80%)',
        }}
      />

      {/* Archive scrim: a second layer that closes the frame down, faded in by
          scroll rather than by a state change so the darkening is continuous. */}
      <ArchiveScrim crossover={crossover} />

      <MagneticCursor />

      {/* Scroll track. Height alone; everything visible is pinned above it. */}
      <div style={{ height: `${viewports * 100}vh` }} aria-hidden />

      <div className="pointer-events-none fixed inset-0 z-10">{children}</div>
    </>
  );
}

/** Re-exported so pages can build the point cloud without a second import. */
export type { DataPoint };
export { scrollState };
