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
import { STORY_FACE_MATCH_WARN_BELOW, STORY_MIN_FACE_MATCH } from '@/lib/face-match';
import { DEFAULT_MIN_POSE_MATCH } from '@/lib/pose-score';
import { REALISM_COMPUTER_MADE_AT_OR_BELOW } from '@/lib/still-realism';

/**
 * The bars every Story reader uses — the beat card, "Retry N flagged" and the pre-cut check.
 * The last two used Day's face bars (0.3 / 0.45): the cut dialog called a still "doesn't look
 * like the Cast (28%)" that its own card passed (live 2026-10-05).
 */
export const STORY_CHECK_THRESHOLDS = {
  minPose: DEFAULT_MIN_POSE_MATCH,
  minFace: STORY_MIN_FACE_MATCH,
  warnFace: STORY_FACE_MATCH_WARN_BELOW,
} as const;

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
  /**
   * Bodies beyond the guide's that fill a real share of the frame (pose-score `extraPeople`):
   * a clone of the lead or a stranger. Older checks lack it.
   */
  extraPeople?: number;
  /** On a miss: the still's lead laid over the guide's, and the limbs that differ. */
  missView?: PoseMissView;
};

/**
 * A pose-check miss: the guide not followed, or someone extra in the still. A clone of the lead
 * scored 94% beside her own double (the angles of the matched body were right), so the score
 * alone passed a solo still with three people in it (live 2026-10-05).
 */
export function storyPoseMatchMissed(
  match: Pick<StoryPoseMatch, 'score' | 'extraPeople'>,
  minScore: number
): boolean {
  return match.score < minScore || (match.extraPeople ?? 0) > 0;
}

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
  const extra = match.extraPeople ?? 0;
  const miss = storyPoseMatchMissed(match, minScore);
  if (extra > 0) {
    const inFrame = match.expectedPeople + extra;
    return {
      text: `Pose match ${pct}% · ${inFrame} people in frame, expected ${match.expectedPeople} — Retry for a still without the extra person.`,
      miss,
    };
  }
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

/** The realism rating (still-realism.ts) of the still at `imageUrl`, 0–10. */
export type StoryRealismCheck = { imageUrl: string; rating: number };

/**
 * Beat card line when the shown still looked computer-made (the realism question's "4"), else
 * null — a still that reads as a photo needs no line.
 */
export function storyRealismLabel(beat: {
  imageUrl?: string;
  realism?: StoryRealismCheck;
}): { text: string; miss: true } | null {
  const check = beat.realism;
  if (!check || check.imageUrl !== beat.imageUrl?.trim()) return null;
  if (check.rating > REALISM_COMPUTER_MADE_AT_OR_BELOW) return null;
  return {
    text: `Looks computer-made (${check.rating}/10) — Retry for a still that reads as a photo.`,
    miss: true,
  };
}

/**
 * Beats "Retry N flagged" redoes: a failed still, or a finished still whose pose, face or
 * realism check missed (the same misses the beat card suggests Retry for). In reel order.
 */
export function storyFlaggedBeats<
  T extends BeatLike & { faceMatch?: StoryFaceMatch; realism?: StoryRealismCheck },
>(story: T[], thresholds: { minPose: number; minFace: number; warnFace: number }): T[] {
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
    return Boolean(pose?.miss || face?.miss || storyRealismLabel(beat));
  });
}
