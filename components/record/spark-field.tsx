'use client';

/**
 * The spark field — Movement II's colour.
 *
 * Movement II is deliberately monochrome: the record nodes drain to grey and the
 * electron field thins and desaturates so the archive reads as an archive. The
 * problem with that is that a greyscale void under slow parallax reads as *dead*
 * rather than as *quiet*. The fix cannot be to put the colour back into the data
 * — draining it is the whole point of the movement — so the colour returns as
 * something transparently NOT data: a few hundred saturated sparks and a handful
 * of tiny colour blocks, scattered through the frame at five depths.
 *
 * IT MUST BE IMPOSSIBLE TO MISTAKE ONE OF THESE FOR A MARK THAT MEANS SOMETHING.
 * There are two other point-like layers on screen, and this one is built to be
 * unlike both of them on every channel a viewer uses to read meaning:
 *
 *   vs. the RECORD NODES (components/cinematic/data-tunnel — the only real data)
 *     placement  camera-relative and angularly uniform, so a spark can never
 *                land in a lane or at a month; a node is pinned to laneX() and
 *                zForMonth(), which is what makes its position a claim.
 *     height     spread through the whole frustum, well above CREST_Y and below
 *                FLOOR_Y; nodes lie in a thin bed just above the canyon floor.
 *     form       additive sprites and flat billboard squares with no surface;
 *                nodes are lit, occluding, depth-writing spheres.
 *     motion     twinkle, tumble and wrap; a node never changes brightness and
 *                never leaves.
 *
 *   vs. the ELECTRON FIELD (components/cinematic/electron-field — decoration too)
 *     colour     saturated signal hues at full chroma. That field is greyed out
 *                by the same crossover this one fades in on, so in Movement II
 *                the sparks are the only chromatic thing in the frame.
 *     count      hundreds, not thousands: individually resolvable, never texture.
 *     shape      the resolvable sparks carry a four-arm flare, and the blocks are
 *                SQUARES. Nothing on this page that carries data is a square.
 *     pointer    leans TOWARD the cursor; the electron field is pushed AWAY from
 *                it. Opposite sign, so under a gesture the two layers visibly
 *                separate instead of moving as one sheet.
 *
 * Placement is entirely camera-relative and computed in the vertex shader from
 * uniforms, which is what lets this be a starfield rather than a volume the
 * camera eventually flies out of the back of. Each spark belongs to one of five
 * strata expressed as fractions of the LIVE far plane; within its stratum its
 * distance ahead of the camera wraps, at a per-stratum rate. Stratum 0 does not
 * follow the camera at all (full parallax, sweeps past); stratum 4 follows it at
 * 0.67, near enough to stationary. Five different rates is the whole depth cue.
 *
 * Draw calls: one THREE.Points for the sparks, one instanced quad batch for the
 * blocks. Every position is a vertex-shader computation — nothing here writes a
 * vector on the CPU, because a few hundred JS vector writes a frame is how a
 * scroll page starts dropping frames while the GPU sits idle.
 *
 * Renders nothing at all under prefers-reduced-motion. The component is drift and
 * twinkle; there is no reduced-motion version of it worth having.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { scrollState } from '@/lib/scroll-engine';
import { pointerState } from '@/lib/pointer-state';

/* ─────────────────────────────────────────────────────────────── palette ──── */

/**
 * The signal palette, straight from app/globals.css.
 *
 * Weighted so cyan and violet lead — they are the site's two accents and the
 * field has to belong to the page — but with a real third of the sparks in
 * amber, green and pink. A field of only the two accents reads as more of the
 * aurora; the warm and green picks are what make it read as *other*, which is
 * exactly the job in a grey frame.
 */
const SPARK_PALETTE: ReadonlyArray<readonly [string, number]> = [
  ['#00c2d1', 0.26], // --color-signal-cyan
  ['#7c5cff', 0.26], // --color-signal-violet
  ['#ffb020', 0.17], // --color-signal-amber
  ['#22d07a', 0.16], // --color-signal-green
  ['#ff4fa3', 0.15], // --color-signal-pink
];

/**
 * The blocks lean the other way.
 *
 * There are only a few dozen of them and they are the deliberate pops, so the
 * two house accents are the minority here and the warm/green picks carry them.
 * A block in cyan next to a cyan spark just looks like a spark that went wrong.
 */
const BLOCK_PALETTE: ReadonlyArray<readonly [string, number]> = [
  ['#ffb020', 0.28],
  ['#ff4fa3', 0.24],
  ['#22d07a', 0.22],
  ['#00c2d1', 0.14],
  ['#7c5cff', 0.12],
];

/* ─────────────────────────────────────────────────────────────── strata ──── */

