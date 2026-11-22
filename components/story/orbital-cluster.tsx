'use client';

/**
 * The globe, seen from the inside.
 *
 * The viewer sits at the centre of a sphere and the nodes are pinned to its
 * inner surface, so dragging turns your head rather than spinning an object in
 * front of you. Everything curves away toward the edges of vision, which is the
 * concave-lens read.
 *
 * The projection is the whole trick. A normal perspective divide (r = f·tanθ)
 * blows up catastrophically past ~60° from the view axis — items smear off to
 * infinity at the edges. This uses an EQUIDISTANT FISHEYE (r = f·θ) instead,
 * the projection real fisheye lenses use: radius grows linearly with angle, so
 * a 150° field of view stays on screen and compresses gracefully at the rim.
 * That compression is what makes it feel like looking through curved glass.
 *
 * DOM + transforms, not WebGL: every node carries a real number and a real
 * label, so it has to stay selectable and readable by a screen reader.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

export interface OrbitNode {
  id: string;
  label: string;
  /** 0-1; drives the ring sweep. Null renders an unlit node. */
  value: number | null;
  /** Relative weight, sets node size. */
  weight: number;
  caption?: string;
  /** True when the node has no observed events behind it. */
  hollow?: boolean;
}

export interface OrbitalClusterProps {
  nodes: OrbitNode[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Half the field of view, in radians. ~75° gives a strong but usable curve. */
  fov?: number;
  /**
   * Keep-clear ellipse over the editorial column, as a fraction of the host's
   * half-width and half-height. A node drifting across the headline makes it
   * unreadable, so nodes that would land inside are deflected to the edge;
   * their depth cues are untouched, so the sphere still reads correctly.
   *
   * `cy` offsets the ellipse's centre (negative = upward, in the same
   * half-height units). It matters because the hero type sits *above* the
   * host's geometric centre, so a centred ellipse puts its own boundary --
   * exactly where deflected nodes come to rest -- straight through the
   * headline. Only text over open background needs protecting: the stat cards
   * below are opaque and occlude nodes by themselves.
   *
   * Pass `{ x: 0, y: 0, cy: 0 }` to disable.
   */
  guard?: { x: number; y: number; cy?: number };
  /** MUST include positioning (e.g. `fixed inset-0`): the host needs real
   *  dimensions, and it is the containing block for the nodes. */
  className?: string;
}

interface Dir {
  node: OrbitNode;
  x: number;
  y: number;
  z: number;
}

/** Even spread over a sphere, offset so nothing lands exactly on a pole. */
function fibonacciSphere(count: number): Array<{ x: number; y: number; z: number }> {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
  });
}

const MAX_ANGLE = (Math.PI / 180) * 96; // just past 90° — nodes fade out behind you

