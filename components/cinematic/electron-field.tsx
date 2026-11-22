'use client';

/**
 * The electron field — the dust the canyon is flown through.
 *
 * Without it the void is a perfect vacuum, and a camera moving through a vacuum
 * is indistinguishable from a camera standing still: parallax needs something
 * near to slide against something far. ~3500 points supply exactly that and
 * nothing else. They carry NO data.
 *
 * THIS IS DECORATION, AND IT MUST LOOK LIKE DECORATION. The record nodes are the
 * only marks on screen that mean anything — discrete spheres, one per survey
 * response, sized and coloured by whether the device actually failed. So this
 * field is deliberately built to lose against them on every channel a viewer
 * uses to rank importance:
 *
 *   size      sub-pixel to ~4.6 CSS px, clamped, versus the nodes' solid discs
 *   count     thousands, versus a couple of hundred — abundance reads as texture
 *   colour    dim, and greyed out entirely once Movement II wants the frame
 *   form      soft round sprites with no edge, versus lit, occluding geometry
 *
 * If a viewer ever has to ask whether a speck is a record, this file is wrong.
 *
 * The volume runs from +200 back to 2.2x the end of the built canyon, so the
 * field keeps going long after the last sampled month. That asymmetry is the
 * point and it matches lib/canyon-space's framing: the grid ends at month 48,
 * the dark does not.
 *
 * One THREE.Points, one custom ShaderMaterial, one draw call. Every position is
 * animated in the VERTEX shader — nothing here touches a position on the CPU,
 * because 3500 vector writes per frame in JS is how a scroll page starts
 * dropping frames while the GPU sits idle.
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { scrollState } from '@/lib/scroll-engine';
import { pointerState } from '@/lib/pointer-state';
import {
  CANYON_END_MONTH, CREST_Y, FLOOR_Y, laneSpread, zForMonth,
} from '@/lib/canyon-space';

/* ─────────────────────────────────────────────────────────────── envelope ──── */

/**
 * The field's width is pinned to a TEN-lane spread, not to however many
 * categories the current panel happens to have.
 *
 * A volume that resized itself when a category dropped out would make the
 * ambient dust report the shape of the data — which is the one thing it must
 * never do. Ten is the panel's designed lane count; the envelope is a set, and
 * it stays set.
 */
const FIELD_LANES = 10;

const HALF_X = laneSpread(FIELD_LANES) + 120;
const Y_LO = FLOOR_Y;
/** Above the crests, so there is sky as well as floor. */
const Y_HI = CREST_Y + 120;
/** Starts behind the camera's rest position so the opening frame is inside it. */
const Z_NEAR = 200;
/** 2.2x the built canyon: the field outlives the grid. */
const Z_FAR = zForMonth(CANYON_END_MONTH) * 2.2;

const DEFAULT_COUNT = 3500;

/* ───────────────────────────────────────────────────────────────── shaders ──── */

