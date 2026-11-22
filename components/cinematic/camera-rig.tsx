'use client';

/**
 * The only thing that writes the camera.
 *
 * Scroll owns where you are; hold-and-drag owns where you are looking. Those are
 * two authorities over one object, and the last time two writers shared one
 * animated property in this codebase (two scrub tweens on the same autoAlpha)
 * sections piled up on screen and stuck there, because whichever wrote last won
 * and nothing rewrote it afterwards. So the composition is explicit and lives in
 * one place: scroll sets the position along the flight path, drag adds a bounded
 * ROTATIONAL OFFSET to it, and nothing else in the tree touches the camera.
 *
 * Drag is bounded and springs back rather than being a free fly. Unbounded
 * free-look reads well for about four seconds and then the reader is staring
 * into empty space while the pinned text describes something behind them, with
 * no way home. thewatch.60fps.fr labels this interaction "HOLD TO EXPLORE" and
 * that is exactly the contract: hold to look, release and the world rights
 * itself.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { scrollState } from '@/lib/scroll-engine';
import { consumeDrag, pointerState } from '@/lib/pointer-state';
import {
  CAM_OVERRUN, CAM_REST_Y, CAM_START_Z, CANYON_END_MONTH, farPlaneFor, zForMonth,
} from '@/lib/canyon-space';

export interface CameraRigProps {
  /** Scroll progress at which Movement I ends and the archive begins. */
  crossover: number;
  /** Deepest month any record occupies, so the far plane can contain the field. */
  maxMonth: number;
  /** Disable drag and drift entirely. */
  reduced?: boolean;
}

/** Bounds on the look-around, in radians. Generous enough to inspect a lane from
 *  an angle, tight enough that the corridor never leaves the frame. */
const YAW_LIMIT = 0.46;
const PITCH_LIMIT = 0.3;
/** Pixels of drag per radian. Lower is heavier. */
const DRAG_PER_RADIAN = 620;

export default function CameraRig({ crossover, maxMonth, reduced = false }: CameraRigProps) {
  const { camera } = useThree();

  const look = useRef({ yaw: 0, pitch: 0 });
  const travel = useRef(0);
  const bank = useRef(0);

  // The record field extrapolates past the built canyon, so the default far
  // plane would clip it away rather than letting fog swallow it.
  /* eslint-disable react-hooks/immutability -- The camera is a three.js object
     owned by the renderer, not React state; widening its frustum is the only way
     to keep the extrapolated record field from being clipped away. */
  useEffect(() => {
    const far = farPlaneFor(maxMonth);
    if (camera instanceof THREE.PerspectiveCamera && camera.far < far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }, [camera, maxMonth]);
  /* eslint-enable react-hooks/immutability */

  /* eslint-disable react-hooks/immutability -- Per-frame camera mutation is the
     required r3f pattern; routing a transform through setState would re-render
     the whole tree every frame. */
  useFrame((_s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const p = scrollState.progress;

    /* ---- position: scroll owns the flight path -------------------------- */
    // Two segments. Movement I flies the built canyon and overruns its end so
    // the last steps are passed through rather than stopped in front of.
    // Movement II keeps going deeper at a similar rate, because the archive is a
    // stratum of the same dive and not a different page.
    const zCanyonEnd = zForMonth(CANYON_END_MONTH) - CAM_OVERRUN;
    let targetZ: number;
    if (p <= crossover) {
      const k = crossover > 0 ? p / crossover : 0;
      targetZ = CAM_START_Z + (zCanyonEnd - CAM_START_Z) * k;
    } else {
      const k = crossover < 1 ? (p - crossover) / (1 - crossover) : 0;
      const perUnit = (zCanyonEnd - CAM_START_Z) * 0.62;
      targetZ = zCanyonEnd + perUnit * k;
    }

    // Damp rather than snap: Lenis is already smooth, but the camera lagging the
    // input very slightly is what gives the flight weight.
    travel.current += (targetZ - travel.current) * Math.min(1, dt * 6);
    camera.position.z = travel.current;

    /* ---- rotation: drag adds a bounded offset --------------------------- */
    if (!reduced) {
      const { dx, dy } = consumeDrag();
      if (dx !== 0 || dy !== 0) {
        look.current.yaw = THREE.MathUtils.clamp(
          look.current.yaw - dx / DRAG_PER_RADIAN, -YAW_LIMIT, YAW_LIMIT,
        );
        look.current.pitch = THREE.MathUtils.clamp(
          look.current.pitch - dy / DRAG_PER_RADIAN, -PITCH_LIMIT, PITCH_LIMIT,
        );
      }
      // Spring home when released. Held, it stays put so you can study a lane.
      if (pointerState.down === 0) {
        const home = Math.min(1, dt * 2.6);
        look.current.yaw += (0 - look.current.yaw) * home;
        look.current.pitch += (0 - look.current.pitch) * home;
      }
    } else {
      look.current.yaw = 0;
      look.current.pitch = 0;
    }

    // Bank into the turn: roll proportional to signed scroll velocity. The
    // single cheapest thing that makes a dolly read as flight.
    const targetBank = reduced ? 0
      : THREE.MathUtils.clamp(scrollState.velocity * -0.0014, -0.12, 0.12);
    bank.current += (targetBank - bank.current) * Math.min(1, dt * 3);

    camera.rotation.set(look.current.pitch, look.current.yaw, bank.current);

    /* ---- lateral drift ------------------------------------------------- */
    // Dead-centre flight down a symmetric corridor reads as a screensaver, so
    // the camera wanders slightly. The pointer nudges it too, which makes the
    // whole world feel attached to the cursor rather than merely decorated by it.
    const t = scrollState.time;
    const wanderX = reduced ? 0 : Math.sin(t * 0.11) * 7;
    const wanderY = reduced ? 0 : Math.cos(t * 0.09) * 4.5;
    const leanX = reduced ? 0 : pointerState.nx * 9;
    const leanY = reduced ? 0 : pointerState.ny * 5;
    camera.position.x += (wanderX + leanX - camera.position.x) * Math.min(1, dt * 2.2);
    camera.position.y += (CAM_REST_Y + wanderY + leanY - camera.position.y)
      * Math.min(1, dt * 2.2);
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}
