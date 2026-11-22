'use client';

/**
 * The Kaplan-Meier canyon.
 *
 * Each category becomes a wall running away from the viewer along the time axis,
 * and the wall's crest IS its survival estimate: the skyline sinks exactly where
 * devices failed. Fly the corridor between the lanes and you are reading ten
 * curves at once, spatially.
 *
 *   -Z = month, shared with the record cloud via lib/canyon-space
 *    Y = S(t), the crest
 *    X = the category's lane
 *
 * TERRACED, NEVER INTERPOLATED. A Kaplan-Meier estimate is a step function: it
 * holds flat between event times and drops instantly at one. The crest is built
 * from `THREE.LineCurve3` segments chained into a `CurvePath` precisely so the
 * geometry *cannot* round the corners — a Catmull-Rom or any spline would draw a
 * curve the estimator never produced and imply failures in months where none
 * were observed. That is the same interpolation error that was biasing the RMST
 * figure by up to a quarter of a month, and it is not going to be reintroduced
 * as geometry.
 *
 * Built only to CANYON_END_MONTH. The published grid's last regular sample is
 * month 48; past that each curve carries a single point at its own end of
 * follow-up, and stretching one unsampled interval across three quarters of the
 * corridor would be a lie about where the detail is. The canyon stops, and says
 * so with an end rule.
 *
 * Draw calls: one wall mesh for all lanes plus one crest tube per lane.
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { scrollState } from '@/lib/scroll-engine';
import type { KmCurve } from '@/lib/supabase-browser';
import {
  CANYON_END_MONTH, FLOOR_Y, laneSpread, laneX, survivalScale, zForMonth,
} from '@/lib/canyon-space';

export interface KmCanyonProps {
  curves: Record<string, KmCurve>;
  /** `deviceKeysOf` order — lane index must match the cloud's group index, or a
   *  wall would stand over another category's records. */
  devices: string[];
  accent: string;
  accent2: string;
  /** Scroll progress at which Movement I hands over; the canyon fades out past
   *  it rather than hanging behind the reader for the whole archive. */
  crossover?: number;
}

const CREST_RADIUS = 1.5;
const CREST_RADIAL_SEGMENTS = 6;

/** Grid months only. The trailing end-of-follow-up sample is deliberately not
 *  part of the built canyon — see the file header. */
function gridPoints(curve: KmCurve) {
  return curve.points.filter((p) => p.month <= CANYON_END_MONTH);
}

/**
 * The staircase, as world-space points.
 *
 * Emits hold-then-drop: travel to the next month at the current level, then step
 * to the new level at that exact month.
 */
function stepPath(
  pts: ReadonlyArray<{ month: number; survival: number }>,
  x: number,
  yFor: (s: number) => number,
): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  if (!pts.length) return out;
  out.push(new THREE.Vector3(x, yFor(pts[0].survival), zForMonth(pts[0].month)));
  for (let i = 0; i < pts.length - 1; i++) {
    const zNext = zForMonth(pts[i + 1].month);
    out.push(new THREE.Vector3(x, yFor(pts[i].survival), zNext));       // hold
    out.push(new THREE.Vector3(x, yFor(pts[i + 1].survival), zNext));   // drop
  }
  return out;
}

