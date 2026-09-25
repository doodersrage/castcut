/**
 * Story pose check — pure helpers.
 *
 * Story stills carry the Image 3 guide they were queued with (`poseGuideExpect`). Once the
 * still lands, `useStoryPoseCheck` reads the pose back with DWPose and stores `poseMatch` on the
 * beat; the beat card shows it and suggests a retry when the still ignored its guide.
 */

import type { NormalizedBody } from '@/lib/pose-library';
import type { PoseMissView } from '@/lib/pose-coaching';
import type { PoseGuideStylePreference } from '@/lib/pose-guide-prompt';

/** The guide a Story take was queued with, tied to that take's ComfyUI prompt id. */
export type StoryPoseGuideExpect = {
  promptId: string;
  keypoints: NormalizedBody[];
  /** Guide canvas width / height. */
  aspect: number;
  style: PoseGuideStylePreference;
  poseKey: string;
  /** The prompt also spelled the pose out in words. */
  cued?: boolean;
};

/** Measured face match of a solo still against the Story reference photo. */
export type StoryFaceMatch = { imageUrl: string; similarity: number };

/** Beat card line for the shown still's face match, or null when not measured. */
export function storyFaceMatchLabel(
  beat: { imageUrl?: string; faceMatch?: StoryFaceMatch },
  thresholds: { miss: number; warn: number }
): { text: string; miss: boolean } | null {
  const match = beat.faceMatch;
  if (!match || match.imageUrl !== beat.imageUrl?.trim()) {
    return null;
  }
  const pct = Math.round(match.similarity * 100);
  if (match.similarity < thresholds.miss) {
    return { text: `Face match ${pct}% — this doesn't look like your Cast; Retry.`, miss: true };
  }
  if (match.similarity < thresholds.warn) {
    return { text: `Face match ${pct}% — worth a look.`, miss: false };
  }
  return { text: `Face match ${pct}%`, miss: false };
}

/** Pose-check result for the still at `imageUrl`. */
export type StoryPoseMatch = {
  imageUrl: string;
  score: number;
  expectedPeople: number;
  detectedPeople: number;
  /** On a miss: the still's lead laid over the guide's, and the limbs that differ. */
  missView?: PoseMissView;
};

type BeatLike = {
  id: string;
  at: number;
  promptId?: string;
  imageUrl?: string;
  stillStatus?: string;
  poseGuideExpect?: StoryPoseGuideExpect;
  poseMatch?: StoryPoseMatch;
};

/**
 * First beat whose shown still is finished, was queued with a guide (same prompt id — an older
 * take picked from the strip was drawn from a different guide), and has not been scored yet.
 */
export function nextStoryPoseCheck<T extends BeatLike>(
  story: T[],
  skipImageUrls: ReadonlySet<string> = new Set()
): T | null {
  for (const beat of story) {
    const imageUrl = beat.imageUrl?.trim();
    const expect = beat.poseGuideExpect;
    if (
      beat.stillStatus === 'completed' &&
      imageUrl &&
      expect &&
      beat.promptId &&
      expect.promptId === beat.promptId &&
      beat.poseMatch?.imageUrl !== imageUrl &&
      !skipImageUrls.has(imageUrl)
    ) {
      return beat;
    }
  }
  return null;
}

/** Beat card line for the shown still, or null when it has not been checked. */
export function storyPoseMatchLabel(
  beat: BeatLike,
  minScore: number
): {
  text: string;
  miss: boolean;
} | null {
  const match = beat.poseMatch;
  if (!match || match.imageUrl !== beat.imageUrl?.trim()) {
    return null;
  }
  const pct = Math.round(match.score * 100);
  const miss = match.score < minScore;
  const heads =
    match.detectedPeople !== match.expectedPeople
      ? ` · ${match.detectedPeople} of ${match.expectedPeople} people found`
      : '';
  return {
    text: miss
      ? `Pose match ${pct}%${heads} — the still didn't follow its guide; Retry draws a new variant.`
      : `Pose match ${pct}%${heads}`,
    miss,
  };
}

/**
 * Beats "Retry N flagged" redoes: a failed still, or a finished still whose pose or face check
 * missed (the same misses the beat card suggests Retry for). In reel order.
 */
export function storyFlaggedBeats<T extends BeatLike & { faceMatch?: StoryFaceMatch }>(
  story: T[],
  thresholds: { minPose: number; minFace: number; warnFace: number }
): T[] {
  return story.filter(beat => {
    if (beat.stillStatus === 'error') {
      return true;
    }
    if (beat.stillStatus !== 'completed') {
      return false;
    }
    const pose = storyPoseMatchLabel(beat, thresholds.minPose);
    const face = storyFaceMatchLabel(beat, {
      miss: thresholds.minFace,
      warn: thresholds.warnFace,
    });
    return Boolean(pose?.miss || face?.miss);
  });
}