interface Stratum {
  /** Band start, as a fraction of the camera's far plane. */
  nearF: number;
  /** Band depth, same units. */
  spanF: number;
  /** 0 = fully world-fixed (maximum parallax), 1 = locked to the camera (none). */
  follow: number;
  /** Size multiplier. */
  size: number;
  /** Alpha multiplier. */
  alpha: number;
  /** Share of the total count. */
  weight: number;
}

/**
 * Five strata, expressed as FRACTIONS OF THE LIVE FAR PLANE rather than in world
 * units.
 *
 * lib/canyon-space.farPlaneFor widens the frustum from the deepest month any
 * record occupies, so `camera.far` is data-dependent — 1600 for a panel that
 * ends at CANYON_END_MONTH, more than twice that once a curve carries a point at
 * 156 months. Literal distances here would then either be clipped outright (a
 * dead straight edge across the void — the exact bug the electron field's
 * uFadeNear/uFadeFar exist to avoid) or crammed into the front third of a
 * frustum that just got bigger. Fractions track it for free. The size law is
 * scaled by sqrt(far) for the same reason: see uScale below.
 *
 * The bands OVERLAP by design. A spark cross-fades at both ends of its band (it
 * can travel either way — scrolling back up reverses it), and contiguous bands
 * would put a dim seam at four fixed distances from the camera, which travels
 * with the camera and is very visible. Overlapping means each seam is filled by
 * its neighbour.
 *
 * Counts rise with depth so the on-screen density is roughly even — the near
 * bands subtend far more solid angle per spark — which leaves the big, flared
 * near sparks rare enough to feel like events.
 */
const STRATA: ReadonlyArray<Stratum> = [
  { nearF: 0.030, spanF: 0.105, follow: 0.00, size: 1.00, alpha: 1.00, weight: 0.11 },
  { nearF: 0.090, spanF: 0.165, follow: 0.13, size: 0.84, alpha: 0.90, weight: 0.17 },
  { nearF: 0.205, spanF: 0.225, follow: 0.29, size: 0.70, alpha: 0.78, weight: 0.22 },
  { nearF: 0.375, spanF: 0.265, follow: 0.47, size: 0.58, alpha: 0.66, weight: 0.24 },
  { nearF: 0.575, spanF: 0.285, follow: 0.67, size: 0.48, alpha: 0.54, weight: 0.26 },
];

/**
 * Default spark count.
 *
 * Only about a third of these are on screen at rest (see SPREAD_X/SPREAD_Y —
 * the field has to extend past the frustum edges so a held drag does not reveal
 * an empty margin), so this is roughly 220 visible sparks across five depths.
 * Enough to read as a starfield, few enough that each one is an object rather
 * than grain.
 */
const DEFAULT_COUNT = 640;

/** Blocks are the garnish, not the dish. Derived from the spark count so one
 *  dial moves both and the ratio cannot drift. */
const BLOCK_RATIO = 0.055;
const BLOCK_CAP = 44;

/* ─────────────────────────────────────────────────────────────── shaders ──── */

/**
 * Shared placement chunk — the wrap, the angular layout and the pointer lean.
 *
 * Both vertex shaders include this verbatim so the sparks and the blocks cannot
 * drift apart: if the two ever disagreed about where a band is, the blocks would
 * parallax at a different rate from the sparks around them and the illusion of
 * one field at five depths would come apart.
 *
 * No backticks anywhere inside these GLSL blocks. They are template literals; a
 * stray backtick in a comment terminates the string, and the failure mode is a
 * mangled shader rather than a clean error.
 */
