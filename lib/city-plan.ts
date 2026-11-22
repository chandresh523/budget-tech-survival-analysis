/**
 * The city: six districts, one flight path, and the scroll mapping between them.
 *
 * All of the "AAA" feeling lives in `scrollToPath` below. A linear scroll→camera
 * mapping reads as a conveyor belt: you glide past everything at constant speed
 * and never arrive anywhere. Instead each district owns a *dwell band* of scroll
 * during which the camera barely advances, separated by *travel bands* it
 * crosses quickly. The result is: accelerate, fly, decelerate, arrive, hold —
 * then leave.
 *
 * Kept as pure data + pure functions so the mapping can be reasoned about and
 * unit-checked without standing up a WebGL context.
 */

import * as THREE from 'three';

export type DistrictId =
  | 'skyline'
  | 'market'
  | 'towers'
  | 'canyon'
  | 'tribunal'
  | 'registry';

export interface District {
  id: DistrictId;
  /** Shown on the minimap and the arrival card. */
  name: string;
  /** One line of flavour, in the register of a place rather than a chart title. */
  tagline: string;
  /** Where the camera comes to rest, in world units. */
  anchor: [number, number, number];
  /** What the camera looks at while dwelling here. */
  focus: [number, number, number];
  /** Accent colour for the district's lighting and its minimap marker. */
  accent: string;
  /**
   * Share of total scroll spent held at this district, before normalisation.
   * Bigger = the reader lingers. The data-heavy stops get more.
   */
  dwellWeight: number;
}

/**
 * THE CORRIDOR RULE.
 *
 * Every district keeps its geometry outside |x| < CORRIDOR_HALF_WIDTH, and the
 * flight path never leaves that column. Without this the camera flies straight
 * into buildings — the first draft parked the Market Row anchor exactly inside
 * storefront #0 and rendered the inside of a wall.
 *
 * Anything that must cross the corridor (the Registry shelf wall, the Tribunal
 * lintel) sits beyond the district's stopping point or well above the camera.
 */
export const CORRIDOR_HALF_WIDTH = 12;

export const DISTRICTS: District[] = [
  {
    id: 'skyline',
    name: 'Approach',
    tagline: 'Inbound over the grid',
    // High above the skyline: the tallest towers reach ~84 units.
    anchor: [0, 120, 300],
    focus: [0, 28, 70],
    accent: '#e8a33d',
    dwellWeight: 0.8,
  },
  {
    id: 'market',
    name: 'Market Row',
    tagline: 'Ten storefronts, ten hardware categories',
    // Down the middle of the street, looking along it.
    anchor: [0, 11, 172],
    focus: [0, 8, 66],
    accent: '#ffb020',
    dwellWeight: 1.35,
  },
  {
    id: 'towers',
    name: 'Twin Towers',
    tagline: 'Cox Proportional Hazards faces the Forest',
    // Between and slightly above the two towers.
    anchor: [0, 34, 48],
    focus: [0, 27, -12],
    accent: '#8b6bff',
    dwellWeight: 1.15,
  },
  {
    id: 'canyon',
    name: 'Decay Canyon',
    tagline: 'The street falls as survival does',
    // At the canyon mouth, looking down its length as the floor drops away.
    anchor: [0, 27, -58],
    focus: [0, 6, -150],
    accent: '#22c9e8',
    dwellWeight: 1.4,
  },
  {
    id: 'tribunal',
    name: 'The Tribunal',
    tagline: 'Where two curves are held against each other',
    // Below the lintel, approaching the colonnade head-on.
    anchor: [0, 13, -208],
    focus: [0, 11, -252],
    accent: '#ff4fa3',
    dwellWeight: 1.05,
  },
  {
    id: 'registry',
    name: 'The Registry',
    tagline: 'Every unit on record',
    // Stopped in front of the shelf wall, never inside it.
    anchor: [0, 17, -292],
    focus: [0, 13, -338],
    accent: '#22d07a',
    dwellWeight: 1.25,
  },
];

/** Fraction of scroll spent travelling rather than dwelling. */
const TRAVEL_SHARE = 0.46;

/**
 * The flight path.
 *
 * Control points are the district anchors plus a lifted mid-point between each
 * pair, so the camera arcs *over* the city between stops instead of sliding
 * along the ground. `curveType: 'catmullrom'` with low tension keeps the arcs
 * broad — a tight spline reads as a rollercoaster, not a flight.
 */
