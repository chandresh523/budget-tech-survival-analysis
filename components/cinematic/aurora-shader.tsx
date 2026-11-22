'use client';

/**
 * The persistent background — a fluid aurora, not a gradient.
 *
 * Three ideas stacked, and the order matters:
 *
 *  1. FBM (fractal Brownian motion) — five octaves of value noise. This alone
 *     is cloud, not liquid: it has detail but no flow.
 *  2. DOMAIN WARPING — feed the noise field back into its own sample position,
 *     twice (Iñigo Quílez's q/r construction). Warping the domain rather than
 *     the output is what produces the folded, sheared filaments that read as a
 *     liquid being stirred. One level looks like smoke; two looks like fluid.
 *  3. CURL-ISH ADVECTION — offset the second warp by the perpendicular of the
 *     first. A true curl field needs the noise gradient; using the perpendicular
 *     is the cheap approximation and it is visually indistinguishable here,
 *     for a fraction of the cost.
 *
 * Colour is not a palette lookup. `uHeat` (statistical intensity — event rate,
 * significance) rotates the whole ramp from deep indigo/cyan through violet to
 * magenta/amber, and `uEnergy` (scroll velocity) raises contrast, sharpens the
 * filament crests and opens a chromatic split at the edges. So the background
 * literally reports both what you are looking at and how fast you are moving.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { scrollState } from '@/lib/scroll-engine';
import { pointerState } from '@/lib/pointer-state';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Fullscreen triangle in clip space — no camera involvement, no matrices.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform vec2  uRes;
  uniform float uHeat;     // 0-1 statistical intensity
  uniform float uEnergy;   // 0-1 scroll velocity
  uniform float uProgress; // 0-1 document progress
  uniform vec3  uAccent;
  uniform vec3  uAccent2;
  uniform vec2  uPointer;    // -1..1 screen space, 0 at centre
  uniform float uHold;       // 0-1 eased pointer-held
  uniform float uPointerE;   // 0-1 damped pointer speed
  uniform float uSaturation; // 1 in Movement I, 0 in the monochrome archive
  uniform float uLevel;      // overall backdrop gain, per route

  // ---- value noise -------------------------------------------------------
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Quintic fade: C2 continuous, so the field has no visible grid creases
    // where cells meet. Cubic smoothstep leaves faint seams at this scale.
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(
      mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    // Irrational lacunarity + a rotation per octave stops the octaves lining
    // up into visible axis-aligned streaks.
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.03 + vec2(9.1, 3.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    // Aspect-correct so the flow is not stretched on wide viewports.
    vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);

    // The field follows the cursor.
    //
    // Two separate effects, because one alone reads as either a gimmick or as
    // nothing. A whole-field translation makes the liquid feel dragged along
    // with the pointer; a local radial bulge makes it feel displaced BY the
    // pointer, like something moving through it. The bulge falls off on a
    // smoothstep so there is no visible edge to the influence.
    vec2 aimed = uPointer * vec2(uRes.x / uRes.y, 1.0);
    p += uPointer * 0.12;
    vec2 toPointer = p - aimed;
    float grip = smoothstep(0.85, 0.0, length(toPointer));
    p += normalize(toPointer + 1e-6) * grip * (0.06 + 0.16 * uHold + 0.10 * uPointerE);

    float t = uTime * (0.045 + uEnergy * 0.09);

    // ---- domain warp, level 1 ---------------------------------------------
    vec2 q = vec2(
      fbm(p * 1.5 + vec2(0.0, t)),
      fbm(p * 1.5 + vec2(5.2, 1.3 - t))
    );

    // ---- domain warp, level 2, advected along the perpendicular of q ------
    // perp(q) is the cheap stand-in for a curl field; it shears the second
    // warp across the first instead of along it, which is what folds the
    // filaments over one another.
    vec2 perp = vec2(-q.y, q.x);
    vec2 r = vec2(
      fbm(p * 1.5 + 3.4 * q + 1.1 * perp + vec2(1.7, 9.2) + 0.4 * t),
      fbm(p * 1.5 + 3.4 * q + 1.1 * perp + vec2(8.3, 2.8) - 0.35 * t)
    );

    float f = fbm(p * 1.7 + 3.8 * r + vec2(0.0, uProgress * 0.6));
    f = f * 0.5 + 0.5;

    // Filament term: the thin bright veins between the broad masses.
    float fil = 1.0 - abs(f * 2.0 - 1.0);
    fil = pow(fil, 3.0 + uEnergy * 5.0);

    // ---- colour ------------------------------------------------------------
    // Overall gain, now a uniform rather than a constant.
    //
    // It is a backdrop for text AND for additive geometry: the canyon and the
    // record field can only ADD light on top of this, so lit too brightly the
    // backdrop swallows them and the world flattens into one wash. The dive wants
    // it lower than the story page does — the dive stacks canyon walls, crests
    // and a record field over it, and all of that adds up under the editorial
    // type. Hence a per-route value instead of one number for both.
    float BACKDROP_LEVEL = uLevel;
    // Heat rotates the ramp; it is not a lookup, so the transition between
    // statistical contexts is continuous rather than a cut.
    vec3 cold  = vec3(0.031, 0.024, 0.086);          // near-void
    vec3 deep  = mix(vec3(0.05, 0.14, 0.36), vec3(0.24, 0.06, 0.34), uHeat);
    vec3 mid   = mix(uAccent, uAccent2, 0.35 + 0.45 * uHeat);
    vec3 hot   = mix(uAccent2, vec3(1.0, 0.52, 0.22), uHeat);

    vec3 col = mix(cold, deep, smoothstep(0.10, 0.48, f));
    col = mix(col, mid, smoothstep(0.42, 0.72, f));
    col = mix(col, hot, smoothstep(0.70, 0.94, f) * (0.45 + uHeat * 0.55));

    // Filaments carry the accent as emitted light.
    col += mix(uAccent, uAccent2, uHeat) * fil * (0.22 + uEnergy * 0.55);

    // ---- chromatic split at speed -----------------------------------------
    // Sampling the field again at a small offset per channel is cheaper than a
    // post pass and only shows when it should: at the rim, at speed.
    if (uEnergy > 0.01) {
      float rim = length(p) * 0.5;
      float sep = uEnergy * 0.012 * rim;
      float fr = fbm(p * 1.7 + 3.8 * r + vec2(sep, 0.0));
      float fb = fbm(p * 1.7 + 3.8 * r - vec2(sep, 0.0));
      col.r += (fr - f + 0.5) * uEnergy * 0.10;
      col.b += (fb - f + 0.5) * uEnergy * 0.10;
    }

    // Legibility. The editorial column sits dead centre, so the field is
    // calmed there and allowed to bloom toward the rim.
    //
    // This was inverted: vig is 1 at the CENTRE, so (0.36 + 0.64 * vig) put
    // peak brightness directly behind the type and dimmed the rim -- the exact
    // opposite of the stated intent. It went unnoticed because the canvas was
    // hidden behind the body background and never reached the screen.
    float centre = smoothstep(1.15, 0.15, length(p));
    col *= BACKDROP_LEVEL * (1.0 - 0.62 * centre);

    // A hard vignette once the archive begins.
    //
    // uSaturation already runs 1 -> 0 across the crossover, so it doubles as
    // "how far into the archive are we" and no second uniform is needed. The
    // archive is plates and long-form type rather than a landscape to fly
    // through, and it wants the frame closed down: attention pulled to the
    // centre, the rim pushed to near-black. Much stronger than Movement I's
    // gentle centre-calm, which exists only to keep a headline legible.
    float archive = 1.0 - clamp(uSaturation, 0.0, 1.0);
    float rim = smoothstep(0.15, 1.25, length(p));
    col *= 1.0 - archive * rim * 0.94;

    // A slow breath, so the backdrop is alive even when nothing is moving.
    // Deliberately shallow: anything stronger and the type appears to throb.
    col *= 0.94 + 0.06 * sin(uTime * 0.55) + 0.05 * uEnergy;

    // Drain to greyscale for the monochrome archive. Rec.709 luma rather than a
    // channel average, or the cyans and violets would not fall to the same grey
    // and the transition would shift hue as it desaturates.
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(luma), col, clamp(uSaturation, 0.0, 1.0));

    // Ordered dither. Sub-LSB noise breaks the banding that big smooth
    // gradients show on 8-bit displays; without it the aurora is ringed.
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (dither - 0.5) / 255.0;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface AuroraProps {
  /** 0-1 statistical intensity. Rotates the colour ramp. */
  heat: number;
  accent: string;
  accent2: string;
  /** 1 = full colour, 0 = greyscale. Acts as a CEILING; the actual value is
   *  driven continuously by scroll across the crossover. */
  saturation?: number;
  /** Scroll progress at which the archive begins. */
  crossover?: number;
  /** Overall backdrop gain. Lower where geometry and type stack over it. */
  level?: number;
}

