'use client';

/**
 * Shared pointer and drag state.
 *
 * The magnetic cursor used to keep its pointer entirely inside one effect
 * closure, so nothing else on the page could react to it — which is why the
 * background never followed the cursor. This is the same trick as `scrollState`
 * in lib/scroll-engine: one mutable module-scope object, written by exactly one
 * publisher, read from `useFrame` and pushed into shader uniforms. It never goes
 * through React state; a pointer move must not re-render the tree.
 *
 * Decay is advanced from the scroll engine's single tick rather than from a
 * second rAF loop here, so pointer velocity, Lenis and the renderer all sample
 * the same frame. Two clocks is how the DOM ends up a frame ahead of the canvas.
 */

export interface PointerState {
  /** Viewport pixels. */
  x: number;
  y: number;
  /** Normalised to -1..1 with 0 at the centre. Aspect-uncorrected on purpose:
   *  shaders want screen space, and correcting here would double-correct. */
  nx: number;
  ny: number;
  /** Smoothed pixels/frame. */
  vx: number;
  vy: number;
  /** 0-1 damped pointer speed, fast to rise and slow to fall. Mirrors
   *  scrollState.energy so both can drive the same shader terms. */
  energy: number;
  /** Primary button held. Drives hold-to-explore. */
  down: number;
  /** 0-1 eased version of `down`, so entering and leaving drag is not a step. */
  holding: number;
  /** True once a real fine pointer has been seen. Coarse pointers never set it,
   *  and every consumer treats "no pointer" as neutral rather than as centre. */
  active: boolean;
}

export const pointerState: PointerState = {
  x: 0, y: 0, nx: 0, ny: 0, vx: 0, vy: 0, energy: 0, down: 0, holding: 0, active: false,
};

/** Raw pixel delta accumulated while held, awaiting a consumer. */
const pendingDrag = { dx: 0, dy: 0 };
/** Last publisher sample, for velocity. */
const last = { x: 0, y: 0, seen: false };

/** Called by the publisher on every pointermove. */
export function publishPointer(x: number, y: number, w: number, h: number): void {
  if (last.seen) {
    const dx = x - last.x;
    const dy = y - last.y;
    // Accumulate drag only while held; a plain hover must not move the camera.
    if (pointerState.down > 0) {
      pendingDrag.dx += dx;
      pendingDrag.dy += dy;
    }
    pointerState.vx = dx;
    pointerState.vy = dy;
  }
  last.x = x;
  last.y = y;
  last.seen = true;

  pointerState.x = x;
  pointerState.y = y;
  pointerState.nx = w > 0 ? (x / w) * 2 - 1 : 0;
  pointerState.ny = h > 0 ? 1 - (y / h) * 2 : 0;
  pointerState.active = true;
}

export function publishPointerDown(down: boolean): void {
  pointerState.down = down ? 1 : 0;
  if (!down) {
    // Drop anything unconsumed so a release cannot smear into the next grab.
    pendingDrag.dx = 0;
    pendingDrag.dy = 0;
  }
}

/**
 * Take the drag accumulated since the last call and reset it.
 *
 * Exactly one consumer — the camera rig. Making this a consuming read rather
 * than a readable field is deliberate: two readers of the same accumulator would
 * each apply the full delta and the camera would move at double rate.
 */
export function consumeDrag(): { dx: number; dy: number } {
  const out = { dx: pendingDrag.dx, dy: pendingDrag.dy };
  pendingDrag.dx = 0;
  pendingDrag.dy = 0;
  return out;
}

/** Advanced once per frame from the scroll engine's tick. `dt` in seconds. */
export function advancePointer(dt: number): void {
  const step = Math.min(1, Math.max(dt, 1 / 240) * 60);

  // Velocity decays toward zero so a parked cursor reads as still. Without this
  // the last move's velocity would persist forever and the field would keep
  // shearing after the pointer stopped.
  pointerState.vx *= Math.pow(0.86, step);
  pointerState.vy *= Math.pow(0.86, step);

  const speed = Math.min(1, Math.hypot(pointerState.vx, pointerState.vy) / 28);
  const rate = speed > pointerState.energy ? 0.25 : 0.05;
  pointerState.energy += (speed - pointerState.energy) * rate * step;

  pointerState.holding += (pointerState.down - pointerState.holding)
    * (pointerState.down ? 0.22 : 0.08) * step;
}

/** Reset for teardown, so a remount does not inherit a stale hold. */
export function resetPointer(): void {
  pointerState.vx = 0;
  pointerState.vy = 0;
  pointerState.energy = 0;
  pointerState.down = 0;
  pointerState.holding = 0;
  pendingDrag.dx = 0;
  pendingDrag.dy = 0;
  last.seen = false;
}