export const FLIGHT_PATH = new THREE.CatmullRomCurve3(
  DISTRICTS.flatMap((district, i) => {
    const here = new THREE.Vector3(...district.anchor);
    const next = DISTRICTS[i + 1];
    if (!next) return [here];

    const there = new THREE.Vector3(...next.anchor);
    const mid = here.clone().lerp(there, 0.5);
    // Arc *over* the gap rather than sliding along it, and swing gently sideways
    // so consecutive legs are not colinear — a straight line through three
    // anchors gives the spline no turn to bank into.
    //
    // The lateral swing is deliberately small: it has to stay inside the
    // corridor, or the arc clips the very buildings it is flying between.
    mid.y += 16 + (i % 2) * 9;
    mid.x += (i % 2 === 0 ? 1 : -1) * (CORRIDOR_HALF_WIDTH - 4);
    return [here, mid];
  }),
  false,
  'catmullrom',
  0.35,
);

/** Normalised curve parameter where each district sits. */
export const STATION_T: number[] = DISTRICTS.map((_, i) =>
  DISTRICTS.length === 1 ? 0 : i / (DISTRICTS.length - 1),
);

interface Band {
  /** Scroll range. */
  s0: number;
  s1: number;
  /** Curve-parameter range. */
  t0: number;
  t1: number;
  /** True where the camera is parked at a district. */
  dwell: boolean;
  districtIndex: number;
}

/**
 * Build the piecewise scroll→t schedule: dwell, travel, dwell, travel, …
 *
 * Total dwell scroll is `1 - TRAVEL_SHARE`, divided between districts by their
 * `dwellWeight`. Travel scroll is split evenly across the legs.
 */
function buildBands(): Band[] {
  const weights = DISTRICTS.map((d) => d.dwellWeight);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const dwellTotal = 1 - TRAVEL_SHARE;
  const legs = Math.max(1, DISTRICTS.length - 1);
  const travelEach = TRAVEL_SHARE / legs;

  const bands: Band[] = [];
  let s = 0;

  DISTRICTS.forEach((_, i) => {
    const dwellSpan = (weights[i] / weightSum) * dwellTotal;

    // Hold at the district: scroll advances, t does not.
    bands.push({
      s0: s,
      s1: s + dwellSpan,
      t0: STATION_T[i],
      t1: STATION_T[i],
      dwell: true,
      districtIndex: i,
    });
    s += dwellSpan;

    // Travel to the next one.
    if (i < DISTRICTS.length - 1) {
      bands.push({
        s0: s,
        s1: s + travelEach,
        t0: STATION_T[i],
        t1: STATION_T[i + 1],
        dwell: false,
        districtIndex: i,
      });
      s += travelEach;
    }
  });

  // Absorb floating-point drift into the final band rather than leaving a gap
  // that would strand the camera short of the last district.
  if (bands.length) bands[bands.length - 1].s1 = 1;
  return bands;
}

export const BANDS: Band[] = buildBands();

/** Smootherstep: zero first *and* second derivative at both ends, so departure
 *  and arrival have no velocity kink. Plain smoothstep still visibly jerks. */
function ease(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export interface PathState {
  /** Curve parameter, 0-1. */
  t: number;
  /** Index of the district currently arrived at, or null while travelling. */
  arrivedAt: number | null;
  /** Index of the district being approached (or held). */
  targetIndex: number;
  /** 0-1 progress across the current travel leg; 1 whenever dwelling. */
  legProgress: number;
}

/**
 * Map scroll progress (0-1) to a position along the flight path.
 *
 * This is the whole trick: within a dwell band `t` is pinned, so the camera
 * holds still and the district's panel can be read; within a travel band `t`
 * eases from one station to the next, so the leg accelerates out and decelerates
 * in.
 */
export function scrollToPath(scroll: number): PathState {
  const s = Math.min(1, Math.max(0, scroll));

  for (const band of BANDS) {
    if (s > band.s1 && band !== BANDS[BANDS.length - 1]) continue;

    const span = band.s1 - band.s0;
    const local = span <= 0 ? 1 : (s - band.s0) / span;

    if (band.dwell) {
      return {
        t: band.t0,
        arrivedAt: band.districtIndex,
        targetIndex: band.districtIndex,
        legProgress: 1,
      };
    }

    const eased = ease(local);
    return {
      t: band.t0 + (band.t1 - band.t0) * eased,
      arrivedAt: null,
      targetIndex: Math.min(band.districtIndex + 1, DISTRICTS.length - 1),
      legProgress: local,
    };
  }

  return { t: 1, arrivedAt: DISTRICTS.length - 1, targetIndex: DISTRICTS.length - 1, legProgress: 1 };
}

/** Scroll position that centres a given district's dwell band — used by the
 *  minimap and by keyboard navigation to jump between places. */
export function scrollForDistrict(index: number): number {
  const band = BANDS.find((b) => b.dwell && b.districtIndex === index);
  if (!band) return 0;
  return (band.s0 + band.s1) / 2;
}

/**
 * How tall the scroll container must be.
 *
 * Every district needs enough scroll distance that its dwell band is
 * comfortable to stop inside; too short and the reader shoots past the panel
 * before it has finished fading in.
 */
export const SCROLL_VIEWPORTS = 9;