export default function Aurora({
  heat, accent, accent2, saturation = 1, crossover = 1, level = 0.5,
}: AuroraProps) {
  const { size } = useThree();
  // Props are mirrored into refs from an effect, not during render: useFrame
  // needs the latest value every frame without the component re-subscribing,
  // but writing a ref while rendering is the anti-pattern the lint rule flags.
  const heatRef = useRef(heat);
  useEffect(() => {
    heatRef.current = heat;
  }, [heat]);
  const saturationRef = useRef(saturation);
  useEffect(() => {
    saturationRef.current = saturation;
  }, [saturation]);
  const crossoverRef = useRef(crossover);
  useEffect(() => {
    crossoverRef.current = crossover;
  }, [crossover]);
  const levelRef = useRef(level);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uHeat: { value: heat },
      uEnergy: { value: 0 },
      uProgress: { value: 0 },
      uAccent: { value: new THREE.Color(accent) },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uHold: { value: 0 },
      uPointerE: { value: 0 },
      uSaturation: { value: 1 },
      // Seeded from the prop, not a literal. The per-frame ease only converges
      // while frames are actually running, so a hardcoded initial value is what
      // the first paint shows — and on a throttled tab, what it keeps showing.
      uLevel: { value: level },
      uAccent2: { value: new THREE.Color(accent2) },
    }),
    // Intentionally built once; every value below is driven per-frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const target = useRef({ accent: new THREE.Color(accent), accent2: new THREE.Color(accent2) });
  useEffect(() => {
    target.current.accent.set(accent);
    target.current.accent2.set(accent2);
  }, [accent, accent2]);

  /* eslint-disable react-hooks/immutability -- Uniform mutation once per frame
     is how r3f feeds the GPU; setState here would re-render at 60fps. */
  useFrame((_s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    uniforms.uTime.value += dt;
    uniforms.uRes.value.set(size.width, size.height);
    uniforms.uEnergy.value = scrollState.energy;
    uniforms.uProgress.value = scrollState.progress;

    // Ease the pointer into the uniform rather than assigning it raw: the field
    // should feel like it has inertia, and a raw assignment makes fast mouse
    // moves snap the whole backdrop.
    const pt = uniforms.uPointer.value as THREE.Vector2;
    pt.x += (pointerState.nx - pt.x) * Math.min(1, dt * 3.4);
    pt.y += (pointerState.ny - pt.y) * Math.min(1, dt * 3.4);
    uniforms.uHold.value += (pointerState.holding - uniforms.uHold.value) * Math.min(1, dt * 4);
    uniforms.uPointerE.value += (pointerState.energy - uniforms.uPointerE.value)
      * Math.min(1, dt * 4);
    // Colour drains as a continuous function of scroll, not on a state flip.
    //
    // It used to ease toward a boolean the page toggled at the crossover, which
    // meant the drain — and the vignette that rides on it — arrived as a single
    // timed event a moment AFTER the reader crossed, wherever they happened to
    // be. Ramping it over a band of scroll instead means the darkening tracks the
    // scrollbar: it begins before the archive and finishes just inside it, and
    // scrolling back up takes the colour back out at exactly the same rate.
    //
    // The band is deliberately wide and smoothstepped. A short ramp reads as a
    // cut no matter how it is eased.
    const band = 0.30;
    const crossover = crossoverRef.current;
    const t = crossover >= 1 ? 0
      : Math.min(1, Math.max(0, (scrollState.progress - (crossover - band * 0.55)) / band));
    const smooth = t * t * (3 - 2 * t);
    // Named satTarget, not target: `target` is already the accent-colour ref in
    // this scope, and shadowing it silently broke the colour lerp below.
    const satTarget = Math.min(saturationRef.current, 1 - smooth);
    uniforms.uSaturation.value += (satTarget - uniforms.uSaturation.value)
      * Math.min(1, dt * 3.2);
    // Ease heat and colour rather than snapping: a hard cut between chapters
    // would read as a glitch in a field that is otherwise continuous.
    uniforms.uLevel.value += (levelRef.current - uniforms.uLevel.value) * Math.min(1, dt * 3);
    uniforms.uHeat.value += (heatRef.current - uniforms.uHeat.value) * Math.min(1, dt * 2.2);
    uniforms.uAccent.value.lerp(target.current.accent, Math.min(1, dt * 2.2));
    uniforms.uAccent2.value.lerp(target.current.accent2, Math.min(1, dt * 2.2));
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
