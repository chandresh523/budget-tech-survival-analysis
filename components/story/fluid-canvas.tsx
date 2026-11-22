'use client';

/**
 * The liquid behind the glass.
 *
 * One fullscreen fragment shader, no 3D scene. A domain-warped FBM field is
 * advected on its own clock and read out as iridescent bands blended between
 * the two live chapter accents, so the background is never decoration bolted
 * onto the story — it is the story's colour state, rendered.
 *
 * The whole thing is driven by two refs the scroll shell owns. Nothing here
 * reads React state per frame, and nothing here writes it: at 60fps a single
 * setState would re-render the tree under the entire dashboard and cost more
 * than the shader itself.
 *
 * Guardrails, because a background must never be the reason a statistics page
 * stutters or the reason someone gets motion sick:
 *   - prefers-reduced-motion gets a static CSS gradient and no WebGL context
 *   - device pixel ratio capped (fragment cost scales with its square)
 *   - frame loop stopped outright while the tab is hidden
 *   - frame delta clamped, so returning to a backgrounded tab does not
 *     fast-forward the fluid by however many seconds elapsed
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface FluidCanvasProps {
  /** 0-1 scroll progress through the story. */
  scrollRef: React.RefObject<number>;
  /** Live chapter state: the two accents to blend, and 0-1 transition velocity. */
  storyRef: React.RefObject<{ accent: string; accent2: string; velocity: number }>;
}

/**
 * A single triangle large enough to cover clip space. Cheaper than a quad —
 * no diagonal seam where two triangles double up on partial fragments — and it
 * needs no uv attribute, since uv falls straight out of the clip position.
 */
const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);

/** CHAPTERS[0]'s pair (#00c2d1 / #7c5cff), so the first frame is already in key. */
const OPENING_ACCENT = [0, 0.761, 0.82] as const;
const OPENING_ACCENT_2 = [0.486, 0.361, 1] as const;

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec2  uRes;
  uniform float uFlow;     // advection clock — runs faster while in transit
  uniform float uScroll;   // 0-1 page progress
  uniform float uVel;      // 0-1 smoothed transition velocity
  uniform vec3  uAccent;
  uniform vec3  uAccent2;

  const float TAU = 6.28318530718;

  // -- value noise + fbm ------------------------------------------------------
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
      // Irrational-ish lacunarity plus an offset keeps octaves from lining up
      // into a visible grid at the lattice points.
      p = p * 2.03 + vec2(11.3, 7.1);
      a *= 0.5;
    }
    return v;
  }

  /**
   * Colour of one band phase. The two accents are the extremes and the crest
   * blooms toward white — the read of oil on water rather than a flat gradient.
   */
  vec3 sheen(float ph) {
    float w = 0.5 + 0.5 * sin(ph);
    vec3 c = mix(uAccent, uAccent2, w);
    return c * (0.32 + 0.92 * w) + vec3(1.0) * pow(w, 14.0) * 0.30;
  }

  void main() {
    // Aspect-correct, so the flow is not stretched into ribbons on a wide
    // viewport, and offset by scroll so the fluid travels with the reader.
    vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    p.y += uScroll * 1.7;

    float t = uFlow;

    // Domain warping: displace the sample position by a second noise field,
    // twice. Two levels are what give the slow folding of something viscous;
    // one level only ever looks like drifting clouds.
    vec2 q = vec2(
      fbm(p * 1.25 + vec2(0.0, t * 0.35)),
      fbm(p * 1.25 + vec2(5.2, -t * 0.31))
    );

    // Velocity opens the warp amplitude: mid-transition the field folds harder
    // and faster, then settles as the reader arrives.
    float churn = 1.35 + uVel * 1.75;

    vec2 r = vec2(
      fbm(p * 1.25 + churn * q + vec2(1.7, 9.2) + t * 0.22),
      fbm(p * 1.25 + churn * q + vec2(8.3, 2.8) - t * 0.19)
    );

    float f = fbm(p * 1.6 + (2.1 + uVel * 1.3) * r) * 0.5 + 0.5;

    // Band phase. Folding r back in bends the bands along the flow instead of
    // leaving them as concentric contours of f.
    float ph = (f * 3.1 + r.x * 0.85) * TAU + t * 0.45;

    // Chromatic separation, split along the local flow direction so it reads as
    // the fluid smearing rather than as a fixed-axis lens fault. Phase-offset
    // per channel rather than three more fbm evaluations: same prism, 1/3 the
    // fragment cost. Vanishes entirely at rest.
    float sep = uVel * 0.20 * (0.75 + r.y);
    vec3 col = vec3(sheen(ph + sep).r, sheen(ph).g, sheen(ph - sep).b);

    // Depth: troughs fall away toward the void so the field has volume.
    col *= 0.26 + 0.98 * smoothstep(0.12, 0.94, f);

    // This sits *under* glass panels carrying real numbers. Keeping it near the
    // void end of the range is what preserves their contrast.
    vec3 base = vec3(0.012, 0.008, 0.039);
    col = base + col * 0.52;

    float vig = smoothstep(1.35, 0.22, length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));
    col *= 0.42 + 0.58 * vig;

    // Ordered-ish dither at 1/255. A dark, slowly-varying gradient is the worst
    // case for 8-bit output and bands visibly without it.
    float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (d - 0.5) / 255.0;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * three converts colours to its linear working space on assignment, but this
 * ShaderMaterial writes gl_FragColor straight to an sRGB canvas with no inverse
 * conversion applied. Round-tripping back out in sRGB hands the shader exactly
 * the values CSS is showing, so the fluid and the DOM cannot disagree about
 * what the chapter accent is. Accepts any CSS colour form three parses, since
 * the shell may publish something other than the raw hex from CHAPTERS.
 */
