/**
 * Bundled sample day-in-the-life reel for welcome / offline demo.
 * Richer photographic SVG stills — no binary assets required.
 */

import type { FilmPlaylistShot } from './character-film';
import type { DaySlotId, DaySlotStill } from './day-planner';

function svgDataUrl(input: {
  label: string;
  subtitle: string;
  from: string;
  mid: string;
  to: string;
  accent: string;
  sunX: number;
  sunY: number;
}): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${input.from}"/>
      <stop offset="55%" stop-color="${input.mid}"/>
      <stop offset="100%" stop-color="${input.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${input.accent}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${input.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="960" height="540" fill="url(#sky)"/>
  <circle cx="${input.sunX}" cy="${input.sunY}" r="120" fill="url(#glow)"/>
  <circle cx="${input.sunX}" cy="${input.sunY}" r="48" fill="${input.accent}" opacity="0.9"/>
  <path d="M0 360 Q240 300 480 340 T960 320 L960 540 L0 540 Z" fill="rgba(0,0,0,0.22)"/>
  <path d="M120 420 Q180 360 220 420" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="3"/>
  <ellipse cx="200" cy="430" rx="28" ry="10" fill="rgba(0,0,0,0.35)"/>
  <rect x="186" y="380" width="28" height="50" rx="10" fill="rgba(20,20,20,0.55)"/>
  <circle cx="200" cy="368" r="14" fill="rgba(255,220,200,0.75)"/>
  <text x="48" y="84" fill="#fff" font-family="Georgia, serif" font-size="52" font-weight="600">${input.label}</text>
  <text x="48" y="128" fill="rgba(255,255,255,0.88)" font-family="system-ui,sans-serif" font-size="24">${input.subtitle}</text>
  <text x="48" y="500" fill="rgba(255,255,255,0.55)" font-family="system-ui,sans-serif" font-size="16">Sample reel · Castcut</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const SAMPLE_FRAMES: Array<{
  id: DaySlotId;
  title: string;
  subtitle: string;
  from: string;
  mid: string;
  to: string;
  accent: string;
  sunX: number;
  sunY: number;
  holdSec: number;
}> = [
  {
    id: 'morning',
    title: 'Morning',
    subtitle: 'Soft light · quiet start',
    from: '#ffe29f',
    mid: '#ffa99f',
    to: '#ff719a',
    accent: '#fff1c1',
    sunX: 780,
    sunY: 140,
    holdSec: 2.2,
  },
  {
    id: 'afternoon',
    title: 'Afternoon',
    subtitle: 'Café energy · candid',
    from: '#a1c4fd',
    mid: '#c2e9fb',
    to: '#89f7fe',
    accent: '#ffffff',
    sunX: 720,
    sunY: 100,
    holdSec: 2.2,
  },
  {
    id: 'evening',
    title: 'Evening',
    subtitle: 'Golden hour · rooftop',
    from: '#f093fb',
    mid: '#f5576c',
    to: '#4e4376',
    accent: '#ffd59a',
    sunX: 200,
    sunY: 180,
    holdSec: 2.4,
  },
  {
    id: 'night',
    title: 'Night',
    subtitle: 'City lights · walk home',
    from: '#0f2027',
    mid: '#203a43',
    to: '#2c5364',
    accent: '#67e8f9',
    sunX: 820,
    sunY: 90,
    holdSec: 2.6,
  },
];

function frameUrl(frame: (typeof SAMPLE_FRAMES)[number]): string {
  return svgDataUrl({
    label: frame.title,
    subtitle: frame.subtitle,
    from: frame.from,
    mid: frame.mid,
    to: frame.to,
    accent: frame.accent,
    sunX: frame.sunX,
    sunY: frame.sunY,
  });
}

/** Four stills representing a finished Day cut — for welcome preview. */
export function welcomeSampleFilmShots(): FilmPlaylistShot[] {
  return SAMPLE_FRAMES.map(frame => ({
    entryId: `sample-${frame.id}`,
    title: frame.title,
    url: frameUrl(frame),
    kind: 'still' as const,
    holdSec: frame.holdSec,
  }));
}

/** Seed completed demo stills into Day when Comfy is unavailable. */
export function buildDemoDayStills(): DaySlotStill[] {
  return SAMPLE_FRAMES.map(frame => ({
    slotId: frame.id,
    status: 'completed' as const,
    imageUrl: frameUrl(frame),
    promptId: `demo-${frame.id}`,
  }));
}

export function demoDayStillCount(): number {
  return SAMPLE_FRAMES.length;
}
