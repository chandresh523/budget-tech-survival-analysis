'use client';

/**
 * The specimen plates — hardware photographs as WebGL planes in the archive.
 *
 * Rendered in the canvas rather than as DOM images because that is what the
 * Cipher reference actually does: its entire floating media cloud is WebGL, with
 * exactly one <img> in the document. Planes can sit at real depth in the same
 * world the reader is already flying through, which DOM images cannot.
 *
 * THE CURSOR IS A LENS. At rest each plate is quantized into white/black
 * luminance blocks — a deliberate mosaic, not a loading state. Bring the pointer
 * near a plate and it resolves toward the real photograph; move away and it
 * dissolves back. That is the mechanic the whole layer exists for, and it is done
 * entirely in the fragment shader: the CPU only computes one focus scalar per
 * plate per frame.
 *
 * A note on why the mosaic is here at all. It is NOT a fix for low-resolution
 * sources — at the size these plates are drawn, a 736px source has more pixels
 * than it needs. It is a look, and it happens to conceal JPEG artefacts in the
 * dark gradients these near-monochrome shots are mostly made of.
 *
 * Categories with no photograph render as an empty framed plate. That is the
 * honest state for the two categories the reference set does not depict, and it
 * has to look deliberate rather than broken.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { scrollState } from '@/lib/scroll-engine';
import { pointerState } from '@/lib/pointer-state';
import { CANYON_END_MONTH, zForMonth } from '@/lib/canyon-space';
import type { Specimen } from '@/lib/specimens';

export interface PlateGridProps {
  plates: Specimen[];
  /** Scroll progress at which the archive begins. Plates belong to it. */
  crossover: number;
}

/** Widest a plate may be drawn, in world units. Capped so the smallest source
 *  in the set (404x316) is never enlarged enough to show it. */
const MAX_PLATE_WIDTH = 82;
/** Radius of the focusing lens, in screen pixels. */
const FOCUS_RADIUS = 320;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uBlock;   // mosaic cell count across the plate
  uniform float uLevels;  // luminance steps at rest
  uniform float uFocus;   // 0 = fully blocked, 1 = the real photograph
  uniform float uAlpha;
  varying vec2 vUv;

  void main() {
    // Sample at the CENTRE of the mosaic cell, not at the fragment. Sampling at
    // the fragment and then rounding the colour gives a posterised photo, which
    // still reads as a photo; sampling the cell centre is what makes it read as
    // a grid of blocks.
    vec2 cell = floor(vUv * uBlock) + 0.5;
    vec3 blocky = texture2D(uMap, cell / uBlock).rgb;
    vec3 sharp  = texture2D(uMap, vUv).rgb;

    // Rec.709 luma, then quantized. A channel average would let the (slightly)
    // warm and cool areas of these shots fall to different greys.
    float lum = dot(blocky, vec3(0.2126, 0.7152, 0.0722));
    float stepped = floor(lum * uLevels) / max(uLevels - 1.0, 1.0);

    // The archive is monochrome, so the resolved state restores DETAIL, not
    // colour: both ends of the mix are desaturated.
    float sharpLum = dot(sharp, vec3(0.2126, 0.7152, 0.0722));
    vec3 col = mix(vec3(stepped), vec3(sharpLum), uFocus);

    // Lift the plate so it survives the archive's vignette.
    //
    // The vignette is a DOM scrim at z-index 9 and the canvas is at 0, so it
    // darkens the plates along with everything else behind it — at full strength
    // it was taking these near-monochrome shots down into the background. The
    // gamma lift opens the shadows (where most of the tonal range in a dark
    // product shot actually lives) and the gain brings the whole plate up;
    // clamping afterwards stops the highlights from blowing out to flat white.
    col = pow(col, vec3(0.78));
    col = clamp(col * (1.30 + 0.34 * uFocus), 0.0, 1.0);

    gl_FragColor = vec4(col, uAlpha);
  }