const cssScratch = new THREE.Color();
const rgbScratch = { r: 0, g: 0, b: 0 };

function readCssColor(css: string, out: THREE.Vector3): void {
  cssScratch.setStyle(css, THREE.SRGBColorSpace);
  cssScratch.getRGB(rgbScratch, THREE.SRGBColorSpace);
  out.set(rgbScratch.r, rgbScratch.g, rgbScratch.b);
}

/** Frame-rate independent exponential follow: `rate` is the fraction remaining after 1s. */
function follow(rate: number, dt: number): number {
  return 1 - Math.pow(rate, dt);
}

function FluidPlane({ scrollRef, storyRef }: FluidCanvasProps) {
  const { size } = useThree();

  // Targets are parsed only when the published string actually changes; the
  // uniforms then chase them, so a chapter's accent eases in rather than
  // snapping at the band boundary.
  const targetAccent = useRef(new THREE.Vector3(...OPENING_ACCENT));
  const targetAccent2 = useRef(new THREE.Vector3(...OPENING_ACCENT_2));
  const lastAccent = useRef('');
  const lastAccent2 = useRef('');
  const velocity = useRef(0);

  const uniforms = useMemo(
    () => ({
      uRes: { value: new THREE.Vector2(1, 1) },
      uFlow: { value: 0 },
      uScroll: { value: 0 },
      uVel: { value: 0 },
      uAccent: { value: new THREE.Vector3(...OPENING_ACCENT) },
      uAccent2: { value: new THREE.Vector3(...OPENING_ACCENT_2) },
    }),
    [],
  );

  useEffect(() => {
    // Writing into a three uniform is how r3f gets data to the GPU: the uniform
    // belongs to the material, not to React.
    uniforms.uRes.value.set(size.width, size.height);
  }, [size, uniforms]);

  /* eslint-disable react-hooks/immutability -- Everything below runs once per
     animation frame. Mutating uniforms and refs is the required r3f pattern:
     routing 60fps values through setState would re-render the whole dashboard
     every frame and defeat the point of using WebGL at all. */
  useFrame((_state, delta) => {
    // A backgrounded tab hands back a delta measured in seconds; unclamped that
    // would jump the fluid forward violently on return.
    const dt = Math.min(delta, 1 / 30);
    const story = storyRef.current;

    if (story.accent !== lastAccent.current) {
      lastAccent.current = story.accent;
      readCssColor(story.accent, targetAccent.current);
    }
    if (story.accent2 !== lastAccent2.current) {
      lastAccent2.current = story.accent2;
      readCssColor(story.accent2, targetAccent2.current);
    }

    // Smooth the published velocity as well as the colours: the shell samples it
    // from discrete scroll events, and the surge should feel like inertia rather
    // than track the wheel step for step.
    velocity.current += (story.velocity - velocity.current) * follow(0.004, dt);

    // The advection clock, not wall-clock time. Speeding this up is what makes
    // the field visibly surge in transit and settle on arrival — turbulence
    // alone would only look noisier, not faster.
    uniforms.uFlow.value += dt * (0.55 + velocity.current * 4.2);
    uniforms.uScroll.value = scrollRef.current;
    uniforms.uVel.value = velocity.current;
    uniforms.uAccent.value.lerp(targetAccent.current, follow(0.002, dt));
    uniforms.uAccent2.value.lerp(targetAccent2.current, follow(0.002, dt));
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <mesh frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[FULLSCREEN_TRIANGLE, 3]} />
      </bufferGeometry>
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

/**
 * Reduced-motion stand-in. Deliberately static and deliberately blind to
 * --accent: a full-viewport gradient that repainted on every scroll frame would
 * be exactly the pulsing the setting exists to prevent, even without WebGL.
 */
function StaticField() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 bg-void"
      style={{
        backgroundImage:
          'radial-gradient(78% 58% at 22% 14%, rgba(0,194,209,0.16) 0%, rgba(3,2,10,0) 62%),' +
          'radial-gradient(66% 54% at 82% 44%, rgba(124,92,255,0.16) 0%, rgba(3,2,10,0) 60%),' +
          'radial-gradient(96% 72% at 50% 104%, rgba(34,208,122,0.08) 0%, rgba(3,2,10,0) 66%)',
      }}
    />
  );
}

