/**
 * "From a photo" on a Day slot or Story beat: fit the people DWPose read from the player's photo
 * to the still's headcount. A one-person still takes the largest person (the reader orders the
 * lead first); a two-person still needs two people in the photo. Pure — the pose preview and the
 * tests share it.
 */

import type { PhotoPose } from '@/lib/day-pose-guide';

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
      pose: { ...base, people: read.people.slice(0, 1) },
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
      pose: { ...base, people: read.people.slice(0, 2) },
      note:
        found > 2
          ? `Found ${count(found)} — this still is two people, so it uses the two largest.`
          : 'Using both people from your photo.',
    };
  }
  // A still is the lead, or the lead and one other: never a third figure from a group photo.
  const kept = read.people.slice(0, 2);
  return {
    pose: { ...base, people: kept },
    note:
      found > kept.length
        ? `Found ${count(found)} — using the two largest.`
        : `Using your photo (${count(kept.length)}).`,
  };
}
