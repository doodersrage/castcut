/**
 * Story pose check — pure helpers.
 *
 * Story stills carry the Image 3 guide they were queued with (`poseGuideExpect`). Once the
 * still lands, `useStoryPoseCheck` reads the pose back with DWPose and stores `poseMatch` on the
 * beat; the beat card shows it and suggests a retry when the still ignored its guide.
 */

import type { NormalizedBody } from '@/lib/pose-library';
import type { PoseGuideStylePreference } from '@/lib/pose-guide-prompt';

/** The guide a Story take was queued with, tied to that take's ComfyUI prompt id. */
export type StoryPoseGuideExpect = {
  promptId: string;
  keypoints: NormalizedBody[];
  /** Guide canvas width / height. */
  aspect: number;
  style: PoseGuideStylePreference;
  poseKey: string;
};

/** Pose-check result for the still at `imageUrl`. */
export type StoryPoseMatch = {
  imageUrl: string;
  score: number;
  expectedPeople: number;
  detectedPeople: number;
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
