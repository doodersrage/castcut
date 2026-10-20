'use client';

import { useEffect, useRef } from 'react';
import { SYSTEM_TRAY_CELEBRATE_EVENT } from '@/lib/app/system-tray-celebrate';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
};

const COLORS = ['#9eb6e0', '#bae6fd', '#7dd3fc', '#5b7fc4', '#e0f2fe'];
const PARTICLE_COUNT = 36;
const DURATION_MS = 900;

function burstOrigin(): { x: number; y: number } {
  const tray = document.querySelector('[data-testid="system-tray"]');
  if (tray instanceof HTMLElement) {
    const rect = tray.getBoundingClientRect();
    if (rect.width > 8 && rect.height > 8) {
      return { x: rect.left + rect.width * 0.72, y: rect.top + rect.height * 0.45 };
    }
  }
  return {
    x: window.innerWidth - 96,
    y: window.innerHeight - 96,
  };
}

function spawnParticles(): Particle[] {
  const origin = burstOrigin();
  return Array.from({ length: PARTICLE_COUNT }, (_, index) => {
    const angle = (Math.PI * 2 * index) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.4;
    const speed = 140 + Math.random() * 220;
    return {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      size: 3 + Math.random() * 5,
      life: 0,
      maxLife: 0.55 + Math.random() * 0.45,
      color: COLORS[index % COLORS.length]!,
    };
  });
}

/** Always-mounted canvas burst. Independent of whether the tray is visible. */
export default function SystemTrayCelebrateOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let particles: Particle[] = [];
    let frame = 0;
    let lastTs = 0;
    let running = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const draw = (ts: number) => {
      if (!running) {
        return;
      }
      const dt = lastTs ? Math.min(0.032, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      let alive = false;
      for (const particle of particles) {
        particle.life += dt;
        if (particle.life >= particle.maxLife) {
          continue;
        }
        alive = true;
        particle.vy += 420 * dt;
        particle.vx *= 0.985;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        const t = 1 - particle.life / particle.maxLife;
        ctx.globalAlpha = t;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      if (alive) {
        frame = window.requestAnimationFrame(draw);
      } else {
        running = false;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    const start = () => {
      particles = spawnParticles();
      lastTs = 0;
      if (!running) {
        running = true;
        frame = window.requestAnimationFrame(draw);
      }
      window.setTimeout(() => {
        if (running) {
          /* loop stops itself when particles die */
        }
      }, DURATION_MS + 200);
    };

    const onCelebrate = () => start();
    window.addEventListener(SYSTEM_TRAY_CELEBRATE_EVENT, onCelebrate);
    window.addEventListener('resize', resize);

    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener(SYSTEM_TRAY_CELEBRATE_EVENT, onCelebrate);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="system-tray-celebrate"
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        pointerEvents: 'none',
      }}
    />
  );
}
