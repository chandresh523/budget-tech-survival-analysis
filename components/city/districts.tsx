'use client';

/**
 * The six districts, as procedural geometry.
 *
 * Where a district can be driven by the real numbers, it is — Market Row's
 * storefronts scale with each device's record count, and Decay Canyon's street
 * literally descends along the pooled Kaplan-Meier survival curve. The city is
 * a reading of the data, not scenery placed next to it.
 *
 * Performance notes, following the ui-ux-pro-max Three.js guidelines:
 *   - repeated geometry goes through InstancedMesh, one draw call per cluster
 *   - segment budget is tiered: nothing in the background exceeds 8-12 segments
 *   - the scene relies on FogExp2 for depth, which also culls the far towers
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import type { KmCurve } from '@/lib/supabase-browser';

export interface CityData {
  /** Device name -> record count, used for Market Row storefront sizing. */
  devices: Array<{ name: string; records: number; events: number; cIndex: number | null }>;
  /** Pooled survival curve, drives the Decay Canyon floor. */
  overall: KmCurve | null;
  /** Cox vs RSF for the selected device, drives the Twin Towers. */
  cox: number | null;
  rsf: number | null;
  /** Number of significant log-rank pairs, drives Tribunal pillar lighting. */
  significantPairs: number;
  totalPairs: number;
}

/* A deterministic PRNG. Math.random() would reshuffle the skyline on every
   re-render, so the city would visibly twitch whenever new data arrived. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dummy = new THREE.Object3D();

/* ------------------------------------------------------------------ helpers */