const PLACEMENT = /* glsl */ `
  uniform float uFar;      // live camera far plane, world units
  uniform vec3  uCam;      // camera world position
  uniform float uTanHalf;  // tan(fov / 2)
  uniform float uAspect;   // width / height
  uniform vec2  uPointer;  // smoothed pointerState.nx/ny, -1..1
  uniform float uPointerEnergy;
  uniform float uPointerActive;

  /**
   * How far past the frustum edges the field extends, in half-extents.
   *
   * NOT 1.0. camera-rig lets a held drag yaw the camera by YAW_LIMIT = 0.46 rad
   * and pitch it by PITCH_LIMIT = 0.3, on a 62 degree vertical fov. Laterally
   * that is tan(0.46) / tan(31 deg) = 0.83 extra half-widths, and vertically
   * tan(0.3) / tan(31 deg) = 0.51 extra half-heights. A field cut exactly at the
   * frustum edge would show a clean empty margin the moment anyone looked
   * sideways — the one gesture the page advertises. The cost is that most of the
   * sparks are off screen at rest, which is why DEFAULT_COUNT is what it is.
   */
  const float SPREAD_X = 1.90;
  const float SPREAD_Y = 1.55;

  /**
   * Pointer lean, in world units per unit of pointer offset, scaled by sqrt(d).
   *
   * The exponent is the whole decision. A lean proportional to d moves every
   * stratum by the same number of PIXELS (the layout is angular, so screen
   * position is d-invariant) and the field reads as one flat sheet sliding — the
   * failure mode this component exists to avoid. A constant world offset gives
   * screen shift proportional to 1/d, which is true parallax but so extreme that
   * the near stratum leaves frame while the far ones never move at all. sqrt(d)
   * sits between: screen shift goes as 1/sqrt(d), so it survives as parallax
   * while staying bounded. The near:far ratio across the five strata is about
   * 3x and is invariant to the far plane; the absolute amounts are not, and at
   * the far plane of a canyon that ends at CANYON_END_MONTH they run from about
   * an eighth of a half-height on the nearest band to about a twenty-second on
   * the deepest. Five distinguishable rates, none of them alarming.
   *
   * Sign is deliberately POSITIVE, i.e. toward the cursor. The electron field
   * pushes away from it. Under the same gesture the two decorative layers move
   * in opposite directions, which is one more reason neither can be mistaken for
   * the other or for the record nodes, which do not respond to the pointer at all.
   */
  const float LEAN = 0.9;

  /**
   * Place a spark. cell is (ax, ay, q) with ax/ay in -1..1 as an angular
   * position and q in 0..1 as its offset within the band. strat is
   * (nearFrac, spanFrac, follow). Writes out the distance ahead of the camera
   * and the 0..1 position within the band, for the edge cross-fade.
   */
  vec3 placeSpark(vec3 cell, vec3 strat, out float depth, out float band) {
    float nearD = strat.x * uFar;
    float span  = max(strat.y * uFar, 1.0);

    // worldZ = camZ * follow + q  =>  depth = camZ * (1 - follow) - q.
    // follow 0 gives the full approach rate, follow 1 gives none. GLSL mod() is
    // x - y * floor(x / y), so the result lands in [0, span) for a negative
    // camera z too and the wrap needs no branch.
    float raw = uCam.z * (1.0 - strat.z) - cell.z * span;
    depth = nearD + mod(raw - nearD, span);

    // Sampled BEFORE the surge below: a 5% depth wobble must not also wobble the
    // edge fades, or the whole band would breathe in and out of existence.
    band = (depth - nearD) / span;

    // Toward/away on pointer energy. Because the layout is angular this cannot
    // slide anything sideways — it only changes size and brightness, which is
    // the point: a soft swell under a moving hand, strongest up close.
    float nearW = 1.0 - smoothstep(0.0, 0.55 * uFar, depth);
    float d = depth * (1.0 - 0.05 * uPointerEnergy * uPointerActive * nearW);

    // Angular layout: the lateral offset scales with depth, so a spark holds its
    // screen position as it approaches and the field expands radially out of the
    // centre. That radial expansion is the single strongest "moving through" cue
    // there is, and it is free.
    vec3 p;
    p.x = uCam.x + cell.x * d * uTanHalf * uAspect * SPREAD_X;
    p.y = uCam.y + cell.y * d * uTanHalf * SPREAD_Y;
    p.z = uCam.z - d;

    // Centred on the camera, not on the world origin. Forced by the construction
    // above — a band's lateral extent is proportional to a camera-relative
    // distance — and the consequence is that the rig's own lateral wander and
    // pointer lean (+-16 world units in x) produce no parallax here. Camera
    // rotation and this lean produce all of it.
    p.xy += uPointer * (LEAN * sqrt(max(d, 1.0))) * uPointerActive;

    return p;
  }
`;

/**
 * Linear working space -> sRGB.
 *
 * THREE.Color converts a CSS hex into the renderer's linear working space on
 * construction, and a custom ShaderMaterial receives none of the renderer's
 * automatic output encoding. Writing the linear value straight out would put
 * these on screen markedly darker and more saturated than the identical hex
 * anywhere else on the page — which, for a layer whose entire job is "the same
 * cyan as everything else, but saturated", would be self-defeating.
 */
const TO_SRGB = /* glsl */ `
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, pow(c, vec3(0.4166667)) * 1.055 - 0.055,
               step(0.0031308, c));
  }
`;

