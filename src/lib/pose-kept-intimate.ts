/**
 * Local learning for two-person sex layouts (pure). When the player keeps an intimate Day /
 * Story still (a Gallery keeper: favorite or 4★+ — the pose-outcome-stats keep signal), its two
 * bodies are read one at a time (pose-person-reads.ts) and saved to this install's pose library
 * under the layout's key (`missionary:2`). Later guides for that layout draw one of the player's
 * own kept poses now and then (`pickPoseLibraryEntry`), the way everyday poses already reuse
 * harvested stills.
 *
 * Local only: the library lives in this browser and travels with the install's own storage sync
 * (studio-extras), never anywhere else; nothing here ships with the app.
 *
 * A read is saved only when it is two whole bodies that hold the layout's drawn postures — a
 * merged or half-read couple would teach the guide a broken pose.
 */

import { resolveSceneGuidePlan, type IntimateLayout } from '@/lib/day-pose-guide';
import { bodyIsUsable, type NormalizedBody, type PoseLibraryEntry } from '@/lib/pose-library';
import { scorePoseMatch, type DetectedPose } from '@/lib/pose-score';

/**
 * Two-person sex layouts a kept still can teach: the ones whose words always describe one body
 * arrangement. Left out: 69 / face-sitting (Rapid draws them as seated oral, so a kept still is
 * an oral pose under the wrong layout) and the layouts whose recipe changes shape with the beat
 * under one pose key — oral (who gives, seated or standing receiver), wall (face to face, or from
 * behind at a window) and bent (over an edge, or on all fours on the floor). A kept pose of one
 * shape would be drawn under words for the other.
 */
export const KEPT_INTIMATE_LAYOUTS: ReadonlySet<IntimateLayout> = new Set<IntimateLayout>([
  'missionary',
  'mating_press',
  'straddle',
  'reverse_straddle',
  'prone',
  'spoon',
  'scissors',
  'standing',
  'lift',
  'kneeling',
  'lap',
]);

/**
 * Lying layouts whose bodies run the same way (heads at one end). Rapid's commonest broken
 * missionary lays him head to head with her, his body running the other way; the posture check
 * passes it (both lying), so a kept still like that is not learned.
 */
const HEADS_SAME_END: ReadonlySet<IntimateLayout> = new Set<IntimateLayout>([
  'missionary',
  'mating_press',
  'prone',
  'spoon',
]);

type Pt = { x: number; y: number };

/** Neck → hip direction of a body in aspect-true units, or null when unread. */
function bodyAxis(body: NormalizedBody, aspect: number): Pt | null {
  const neck = body[1] ?? (body[2] && body[5] ? mid(body[2], body[5]) : null);
  const hip = body[8] && body[11] ? mid(body[8], body[11]) : (body[8] ?? body[11]);
  if (!neck || !hip) return null;
  return { x: (hip.x - neck.x) * aspect, y: hip.y - neck.y };
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The two bodies point the same way (head to hips), within a right angle. Unread: true. */
export function headsSameEnd(
  a: NormalizedBody,
  b: NormalizedBody,
  canvas: { width: number; height: number }
): boolean {
  const aspect = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 1;
  const u = bodyAxis(a, aspect);
  const v = bodyAxis(b, aspect);
  if (!u || !v) return true;
  return u.x * v.x + u.y * v.y > 0;
}

/** Library entry ids of kept intimate poses start with this. */
export const KEPT_INTIMATE_ID_PREFIX = 'kept-';

/** Is this pose-take layout (`missionary`, from the take's pose key) one a keep can teach? */
export function keptIntimateLayout(layout: string | null | undefined): IntimateLayout | null {
  const value = layout?.trim().toLowerCase() as IntimateLayout | undefined;
  return value && KEPT_INTIMATE_LAYOUTS.has(value) ? value : null;
}

/** The layout's hand-drawn guide (variant 0, no library or references): what a read must hold. */
export function keptIntimateGuide(layout: IntimateLayout): {
  keypoints: NormalizedBody[];
  aspect: number;
} {
  const plan = resolveSceneGuidePlan('', 0, {
    pose: { act: layout, people: 2 },
    forcePeople: 2,
    allowIntimate: true,
    library: [],
    references: [],
    variant: 0,
  }).openPose;
  return { keypoints: plan.keypoints, aspect: plan.canvas.width / plan.canvas.height };
}

export type KeptIntimateRead =
  | { ok: true; entry: PoseLibraryEntry }
  | { ok: false; why: 'layout' | 'people' | 'partial' | 'posture' | 'inverted' };

/**
 * A kept still's per-person read → a pose-library entry for its layout (lead first, as the guide
 * draws them), or why not: not a learnable layout, not two people, a body read too thinly, or a
 * body in another posture than the layout's drawing (a read that merged or swapped the pair).
 */
export function keptIntimateLibraryEntry(input: {
  layout: string | null | undefined;
  detected: DetectedPose;
  /** The layout's drawn guide; defaults to {@link keptIntimateGuide}. */
  guide?: { keypoints: NormalizedBody[]; aspect: number };
  /** The kept take's id (its ComfyUI prompt id), for the entry id. */
  takeId?: string | null;
  now?: number;
}): KeptIntimateRead {
  const layout = keptIntimateLayout(input.layout);
  if (!layout) return { ok: false, why: 'layout' };
  const people = input.detected.people;
  if (people.length !== 2) return { ok: false, why: 'people' };
  if (!people.every(bodyIsUsable)) return { ok: false, why: 'partial' };
  const guide = input.guide ?? keptIntimateGuide(layout);
  if (guide.keypoints.length !== 2) return { ok: false, why: 'layout' };
  const match = scorePoseMatch({
    guide: guide.keypoints,
    guideAspect: guide.aspect,
    detected: { canvas: input.detected.canvas, people },
  });
  const [lead, partner] = match.assignment;
  if (lead == null || partner == null || lead < 0 || partner < 0 || lead === partner) {
    return { ok: false, why: 'people' };
  }
  if (match.postureMiss) return { ok: false, why: 'posture' };
  if (
    HEADS_SAME_END.has(layout) &&
    !headsSameEnd(people[lead]!, people[partner]!, input.detected.canvas)
  ) {
    return { ok: false, why: 'inverted' };
  }
  const { width, height } = input.detected.canvas;
  const now = input.now ?? Date.now();
  const key = `${layout}:2`;
  const tag =
    input.takeId
      ?.trim()
      .replace(/[^a-z0-9-]/gi, '')
      .slice(0, 24) || now.toString(36);
  return {
    ok: true,
    entry: {
      id: `${KEPT_INTIMATE_ID_PREFIX}${key}-${tag}`,
      key,
      aspect: width > 0 && height > 0 ? width / height : guide.aspect,
      people: [people[lead]!, people[partner]!],
      // The player chose it: rank with the hand-imported poses, above auto-harvested ones.
      score: 1,
      createdAt: now,
    },
  };
}
