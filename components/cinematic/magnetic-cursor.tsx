'use client';

/**
 * Physics cursor that snaps to data.
 *
 * A lerped dot chasing the pointer, which magnetically captures anything marked
 * `data-magnetic` and expands into a label.
 *
 * The capture is spring-weighted rather than a hard snap: inside the radius the
 * dot is pulled toward the target's centre by a falloff, so it eases in and
 * releases with momentum instead of teleporting. A hard snap feels like a bug;
 * a weighted one feels like magnetism.
 *
 * Runs entirely outside React — one rAF loop writing transforms. It is disabled
 * for coarse pointers (there is no cursor to augment on a touchscreen) and
 * under Reduce Motion.
 */

import { useEffect, useRef } from 'react';
import { publishPointer, publishPointerDown, resetPointer } from '@/lib/pointer-state';

const CAPTURE_RADIUS = 78;

export default function MagneticCursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const d = dot.current;
    const r = ring.current;
    const c = chip.current;
    if (!d || !r || !c) return;

    const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
    const pos = { ...pointer };
    const ringPos = { ...pointer };
    let captured: HTMLElement | null = null;
    let strength = 0;

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      // Publish outward as well as inward. This used to stay entirely inside
      // this closure, which is why nothing else on the page — least of all the
      // background shader — could react to the cursor.
      publishPointer(e.clientX, e.clientY, innerWidth, innerHeight);

      // elementFromPoint rather than pointerenter listeners: the nodes move
      // every frame under their own animation, so enter/leave events fire
      // erratically. Hit-testing the actual composited position is reliable.
      const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      captured = hit?.closest<HTMLElement>('[data-magnetic]') ?? null;
    };

    let raf = 0;
    const loop = () => {
      let tx = pointer.x;
      let ty = pointer.y;
      let targetStrength = 0;

      if (captured) {
        const box = captured.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const dist = Math.hypot(pointer.x - cx, pointer.y - cy);
        if (dist < CAPTURE_RADIUS + Math.max(box.width, box.height) / 2) {
          // Falloff: full pull at the centre, none at the rim. Squaring makes
          // the approach gentle and the settle decisive.
          const pull = Math.pow(1 - Math.min(1, dist / (CAPTURE_RADIUS * 1.6)), 2);
          tx = pointer.x + (cx - pointer.x) * pull * 0.85;
          ty = pointer.y + (cy - pointer.y) * pull * 0.85;
          targetStrength = pull;
        }
      }

      pos.x += (tx - pos.x) * 0.35;
      pos.y += (ty - pos.y) * 0.35;
      // The ring trails the dot — that lag is what reads as mass.
      ringPos.x += (tx - ringPos.x) * 0.16;
      ringPos.y += (ty - ringPos.y) * 0.16;
      strength += (targetStrength - strength) * 0.18;

      d.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;
      r.style.transform =
        `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) translate(-50%, -50%) ` +
        `scale(${(1 + strength * 1.5).toFixed(3)})`;
      r.style.opacity = (0.28 + strength * 0.6).toFixed(3);

      const label = captured?.getAttribute('data-magnetic');
      if (label && strength > 0.25) {
        if (c.textContent !== label) c.textContent = label;
        c.style.opacity = String(Math.min(1, (strength - 0.25) * 3));
        c.style.transform =
          `translate3d(${ringPos.x}px, ${ringPos.y - 46}px, 0) translate(-50%, -50%) ` +
          `scale(${(0.9 + strength * 0.1).toFixed(3)})`;
      } else {
        c.style.opacity = '0';
      }

      raf = requestAnimationFrame(loop);
    };

    const onDown = (e: PointerEvent) => {
      // Primary button only: a right-click or a middle-drag must not grab the
      // camera.
      if (e.button === 0) publishPointerDown(true);
    };
    const onUp = () => publishPointerDown(false);

    // Hide the native cursor, as both Palomino and personaal.studio do, so the
    // lerped dot IS the pointer rather than trailing a second one.
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = 'none';

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    // A pointer that leaves the window never sends pointerup, which would leave
    // the camera stuck in a held drag forever.
    window.addEventListener('blur', onUp);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
      cancelAnimationFrame(raf);
      document.body.style.cursor = previousCursor;
      resetPointer();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      <div
        ref={ring}
        className="fixed left-0 top-0 h-10 w-10 rounded-full border"
        style={{ borderColor: 'var(--accent)', opacity: 0.28, willChange: 'transform' }}
      />
      <div
        ref={dot}
        className="fixed left-0 top-0 h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--accent)', willChange: 'transform' }}
      />
      <div
        ref={chip}
        className="glass fixed left-0 top-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium text-ink-100"
        style={{ opacity: 0, willChange: 'transform, opacity' }}
      />
    </div>
  );
}