const vertexShader = /* glsl */ `
  precision highp float;

  // x: hue mix, 0 = accent, 1 = accent2
  // y: base size in the point-size formula, and the per-point brightness
  // z: drift phase, 0-1, scaled to radians below
  // w: thinning rank, 0-1 — stable, so thinning always removes the SAME points
  attribute vec4 aSeed;

  uniform float uTime;
  uniform vec2  uPointer;        // -1..1 NDC, 0 at centre (pointerState.nx/ny)
  uniform float uPointerEnergy;  // 0-1 damped pointer speed
  uniform float uPointerActive;  // 0-1 eased "a real pointer exists"
  uniform float uAspect;         // width / height
  uniform float uFade;           // 0-1 global entrance
  uniform float uThin;           // 0-1 how far past the crossover we are
  uniform float uSaturation;     // 1 = full colour, 0 = grey at equal luminance
  uniform float uScale;          // CSS px * world units, for the size formula
  uniform float uPixelRatio;
  uniform float uFadeNear;       // depth where the far fade starts
  uniform float uFadeFar;        // depth where it has finished
  uniform vec3  uAccent;
  uniform vec3  uAccent2;

  varying vec3  vColor;
  varying float vAlpha;

  /** World units of wander. Comparable to a node's diameter, no more. */
  const float DRIFT = 11.0;
  /** View-space units the cursor shoves a point. ~50 CSS px at close range. */
  const float PUSH = 8.0;
  /** Slow. Anything faster and the dust reads as falling snow. */
  const float DRIFT_RATE = 0.12;
  /** Long wavelength (~840 world units) and a short one (~330). */
  const float K1 = 0.0075;
  const float K2 = 0.019;

  /**
   * Cheap curl-ish flow: the analytic curl of a sine vector potential.
   *
   * For psi = (sin(k*y + t), sin(k*z + 1.3t), sin(k*x - 0.7t)),
   *   curl psi = -k * (cos(k*z + 1.3t), cos(k*x - 0.7t), cos(k*y + t))
   * which is divergence-free by construction — three cosines, no noise texture,
   * no gradient estimate. Divergence-freeness is the whole reason to build it
   * this way rather than from three unrelated sines: a field with sinks slowly
   * gathers every point into the same few knots, and an even dust that clumps
   * over thirty seconds starts to look like structure.
   *
   * The per-point phase is a constant offset, so each point rides its own
   * translated copy of the same divergence-free field and the aggregate density
   * still holds. Octave one gets only a fraction of the phase, which leaves
   * neighbours partly correlated and preserves the drifting sheets; octave two
   * gets the full phase and is pure per-point shimmer.
   */
  vec3 flow(vec3 p, float t, float phase) {
    vec3 a1 = p * K1 + phase * 0.38;
    vec3 c1 = vec3(cos(a1.z + t * 1.3), cos(a1.x - t * 0.7), cos(a1.y + t));

    vec3 a2 = p * K2 + phase;
    vec3 c2 = vec3(cos(a2.z - t * 2.1), cos(a2.x + t * 1.7), cos(a2.y - t * 2.6));

    return c1 + c2 * 0.34;
  }

  void main() {
    float phase = aSeed.z * 6.2831853;
    vec3 p = position + flow(position, uTime * DRIFT_RATE, phase) * DRIFT;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);

    /* ---- cursor repulsion, resolved in screen space -------------------- */
    // Doing this in screen space rather than in world space is what makes it
    // read: a world-space sphere of influence around the cursor ray has no
    // fixed size on screen, so the same gesture parts the dust at one depth and
    // does nothing at another.
    //
    // clip here is only used to find where the point currently lands on
    // screen. gl_Position is projected AGAIN at the end, from the displaced
    // mv — reusing this value would compute the push and then throw it away.
    vec4 clip = projectionMatrix * mv;
    if (clip.w > 0.001 && uPointerActive > 0.001) {
      // Scale x by aspect so the influence is a circle in PIXELS, not an
      // ellipse stretched across a wide monitor. 1.0 here is half a viewport
      // height in both axes.
      vec2 d = (clip.xy / clip.w - uPointer) * vec2(uAspect, 1.0);
      float r2 = dot(d, d);

      // Strongest nearest the camera. A far point barely shifts on screen no
      // matter how hard it is pushed in world units, so spending the effect
      // there would be invisible; near the lens the same nudge is dozens of
      // pixels and reads as the field parting.
      float nearK = 1.0 - smoothstep(90.0, 760.0, -mv.z);
      // Gaussian, so the influence has no edge to notice.
      float halo = exp(-r2 * 3.2);
      float push = PUSH * halo * nearK * uPointerActive
                 * (0.30 + 0.70 * uPointerEnergy);

      // View-space X and Y project to pixels with the SAME coefficient
      // (P11 * height / 2 / -z), so a pixel-space direction can be applied
      // straight to mv.xy with no change of basis.
      mv.xy += normalize(d + vec2(1e-5)) * push;
    }

    float depth = -mv.z;

    /* ---- fades --------------------------------------------------------- */
    float fade = uFade;

    // Points crossing the lens would otherwise streak across the type.
    fade *= smoothstep(6.0, 70.0, depth);

    // Its own distance fade rather than the scene's FogExp2 — a custom
    // ShaderMaterial gets no fog chunks anyway, and the exponential-squared
    // curve would erase the field a long way before the far end of the volume,
    // which is the one region that exists to say the dark keeps going. This
    // fade is driven from the live camera far plane, because a fade that
    // finishes outside the frustum is clipped instead of faded: a dead straight
    // edge across the void at whatever brightness the points happened to have.
    fade *= 1.0 - smoothstep(uFadeNear, uFadeFar, depth);

    // Thinning past the crossover. The rank is stable per point, so the field
    // loses individual specks and keeps the rest at full strength — it never
    // dims as a sheet and it never hard-cuts. At uThin = 1 roughly a fifth of
    // the field is still there.
    float cut = uThin * 0.78;
    fade *= smoothstep(cut - 0.14, cut, aSeed.w);
    fade *= mix(1.0, 0.62, uThin);

    /* ---- colour -------------------------------------------------------- */
    vec3 c = mix(uAccent, uAccent2, aSeed.x);
    // Desaturate toward grey at EQUAL luminance, so draining the colour does
    // not also change how bright the field is. A plain mix toward vec3(0.5)
    // would lift the dark end and flatten the whole thing.
    float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(grey), c, uSaturation);

    // Dim, and dimmer for the smaller specks, which is how real depth-of-field
    // dust behaves and it keeps the field from ever competing with a node.
    vColor = c * (0.16 + 0.12 * aSeed.y);
    vAlpha = fade;

    gl_Position = projectionMatrix * mv;
    // The brief's formula. The clamp is not decoration: unclamped, a point a
    // few units from the lens becomes a screen-filling additive blob directly
    // over the editorial column — the same failure the record cloud's instance
    // sizes were tuned down to avoid.
    float px = aSeed.y * uScale / max(depth, 1.0);
    gl_PointSize = clamp(px, 0.55, 4.6) * uPixelRatio;

    if (vAlpha < 0.0025) {
      // Push behind the far plane so it is clipped outright. A zero point size
      // is not reliably a no-op across drivers.
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      gl_PointSize = 0.0;
    }
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec3  vColor;
  varying float vAlpha;

  /**
   * Linear working space -> sRGB.
   *
   * three converts a CSS hex into its linear working space when the Color is
   * constructed, and a custom ShaderMaterial receives none of the renderer's
   * automatic output encoding. Writing the linear value straight out would put
   * the field on screen markedly darker and more saturated than the identical
   * hex on the canyon walls, which do get the encoding.
   */
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, pow(c, vec3(0.4166667)) * 1.055 - 0.055,
               step(0.0031308, c));
  }

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    // Discard outside the disc rather than fading to zero alpha. At one or two
    // pixels an additive square reads unmistakably as a square, and thousands
    // of squares read as a noise texture laid over the lens instead of as dust
    // suspended in the scene.
    if (r2 > 0.25) discard;

    // Gaussian core, offset so it reaches exactly zero at the rim (exp(-2.75)
    // = 0.0639) and rescaled so the centre is still 1. Subtracting instead of
    // relying on the discard removes the faint hard ring the cutoff leaves.
    float a = max(0.0, exp(-r2 * 11.0) - 0.0639) * 1.0683;

    gl_FragColor = vec4(toSRGB(vColor), a * vAlpha);
  }
`;