const sparkVertex = /* glsl */ `
  precision highp float;

  // NOTE: position is NOT a world position here. It is the spark's cell —
  // (angular x, angular y, offset within its band) — and the world position is
  // computed below from the camera uniforms. Reusing the mandatory attribute
  // saves a buffer; the geometry's bounding sphere is meaningless as a result,
  // which is why the object is never frustum-culled.
  attribute vec3  aStrat;   // nearFrac, spanFrac, follow
  attribute vec3  aColor;   // linear working space, baked on the CPU
  attribute vec4  aSeed;    // size, alpha, twinkle phase, twinkle rate

  ${PLACEMENT}

  uniform float uTime;
  uniform float uFade;        // 0-1 crossover entrance
  uniform float uScale;       // CSS px * sqrt(world units)
  uniform float uPixelRatio;

  varying vec3  vColor;
  varying float vAlpha;
  varying float vFlare;

  void main() {
    float depth;
    float band;
    vec3 world = placeSpark(position, aStrat, depth, band);

    // viewMatrix, not modelViewMatrix: placeSpark already returns a world
    // position, so going through the object matrix would apply the (identity)
    // model transform twice as soon as anyone parented this to a moving group.
    vec4 mv = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;

    /* ---- size ---------------------------------------------------------- */
    // Sized off the true view depth rather than the along-Z band depth, so a
    // spark at the lateral edge of a yawed frustum is not drawn a few percent
    // too large. max() guards the case where camera rotation puts a spark from
    // the near band slightly behind the lens.
    float viewDepth = max(-mv.z, 4.0);

    // sqrt(viewDepth), not viewDepth. A strict 1/d law is correct perspective
    // and it does not work here: with a clamp low enough to keep a near spark
    // off the editorial column, every spark past about a third of the frustum
    // lands exactly on the clamp floor, which erases the size ordering the five
    // strata exist to create. 1/sqrt(d) keeps a visible gradient across the
    // first three bands and still makes the near ones distinctly larger. The
    // two deepest bands do sit on the floor at about a pixel each — which is
    // what a distant star is — and carry their depth in alpha instead. Sparks
    // are not physical objects; nothing is being misreported.
    float px = aSeed.x * uScale / sqrt(viewDepth);
    px = clamp(px, 1.0, 6.8);
    gl_PointSize = px * uPixelRatio;

    // Only the sparks big enough to resolve one get the four-arm flare; on a
    // 1px dot it would just be a slightly brighter dot.
    vFlare = smoothstep(3.2, 5.4, px);

    /* ---- twinkle ------------------------------------------------------- */
    // Driven from uTime and a per-spark phase, entirely on the GPU. The cube is
    // what makes it read as twinkling rather than pulsing: it spends most of the
    // cycle near zero and spikes briefly, so at any instant a few sparks are
    // bright and the rest are embers. A plain sine has every spark at
    // mid-brightness most of the time, and a field of those breathes in unison
    // no matter how well the phases are scattered.
    float s = sin(uTime * aSeed.w + aSeed.z * 6.2831853) * 0.5 + 0.5;
    float twinkle = 0.26 + 0.74 * s * s * s;

    /* ---- fades --------------------------------------------------------- */
    float a = uFade * aSeed.y * twinkle;

    // Cross-fade at both ends of the band. Both ends, not just the near one: a
    // spark travels toward the near edge while scrolling down and toward the far
    // edge while scrolling back up, and it must not pop into existence either way.
    a *= smoothstep(0.0, 0.12, band) * (1.0 - smoothstep(0.88, 1.0, band));

    // A spark crossing the lens would streak across the type. Fractional rather
    // than a literal distance, so it keeps the same relationship to the nearest
    // stratum (which starts at 0.030 * uFar) whatever the far plane becomes.
    a *= smoothstep(uFar * 0.004, uFar * 0.020, depth);

    // Its own distance fade. A custom ShaderMaterial gets no fog chunks, and the
    // scene's FogExp2 would have erased everything past roughly 1200 units
    // anyway — deliberately not matched, because the deepest stratum is the part
    // that says the dark keeps going past the end of the sampled grid.
    a *= 1.0 - smoothstep(uFar * 0.72, uFar * 0.99, depth);

    vColor = aColor;
    vAlpha = a;

    if (vAlpha < 0.0025) {
      // Clipped outright. A zero point size is not reliably a no-op across
      // drivers, and a transparent additive sprite still costs fill.
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      gl_PointSize = 0.0;
    }
  }
`;

const sparkFragment = /* glsl */ `
  precision highp float;

  varying vec3  vColor;
  varying float vAlpha;
  varying float vFlare;

  ${TO_SRGB}

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    // Discard outside the disc rather than fading alpha to zero: at two or three
    // pixels an additive square is unmistakably a square, and a field of those
    // reads as noise laid over the lens instead of light suspended in the scene.
    if (r2 > 0.25) discard;

    // Gaussian core, offset so it reaches exactly zero at the rim
    // (exp(-13 * 0.25) = 0.0388) and rescaled so the centre is still 1.
    // Subtracting rather than relying on the discard removes the faint hard ring
    // the cutoff otherwise leaves.
    float core = max(0.0, exp(-r2 * 13.0) - 0.0388) * 1.0403;

    // Four-arm flare. This is the "star" in starfield: two thin bars crossing at
    // the core, faded out radially so they end before the rim. It exists to make
    // the resolvable sparks unlike anything else on screen — the record nodes are
    // shaded spheres and the electron field is plain round dust.
    float r = sqrt(r2);
    float arms = (max(0.0, 1.0 - abs(d.x) * 9.0) + max(0.0, 1.0 - abs(d.y) * 9.0))
               * max(0.0, 1.0 - r * 2.0);

    float a = min(1.0, core + arms * 0.34 * vFlare);
    gl_FragColor = vec4(toSRGB(vColor), a * vAlpha);
  }
`;

