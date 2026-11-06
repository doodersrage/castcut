/**
 * A shot's blocking, top-down (Part 18 R7): where the people stand and where the camera is, from
 * what is set — the camera's direction and shot size, which side the lead is on, how many are in
 * it. Coordinates in a 100 × 100 plan, the people around the middle, the camera below them for
 * front-on, round to the side for three-quarter and side, behind for back; further for a wider
 * shot. Pure (BlockingDiagram draws it).
 */

import type { PoseCameraChoice } from './camera-shot';

export type BlockingPlan = {
  people: Array<{ x: number; y: number; lead: boolean }>;
  camera: { x: number; y: number; angleDeg: number };
};

const DISTANCE: Record<string, number> = { head: 18, waist: 26, knees: 33, full: 40 };
const ANGLE: Record<string, number> = { front: 90, 'three-quarter': 50, side: 0, back: 270 };

export function blockingPlan(input: {
  camera?: PoseCameraChoice | null;
  leadSide?: 'left' | 'right';
  people?: number;
}): BlockingPlan {
  const count = Math.max(1, Math.min(4, input.people ?? 1));
  // The lead on her side; the others beside her, 14 apart, the group centred.
  const leadFirst = input.leadSide !== 'right';
  const people = Array.from({ length: count }, (_, i) => ({
    x: 50 + (i - (count - 1) / 2) * 14,
    y: 50,
    lead: leadFirst ? i === 0 : i === count - 1,
  }));
  const distance = DISTANCE[input.camera?.shot ?? 'knees'] ?? 33;
  const angle = ANGLE[input.camera?.direction ?? 'front'] ?? 90;
  const rad = (angle * Math.PI) / 180;
  // y grows downward: the camera sits "below" the people for front-on (angle 90).
  const x = Math.round((50 + Math.cos(rad) * distance) * 10) / 10;
  const y = Math.round((50 + Math.sin(rad) * distance) * 10) / 10;
  // The camera points at the middle.
  const angleDeg = Math.round((Math.atan2(50 - y, 50 - x) * 180) / Math.PI);
  return { people, camera: { x, y, angleDeg } };
}
