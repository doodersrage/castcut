/**
 * Bundled sample day-in-the-life reel for welcome / offline demo.
 * Prefers a real mute MP4 in public/; falls back to photographic SVG stills.
 */

import type { FilmPlaylistShot } from './character-film';
import type { DaySlotId, DaySlotStill } from './day-planner';

/** Mute morning→night sample cut (ffmpeg-generated, checked into public/). */
export const WELCOME_SAMPLE_REEL_URL = '/samples/day-sample-reel.mp4';

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

/**
 * A real frame of the sample Day: Nora (the demo Cast) morning to night, rendered by Castcut —
 * the welcome used to show flat gradient cards (UI review 2026-10-11: "thin").
 */
function frameUrl(frame: (typeof SAMPLE_FRAMES)[number]): string {
  return `/samples/day-${frame.id}.webp`;
}

/** One mute clip representing a finished Day cut — for welcome / Watch sample. */
export function welcomeSampleFilmShots(): FilmPlaylistShot[] {
  return [
    {
      entryId: 'sample-day-reel',
      title: 'Sample Day',
      url: WELCOME_SAMPLE_REEL_URL,
      kind: 'clip',
    },
  ];
}

/** Fallback still playlist when the MP4 cannot play (tests / older clients). */
export function welcomeSampleStillShots(): FilmPlaylistShot[] {
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
