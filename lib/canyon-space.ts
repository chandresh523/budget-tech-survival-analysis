/**
 * Shared spatial conventions for the canyon.
 *
 * Replaces lib/tunnel-space.ts. The old world was radial — Z=time, θ=category,
 * R=price, survival encoded as the tunnel's radius. That radial wall never read
 * as a Kaplan-Meier curve, which is why the survival curves felt missing. This
 * one is Cartesian, and a category's survival curve is literally the skyline of
 * its wall.
 *
 *   TIME     -> -Z. Months run away from the viewer, so flying forward is time
 *               passing. 0 months at the origin, CANYON_END_MONTH at -LENGTH.
 *   SURVIVAL -> +Y. The wall's crest. It sinks where devices fail, so the
 *               canyon's skyline IS the estimate.
 *   CATEGORY -> X. One lane per category, spread left and right of the flight
 *               path, so you fly down the corridor between them.
 *
 * On axis naming: the brief said X=time and Z=category, and also that scroll
 * dives along Z. Both cannot hold. Time is on Z here because that is the axis
 * the camera actually travels, which keeps the existing fog, depth-scrub and
 * velocity-bank code meaningful and needs no camera reorientation. The geometry
 * a viewer sees is identical either way — only the letters differ.
 *
 * Everything that places anything in this world imports from here. Two modules
 * each deriving their own scale is how the cloud and the curves silently stop
 * agreeing about what a position means.
 */

/**
 * The canyon stops where the data stops.
 *
 * The pipeline samples S(t) on a fixed grid whose last regular month is 48;
 * beyond that each curve carries a single point at its own end of follow-up
 * (up to 156 months). Running the corridor to 156 would spend three quarters of
 * its length on one unsampled interval and crush every observed step into the
 * opening stretch. So the built canyon ends at 48 and says so, and records
 * beyond it keep going into the dark — the grid ends, the data does not.
 */
export const CANYON_END_MONTH = 48;

/** World length of the built canyon, i.e. of months 0..CANYON_END_MONTH. */
export const CANYON_LENGTH = 820;

/** Z separation between adjacent category lanes. */
export const LANE_GAP = 44;

/** Floor of the walls, and the crest height at maximum survival. */
export const FLOOR_Y = -30;
export const CREST_Y = 52;

/** Half-thickness of a wall along Z... i.e. across the lane. */
export const WALL_HALF_WIDTH = 7;

/** Months -> Z. Linear and deliberately unclamped, so a record past the end of
 *  the built canyon extrapolates into the dark instead of piling on the end
 *  plate. */
export function zForMonth(month: number): number {
  return -(month / CANYON_END_MONTH) * CANYON_LENGTH;
}

/** Z -> months. The blueprint overlay needs the inverse to label the depth the
 *  camera is actually at. */
export function monthForZ(z: number): number {
  return (-z / CANYON_LENGTH) * CANYON_END_MONTH;
}

/** Lane centre for a category. Group indices come from `deviceKeysOf`, so lane
 *  order matches the cloud's grouping — a wall must sit over its own records. */
export function laneX(group: number, groups: number): number {
  return (group - (groups - 1) / 2) * LANE_GAP;
}

/** Half-width of the whole lane spread, for framing and camera bounds. */
export function laneSpread(groups: number): number {
  return ((groups - 1) / 2) * LANE_GAP;
}

export interface SurvivalScale {
  /** Survival probability -> world Y. */
  yFor(survival: number): number;
  /** The survival value pinned to the floor. */
  floor: number;
  /** True when the scale was widened to the observed range. */
  normalised: boolean;
}

/**
 * Height scale for survival, anchored to the range actually observed.
 *
 * Mapping S in [0,1] onto the full height is the obvious choice and it does not
 * work: nothing in this panel survives worse than about 0.81, so every curve
 * lands in the top fifth of the wall and the drops — the one thing the encoding
 * exists to show — are invisible. Anchoring the floor just below the worst
 * observed value spends the whole height on the range that has data in it.
 *
 * The cost is that height becomes a RELATIVE encoding, so it is never labelled
 * as a probability in 3D. Exact S(t) is printed in the Survival and Classes
 * ledgers, which is where a reader gets numbers.
 */
export function survivalScale(observed: number[]): SurvivalScale {
  let min = 1;
  for (const s of observed) if (Number.isFinite(s) && s < min) min = s;

  // A panel with no failures at all would collapse the span to zero; fall back
  // to the absolute scale rather than dividing by it.
  const floor = min >= 1 ? 0 : Math.max(0, Math.min(0.94, min - 0.02));
  const span = 1 - floor || 1;

  return {
    floor,
    normalised: floor > 0,
    yFor(survival: number) {
      const k = Math.max(0, Math.min(1, (survival - floor) / span));
      return FLOOR_Y + k * (CREST_Y - FLOOR_Y);
    },
  };
}

/** Min/max observed time across the cloud, for framing the record field. */
export function timeExtentOf(points: ReadonlyArray<{ t: number }>): [number, number] {
  if (!points.length) return [0, CANYON_END_MONTH];
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    if (p.t < lo) lo = p.t;
    if (p.t > hi) hi = p.t;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [0, CANYON_END_MONTH];
  return [lo, hi];
}

/* ─────────────────────────────────────────────────────── camera envelope ──── */

/**
 * Where the camera sits when it is not being dragged.
 *
 * Above the floor and below the crests, so the skylines read against the void
 * rather than against each other. It flies the centre of the lane spread.
 */
export const CAM_REST_Y = 24;
/** Start back from month 0 so the opening frame is not inside the first wall. */
export const CAM_START_Z = 150;
/** Travel past the end plate so the last steps are flown through, not stopped at. */
export const CAM_OVERRUN = 190;

/** Far plane needed to keep the extrapolated record field inside the frustum. */
export function farPlaneFor(maxMonth: number): number {
  return Math.max(1600, Math.abs(zForMonth(maxMonth)) + 600);
}