/** A cluster of instanced boxes placed by a callback. */
function InstancedBoxes({
  count,
  place,
  color,
  emissive,
  emissiveIntensity = 0,
  roughness = 0.72,
  metalness = 0.35,
  cast = false,
}: {
  count: number;
  place: (i: number, o: THREE.Object3D) => void;
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  /** Shadow casting doubles this cluster's draw cost — only where it reads. */
  cast?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      place(i, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, place]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow={cast} receiveShadow={cast}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity}
        roughness={roughness}
        metalness={metalness}
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------- sky */

/**
 * Gradient sky dome — a bright overcast-clearing day.
 *
 * Buildings need something to read against; at night that was a warm haze, and
 * in daylight it is a pale sun-washed horizon under blue zenith. One draw call.
 */
function SkyDome() {
  const uniforms = useMemo(
    () => ({
      uHorizon: { value: new THREE.Color('#e8ecf2') },
      uHaze: { value: new THREE.Color('#ffdca8') },
      uZenith: { value: new THREE.Color('#5ba3e0') },
    }),
    [],
  );

  return (
    <mesh scale={[-1, 1, 1]} renderOrder={-1}>
      {/* Inverted sphere: negative x scale flips the normals inward so we see
          the inside. Low segment count — it is a smooth gradient, not geometry. */}
      <sphereGeometry args={[900, 32, 20]} />
      <shaderMaterial
        uniforms={uniforms}
        // Painted first with depth off: the dome is a backdrop, so it must never
        // be clipped by the far plane or occlude anything in front of it.
        depthWrite={false}
        depthTest={false}
        fog={false}
        vertexShader={/* glsl */ `
          varying vec3 vWorld;
          void main() {
            vWorld = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uHorizon;
          uniform vec3 uHaze;
          uniform vec3 uZenith;
          varying vec3 vWorld;
          void main() {
            float h = normalize(vWorld).y;
            // Tight warm band right at the horizon, then a broad fade upward.
            float haze = smoothstep(0.16, -0.05, h);
            float up   = smoothstep(0.0, 0.55, h);
            vec3 col = mix(uHorizon, uZenith, up);
            col = mix(col, uHaze, haze * 0.72);
            // Below the horizon settle to near-black so the ground plane joins it.
            col = mix(col, vec3(0.80, 0.79, 0.74), smoothstep(-0.02, -0.32, h));
            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------- 0. Approach */

const SKYLINE_COUNT = 300;
/** Windows per building on the face turned toward the flight corridor. */
const WINDOWS_PER_BUILDING = 6;

/**
 * Distant skyline the camera flies in over.
 *
 * Two instanced clusters: the massing, and a layer of lit windows. The windows
 * are what actually make this read as a city at night — without them the towers
 * are featureless slabs, and no amount of tinting the base colour fixes that.
 * Both are one draw call each.
 */
function Skyline() {
  const specs = useMemo(() => {
    const rand = mulberry32(1337);
    // The flight channel is carved by |x| rather than by radius: a large inner
    // radius pushed every tower past the fog's reach and the approach rendered
    // as an empty black void.
    const CHANNEL_HALF_WIDTH = 62;
    return Array.from({ length: SKYLINE_COUNT }, () => {
      const side = rand() < 0.5 ? -1 : 1;
      // Squared distribution: dense near the channel, thinning outward.
      const x = side * (CHANNEL_HALF_WIDTH + rand() * rand() * 320);
      const z = 360 - rand() * 800;
      return {
        x,
        z,
        h: 8 + rand() * rand() * 88,
        w: 6 + rand() * 13,
        d: 6 + rand() * 13,
        side,
        // Not every building is occupied at night.
        litRatio: rand(),
        seed: rand(),
      };
    });
  }, []);

  const placeBuilding = useMemo(
    () => (i: number, o: THREE.Object3D) => {
      const s = specs[i];
      o.position.set(s.x, s.h / 2, s.z);
      o.scale.set(s.w, s.h, s.d);
      o.rotation.set(0, 0, 0);
    },
    [specs],
  );

  const placeWindow = useMemo(() => {
    const rand = mulberry32(90210);
    // Pre-roll every window so placement is stable across re-renders.
    const windows = Array.from({ length: SKYLINE_COUNT * WINDOWS_PER_BUILDING }, (_, i) => {
      const b = specs[Math.floor(i / WINDOWS_PER_BUILDING)];
      const on = rand() < 0.35 + b.litRatio * 0.4;
      return {
        // Sit just proud of the face that looks back at the corridor.
        x: b.x - b.side * (b.w / 2 + 0.12),
        y: 3 + rand() * Math.max(1, b.h - 5),
        z: b.z + (rand() - 0.5) * b.d * 0.75,
        h: 0.5 + rand() * 1.0,
        d: 0.6 + rand() * 1.3,
        on,
      };
    });
    return (i: number, o: THREE.Object3D) => {
      const w = windows[i];
      o.position.set(w.x, w.y, w.z);
      // Unlit windows are scaled to nothing rather than drawn dark — cheaper
      // than a second material and invisible either way.
      o.scale.set(w.on ? 0.18 : 0, w.on ? w.h : 0, w.on ? w.d : 0);
      o.rotation.set(0, 0, 0);
    };
  }, [specs]);

  return (
    <group>
      <InstancedBoxes
        count={SKYLINE_COUNT}
        place={placeBuilding}
        // Cool and dark: the towers are silhouettes, the windows are the light.
        color="#d9d4c6"
        emissive="#8fa8c4"
        emissiveIntensity={0.06}
        metalness={0.3}
        roughness={0.78}
      />
      <InstancedBoxes
        count={SKYLINE_COUNT * WINDOWS_PER_BUILDING}
        place={placeWindow}
        color="#7fa9cf"
        emissive="#bcd9f2"
        emissiveIntensity={0.5}
        metalness={0}
        roughness={1}
      />
    </group>
  );
}

/* ----------------------------------------------------------- 1. Market Row */

/**
 * One storefront per hardware category, in a street the camera flies down.
 * Height scales with how many records that device has; the sign glows in the
 * device's status colour.
 */
function MarketRow({ data }: { data: CityData }) {
  const devices = data.devices;
  const maxRecords = Math.max(1, ...devices.map((d) => d.records));

  return (
    <group position={[0, 0, 0]}>
      {/* Street bed */}
      {/* Rain-slicked street. Reflected signage roughly doubles the apparent
          detail of the district for the cost of one material, and it is the
          cheapest thing in the scene that reads as "rendered" rather than "drawn". */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 106]} receiveShadow>
        <planeGeometry args={[54, 130]} />
        <MeshReflectorMaterial
          // Half-res reflection buffer: at this blur nobody can tell, and it
          // halves the extra render pass.
          resolution={512}
          mirror={0.42}
          mixStrength={1.5}
          mixBlur={2.2}
          blur={[300, 90]}
          depthScale={1.1}
          minDepthThreshold={0.3}
          maxDepthThreshold={1.3}
          roughness={0.72}
          metalness={0.22}
          color="#9d9584"
        />
      </mesh>

      {devices.map((device, i) => {
        // Alternate sides of the street.
        const side = i % 2 === 0 ? -1 : 1;
        // Five ranks of two, running toward the camera's stopping point.
        const along = 150 - (i >> 1) * 22;
        const height = 5 + (device.records / maxRecords) * 16;
        const lit =
          device.cIndex === null
            ? '#5d6572'
            : device.events < 5
              ? '#ffb020'
              : '#22d07a';

        return (
          <group key={device.name} position={[side * 17, 0, along]}>
            {/* Shopfront block */}
            <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[11, height, 12]} />
              <meshStandardMaterial
                color="#efe9da"
                roughness={0.74}
                metalness={0.06}
              />
            </mesh>
            {/* Lit window band facing the street */}
            <mesh position={[side * -5.7, 3.4, 0]} rotation={[0, side * -Math.PI / 2, 0]}>
              <planeGeometry args={[7.5, 2.2]} />
              <meshBasicMaterial color={lit} toneMapped={false} transparent opacity={0.9} />
            </mesh>
            {/* Sign board */}
            <mesh position={[side * -5.7, height - 1.8, 0]} rotation={[0, side * -Math.PI / 2, 0]}>
              <planeGeometry args={[8, 1.1]} />
              <meshBasicMaterial color={lit} toneMapped={false} />
            </mesh>
            <pointLight
              position={[side * -8, 5, 0]}
              color={lit}
              intensity={12}
              distance={40}
              decay={2}
            />
          </group>
        );
      })}
    </group>
  );
}

/* ---------------------------------------------------------- 2. Twin Towers */

/** Cox and RSF as two towers whose heights are their concordance indices. */
function TwinTowers({ data }: { data: CityData }) {
  const towers = [
    { label: 'cox', score: data.cox, x: -17, color: '#22c9e8' },
    { label: 'rsf', score: data.rsf, x: 17, color: '#8b6bff' },
  ];

  return (
    <group position={[0, 0, -10]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[40, 32]} />
        <meshStandardMaterial color="#c9c3b3" roughness={0.9} metalness={0.05} />
      </mesh>

      {towers.map((tower) => {
        // A model that did not fit gets a stump, not a tall tower — the city
        // must not imply a score where none exists.
        const unfitted = tower.score === null;
        // Scale from 0.5 (chance) rather than 0, so the visual difference
        // between 0.7 and 0.9 is legible instead of being lost in the base.
        const norm = unfitted ? 0 : Math.max(0, (tower.score! - 0.5) / 0.5);
        const height = unfitted ? 3 : 8 + norm * 44;

        return (
          <group key={tower.label} position={[tower.x, 0, 0]}>
            <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[10, height, 10]} />
              <meshStandardMaterial
                color={unfitted ? '#b3aa98' : '#f2eee2'}
                emissive={unfitted ? '#000000' : tower.color}
                emissiveIntensity={unfitted ? 0 : 0.28}
                roughness={0.42}
                metalness={0.2}
              />
            </mesh>
            {!unfitted && (
              <>
                {/* Crown light */}
                <mesh position={[0, height + 0.6, 0]}>
                  <boxGeometry args={[11, 0.5, 11]} />
                  <meshBasicMaterial color={tower.color} toneMapped={false} />
                </mesh>
                <pointLight
                  position={[0, height, 0]}
                  color={tower.color}
                  intensity={22}
                  distance={70}
                  decay={2}
                />
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}

/* --------------------------------------------------------- 3. Decay Canyon */

/**
 * A canyon whose floor follows the pooled Kaplan-Meier curve: the further you
 * fly, the more months have passed, and the lower the street sinks as survival
 * falls. The walls step down with it.
 */
function DecayCanyon({ data }: { data: CityData }) {
  const curve = data.overall;

  const segments = useMemo(() => {
    const points = curve?.estimable ? curve.points : [];
    if (points.length < 2) {
      // No estimate: a flat, unlit trench rather than an invented slope.
      return Array.from({ length: 27 }, (_, i) => ({ z: -i * 4, survival: 1, dead: true }));
    }
    const maxMonth = points[points.length - 1].month || 1;
    return points.map((p) => ({
      z: -(p.month / maxMonth) * 108,
      survival: p.survival,
      dead: false,
    }));
  }, [curve]);

  return (
    <group position={[0, 0, -72]}>
      {segments.map((seg, i) => {
        const floorY = -2 + seg.survival * 14;
        const wallH = 16 + seg.survival * 20;
        const glow = seg.dead ? '#3a4048' : '#22c9e8';
        const next = segments[i + 1];
        const depth = next ? Math.abs(next.z - seg.z) : 4;

        return (
          <group key={i} position={[0, 0, seg.z]}>
            {/* Street floor at this month's survival height */}
            <mesh position={[0, floorY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[30, Math.max(depth, 0.5)]} />
              <meshStandardMaterial
                color={seg.dead ? '#b0a998' : '#e4dfd0'}
                emissive={glow}
                emissiveIntensity={seg.dead ? 0.02 : 0.34}
                roughness={0.8}
                metalness={0.08}
              />
            </mesh>
            {/* Canyon walls */}
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * 19, floorY + wallH / 2, 0]}
              >
                <boxGeometry args={[8, wallH, Math.max(depth, 0.5)]} />
                <meshStandardMaterial
                  color="#d5cfbe"
                  emissive={glow}
                  emissiveIntensity={seg.dead ? 0.01 : 0.09}
                  roughness={0.78}
                  metalness={0.08}
                />
              </mesh>
            ))}
            {i % 3 === 0 && !seg.dead && (
              <pointLight
                position={[0, floorY + 5, 0]}
                color={glow}
                intensity={9}
                distance={34}
                decay={2}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------ 4. Tribunal */

/**
 * A colonnade: one pillar per device pair tested by the log-rank statistic.
 * Pairs that separate significantly are lit; the rest stay dark.
 */
function Tribunal({ data }: { data: CityData }) {
  const total = Math.max(1, data.totalPairs);
  const lit = data.significantPairs;
  const pillars = Math.min(total, 28);

  return (
    <group position={[0, 0, -240]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 54]} />
        <meshStandardMaterial color="#bdb6a5" roughness={0.9} metalness={0.05} />
      </mesh>

      {Array.from({ length: pillars }, (_, i) => {
        const col = i % 2 === 0 ? -1 : 1;
        const row = i >> 1;
        // Light the first `lit` pillars: the count is what carries meaning.
        const isLit = i < Math.round((lit / total) * pillars);
        const h = 15 + (i % 3) * 2.5;

        return (
          <group key={i} position={[col * 16, 0, 22 - row * 3.4]}>
            <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[1.15, 1.35, h, 10]} />
              <meshStandardMaterial
                color={isLit ? '#fff2f7' : '#cfc8b7'}
                emissive={isLit ? '#ff2f8e' : '#000000'}
                emissiveIntensity={isLit ? 0.75 : 0}
                roughness={0.6}
                metalness={0.1}
              />
            </mesh>
          </group>
        );
      })}

      {/* Lintel across the colonnade */}
      {/* Lintel spans the corridor, so it sits well above the camera's y=13. */}
      <mesh position={[0, 26, 4]}>
        <boxGeometry args={[38, 1.8, 52]} />
        <meshStandardMaterial color="#e0dac9" roughness={0.72} metalness={0.08} />
      </mesh>
      <pointLight position={[0, 12, 0]} color="#ff4fa3" intensity={34} distance={80} decay={2} />
    </group>
  );
}

/* ------------------------------------------------------------ 5. Registry */

/** An archive hall: a wall of shelves, one lit slot per analysed record. */
function Registry({ data }: { data: CityData }) {
  const records = data.devices.reduce((sum, d) => sum + d.records, 0);
  const slots = Math.min(600, Math.max(60, records));

  const place = useMemo(() => {
    const perRow = 40;
    return (i: number, o: THREE.Object3D) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      o.position.set(-39 + col * 2, 2 + row * 2.1, -8 - (row % 2) * 0.4);
      o.scale.set(1.5, 1.6, 0.7);
      o.rotation.set(0, 0, 0);
    };
  }, []);

  return (
    <group position={[0, 0, -330]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[96, 60]} />
        <meshStandardMaterial color="#bdb6a5" roughness={0.9} metalness={0.05} />
      </mesh>

      <InstancedBoxes
        count={slots}
        place={place}
        color="#f0ece0"
        emissive="#12c46e"
        emissiveIntensity={0.42}
        roughness={0.6}
        metalness={0.44}
      />

      {/* Back wall so the hall reads as enclosed */}
      <mesh position={[0, 22, -14]}>
        <boxGeometry args={[96, 44, 2]} />
        <meshStandardMaterial color="#ddd7c6" roughness={0.86} metalness={0.06} />
      </mesh>
      <pointLight position={[0, 16, 6]} color="#22d07a" intensity={46} distance={110} decay={2} />
    </group>
  );
}

/* ------------------------------------------------------------------- life */

/**
 * The things that stop a city reading as a diorama.
 *
 * Stillness is the giveaway. Three cheap moving layers, all instanced or
 * shader-driven so the cost is a handful of draw calls:
 *   - aircraft warning beacons on the tallest towers, blinking out of phase
 *   - traffic streaks running the length of Market Row
 *   - cloud shadows drifting across the ground plane
 */
function CityLife() {
  const beaconRef = useRef<THREE.InstancedMesh>(null);
  const trafficRef = useRef<THREE.InstancedMesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);

  const BEACONS = 26;
  const TRAFFIC = 34;

  const beacons = useMemo(() => {
    const rand = mulberry32(4242);
    return Array.from({ length: BEACONS }, () => ({
      x: (rand() < 0.5 ? -1 : 1) * (70 + rand() * rand() * 280),
      y: 40 + rand() * 60,
      z: 300 - rand() * 720,
      // Out of phase, and at slightly different rates, so they never pulse in
      // unison — synchronised blinking reads as an effect, not a city.
      phase: rand() * Math.PI * 2,
      rate: 0.7 + rand() * 0.7,
    }));
  }, []);

  const traffic = useMemo(() => {
    const rand = mulberry32(777);
    return Array.from({ length: TRAFFIC }, () => ({
      lane: rand() < 0.5 ? -1 : 1,
      offset: rand(),
      speed: 0.05 + rand() * 0.09,
      warm: rand() < 0.5,
    }));
  }, []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;

    // Beacons: scale to zero on the off-beat rather than switching materials.
    const bm = beaconRef.current;
    if (bm) {
      for (let i = 0; i < BEACONS; i++) {
        const b = beacons[i];
        const on = Math.sin(time * b.rate + b.phase) > 0.72 ? 1 : 0.12;
        dummy.position.set(b.x, b.y, b.z);
        dummy.scale.setScalar(1.5 * on);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bm.setMatrixAt(i, dummy.matrix);
      }
      bm.instanceMatrix.needsUpdate = true;
    }

    // Traffic: elongated boxes sliding along the street, wrapping at the ends.
    const tm = trafficRef.current;
    if (tm) {
      for (let i = 0; i < TRAFFIC; i++) {
        const c = traffic[i];
        const p = (c.offset + time * c.speed) % 1;
        dummy.position.set(c.lane * 5.5, 0.7, 168 - p * 128);
        dummy.scale.set(1.1, 0.5, 5 + c.speed * 26);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        tm.setMatrixAt(i, dummy.matrix);
      }
      tm.instanceMatrix.needsUpdate = true;
    }

    // Cloud shadows: one big translucent plane drifting overhead.
    if (cloudRef.current) {
      cloudRef.current.position.x = Math.sin(time * 0.014) * 90;
      cloudRef.current.position.z = -40 + Math.cos(time * 0.009) * 130;
    }
  });

  return (
    <group>
      <instancedMesh ref={beaconRef} args={[undefined, undefined, BEACONS]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        {/* Basic, not standard: a beacon is emitted light, it should not be lit. */}
        <meshBasicMaterial color="#ff4a3d" toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={trafficRef} args={[undefined, undefined, TRAFFIC]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#fff0cf" toneMapped={false} transparent opacity={0.75} />
      </instancedMesh>

      {/* Soft dappling across the ground — sells an actual sky overhead. */}
      <mesh ref={cloudRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, -40]}>
        <planeGeometry args={[420, 520]} />
        <meshBasicMaterial color="#5d6a80" transparent opacity={0.09} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* --------------------------------------------------------------- assembled */

export default function Districts({ data }: { data: CityData }) {
  return (
    <>
      <SkyDome />
      <Skyline />
      <CityLife />
      <MarketRow data={data} />
      <TwinTowers data={data} />
      <DecayCanyon data={data} />
      <Tribunal data={data} />
      <Registry data={data} />

      {/* Ground plane far below, catching the fog and giving the city a base. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -6, -40]} receiveShadow>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial color="#c8c2b2" roughness={1} metalness={0} />
      </mesh>
    </>
  );
}
