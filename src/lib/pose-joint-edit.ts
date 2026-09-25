/** Hand edits to a guide skeleton (the pose preview's joint editor). Pure. */

import type { NormalizedBody } from '@/lib/pose-library';

/** COCO-18 eye / ear points — they ride along when the nose (head) moves. */
const FACE = [14, 15, 16, 17] as const;

const clamp01 = (value: number) => Math.min(0.99, Math.max(0.01, value));

/** Move one joint (and the face points with the nose) — pure, for tests and keyboard nudges. */
export function moveJoint(
  bodies: NormalizedBody[],
  person: number,
  joint: number,
  to: { x: number; y: number }
): NormalizedBody[] {
  return bodies.map((body, index) => {
    if (index !== person) return body;
    const from = body[joint];
    if (!from) return body;
    const next = { x: clamp01(to.x), y: clamp01(to.y) };
    const dx = next.x - from.x;
    const dy = next.y - from.y;
    return body.map((p, i) => {
      if (i === joint) return next;
      if (joint === 0 && p && (FACE as readonly number[]).includes(i)) {
        return { x: clamp01(p.x + dx), y: clamp01(p.y + dy) };
      }
      return p;
    });
  });
}
