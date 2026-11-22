'use client';

/**
 * Scroll-driven camera.
 *
 * Reads scroll from a ref rather than React state: scroll fires far more often
 * than 60Hz and re-rendering the tree on each event would drop frames.
 *
 * Two pieces of smoothing do most of the work in making this feel flown rather
 * than scrubbed:
 *   - the scroll value itself is damped, so a trackpad's jittery deltas do not
 *     become camera shake
 *   - the camera banks into turns, rolling toward the inside of the curve, which
 *     is what sells "flying" rather than "sliding along a rail"
 */

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DISTRICTS, FLIGHT_PATH, scrollToPath } from '@/lib/city-plan';

/** Frame-rate independent damping. Returns the lerp alpha for this frame. */
function damp(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

export interface CameraRigProps {
  /** Live scroll progress 0-1, updated outside React. */
  scrollRef: React.RefObject<number>;
  /** Pointer offset -1..1, for a subtle look-around at rest. */
  pointerRef: React.RefObject<{ x: number; y: number }>;
  /** Smoothed 0-1 travel signal, produced by PostFx. */
  travelRef?: React.RefObject<number>;
}

/** Base field of view; the kick widens from here. */
const BASE_FOV = 58;

export default function CameraRig({ scrollRef, pointerRef, travelRef }: CameraRigProps) {
  const { camera } = useThree();

  const smoothedScroll = useRef(0);
  const currentPos = useRef(new THREE.Vector3(...DISTRICTS[0].anchor));
  const currentLook = useRef(new THREE.Vector3(...DISTRICTS[0].focus));
  const currentRoll = useRef(0);

  // Scratch vectors, reused every frame — allocating inside useFrame would
  // create garbage 60 times a second.
  const scratch = useRef({
    pos: new THREE.Vector3(),
    ahead: new THREE.Vector3(),
    look: new THREE.Vector3(),
    tangentA: new THREE.Vector3(),
    tangentB: new THREE.Vector3(),
  });

  /* eslint-disable react-hooks/immutability -- Everything below runs once per
     animation frame. Mutating refs, the camera and uniform values in place is
     the required r3f pattern: routing 60fps values through setState would
     re-render the tree every frame and defeat the point of using WebGL. */
  useFrame((_state, delta) => {
    // After a background tab regains focus delta can be seconds; clamping stops
    // the camera teleporting across the city.
    const dt = Math.min(delta, 1 / 30);
    const s = scratch.current;

    // 1. Damp the raw scroll.
    smoothedScroll.current += (scrollRef.current - smoothedScroll.current) * damp(6.5, dt);

    // 2. Map to the flight path.
    const { t, arrivedAt } = scrollToPath(smoothedScroll.current);
    FLIGHT_PATH.getPointAt(THREE.MathUtils.clamp(t, 0, 1), s.pos);

    // 3. Aim. While dwelling, look at the district's focus point so the place
    //    is composed; while travelling, look down the path so it reads as flight.
    if (arrivedAt !== null) {
      s.look.set(...DISTRICTS[arrivedAt].focus);
    } else {
      FLIGHT_PATH.getPointAt(THREE.MathUtils.clamp(t + 0.035, 0, 1), s.ahead);
      s.look.copy(s.ahead);
    }

    // 4. Bank. Compare tangents slightly ahead and behind to get the turn
    //    direction, then roll toward the inside of it.
    FLIGHT_PATH.getTangentAt(THREE.MathUtils.clamp(t - 0.01, 0, 1), s.tangentA);
    FLIGHT_PATH.getTangentAt(THREE.MathUtils.clamp(t + 0.01, 0, 1), s.tangentB);
    const turn = s.tangentA.x * s.tangentB.z - s.tangentA.z * s.tangentB.x;
    // No bank at rest: a parked camera holding a roll angle looks broken.
    const targetRoll = arrivedAt !== null ? 0 : THREE.MathUtils.clamp(turn * 9, -0.32, 0.32);
    currentRoll.current += (targetRoll - currentRoll.current) * damp(3, dt);

    // 5. Pointer parallax, only while stopped — during flight it fights the path.
    const p = pointerRef.current;
    if (arrivedAt !== null && p) {
      s.pos.x += p.x * 2.4;
      s.pos.y += p.y * 1.5;
    }

    // 6. Apply, damped, so even a scroll jump arrives smoothly.
    currentPos.current.lerp(s.pos, damp(7, dt));
    currentLook.current.lerp(s.look, damp(5, dt));

    camera.position.copy(currentPos.current);
    camera.up.set(Math.sin(currentRoll.current), Math.cos(currentRoll.current), 0);
    camera.lookAt(currentLook.current);

    // FOV kick: the lens widens as the leg builds and settles on arrival. This
    // is the oldest speed cue in games — peripheral stretch reads as velocity
    // far more strongly than the camera simply moving faster.
    if (travelRef && camera instanceof THREE.PerspectiveCamera) {
      const wanted = BASE_FOV + (travelRef.current ?? 0) * 11;
      if (Math.abs(camera.fov - wanted) > 0.01) {
        camera.fov += (wanted - camera.fov) * damp(4, dt);
        camera.updateProjectionMatrix();
      }
    }
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}