/* ──────────────────────────────────────────────────────────── reduced motion ── */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const getReduced = () => window.matchMedia(REDUCED_QUERY).matches;
const getReducedServer = () => false;

/* ───────────────────────────────────────────────────────────────── the field ── */

export interface ElectronFieldProps {
  accent: string;
  accent2: string;
  /** Point count. Cost is one draw call regardless; this is a fill-rate dial. */
  count?: number;
  /**
   * Scroll progress at which Movement I hands over. Past it the field thins and
   * its colour drains, so Movement II owns the frame.
   */
  crossover?: number;
  /**
   * Optional external colour drain, 1 = full colour. Multiplies the drain the
   * crossover already applies, so a caller that wants the archive fully grey can
   * say so without also having to move the crossover.
   */
  saturation?: number;
}

/** Deterministic PRNG. The field must be identical on every mount — a cloud
 *  that reshuffles when React remounts the tree reads as a glitch. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGeometry(count: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const rnd = mulberry32(0x5eed1a11);

  const spanY = Y_HI - Y_LO;
  const spanZ = Z_NEAR - Z_FAR; // positive: Z_FAR is deep negative

  for (let i = 0; i < count; i++) {
    // Uniform through the whole box, on purpose. Any clustering in an ambient
    // field starts to read as density, and density is what the record cloud
    // encodes — so this one stays flat.
    positions[i * 3] = (rnd() * 2 - 1) * HALF_X;
    positions[i * 3 + 1] = Y_LO + rnd() * spanY;
    positions[i * 3 + 2] = Z_NEAR - rnd() * spanZ;

    seeds[i * 4] = rnd();
    // Skewed hard toward the small end: pow(u, 2.4) puts most of the field at
    // the bottom of the size range and leaves a sparse scatter of slightly
    // larger specks to catch the eye. A uniform size range reads as a grid.
    seeds[i * 4 + 1] = 0.55 + Math.pow(rnd(), 2.4) * 1.15;
    seeds[i * 4 + 2] = rnd();
    // Drawn from the same stream as the position, so the thinning rank is
    // uncorrelated with depth: thinning removes specks evenly through the
    // volume instead of eating the field from one end.
    seeds[i * 4 + 3] = rnd();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.computeBoundingSphere();
  return geometry;
}

export default function ElectronField({
  accent,
  accent2,
  count = DEFAULT_COUNT,
  crossover = 1,
  saturation = 1,
}: ElectronFieldProps) {
  const { size, viewport } = useThree();
  // Read as an external store, matching Stage: toggling the OS setting drops
  // the field live rather than needing a reload.
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getReducedServer);

  // Nothing is built under Reduce Motion. The whole component is drift.
  const geometry = useMemo(
    () => (reduced ? null : buildGeometry(Math.max(0, Math.floor(count)))),
    [count, reduced],
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPointerEnergy: { value: 0 },
      uPointerActive: { value: 0 },
      uAspect: { value: 1 },
      uFade: { value: 0 },
      uThin: { value: 0 },
      uSaturation: { value: 1 },
      // CSS px x world units. At 320 units of depth a size-1 speck is ~2.4 CSS
      // px. Fixed rather than scaled by viewport height on purpose: dust is
      // sized in pixels, and letting it grow with the window would coarsen the
      // field on a large display exactly where there is most of it on screen.
      uScale: { value: 780 },
      uPixelRatio: { value: 1 },
      uFadeNear: { value: 1000 },
      uFadeFar: { value: 2350 },
      uAccent: { value: new THREE.Color(accent) },
      uAccent2: { value: new THREE.Color(accent2) },
    }),
    // Built once; every value is driven per-frame below. Rebuilding this object
    // would swap the uniforms out from under a compiled program.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        // Additive so overlapping specks sum into a faint haze instead of
        // punching holes in one another, and no depth write so 3500 sprites do
        // not need sorting.
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [uniforms],
  );

  // A useMemo'd geometry or material that is replaced and not disposed keeps its
  // GPU buffers and its compiled program for the life of the context.
  useEffect(() => () => { geometry?.dispose(); }, [geometry]);
  useEffect(() => () => { material.dispose(); }, [material]);

  // Props are mirrored into refs from an effect rather than read in useFrame's
  // closure, so the per-frame targets are always current without the component
  // resubscribing, and without a ref write during render.
  const targets = useRef({
    accent: new THREE.Color(accent),
    accent2: new THREE.Color(accent2),
    crossover,
    saturation,
  });
  useEffect(() => {
    targets.current.accent.set(accent);
    targets.current.accent2.set(accent2);
    targets.current.crossover = crossover;
    targets.current.saturation = saturation;
  }, [accent, accent2, crossover, saturation]);

  /* eslint-disable react-hooks/immutability -- Per-frame uniform mutation is
     the r3f pattern; routing these through setState would re-render the tree
     sixty times a second. */
  useFrame((state, delta) => {
    if (!geometry) return;

    const dt = Math.min(delta, 1 / 30);
    uniforms.uTime.value += dt;

    // Two damping rates: slow for the state that should feel like weather,
    // faster for the pointer so following the cursor still feels attached.
    const kSlow = Math.min(1, Math.max(dt, 1 / 240) * 4);
    const kFast = Math.min(1, Math.max(dt, 1 / 240) * 9);

    /* ---- entrance and handover ---------------------------------------- */
    const p = scrollState.progress;
    const { crossover: cross, saturation: sat } = targets.current;

    // In over the first few percent. The field is the bed everything else sits
    // on, so it arrives before the canyon does rather than with it.
    const entrance = smooth01((p - 0.002) / 0.04);
    // Past the crossover: thin and drain. Starts just before, so Movement II
    // is not handed a full-strength field on its first frame.
    const past = cross >= 1 ? 0 : smooth01((p - (cross - 0.05)) / 0.12);

    uniforms.uFade.value += (entrance - uniforms.uFade.value) * kSlow;
    uniforms.uThin.value += (past - uniforms.uThin.value) * kSlow;
    // The two drains multiply: the crossover takes the field most of the way to
    // grey on its own, and an explicit `saturation` can finish the job.
    const satTarget = sat * (1 - past * 0.7);
    uniforms.uSaturation.value += (satTarget - uniforms.uSaturation.value) * kSlow;

    /* ---- pointer ------------------------------------------------------- */
    // A coarse or absent pointer never sets `active`, and neutral there means
    // "no influence at all" rather than "influence at the screen centre".
    const px = pointerState.active ? pointerState.nx : 0;
    const py = pointerState.active ? pointerState.ny : 0;
    uniforms.uPointer.value.x += (px - uniforms.uPointer.value.x) * kFast;
    uniforms.uPointer.value.y += (py - uniforms.uPointer.value.y) * kFast;
    uniforms.uPointerEnergy.value +=
      (pointerState.energy - uniforms.uPointerEnergy.value) * kFast;
    uniforms.uPointerActive.value +=
      ((pointerState.active ? 1 : 0) - uniforms.uPointerActive.value) * kSlow;

    /* ---- viewport and frustum ------------------------------------------ */
    uniforms.uAspect.value = size.height > 0 ? size.width / size.height : 1;
    uniforms.uPixelRatio.value = viewport.dpr;

    // Read the live far plane instead of hardcoding the fade range: the page
    // sets `far` from the deepest month any record occupies (see
    // canyon-space.farPlaneFor), so a literal here would be stale the moment a
    // longer follow-up lands, and the field would be clipped mid-brightness.
    const far = (state.camera as THREE.PerspectiveCamera).far || 2400;
    uniforms.uFadeNear.value = far * 0.42;
    uniforms.uFadeFar.value = far * 0.98;

    /* ---- colour -------------------------------------------------------- */
    // Eased, not snapped: an act change must not read as a cut in a field that
    // is otherwise continuous.
    const kColor = Math.min(1, dt * 2.2);
    uniforms.uAccent.value.lerp(targets.current.accent, kColor);
    uniforms.uAccent2.value.lerp(targets.current.accent2, kColor);
  });
  /* eslint-enable react-hooks/immutability */

  if (!geometry) return null;

  return (
    // Never culled: the volume always contains the camera, so a bounding-sphere
    // test can only ever cost time here.
    <points geometry={geometry} material={material} frustumCulled={false} />
  );
}

/** Clamp to 0-1 and ease both ends, so a ramp has no corners. */
function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
