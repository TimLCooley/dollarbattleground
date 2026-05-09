"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#B0121A", "#0E2A52", "#F4EFE6"] as const;
const COLOR_WEIGHTS = [0.45, 0.45, 0.1];

function pickColor(): string {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < COLORS.length; i++) {
    acc += COLOR_WEIGHTS[i];
    if (r < acc) return COLORS[i];
  }
  return COLORS[0];
}

type Square = {
  x: number;
  y: number;
  size: number;
  vy: number;
  rot: number;
  vrot: number;
  color: string;
  opacity: number;
};

export function FallingSquares() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    function resize() {
      if (!canvas || !ctx) return;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(initial: boolean): Square {
      return {
        x: Math.random() * width,
        y: initial ? Math.random() * height : -10,
        size: 2 + Math.random() * 4,
        vy: 28 + Math.random() * 92,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 1.6,
        color: pickColor(),
        opacity: 0.28 + Math.random() * 0.5,
      };
    }

    resize();
    const squares: Square[] = Array.from({ length: 90 }, () => spawn(true));
    let last = performance.now();
    let raf = 0;

    function frame(now: number) {
      if (!ctx) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, width, height);

      for (const s of squares) {
        s.y += s.vy * dt;
        s.rot += s.vrot * dt;
        if (s.y - s.size > height) {
          Object.assign(s, spawn(false));
        }
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.globalAlpha = s.opacity;
        ctx.fillStyle = s.color;
        ctx.fillRect(-s.size / 2, -s.size / 2, s.size, s.size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