export default function FluidCanvas({ scrollRef, storyRef }: FluidCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  // 'probing' until we know whether motion and WebGL are both available, so we
  // never flash a canvas we are about to throw away.
  const [mode, setMode] = useState<'probing' | 'webgl' | 'static'>('probing');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* Both branches depend on browser capabilities — matchMedia and WebGL
       context creation — that do not exist during SSR, so neither can be
       derived in a useState initialiser. This settles on mount and on the rare
       media-query change; there is no cascade. */
    const decide = () => {
      if (motion.matches) {
        setMode('static');
        return;
      }
      // Probe on a throwaway canvas. Creating the real one only to discover it
      // is unsupported strands a dead context.
      let supported = false;
      try {
        const probe = document.createElement('canvas');
        supported = Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
      } catch {
        supported = false;
      }
      setMode(supported ? 'webgl' : 'static');
    };

    decide();
    motion.addEventListener('change', decide);
    return () => motion.removeEventListener('change', decide);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (mode !== 'webgl' || !el) return;
    /* r3f sizes its canvas from a ResizeObserver. Some embedded webviews never
       fire one, and r3f then leaves the canvas at the 300x150 HTML default and
       never creates the renderer — a silently blank background with no error in
       the console. react-use-measure also listens to window resize, so one nudge
       after mount recovers it. Harmless where the observer works: same size. */
    const id = window.setTimeout(() => {
      const canvas = el.querySelector('canvas');
      if (canvas && canvas.width <= 300) window.dispatchEvent(new Event('resize'));
    }, 250);
    return () => window.clearTimeout(id);
  }, [mode]);

  if (mode === 'probing') return null;
  if (mode === 'static') return <StaticField />;

  return (
    /* The fixed positioning lives on this wrapper, NOT on the Canvas. A Canvas
       that is itself `position: fixed` measures as 0 in r3f, so the renderer is
       never created, onCreated never fires, and nothing ever renders. */
    <div ref={host} aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-void">
      <Canvas
        gl={{ alpha: false, antialias: false, powerPreference: 'high-performance' }}
        // Fragment cost scales with the square of DPR, and this shader is all
        // fragment. 1.75 is indistinguishable on a soft field and saves ~45% of
        // the pixels on a 3x display.
        dpr={[1, 1.75]}
        // A shader burning GPU behind a hidden tab is pure battery drain.
        frameloop={visible ? 'always' : 'never'}
        orthographic
        camera={{ position: [0, 0, 1], zoom: 1 }}
      >
        <FluidPlane scrollRef={scrollRef} storyRef={storyRef} />
      </Canvas>
    </div>
  );
}