const blockVertex = /* glsl */ `
  precision highp float;

  // position is the quad corner, +-0.5 in xy, and is NOT declared here: three's
  // ShaderMaterial prefix already injects position, normal and uv, and
  // redeclaring one is a compile error rather than a shadow.
  attribute vec3  iCell;
  attribute vec3  iStrat;
  attribute vec3  iColor;
  attribute vec4  iSeed;     // CSS px size, alpha, phase, signed spin rate

  ${PLACEMENT}

  uniform float uTime;
  uniform float uFade;
  uniform float uViewportH;  // CSS pixels

  varying vec3  vColor;
  varying float vAlpha;
  varying vec2  vQuad;

  void main() {
    float depth;
    float band;
    vec3 world = placeSpark(iCell, iStrat, depth, band);

    vec4 mv = viewMatrix * vec4(world, 1.0);

    /* ---- billboard, sized in CSS pixels -------------------------------- */
    // View-space x and y both project to pixels with the coefficient
    // P11 * height / (2 * viewDepth), so inverting it gives view units per pixel
    // at this depth and the quad can hold a fixed pixel size at any distance.
    // P11 is read out of projectionMatrix rather than passed as a fov: one
    // source of truth, and it survives an aspect or fov change with no plumbing.
    //
    // Named halfSpan, never half: "half" is a reserved word in GLSL ES and
    // declaring it is a compile error, which takes the whole canvas with it.
    float viewDepth = max(-mv.z, 1.0);
    float unitsPerPx = 2.0 * viewDepth / max(uViewportH * projectionMatrix[1][1], 1e-4);
    float halfSpan = iSeed.x * 0.5 * unitsPerPx;

    // Tumble, applied in VIEW space so the quad always faces the camera and only
    // its orientation on screen changes. A block that could turn edge-on would
    // vanish for a frame twice a revolution, which reads as a dropped frame
    // rather than as a rotation.
    float ang = iSeed.z * 6.2831853 + uTime * iSeed.w;
    float c = cos(ang);
    float s = sin(ang);
    vec2 q = position.xy * (halfSpan * 2.0);   // position.xy is +-0.5
    mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);

    gl_Position = projectionMatrix * mv;

    /* ---- fades: the same shape as the sparks --------------------------- */
    float a = uFade * iSeed.y;
    // Gentler than the sparks' cubed twinkle. A hard-flashing square reads as a
    // UI element failing rather than as light.
    a *= 0.58 + 0.42 * (sin(uTime * 0.55 + iSeed.z * 6.2831853) * 0.5 + 0.5);
    a *= smoothstep(0.0, 0.12, band) * (1.0 - smoothstep(0.88, 1.0, band));
    a *= smoothstep(uFar * 0.006, uFar * 0.026, depth);
    a *= 1.0 - smoothstep(uFar * 0.72, uFar * 0.99, depth);

    vColor = iColor;
    vAlpha = a;
    vQuad = position.xy;

    // Whole instance clipped behind the far plane. Every vertex of a given quad
    // takes this branch together, because vAlpha depends only on instance
    // attributes and uniforms — a per-vertex condition here would tear the quad.
    if (vAlpha < 0.0025) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }
`;

const blockFragment = /* glsl */ `
  precision highp float;

  varying vec3  vColor;
  varying float vAlpha;
  varying vec2  vQuad;

  ${TO_SRGB}

  void main() {
    // A SQUARE, kept square. The edge gets the smallest feather that stops a 3px
    // quad aliasing into a flickering cluster of pixels — any softer and it
    // rounds off into just another dot, which would forfeit the one shape cue
    // separating these from every other speck on the page.
    vec2 d = abs(vQuad) * 2.0;               // 0 at the centre, 1 at the edge
    float edge = max(d.x, d.y);
    float a = 1.0 - smoothstep(0.82, 1.0, edge);

    // Slight centre lift, so a block reads as a chip catching light rather than
    // as a flat swatch. Small on purpose: 18%.
    a *= 0.82 + 0.18 * (1.0 - edge);

    gl_FragColor = vec4(toSRGB(vColor), a * vAlpha);
  }
`;

/* ─────────────────────────────────────────────────────── reduced motion ──── */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const getReduced = () => window.matchMedia(REDUCED_QUERY).matches;
const getReducedServer = () => false;

/* ────────────────────────────────────────────────────────────── building ──── */

/**
 * Deterministic PRNG. The field must be identical on every mount — a starfield
 * that reshuffles when React remounts the tree reads as a glitch, and the
 * pipeline watcher republishes this page while it is open.
 */
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

/** Pick from a weighted palette into the renderer's linear working space, which
 *  is what THREE.Color's hex setter produces. */
