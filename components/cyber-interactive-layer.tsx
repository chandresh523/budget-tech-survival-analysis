"use client";

import { useEffect, useRef, useCallback } from "react";

const CYAN = "#00c2d1";
const VIOLET = "#7c5cff";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const CONFIG = {
  maxDistance: 140,
  cursorRadius: 180,
  cursorForce: 0.55,
  curvePull: 30,
  friction: 0.97,
  driftSpeed: 0.18,
  density: 15000,
  maxNodes: 170,
  minNodes: 40,
  lineWidth: 0.6,
  nodeRadius: 1.6,
};

export default function CyberInteractiveLayer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorDotRef = useRef<HTMLDivElement | null>(null);
  const cursorRingRef = useRef<HTMLDivElement | null>(null);

  const nodesRef = useRef<Node[]>([]);
  // Initialize mouse in the center of the viewport so cursor is visible immediately
  const mouseRef = useRef({ 
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 500, 
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 400, 
    active: true 
  });
  const ringPosRef = useRef({ 
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 500, 
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 400 
  });
  const dimsRef = useRef({ w: 0, h: 0 });

  const initNodes = useCallback((w: number, h: number) => {
    const count = Math.min(
      CONFIG.maxNodes,
      Math.max(CONFIG.minNodes, Math.floor((w * h) / CONFIG.density))
    );
    const nodes: Node[] = [];
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * CONFIG.driftSpeed,
        vy: (Math.random() - 0.5) * CONFIG.driftSpeed,
      });
    }
    nodesRef.current = nodes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let rafId: number;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      dimsRef.current = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes(w, h);
    };

    resize();
    window.addEventListener("resize", resize);

    const handlePointerMove = (x: number, y: number) => {
      mouseRef.current.x = x;
      mouseRef.current.y = y;
      mouseRef.current.active = true;
    };

    const onMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchstart", onTouchMove, { passive: true });

    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "none";

    const animate = () => {
      const { w, h } = dimsRef.current;
      const nodes = nodesRef.current;
      const mouse = mouseRef.current;

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];

        if (mouse.active) {
          const dx = n.x - mouse.x;
          const dy = n.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          if (dist < CONFIG.cursorRadius) {
            const force = (1 - dist / CONFIG.cursorRadius) * CONFIG.cursorForce;
            n.vx += (dx / dist) * force;
            n.vy += (dy / dist) * force;
          }
        }

        n.vx *= CONFIG.friction;
        n.vy *= CONFIG.friction;
        n.x += n.vx;
        n.y += n.vy;

        if (n.x < -20) n.x = w + 20;
        if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        if (n.y > h + 20) n.y = -20;
      }

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONFIG.maxDistance) {
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            let ctrlX = midX;
            let ctrlY = midY;

            if (mouse.active) {
              const mdx = midX - mouse.x;
              const mdy = midY - mouse.y;
              const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
              if (mdist < CONFIG.cursorRadius) {
                const pull = (1 - mdist / CONFIG.cursorRadius) * CONFIG.curvePull;
                ctrlX = midX - (mdx / (mdist || 1)) * pull;
                ctrlY = midY - (mdy / (mdist || 1)) * pull;
              }
            }

            const alpha = (1 - dist / CONFIG.maxDistance) * 0.6;
            const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            grad.addColorStop(0, `rgba(0,194,209,${alpha})`);
            grad.addColorStop(1, `rgba(124,92,255,${alpha})`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = CONFIG.lineWidth;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(ctrlX, ctrlY, b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        ctx.beginPath();
        ctx.fillStyle = CYAN;
        ctx.shadowColor = CYAN;
        ctx.shadowBlur = 8;
        ctx.arc(n.x, n.y, CONFIG.nodeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchstart", onTouchMove);
      document.body.style.cursor = prevCursor;
      cancelAnimationFrame(rafId);
    };
  }, [initNodes]);

  useEffect(() => {
    let raf: number;
    const ringEase = 0.16;

    const loop = () => {
      const mouse = mouseRef.current;
      const dot = cursorDotRef.current;
      const ring = cursorRingRef.current;
      const ringPos = ringPosRef.current;

      if (dot) {
        dot.style.transform = `translate3d(${mouse.x}px, ${mouse.y}px, 0) translate(-50%, -50%)`;
      }

      ringPos.x += (mouse.x - ringPos.x) * ringEase;
      ringPos.y += (mouse.y - ringPos.y) * ringEase;

      if (ring) {
        ring.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) translate(-50%, -50%)`;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[999] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 block pointer-events-none" />

      <div
        ref={cursorDotRef}
        className="pointer-events-none fixed top-0 left-0 z-[10000] rounded-full"
        style={{
          width: 8,
          height: 8,
          backgroundColor: CYAN,
          boxShadow: `0 0 10px 3px ${CYAN}, 0 0 24px 6px ${CYAN}99`,
          willChange: "transform",
        }}
      />
      <div
        ref={cursorRingRef}
        className="pointer-events-none fixed top-0 left-0 z-[9999] rounded-full"
        style={{
          width: 36,
          height: 36,
          border: `1.5px solid ${VIOLET}`,
          boxShadow: `0 0 16px 3px ${VIOLET}88`,
          willChange: "transform",
        }}
      />
    </div>
  );
}
