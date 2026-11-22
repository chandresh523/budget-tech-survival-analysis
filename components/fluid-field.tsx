'use client';

/**
 * WebGL fluid layer — liquid mercury beneath the instrument glass.
 *
 * A full Navier-Stokes solve is overkill for a background and the Skeuomorphism
 * style spec already warns that this aesthetic costs performance. Instead this
 * advects a domain-warped FBM field and drives it with a smoothed pointer
 * velocity, which reads as viscous metal without ping-ponging framebuffers.
 *
 * Guardrails, because a background must never be why the dashboard stutters:
 *   - skipped entirely when prefers-reduced-motion is set, or WebGL is absent
 *   - device pixel ratio capped (fragment cost scales with its square)
 *   - frame loop paused when the tab is hidden
 *   - alpha:true so the CSS chassis gradient shows through, per the
 *     ui-ux-pro-max Three.js "Alpha Canvas Plus CSS Background" guideline
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform vec2  uRes;
  uniform vec2  uPointer;   // normalised, smoothed
  uniform float uEnergy;    // pointer speed -> turbulence
  uniform float uScroll;

  // -- value noise + fbm -----------------------------------------------------
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
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
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.02 + vec2(11.3, 7.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Correct for aspect so the flow is not stretched on wide viewports.
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);

    float t = uTime * 0.055;

    // Pull the field toward the pointer; falls off smoothly so there is no
    // visible edge to the interaction.
    vec2 toPointer = p - (uPointer - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float grip = exp(-dot(toPointer, toPointer) * 3.4);

    // Domain warping: displace the sample position by another noise field.
    // Two levels give the slow folding characteristic of a viscous liquid.
    vec2 q = vec2(fbm(p * 1.7 + vec2(0.0, t)), fbm(p * 1.7 + vec2(4.2, -t)));
    vec2 r = vec2(
      fbm(p * 1.7 + 3.1 * q + vec2(1.7, 9.2) + t * 0.7),
      fbm(p * 1.7 + 3.1 * q + vec2(8.3, 2.8) - t * 0.6)
    );

    // Pointer energy adds local turbulence, as if stirred.
    r += toPointer * grip * (0.35 + uEnergy * 1.5);

    float f = fbm(p * 1.9 + 3.4 * r + vec2(0.0, uScroll * 0.25));
    f = f * 0.5 + 0.5;

    // -- Liquid metal ramp ---------------------------------------------------
    // Dark graphite base through steel to a brass sheen at the crests, so the
    // fluid belongs to the same material family as the chassis.
    vec3 deep   = vec3(0.043, 0.047, 0.055);
    vec3 steel  = vec3(0.129, 0.145, 0.169);
    vec3 chrome = vec3(0.286, 0.318, 0.361);
    vec3 brass  = vec3(0.910, 0.639, 0.239);
    vec3 violet = vec3(0.545, 0.420, 1.000);

    vec3 col = mix(deep, steel, smoothstep(0.18, 0.52, f));
    col = mix(col, chrome, smoothstep(0.52, 0.74, f));

    // Sharp specular crests — the giveaway that a surface is metal.
    float crest = smoothstep(0.80, 0.95, f);
    col = mix(col, brass, crest * 0.55);

    // Cool rim in the troughs keeps it from reading as uniformly warm.
    col = mix(col, violet, smoothstep(0.30, 0.06, f) * 0.16);

    // Brighten where the pointer is, as though the liquid catches the light.
    col += brass * grip * (0.05 + uEnergy * 0.28);

    // Vignette so the panel chrome above it stays the focus.
    float vig = smoothstep(1.25, 0.28, length(p));
    col *= 0.42 + 0.58 * vig;

    // Modest alpha: this sits *under* the instrument, never competing with it.
    float alpha = 0.72 * vig + 0.10;
    gl_FragColor = vec4(col, alpha);
  }
`;

function FluidPlane({ intensity }: { intensity: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  // Pointer state kept in refs: this updates every mousemove and must never
  // trigger a React render.
  const pointer = useRef(new THREE.Vector2(0.5, 0.5));
  const smoothed = useRef(new THREE.Vector2(0.5, 0.5));
  const energy = useRef(0);
  const scroll = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uEnergy: { value: 0 },
      uScroll: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      pointer.current.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scroll.current = max > 0 ? window.scrollY / max : 0;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    // Writing into a three.js uniform is how r3f passes data to the GPU: the
    // uniform belongs to the material, not to React state.
    uniforms.uRes.value.set(size.width, size.height);
  }, [size, uniforms]);

  /* eslint-disable react-hooks/immutability -- Everything below runs once per
     animation frame. Uniform and ref mutation is the required r3f pattern here:
     routing 60fps values through setState would re-render the tree every frame
     and defeat the purpose of using WebGL at all. */
  useFrame((_state, delta) => {
    if (!material.current) return;
    // Clamp delta: after a tab regains focus it can be seconds long, which
    // would jump the animation forward violently.
    const dt = Math.min(delta, 1 / 30);

    const prev = smoothed.current.clone();
    // Critically-damped follow gives the pointer weight, like stirring syrup.
    smoothed.current.lerp(pointer.current, 1 - Math.pow(0.0015, dt));
    const travelled = smoothed.current.distanceTo(prev) / dt;

    // Decay toward rest so turbulence fades once the pointer stops.
    energy.current += (Math.min(travelled * 0.4, 1) - energy.current) * (1 - Math.pow(0.02, dt));

    uniforms.uTime.value += dt;
    uniforms.uPointer.value.copy(smoothed.current);
    uniforms.uEnergy.value = energy.current * intensity;
    uniforms.uScroll.value = scroll.current;
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <mesh frustumCulled={false}>
      {/* A 2x2 plane in clip space covers the viewport with one draw call. */}
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Cheap static stand-in used when WebGL or motion is unavailable. */
function FluidFallback() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        backgroundImage:
          'radial-gradient(70% 55% at 28% 22%, rgba(232,163,61,0.13) 0%, rgba(11,12,14,0) 62%),' +
          'radial-gradient(60% 50% at 78% 68%, rgba(139,107,255,0.13) 0%, rgba(11,12,14,0) 60%),' +
          'radial-gradient(90% 70% at 50% 100%, rgba(34,201,232,0.07) 0%, rgba(11,12,14,0) 65%)',
      }}
    />
  );
}