export default function OrbitalCluster({
  nodes,
  selectedId,
  onSelect,
  fov = (Math.PI / 180) * 78,
  guard = { x: 0.95, y: 0.52, cy: -0.34 },
  className = '',
}: OrbitalClusterProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  // Where the viewer is looking. Changes every frame, so it lives in refs.
  const view = useRef({ yaw: 0, pitch: 0 });
  const vel = useRef({ yaw: 0.0038, pitch: 0 });
  const drag = useRef({ active: false, lx: 0, ly: 0, moved: 0 });
  const hovering = useRef(false);

  const dirs: Dir[] = useMemo(() => {
    const pts = fibonacciSphere(nodes.length);
    return nodes.map((node, i) => ({ node, ...pts[i] }));
  }, [nodes]);

  const maxWeight = useMemo(() => Math.max(1, ...nodes.map((n) => n.weight)), [nodes]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // A backgrounded tab returns a delta of seconds; clamping stops the view
      // from whipping around on return.
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;

      if (!drag.current.active) {
        // Drift back to a slow idle pan, and level the pitch so the horizon
        // rights itself after a flick.
        if (!hovering.current) {
          vel.current.yaw += (0.0038 - vel.current.yaw) * 0.02 * dt;
        } else {
          // Ease down to a quarter speed, never to zero.
          vel.current.yaw += (0.0038 * 0.25 - vel.current.yaw) * 0.06 * dt;
        }
        vel.current.pitch *= Math.pow(0.92, dt);
        view.current.yaw += vel.current.yaw * dt;
        view.current.pitch += vel.current.pitch * dt;
        view.current.pitch += (0 - view.current.pitch) * 0.01 * dt;
      }
      view.current.pitch = Math.max(-0.85, Math.min(0.85, view.current.pitch));

      const host = hostRef.current;
      if (!host) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w < 2 || h < 2) {
        // Zero-sized host: a focal length of 0 would pile every node on the
        // centre point. Wait for a real measurement instead.
        raf = requestAnimationFrame(frame);
        return;
      }
      // Focal length in px per radian: map the half-FOV to the shorter half-axis
      // so the field fits whatever the viewport is.
      const focal = Math.min(w, h) / 2 / fov;
      const guardX = (w / 2) * guard.x;
      const guardY = (h / 2) * guard.y;
      const guardCy = (h / 2) * (guard.cy ?? 0);

      const cy = Math.cos(view.current.yaw);
      const sy = Math.sin(view.current.yaw);
      const cp = Math.cos(view.current.pitch);
      const sp = Math.sin(view.current.pitch);

      dirs.forEach((d, i) => {
        const el = refs.current[i];
        if (!el) return;

        // Rotate the node's direction into view space (yaw then pitch).
        const x1 = d.x * cy - d.z * sy;
        const z1 = d.x * sy + d.z * cy;
        const y2 = d.y * cp - z1 * sp;
        const z2 = d.y * sp + z1 * cp;

        // Angle away from the view axis (+z is straight ahead).
        const theta = Math.acos(Math.max(-1, Math.min(1, z2)));

        if (theta > MAX_ANGLE) {
          // Behind the viewer. Hidden rather than wrapped, so nothing pops
          // through the back of the head.
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          el.style.transform = 'translate3d(-9999px,0,0)';
          return;
        }

        // Equidistant fisheye: radius grows linearly with angle.
        const r = focal * theta;
        const lateral = Math.hypot(x1, y2) || 1e-6;
        let px = (x1 / lateral) * r;
        let py = (-y2 / lateral) * r;

        // Deflect out of the centre column so the headline stays readable.
        // Measured as an elliptical radius, so one test covers a wide, short
        // text block: q < 1 means the node is inside the keep-clear zone, and
        // dividing by q lands it exactly on the boundary. The node keeps
        // orbiting -- it slides around the type instead of over it.
        //
        // Deliberately applied AFTER the projection and never to theta: scale,
        // opacity, blur and z-index all stay driven by the true view angle, so
        // deflected nodes still sit at the right apparent depth.
        if (guardX > 1 && guardY > 1) {
          // Measure in the ellipse's own frame, push, then translate back.
          const ly = py - guardCy;
          const q = Math.hypot(px / guardX, ly / guardY);
          if (q < 1) {
            if (q < 1e-4) {
              // Dead centre: no direction to push along. Send it out along +x
              // rather than dividing by zero.
              px = guardX;
              py = guardCy;
            } else {
              px /= q;
              py = guardCy + ly / q;
            }
          }
        }

        // Nearer the view axis = nearer the viewer = larger.
        const closeness = Math.cos(theta) * 0.5 + 0.5;
        const size = 54 + (d.node.weight / maxWeight) * 46;
        const scale = 0.42 + closeness * 0.95;
        // Fade the last few degrees so nodes dissolve at the rim instead of
        // vanishing mid-stride.
        const rim = Math.min(1, (MAX_ANGLE - theta) / 0.5);

        el.style.transform =
          `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) ` +
          `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.opacity = (rim * (0.3 + closeness * 0.7)).toFixed(3);
        el.style.filter = closeness < 0.6 ? `blur(${((0.6 - closeness) * 6).toFixed(1)}px)` : 'none';
        el.style.zIndex = String(Math.round(closeness * 100));
        el.style.pointerEvents = closeness > 0.55 && rim > 0.6 ? 'auto' : 'none';
      });

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [dirs, fov, maxWeight, guard.x, guard.y, guard.cy]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    drag.current = { active: true, lx: e.clientX, ly: e.clientY, moved: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.lx;
    const dy = e.clientY - drag.current.ly;
    drag.current.lx = e.clientX;
    drag.current.ly = e.clientY;
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    // Inverted: dragging right should swing the world right, i.e. look left.
    view.current.yaw -= dx * 0.0032;
    view.current.pitch -= dy * 0.0026;
    vel.current.yaw = -dx * 0.0016;
    vel.current.pitch = -dy * 0.0012;
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    drag.current.active = false;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      ref={hostRef}
      // No positioning class here on purpose: the caller supplies it. Baking in
      // `relative` fought the `fixed` passed from the shell, and whichever lost
      // the cascade left the host at zero height — which collapsed the focal
      // length to 0 and stacked every node dead centre.
      className={`touch-none select-none overflow-hidden ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => (hovering.current = false)}
      style={{ cursor: 'grab' }}
    >
      {/* Vignette: the inside of a sphere is darker toward the rim, and it
          reinforces the sense of being enclosed. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[200]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 42%, rgba(3,2,10,0.55) 78%, rgba(3,2,10,0.9) 100%)',
        }}
      />

      <div className="absolute left-1/2 top-1/2 h-0 w-0">
        {dirs.map((d, i) => {
          const n = d.node;
          const selected = selectedId === n.id;
          const pct = n.value === null ? 0 : Math.max(0, Math.min(1, n.value));
          const C = 2 * Math.PI * 15.5;
          return (
            <button
              key={n.id}
              type="button"
              ref={(el) => {
                refs.current[i] = el;
              }}
              onClick={() => {
                // A drag that ends over a node should not also select it.
                if (drag.current.moved > 8) return;
                onSelect?.(n.id);
              }}
              aria-label={`${n.label}${n.caption ? `, ${n.caption}` : ''}`}
              aria-pressed={selected}
              className="absolute grid place-items-center rounded-full transition-[background,border-color,box-shadow] duration-300"
              style={{
                background: selected
                  ? 'color-mix(in oklab, var(--accent) 26%, #1d1d1f)'
                  : '#1d1d1f',
                border: `1px solid ${
                  selected
                    ? 'color-mix(in oklab, var(--accent) 70%, transparent)'
                    : 'rgba(255,255,255,0.08)'
                }`,
                boxShadow: selected
                  ? '0 0 0 4px color-mix(in oklab, var(--accent) 16%, transparent)'
                  : 'none',
                willChange: 'transform, opacity, filter',
              }}
            >
              <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none"
                        stroke="rgba(255,255,255,0.09)" strokeWidth="2.5" />
                {n.value !== null && (
                  <circle
                    cx="18" cy="18" r="15.5" fill="none"
                    stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - pct)}
                    style={{ transition: 'stroke-dashoffset 700ms var(--ease-apple)' }}
                  />
                )}
              </svg>
              <span className="pointer-events-none relative z-10 px-1 text-center text-[10px] font-medium leading-[1.1] text-[#f5f5f7]">
                {n.label}
              </span>
              {n.hollow && (
                <span aria-hidden
                      className="absolute -bottom-1 h-1 w-1 rounded-full bg-[#a1a1a6]"
                      title="no observed failures" />
              )}
            </button>
          );
        })}
      </div>

      <span className="pointer-events-none absolute bottom-3 left-1/2 z-[201] -translate-x-1/2 text-[11px] tracking-wide text-[#a1a1a6]">
        Drag to explore
      </span>
    </div>
  );
}
