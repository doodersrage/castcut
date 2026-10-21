/**
 * "From a photo" on a Day slot or Story beat: fit the people DWPose read from the player's photo
 * to the still's headcount. A one-person still takes the largest person (the reader orders the
 * lead first); a two-person still needs two people in the photo. Pure — the pose preview and the
 * tests share it.
 */

import type { PhotoPose } from '@/lib/pose/types';

export type PhotoPoseFit = {
  pose: PhotoPose;
  /** What the preview says about the read. */
  note: string;
};

function count(n: number): string {
  return `${n} ${n === 1 ? 'person' : 'people'}`;
}

/**
 * The read pose cut to `people` figures (1 = solo, 2 = duo; unset = as read, at most two).
 * Throws an Error with a plain message when the photo cannot pose this still.
 */
export function fitPhotoPoseToHeadcount(read: PhotoPose, people?: number | null): PhotoPoseFit {
  const found = read.people.length;
  if (found === 0) {
    throw new Error('No person found in that photo — it needs the whole body in frame.');
  }
  const base = { aspect: read.aspect, source: 'photo' as const };
  if (people === 1) {
    return {
      // The photo's posture read is the lead's: it stays with her figure, however many people
      // the photo had.
      pose: {
        ...base,
        people: read.people.slice(0, 1),
        ...(read.posture ? { posture: read.posture } : {}),
      },
      note:
        found > 1
          ? `Found ${count(found)} — this still is one person, so it uses the largest one.`
          : 'Using the pose from your photo.',
    };
  }
  if (people === 2) {
    if (found < 2) {
      throw new Error(
        'Only one person found in that photo, and this still is two people. Pick a photo with both people fully in frame.'
      );
    }
    return {
      // The lead's posture read rides along (a two-figure description ignores it).
      pose: {
        ...base,
        people: read.people.slice(0, 2),
        ...(read.posture ? { posture: read.posture } : {}),
      },
      note:
        found > 2
          ? `Found ${count(found)} — this still is two people, so it uses the two largest.`
          : 'Using both people from your photo.',
    };
  }
  // A still is the lead, or the lead and one other: never a third figure from a group photo.
  const kept = read.people.slice(0, 2);
  return {
    pose: {
      ...base,
      people: kept,
      // The lead's posture read rides along: a one-figure still (photoPoseForStill keeps the
      // lead) is described with it; a two-figure description ignores it.
      ...(read.posture ? { posture: read.posture } : {}),
    },
    note:
      found > kept.length
        ? `Found ${count(found)} — using the two largest.`
        : `Using your photo (${count(kept.length)}).`,
  };
}

/** Above the top joint (the eyes and nose): room for the top of the head, as the references. */
const FRAME_TOP_PAD = 0.15;
/** Below the lowest joint (the ankles): room for the feet. */
const FRAME_BOTTOM_PAD = 0.07;
/** Each side, as a share of the body's own height (or width, lying down). */
const FRAME_SIDE_PAD = 0.1;
const R_ANKLE = 10;
const L_ANKLE = 13;

/**
 * A photo pose cropped to its people, like the pose references are: the box around their joints
 * with a margin for the head and feet, the photo's proportions kept (no stretch), centred on them.
 * Contain-fitted onto the guide (placeLibraryPeople) they fill it the way a reference does.
 *
 * Pose bench (2026-10-21): letterboxed whole, the picked person was 19–38% of the guide's height
 * on 8 of 12 photos and often off-centre (centre x 0.08 / 0.19 / 0.78) — all 4 extra-person
 * stills (she stood while a small second woman did the pose at the map's figure) and Noct-Q's
 * tiny figures came from it.
 *
 * A body cut off at the photo's lower edge (no ankles read) keeps that edge as the crop's bottom,
 * so a three-quarter shot stays cut where the photo cut it rather than floating mid-guide.
 */
export function framePhotoPeople(photo: PhotoPose): PhotoPose {
  const aspect = photo.aspect > 0 ? photo.aspect : 2 / 3;
  const points = photo.people.flatMap(body =>
    body.filter((p): p is { x: number; y: number } => Boolean(p))
  );
  if (points.length < 2) return photo;
  // Pixel units: x scaled by the photo's aspect, so both axes share one scale.
  const xs = points.map(p => p.x * aspect);
  const ys = points.map(p => p.y);
  const [left, right] = [Math.min(...xs), Math.max(...xs)];
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
  const w = right - left;
  const h = bottom - top;
  const size = Math.max(w, h);
  if (size <= 1e-6) return photo;
  const feet = photo.people.some(body => body[R_ANKLE] || body[L_ANKLE]);
  const cropTop = top - FRAME_TOP_PAD * h;
  const cropBottom = feet ? bottom + FRAME_BOTTOM_PAD * h : Math.max(1, bottom);
  const cropLeft = left - FRAME_SIDE_PAD * size;
  const cropRight = right + FRAME_SIDE_PAD * size;
  const cropW = cropRight - cropLeft;
  const cropH = cropBottom - cropTop;
  // Already about as framed as that (a reference, a close crop): leave it.
  if (cropW >= aspect * 0.95 && cropH >= 0.95) return photo;
  return {
    ...photo,
    aspect: cropW / cropH,
    people: photo.people.map(body =>
      body.map(p =>
        p
          ? {
              x: Math.round(((p.x * aspect - cropLeft) / cropW) * 10000) / 10000,
              y: Math.round(((p.y - cropTop) / cropH) * 10000) / 10000,
            }
          : null
      )
    ),
  };
}
