'use client';

/**
 * The record field — every analysed response, placed by its own statistics.
 *
 *   Z = time-to-event, shared with the canyon walls via lib/canyon-space, so a
 *       record and a crest at the same depth mean the same month.
 *   X = the record's category lane, the same lane its wall stands in. Records
 *       therefore lie directly beneath the curve they produced.
 *   Y = jitter only, close to the floor. Deliberately meaningless.
 *
 * On that last point: Y belongs to survival in this world, because the walls'
 * crests are S(t). Giving a record a *different* Y meaning — price, say, which is
 * what the old radial tunnel encoded as radius — would put two incompatible
 * scales on one axis and quietly invite a viewer to read a record's height as its
 * survival. So price has no spatial channel here at all, and the records read as
 * a luminous gravel bed along each lane's floor: the ground its wall stands on.
 *
 * Observed failures sit slightly proud and burn bright; censored records are
 * small and dim. That asymmetry IS survival analysis made visible — most of the
 * field is censored, and you can see how thin the failure evidence actually is.
 *
 * One InstancedMesh, one draw call. The camera is NOT touched here; camera-rig
 * owns it.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR_Y, laneX, zForMonth } from '@/lib/canyon-space';

export interface DataPoint {
  /** Months until failure, or until last observation if censored. */
  t: number;
  /** 1 = observed failure, 0 = censored. */
  event: 0 | 1;
  /** Category index; must match the canyon's lane index. */
  group: number;
  /** Total groups, so lanes divide evenly. */
  groups: number;
  /** Price in thousands of rupees. Retained on the type for the ledgers; it has
   *  no spatial channel here — see the file header. */
  price: number;
  label: string;
}

export interface DataTunnelProps {
  /** Static cloud. Ignored when `streaming` is set. */
  points?: DataPoint[];
  /** Live source, read every frame from a mutable buffer — see realtime-stream. */
  streaming?: { points: DataPoint[]; version: number; pending: number[] };
  accent: string;
  accent2: string;
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/** Deterministic jitter, so the field has natural scatter but never re-shuffles
 *  between renders — Math.random would make the world twitch on every publish. */
function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export default function DataTunnel({ points, streaming, accent, accent2 }: DataTunnelProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // An InstancedMesh cannot be resized after construction, so buffers are
  // allocated once with headroom and `mesh.count` exposes only the live rows.
  const CAPACITY = 4096;
  const version = streaming?.version ?? 0;
  // The stream buffer is mutated IN PLACE, so its array identity never changes.
  // Keying the layout off `version` is what makes it recompute when a publish
  // lands; depending on the array alone would silently serve a stale field.
  const source = useMemo(
    () => streaming?.points ?? points ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, points, version],
  );
  const count = source.length;

  const placed = useMemo(() => {
    if (!count) return [] as Array<{ x: number; y: number; z: number; s: number; event: number }>;
    return source.map((p, i) => {
      const lane = laneX(p.group, p.groups);
      return {
        // Scatter across the lane's width but never far enough to stray into a
        // neighbouring category's lane.
        x: lane + (hash(i) - 0.5) * 26,
        y: FLOOR_Y + 1.5 + hash(i + 7919) * 13 + (p.event === 1 ? 4 : 0),
        z: zForMonth(p.t) + (hash(i + 104729) - 0.5) * 5,
        // Failures are larger — they carry the statistical weight. Kept modest:
        // the field surrounds the flight path, so anything is eventually passed
        // at close range and a large instance becomes a screen-filling blob over
        // the editorial type at exactly that moment.
        s: p.event === 1 ? 1.25 + hash(i + 15485863) * 0.5 : 0.52 + hash(i + 32452843) * 0.26,
        event: p.event,
      };
    });
  }, [source, count]);

  /* ---- GPU upload, driven by the buffer's version, not by React ---- */

  const uploaded = useRef(-1);

  // Allocated at full CAPACITY, but nothing may draw until the first upload.
  // Without this the zeroed matrices render as CAPACITY degenerate instances
  // piled on the origin — a bright blob at the centre of the world on first paint.
  const bindMesh = useCallback((mesh: THREE.InstancedMesh | null) => {
    meshRef.current = mesh;
    if (mesh) mesh.count = 0;
  }, []);
  const arrival = useRef<Float32Array>(new Float32Array(CAPACITY));

  const colors = useMemo(
    () => ({ fail: new THREE.Color(accent2), cens: new THREE.Color(accent) }),
    [accent, accent2],
  );

  const writeInstance = (
    mesh: THREE.InstancedMesh,
    i: number,
    p: { x: number; y: number; z: number; s: number; event: number },
    grow: number,
  ) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.setScalar(p.s * grow);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    tint.copy(p.event === 1 ? colors.fail : colors.cens)
      .multiplyScalar(p.event === 1 ? 1.0 : 0.3);
    mesh.setColorAt(i, tint);
  };

  /* eslint-disable react-hooks/immutability -- Per-frame instance and material
     mutation is the required r3f pattern; setState here would re-render the tree
     sixty times a second. */
  useFrame((_s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const mesh = meshRef.current;
    if (!mesh) return;

    const n = Math.min(placed.length, CAPACITY);

    if (uploaded.current !== version) {
      // A publish landed. Rewrite every instance and mark the new tail for the
      // arrival animation. Full rewrite is deliberate: at a few thousand
      // instances it is well under a millisecond, and diffing would cost more in
      // bookkeeping than it saves.
      const pending = streaming?.pending;
      for (let i = 0; i < n; i++) {
        const isNew = pending ? pending.includes(i) : false;
        arrival.current[i] = uploaded.current === -1 ? 1 : isNew ? 0 : 1;
        writeInstance(mesh, i, placed[i], arrival.current[i]);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      uploaded.current = version;
    } else if (streaming?.pending.length) {
      // Advance only the arriving instances. Touching a handful of matrices per
      // frame is far cheaper than re-uploading the whole buffer.
      let stillGrowing = false;
      for (const i of streaming.pending) {
        if (i >= n) continue;
        const g = Math.min(1, arrival.current[i] + dt * 2.2);
        arrival.current[i] = g;
        writeInstance(mesh, i, placed[i], g);
        if (g < 1) stillGrowing = true;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (!stillGrowing) streaming.pending.length = 0;
    }
  });
  /* eslint-enable react-hooks/immutability */

  useEffect(() => () => {
    const mesh = meshRef.current;
    if (mesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }, []);

  if (!count) return null;

  return (
    <instancedMesh ref={bindMesh} args={[undefined, undefined, CAPACITY]} frustumCulled={false}>
      {/* Low-poly spheres: nobody counts facets at this scale, and 8x6 keeps a
          few hundred instances trivially cheap while still catching a highlight. */}
      <sphereGeometry args={[1, 8, 6]} />
      {/* Basic, not standard: these are emissive data points, not lit objects.
          Additive blending makes dense clusters bloom where records pile up,
          which turns overplotting into a density cue instead of a problem. */}
      <meshBasicMaterial
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