export default function KmCanyon({
  curves, devices, accent, accent2, crossover = 1,
}: KmCanyonProps) {
  /**
   * Materials are created here and shared, not declared as JSX children.
   *
   * A `<meshBasicMaterial ref={...}>` inside the crest `.map()` would assign
   * every lane's material to the same ref: only the last one would ever be
   * animated and the other nine would sit at opacity 0, permanently invisible.
   * One instance, handed to every mesh.
   */
  const mats = useMemo(() => ({
    wall: new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    }),
    crest: new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
  }), []);
  useEffect(() => () => { mats.wall.dispose(); mats.crest.dispose(); }, [mats]);

  const built = useMemo(() => {
    const estimable = devices
      .map((key, group) => ({ key, group, curve: curves[key] }))
      // An inestimable category has no curve to draw. A flat wall at S=1 would
      // be inventing a result, so its lane is simply empty.
      .filter((d) => d.curve?.estimable && (d.curve.points?.length ?? 0) >= 2);

    const observed: number[] = [];
    for (const d of estimable) for (const p of gridPoints(d.curve)) observed.push(p.survival);
    const scale = survivalScale(observed);

    const from = new THREE.Color(accent);
    const to = new THREE.Color(accent2);
    const hue = new THREE.Color();

    // ---- walls: one geometry for every lane -------------------------------
    const wPos: number[] = [];
    const wCol: number[] = [];
    const crests: Array<{ key: string; geometry: THREE.BufferGeometry }> = [];

    for (const { key, group, curve } of estimable) {
      const x = laneX(group, devices.length);
      hue.copy(from).lerp(to, devices.length > 1 ? group / (devices.length - 1) : 0);
      const pts = gridPoints(curve);

      for (let i = 0; i < pts.length - 1; i++) {
        const yTop = scale.yFor(pts[i].survival);
        const zA = zForMonth(pts[i].month);
        const zB = zForMonth(pts[i + 1].month);
        // Failure is what carries information, so the wall glows where survival
        // is low rather than uniformly.
        const k = 0.16 + (1 - pts[i].survival) * 1.9;
        const quad = [
          [x, yTop, zA], [x, yTop, zB], [x, FLOOR_Y, zB],
          [x, yTop, zA], [x, FLOOR_Y, zB], [x, FLOOR_Y, zA],
        ];
        for (const [px, py, pz] of quad) {
          wPos.push(px, py, pz);
          wCol.push(hue.r * k, hue.g * k, hue.b * k);
        }
      }

      // ---- crest: a tube that cannot round its corners --------------------
      const path = stepPath(pts, x, scale.yFor);
      const curvePath = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < path.length - 1; i++) {
        // Zero-length segments (a month with no change) would make TubeGeometry
        // emit NaN normals and drop the whole mesh.
        if (path[i].distanceToSquared(path[i + 1]) < 1e-9) continue;
        curvePath.add(new THREE.LineCurve3(path[i], path[i + 1]));
      }
      if (!curvePath.curves.length) continue;

      const tubular = Math.max(48, curvePath.curves.length * 10);
      const tube = new THREE.TubeGeometry(
        curvePath, tubular, CREST_RADIUS, CREST_RADIAL_SEGMENTS, false,
      );
      const n = tube.getAttribute('position').count;
      const cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        cols[i * 3] = hue.r; cols[i * 3 + 1] = hue.g; cols[i * 3 + 2] = hue.b;
      }
      tube.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      crests.push({ key, geometry: tube });
    }

    // ---- end rule: where the sampled grid stops --------------------------
    const spread = laneSpread(devices.length) + 26;
    const zEnd = zForMonth(CANYON_END_MONTH);
    const rule = [
      [-spread, FLOOR_Y, zEnd], [spread, FLOOR_Y, zEnd], [spread, FLOOR_Y + 1.4, zEnd],
      [-spread, FLOOR_Y, zEnd], [spread, FLOOR_Y + 1.4, zEnd], [-spread, FLOOR_Y + 1.4, zEnd],
    ];
    for (const [px, py, pz] of rule) {
      wPos.push(px, py, pz);
      wCol.push(0.5, 0.52, 0.6);
    }

    const walls = new THREE.BufferGeometry();
    walls.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
    walls.setAttribute('color', new THREE.Float32BufferAttribute(wCol, 3));
    walls.computeBoundingSphere();

    return { walls, crests, scale };
  }, [curves, devices, accent, accent2]);

  // useMemo replaces geometry but never frees the old one, and a leaked
  // BufferGeometry keeps its GPU buffers for the life of the context.
  useEffect(() => () => {
    built.walls.dispose();
    for (const c of built.crests) c.geometry.dispose();
  }, [built]);

  /* eslint-disable react-hooks/immutability -- Per-frame material mutation is
     the required r3f pattern. These are long-lived GPU objects, not React data;
     routing opacity through setState would re-render the tree sixty times a
     second. */
  useFrame((_s, delta) => {
    const p = scrollState.progress;
    // Visible from the landing frame, not faded in from nothing. A world that is
    // transparent at progress 0 greets the reader with an empty screen and only
    // appears once they happen to scroll — the same mistake the opening act made
    // before it was fixed. The canyon IS the establishing shot.
    const exit = crossover >= 1 ? 1
      : Math.max(0, 1 - Math.max(0, p - (crossover - 0.06)) / 0.08);
    const target = exit;
    const k = Math.min(1, Math.max(delta, 1 / 240) * 5);

    mats.wall.opacity += (target * 0.27 - mats.wall.opacity) * k;
    mats.wall.visible = mats.wall.opacity > 0.004;
    mats.crest.opacity += (target * 0.82 - mats.crest.opacity) * k;
    mats.crest.visible = mats.crest.opacity > 0.004;
  });
  /* eslint-enable react-hooks/immutability */

  if (!built.crests.length) return null;

  return (
    <group>
      {/* Walls. Additive with no depth write so ten translucent lanes read
          through one another instead of the nearest two occluding the rest. */}
      <mesh geometry={built.walls} material={mats.wall} frustumCulled={false} />

      {/* Crests. One draw call per lane; they share a single material. */}
      {built.crests.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={mats.crest} frustumCulled={false} />
      ))}
    </group>
  );
}
