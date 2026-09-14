/**
 * Bundled sample day-in-the-life reel for welcome / offline demo.
 * SVG data URLs — no binary assets required.
 */

import type { FilmPlaylistShot } from './character-film';
import type { DaySlotId, DaySlotStill } from './day-planner';

function svgDataUrl(input: {
  label: string;
  subtitle: string;
  from: string;
  to: string;
  accent: string;
}): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${input.from}"/>
      <stop offset="100%" stop-color="${input.to}"/>
    </linearGradient>
  </defs>
  <rect width="960" height="540" fill="url(#g)"/>
  <circle cx="780" cy="120" r="90" fill="${input.accent}" opacity="0.35"/>
  <circle cx="160" cy="420" r="140" fill="${input.accent}" opacity="0.2"/>
  <text x="64" y="280" fill="#fff" font-family="Georgia, serif" font-size="64" font-weight="600">${input.label}</text>
  <text x="64" y="340" fill="rgba(255,255,255,0.85)" font-family="system-ui,sans-serif" font-size="28">${input.subtitle}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const SAMPLE_FRAMES: Array<{
  id: DaySlotId;
  title: string;
  subtitle: string;
  from: string;
  to: string;
  accent: string;
  holdSec: number;
}> = [
  {
    id: 'morning',
    title: 'Morning',
    subtitle: 'Soft light · quiet start',
    from: '#f6d365',
    to: '#fda085',
    accent: '#fff7ed',
    holdSec: 2.2,
  },
  {
    id: 'afternoon',
    title: 'Afternoon',
    subtitle: 'Café energy · candid',
    from: '#89f7fe',
    to: '#66a6ff',
    accent: '#e0f2fe',
    holdSec: 2.2,
  },
  {
    id: 'evening',
    title: 'Evening',
    subtitle: 'Golden hour · rooftop',
    from: '#f093fb',
    to: '#f5576c',
    accent: '#fce7f3',
    holdSec: 2.4,
  },
  {
    id: 'night',
    title: 'Night',
    subtitle: 'City lights · walk home',
    from: '#0f2027',
    to: '#2c5364',
    accent: '#67e8f9',
    holdSec: 2.6,
  },
];

/** Four stills representing a finished Day cut — for welcome preview. */
export function welcomeSampleFilmShots(): FilmPlaylistShot[] {
  return SAMPLE_FRAMES.map(frame => ({
    entryId: `sample-${frame.id}`,
    title: frame.title,
    url: svgDataUrl({
      label: frame.title,
      subtitle: frame.subtitle,
      from: frame.from,
      to: frame.to,
      accent: frame.accent,
    }),
    kind: 'still' as const,
    holdSec: frame.holdSec,
  }));
}

/** Seed completed demo stills into Day when Comfy is unavailable. */
export function buildDemoDayStills(): DaySlotStill[] {
  return SAMPLE_FRAMES.map(frame => ({
    slotId: frame.id,
    status: 'completed' as const,
    imageUrl: svgDataUrl({
      label: frame.title,
      subtitle: frame.subtitle,
      from: frame.from,
      to: frame.to,
      accent: frame.accent,
    }),
    promptId: `demo-${frame.id}`,
  }));
}

export function demoDayStillCount(): number {
  return SAMPLE_FRAMES.length;
}
