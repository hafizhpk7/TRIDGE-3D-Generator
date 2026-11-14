import { useEffect, useRef } from 'react';

const COLORS = ['#ff6b9d', '#ff9f43', '#ffd43b', '#3dd9b0', '#4dabf7', '#9b7bff'];
const DURATION_MS = 1800;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
}

/** A short burst of colored triangles. Renders nothing when reduced motion is on. */
export function Confetti({ burst }: { burst: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (burst === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const pieces: Piece[] = Array.from({ length: 80 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const speed = 5 + Math.random() * 8;
      return {
        x: w / 2,
        y: h * 0.62,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 8 + Math.random() * 10,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });

    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = t > DURATION_MS * 0.6 ? 1 - (t - DURATION_MS * 0.6) / (DURATION_MS * 0.4) : 1;
      ctx.globalAlpha = Math.max(0, fade);
      for (const p of pieces) {
        p.vy += 0.28;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(0, -p.size / 1.5);
        ctx.lineTo(p.size / 1.2, p.size / 2);
        ctx.lineTo(-p.size / 1.2, p.size / 2);
        ctx.closePath();
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#22184a';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
      }
      if (t < DURATION_MS) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, w, h);
    };
  }, [burst]);

  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