function pickColor(
  palette: ReadonlyArray<readonly [string, number]>,
  u: number,
  into: THREE.Color,
): THREE.Color {
  let acc = 0;
  for (const [hex, w] of palette) {
    acc += w;
    if (u <= acc) return into.set(hex);
  }
  // Weights are authored to sum to 1, but float accumulation can leave u a hair
  // above the last boundary. Falling through to the final entry is correct;
  // returning nothing would leave a black spark.
  return into.set(palette[palette.length - 1][0]);
}

/**
 * Spread `total` across the strata by weight without losing or inventing one to
 * rounding. Returns the per-stratum counts and the exact sum, because the sum is
 * what the instance count must be: an InstancedBufferGeometry told to draw more
 * instances than its attributes hold reads past the end of the buffer.
 */
function allocate(total: number): { per: number[]; sum: number } {
  const per: number[] = [];
  let assigned = 0;
  for (let i = 0; i < STRATA.length; i++) {
    const n = i === STRATA.length - 1
      ? total - assigned
      : Math.round(total * STRATA[i].weight);
    const clamped = Math.max(0, Math.min(n, total - assigned));
    per.push(clamped);
    assigned += clamped;
  }
  return { per, sum: assigned };
}

/** Per-spark seed values, shared by both builders so the two layers agree about
 *  what a stratum looks like. */
function fillCell(
  cells: Float32Array,
  strat: Float32Array,
  i: number,
  band: Stratum,
  rnd: () => number,
): void {
  // Uniform in angle. Any clustering in an ambient field starts to read as
  // density, and density is a channel the record cloud actually uses.
  cells[i * 3] = rnd() * 2 - 1;
  cells[i * 3 + 1] = rnd() * 2 - 1;
  cells[i * 3 + 2] = rnd();

  strat[i * 3] = band.nearF;
  strat[i * 3 + 1] = band.spanF;
  strat[i * 3 + 2] = band.follow;
}

function buildSparks(count: number): THREE.BufferGeometry | null {
  if (count <= 0) return null;

  const cells = new Float32Array(count * 3);
  const strat = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);

  const rnd = mulberry32(0x59a12c5);
  const colour = new THREE.Color();
  const { per } = allocate(count);

  let i = 0;
  for (let s = 0; s < STRATA.length; s++) {
    const band = STRATA[s];
    for (let n = 0; n < per[s]; n++, i++) {
      fillCell(cells, strat, i, band, rnd);

      pickColor(SPARK_PALETTE, rnd(), colour);
      colors[i * 3] = colour.r;
      colors[i * 3 + 1] = colour.g;
      colors[i * 3 + 2] = colour.b;

      // Sizes skewed hard to the small end: pow(u, 2.1) leaves most of a band at
      // its floor size with a sparse scatter of larger sparks to catch the eye.
      // A uniform size range reads as a grid of equal dots.
      seeds[i * 4] = band.size * (0.62 + Math.pow(rnd(), 2.1) * 1.05);
      // Low alpha, per the brief. Additive over a near-black void means even 0.3
      // of a saturated hue is unmistakably that hue, so this stays subordinate
      // to everything that carries meaning while still reading as colour.
      seeds[i * 4 + 1] = band.alpha * (0.30 + rnd() * 0.30);
      seeds[i * 4 + 2] = rnd();
      // Twinkle rates scattered over roughly 2.4x. Any narrower and the field
      // audibly beats against itself at the difference frequency.
      seeds[i * 4 + 3] = 0.55 + rnd() * 1.35;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(cells, 3));
  g.setAttribute('aStrat', new THREE.BufferAttribute(strat, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  // position holds cells, not world coordinates, so a computed bounding sphere
  // would describe nothing. Set a trivial one anyway so nothing downstream trips
  // over a null, and never frustum-cull the object.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  return g;
}

function buildBlocks(count: number): THREE.InstancedBufferGeometry | null {
  if (count <= 0) return null;

  const g = new THREE.InstancedBufferGeometry();

  // The quad is written out by hand rather than taken from a PlaneGeometry.
  // Sharing a PlaneGeometry's attribute objects would mean disposing that plane
  // released the GPU buffers this geometry is still drawing from — and NOT
  // disposing it leaks. Four vertices is cheaper than either problem.
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    0.5, 0.5, 0,
    -0.5, 0.5, 0,
  ]), 3));

  const cells = new Float32Array(count * 3);
  const strat = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);

  const rnd = mulberry32(0x2b10c5);
  const colour = new THREE.Color();
  const { per, sum } = allocate(count);

  let i = 0;
  for (let s = 0; s < STRATA.length; s++) {
    const band = STRATA[s];
    for (let n = 0; n < per[s]; n++, i++) {
      fillCell(cells, strat, i, band, rnd);

      pickColor(BLOCK_PALETTE, rnd(), colour);
      colors[i * 3] = colour.r;
      colors[i * 3 + 1] = colour.g;
      colors[i * 3 + 2] = colour.b;

      // A fixed CSS pixel size regardless of depth, unlike the sparks. Depth is
      // already legible from the parallax rate and the alpha, and a block that
      // grew as it approached would eventually be a colour swatch laid across
      // the type — the one thing a decorative layer must never become.
      // 2.4-6.0 px, tilted smaller for the deeper strata: reads as a chip, never
      // as a panel.
      seeds[i * 4] = (2.4 + rnd() * 3.6) * (0.66 + 0.34 * band.size);
      // Dimmer than the sparks. A square holds the eye harder than a dot of the
      // same area, so it has to be quieter to stay level with them.
      seeds[i * 4 + 1] = band.alpha * (0.20 + rnd() * 0.16);
      seeds[i * 4 + 2] = rnd();
      // Signed, so they do not all tumble the same way, and slow: a fast spin on
      // a 3px square is just shimmer.
      seeds[i * 4 + 3] = (rnd() < 0.5 ? -1 : 1) * (0.06 + rnd() * 0.16);
    }
  }

  g.setAttribute('iCell', new THREE.InstancedBufferAttribute(cells, 3));
  g.setAttribute('iStrat', new THREE.InstancedBufferAttribute(strat, 3));
  g.setAttribute('iColor', new THREE.InstancedBufferAttribute(colors, 3));
  g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  // The allocated sum, not `count`: they are equal for every count that reaches
  // here, and asserting the one the buffers were actually filled to is what
  // stops a future weight edit turning into an out-of-range instanced draw.
  g.instanceCount = sum;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  return g;
}

