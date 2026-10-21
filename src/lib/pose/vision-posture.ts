/**
 * A photo's posture read by the vision model, for "From a photo". DWPose gives flat joints, and a
 * body shot from above or at an angle reads wrong from them: a woman reclining on a sofa, seen
 * from above, came out "standing on her right leg, left leg lifted" (2026-10-20). The vision model
 * sees the sofa and the angle, but an 8B model mixes up her left and right (it mirrored the legs
 * of the same photo on a second ask). So it answers only what joints cannot — the posture from a
 * fixed list and what she rests on — and the joints still say every limb and side
 * (describePoseFigure).
 *
 * Trusted only for a supported posture (reclining, lying, sitting, kneeling, crouching, all
 * fours). An upright one stays the joints' call: the model called a woman standing on a road
 * "bending over" while the joints read her standing, which she was. Client-safe.
 */

import type { PhotoPosture, VisionPostureClass } from './types';

export type { PhotoPosture, VisionPostureClass };

export const VISION_POSTURE_SYSTEM_PROMPT = `You read one person's body posture in a photo. Answer with JSON only:
{"posture": one of "standing","walking","sitting","kneeling","crouching","reclining","lying on her back","lying on her front","lying on her side","on all fours","bending over",
 "support": what her body rests on in 1-3 words ("the floor", "a sofa", "a bed", "a chair", "the ground") or "nothing" when standing}
"reclining" = half lying with her back propped up against something (a sofa back, pillows, a wall). Judge the body, not the camera angle: a person photographed from above is still reclining or lying.`;

export const VISION_POSTURE_PROMPT = 'Her posture?';

const POSTURES: Record<string, VisionPostureClass> = {
  standing: 'standing',
  walking: 'walking',
  sitting: 'sitting',
  kneeling: 'kneeling',
  crouching: 'crouching',
  reclining: 'reclining',
  'lying on her back': 'lying-back',
  'lying on her front': 'lying-front',
  'lying on her side': 'lying-side',
  'on all fours': 'all-fours',
  'bending over': 'bending',
};

const CLASSES = new Set<VisionPostureClass>(Object.values(POSTURES));

/** Postures the vision read decides; an upright one is left to the joints. */
const SUPPORTED = new Set<VisionPostureClass>([
  'sitting',
  'kneeling',
  'crouching',
  'reclining',
  'lying-back',
  'lying-front',
  'lying-side',
  'all-fours',
]);

/** 1–3 plain words ("a sofa"), or undefined for none / anything that is not a short noun. */
function cleanSupport(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || /^(?:nothing|none|n\/?a|no)$/.test(text)) return undefined;
  const words = text.split(' ');
  if (words.length > 4) return undefined;
  return /^(?:a|an|the|her|his)$/.test(words[0]!) ? text : `the ${text}`;
}

/** The model's reply ({"posture": …, "support": …}, maybe in a code fence) → a posture, or null. */
export function parseVisionPosture(reply: string): PhotoPosture | null {
  const json = /\{[\s\S]*\}/.exec(reply)?.[0];
  if (!json) return null;
  let record: { posture?: unknown; support?: unknown };
  try {
    record = JSON.parse(json) as typeof record;
  } catch {
    return null;
  }
  const label =
    typeof record.posture === 'string'
      ? record.posture.toLowerCase().trim().replace(/\.$/, '')
      : '';
  const posture = POSTURES[label] ?? (label.startsWith('lying') ? 'lying-back' : undefined);
  if (!posture) return null;
  const support =
    posture === 'standing' || posture === 'walking' ? undefined : cleanSupport(record.support);
  return support ? { posture, support } : { posture };
}

/** A stored posture read, or undefined. */
export function normalizePhotoPosture(raw: unknown): PhotoPosture | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as { posture?: unknown; support?: unknown };
  if (typeof record.posture !== 'string' || !CLASSES.has(record.posture as VisionPostureClass)) {
    return undefined;
  }
  const support = cleanSupport(record.support);
  return {
    posture: record.posture as VisionPostureClass,
    ...(support ? { support } : {}),
  };
}

/** True when the vision read should set the stance (a supported posture). */
export function visionPostureDecides(posture: PhotoPosture | null | undefined): boolean {
  return Boolean(posture && SUPPORTED.has(posture.posture));
}

/** The stance for a supported posture ("reclining back against a sofa"); null when upright. */
export function visionPostureStance(
  posture: PhotoPosture | null | undefined,
  possessive: 'her' | 'his' = 'her'
): string | null {
  if (!posture || !visionPostureDecides(posture)) return null;
  const on = posture.support ? ` on ${posture.support}` : '';
  switch (posture.posture) {
    case 'reclining':
      return `reclining back against ${posture.support ?? 'cushions'}`;
    case 'lying-back':
      return `lying on ${possessive} back${on}`;
    case 'lying-front':
      return `lying on ${possessive} front${on}`;
    case 'lying-side':
      return `lying on ${possessive} side${on}`;
    case 'sitting':
      return `sitting${on}`;
    case 'kneeling':
      return `kneeling${on}`;
    case 'crouching':
      return 'crouching low';
    case 'all-fours':
      return `on all fours${on}`;
    default:
      return null;
  }
}