export default function FluidField({ intensity = 1 }: { intensity?: number }) {
  // 'probing' until we know whether WebGL and motion are both available, so we
  // never flash a canvas we are about to discard.
  const [mode, setMode] = useState<'probing' | 'webgl' | 'fallback'>('probing');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Both branches depend on
       browser capabilities (matchMedia, WebGL context creation) that do not
       exist during SSR, so this cannot be derived in a useState initialiser.
       It runs exactly once on mount and settles; there is no cascade. */
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setMode('fallback');
      return;
    }
    // Probe on a throwaway canvas: constructing the real one only to find it
    // unsupported leaves a dead context behind.
    let supported = false;
    try {
      const probe = document.createElement('canvas');
      supported = Boolean(
        probe.getContext('webgl2') ||
          probe.getContext('webgl') ||
          probe.getContext('experimental-webgl'),
      );
    } catch {
      supported = false;
    }
    setMode(supported ? 'webgl' : 'fallback');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (mode === 'probing') return null;
  if (mode === 'fallback') return <FluidFallback />;

  return (
    // r3f sizes its canvas from a ResizeObserver. The explicit size-full rules
    // guarantee the canvas fills the viewport even if that observer has not
    // reported yet, instead of leaving it at the 300x150 HTML default.
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 [&>div]:size-full [&_canvas]:size-full! [&_canvas]:block!"
    >
      <Canvas
        // alpha:true — the CSS chassis gradient provides the base colour.
        gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
        // Fragment cost scales with the square of DPR; 1.75 is plenty for a
        // soft background and saves ~45% of pixels on a 3x display.
        dpr={[1, 1.75]}
        // Stop rendering entirely while the tab is hidden — a backgrounded
        // shader burning GPU is pure waste and drains battery.
        frameloop={visible ? 'always' : 'never'}
        orthographic
        camera={{ position: [0, 0, 1], zoom: 1 }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <FluidPlane intensity={intensity} />
      </Canvas>
    </div>
  );
}