/* ───────────────────────────────────────────────────────────── the field ──── */

export interface SparkFieldProps {
  /**
   * Scroll progress at which Movement I hands over.
   *
   * The sparks belong to Movement II, so they fade in as progress crosses this
   * and stay for the rest of the document. The fade is a pure function of
   * progress, which means scrolling back up into Movement I takes the colour
   * back out with it — correct, because this is that movement's colour and
   * nothing else's.
   *
   * At crossover >= 1 there is no Movement II and the field never appears.
   */
  crossover: number;
  /**
   * Spark count. The cost is two draw calls whatever this is; it is a fill-rate
   * and density dial. The block count is derived from it.
   */
  count?: number;
}

export default function SparkField({ crossover, count = DEFAULT_COUNT }: SparkFieldProps) {
  const { size, viewport } = useThree();
  // Read as an external store, matching Stage and the electron field: toggling
  // the OS setting drops the field live rather than needing a reload.
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getReducedServer);

  const sparkCount = Math.max(0, Math.floor(count));
  const blockCount = Math.min(BLOCK_CAP, Math.round(sparkCount * BLOCK_RATIO));

  // Nothing is built under Reduce Motion. The whole component is drift.
  const sparkGeo = useMemo(
    () => (reduced ? null : buildSparks(sparkCount)),
    [reduced, sparkCount],
  );
  const blockGeo = useMemo(
    () => (reduced ? null : buildBlocks(blockCount)),
    [reduced, blockCount],
  );

  /**
   * ONE uniforms object, shared by both materials.
   *
   * The sparks and the blocks have to agree exactly about the camera, the far
   * plane and the pointer or they would parallax against each other. Sharing the
   * object makes that structural rather than a thing to remember in useFrame.
   *
   * Built once and mutated in place — rebuilding it would swap the uniforms out
   * from under an already-compiled program.
   */
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFar: { value: 1600 },
      uCam: { value: new THREE.Vector3() },
      uTanHalf: { value: 0.6 },
      uAspect: { value: 1 },
      uViewportH: { value: 800 },
      uPixelRatio: { value: 1 },
      uPointer: { value: new THREE.Vector2() },
      uPointerEnergy: { value: 0 },
      uPointerActive: { value: 0 },
      uFade: { value: 0 },
      // CSS px * sqrt(world units). Driven per frame from sqrt(uFar) rather than
      // fixed, and that is not a detail: every distance in this field is a
      // fraction of the far plane, and the far plane is derived from the deepest
      // month any record occupies. A constant here would make the sparks
      // visibly smaller on a panel that happens to carry a long follow-up —
      // i.e. it would let a decorative layer report the shape of the data, which
      // is the one thing it must never do. Scaling by sqrt(far) exactly cancels
      // the sqrt(depth) in the size law and holds the apparent size fixed.
      uScale: { value: 40 },
    }),
    [],
  );

  const sparkMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: sparkVertex,
        fragmentShader: sparkFragment,
        uniforms,
        transparent: true,
        // Additive, so overlapping sparks sum into light instead of punching
        // holes in one another. depthWrite off so nothing needs sorting, but
        // depth TEST stays on: a spark behind a record node is occluded by it,
        // which is what keeps the field inside the world rather than on the lens.
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [uniforms],
  );

  const blockMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: blockVertex,
        fragmentShader: blockFragment,
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        // Both faces. The tumble is a view-space rotation so a quad never turns
        // away, but back-face culling on a hand-written quad is one more thing
        // to get wrong for nothing.
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [uniforms],
  );

  // A useMemo'd geometry or material that is replaced and not disposed keeps its
  // GPU buffers and its compiled program for the life of the context.
  useEffect(() => () => { sparkGeo?.dispose(); }, [sparkGeo]);
  useEffect(() => () => { blockGeo?.dispose(); }, [blockGeo]);
  useEffect(() => () => { sparkMat.dispose(); }, [sparkMat]);
  useEffect(() => () => { blockMat.dispose(); }, [blockMat]);

  /* eslint-disable react-hooks/immutability -- Per-frame uniform mutation is the
     r3f pattern; routing these through setState would re-render the tree sixty
     times a second. */
  useFrame((state, delta) => {
    if (!sparkGeo && !blockGeo) return;

    const dt = Math.min(delta, 1 / 30);
    uniforms.uTime.value += dt;

    // Two damping rates: slow for state that should feel like weather, faster
    // for the pointer so following the cursor still feels attached to the hand.
    const kSlow = Math.min(1, Math.max(dt, 1 / 240) * 4);
    const kFast = Math.min(1, Math.max(dt, 1 / 240) * 9);

    /* ---- entrance ------------------------------------------------------ */
    // Starts just BEFORE the crossover: arriving exactly on the boundary reads
    // as a cut, and the handover is meant to feel like one continuous dive into
    // a different stratum. No matching fade-out at the far end — once Movement
    // II owns the frame the sparks stay for the rest of the document.
    const p = scrollState.progress;
    let target: number;
    if (crossover >= 1) {
      target = 0;                       // no Movement II on this page at all
    } else if (crossover <= 0) {
      target = smooth01(p / 0.05);      // the whole document is Movement II
    } else {
      target = smooth01((p - (crossover - 0.04)) / 0.10);
    }
    uniforms.uFade.value += (target - uniforms.uFade.value) * kSlow;

    /* ---- camera and frustum -------------------------------------------- */
    // Read live rather than hardcoded: camera-rig sets `far` from
    // canyon-space.farPlaneFor(deepest month), so it changes when a longer
    // follow-up lands, and every distance in this field is a fraction of it.
    const cam = state.camera as THREE.PerspectiveCamera;
    uniforms.uCam.value.copy(cam.position);
    const far = cam.far > 0 ? cam.far : 1600;
    uniforms.uFar.value = far;
    // sqrt(far) keeps apparent spark size independent of the far plane; see the
    // uScale comment above. The coefficient is exactly 1, which lands the
    // nearest band between about 3.5 and 5.8 CSS px across its span, the middle
    // band at about 1.2, and the two deepest on the 1px clamp floor — measured
    // identically at both ends of the far-plane range the pipeline produces.
    uniforms.uScale.value = Math.sqrt(far);
    uniforms.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad((cam.fov || 62) * 0.5));
    uniforms.uAspect.value = size.height > 0 ? size.width / size.height : 1;
    uniforms.uViewportH.value = Math.max(1, size.height);
    uniforms.uPixelRatio.value = viewport.dpr;

    /* ---- pointer ------------------------------------------------------- */
    // A coarse or absent pointer never sets `active`, and neutral there means
    // "no influence at all" rather than "influence at the screen centre" — a
    // touch device must not get a field permanently leaned toward the middle.
    const px = pointerState.active ? pointerState.nx : 0;
    const py = pointerState.active ? pointerState.ny : 0;
    uniforms.uPointer.value.x += (px - uniforms.uPointer.value.x) * kFast;
    uniforms.uPointer.value.y += (py - uniforms.uPointer.value.y) * kFast;
    uniforms.uPointerEnergy.value +=
      (pointerState.energy - uniforms.uPointerEnergy.value) * kFast;
    uniforms.uPointerActive.value +=
      ((pointerState.active ? 1 : 0) - uniforms.uPointerActive.value) * kSlow;
  });
  /* eslint-enable react-hooks/immutability */

  if (!sparkGeo && !blockGeo) return null;

  return (
    <>
      {/* Never culled: placement is camera-relative and computed in the shader,
          so the bounding sphere describes nothing. A frustum test here can only
          cost time, or wrongly cull the entire field. */}
      {sparkGeo && (
        <points geometry={sparkGeo} material={sparkMat} frustumCulled={false} />
      )}
      {blockGeo && (
        <mesh geometry={blockGeo} material={blockMat} frustumCulled={false} />
      )}
    </>
  );
}

/** Clamp to 0-1 and ease both ends, so a ramp has no corners. */
function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