`;

interface PlacedPlate {
  spec: Specimen;
  position: [number, number, number];
  width: number;
  height: number;
}

/**
 * Where the plates live.
 *
 * The archive occupies the stretch of Z the camera travels after the canyon, so
 * the plates are laid out there rather than back among the walls. Spread across
 * three depth strata and alternating sides, so the reader passes between them
 * instead of at a wall of thumbnails.
 */
function layout(plates: Specimen[]): PlacedPlate[] {
  const zStart = zForMonth(CANYON_END_MONTH) - 260;
  const zSpan = -900;

  return plates.map((spec, i) => {
    const t = plates.length > 1 ? i / (plates.length - 1) : 0;
    const aspect = spec.width && spec.height ? spec.width / spec.height : 0.75;
    const width = Math.min(MAX_PLATE_WIDTH, spec.lowResolution ? 54 : MAX_PLATE_WIDTH);
    return {
      spec,
      position: [
        // Alternate sides with a widening walk, so no two consecutive plates
        // occupy the same part of the frame.
        (i % 2 === 0 ? -1 : 1) * (58 + (i % 3) * 26),
        18 + Math.sin(i * 1.7) * 26,
        zStart + zSpan * t,
      ],
      width,
      height: width / Math.max(aspect, 0.2),
    };
  });
}

function Plate({ placed, crossover }: { placed: PlacedPlate; crossover: number }) {
  const { spec } = placed;
  const mesh = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  // Only ever called for plates that have a source; the caller branches first,
  // so this hook order stays stable.
  const texture = useTexture(spec.src as string);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMap: { value: texture },
      uBlock: { value: 26 },
      uLevels: { value: 5 },
      uFocus: { value: 0 },
      uAlpha: { value: 0 },
    },
  }), [texture]);

  /* eslint-disable react-hooks/immutability -- A THREE.Texture is a GPU resource
     owned by the loader cache, not React data. These flags must be set on the
     instance itself, and mipmaps matter here: these plates are drawn far smaller
     than their sources, and without them the mosaic aliases into moire. */
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
  }, [texture]);
  /* eslint-enable react-hooks/immutability */

  useEffect(() => () => material.dispose(), [material]);

  const projected = useMemo(() => new THREE.Vector3(), []);

  /* eslint-disable react-hooks/immutability -- Per-frame uniform and transform
     mutation is the required r3f pattern; setState here would re-render the tree
     every frame. */
  useFrame((_s, delta) => {
    const m = mesh.current;
    if (!m) return;
    const k = Math.min(1, Math.max(delta, 1 / 240) * 6);

    // Face the reader. Copying the camera's quaternion is billboarding for the
    // price of an assignment.
    m.quaternion.copy(camera.quaternion);

    // Focus: how close is the pointer to this plate on screen?
    projected.set(...placed.position).project(camera);
    const onScreen = projected.z > -1 && projected.z < 1;
    let target = 0;
    if (onScreen && pointerState.active) {
      const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;
      const d = Math.hypot(sx - pointerState.x, sy - pointerState.y);
      target = Math.max(0, 1 - d / FOCUS_RADIUS);
      target *= target; // squared falloff — a soft lens, not a hard spotlight
    }
    const u = material.uniforms;
    u.uFocus.value += (target - u.uFocus.value) * k;

    // Resting block size breathes with scroll energy, so the mosaic is alive
    // even when the pointer is elsewhere.
    u.uBlock.value = 26 - 8 * scrollState.energy - 12 * u.uFocus.value;

    // The plates belong to the archive: absent before the crossover.
    const p = scrollState.progress;
    const appear = crossover >= 1 ? 0
      : Math.min(1, Math.max(0, (p - (crossover - 0.04)) / 0.07));
    u.uAlpha.value += (appear - u.uAlpha.value) * k;
    m.visible = u.uAlpha.value > 0.004;
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <mesh ref={mesh} position={placed.position} material={material} frustumCulled={false}>
      <planeGeometry args={[placed.width, placed.height]} />
    </mesh>
  );
}

/** A category the reference set does not depict: a marked blank, not a hole. */
function EmptyPlate({ placed, crossover }: { placed: PlacedPlate; crossover: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#f5f5f7',
    transparent: true,
    opacity: 0,
    wireframe: true,
    depthWrite: false,
    toneMapped: false,
  }), []);
  useEffect(() => () => material.dispose(), [material]);

  /* eslint-disable react-hooks/immutability -- see Plate. */
  useFrame((_s, delta) => {
    const m = mesh.current;
    if (!m) return;
    m.quaternion.copy(camera.quaternion);
    const p = scrollState.progress;
    const appear = crossover >= 1 ? 0
      : Math.min(1, Math.max(0, (p - (crossover - 0.04)) / 0.07));
    const k = Math.min(1, Math.max(delta, 1 / 240) * 6);
    material.opacity += (appear * 0.34 - material.opacity) * k;
    m.visible = material.opacity > 0.004;
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <mesh ref={mesh} position={placed.position} material={material} frustumCulled={false}>
      <planeGeometry args={[placed.width, placed.width * 1.35]} />
    </mesh>
  );
}

export default function PlateGrid({ plates, crossover }: PlateGridProps) {
  const placed = useMemo(() => layout(plates), [plates]);
  if (!placed.length) return null;

  return (
    <group>
      {placed.map((p) => (p.spec.src
        ? <Plate key={p.spec.id} placed={p} crossover={crossover} />
        : <EmptyPlate key={p.spec.id} placed={p} crossover={crossover} />
      ))}
    </group>
  );
}
