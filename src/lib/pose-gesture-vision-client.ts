import type { NormalizedBody } from './pose-library';
import { sharedLlmRequestBody } from './llm-request-options';
import {
  applyGestureVerdict,
  decideGesture,
  planGestureCheck,
  type GestureAnswer,
  type GestureLead,
  type GestureQuestion,
  type GestureVerdict,
} from './pose-gesture';
import { applyPostureAnswer, postureQuestion } from './pose-posture-question';
import { DEFAULT_MIN_POSE_MATCH, type DetectedPose, type PoseMatchResult } from './pose-score';
import type { SharedToolSettings } from './settings-cache';
import { decideRealism, type RealismVerdict } from './still-realism';

type VisionShared = Pick<
  SharedToolSettings,
  | 'sessionLlmTemperature'
  | 'sessionAllowTemplateFallback'
  | 'sessionLlmModel'
  | 'sessionLlmVisionModel'
  | 'sessionLlmEnabled'
  | 'sessionLlmProvider'
  | 'sessionLlmApiKey'
>;

/**
 * The pose check's vision questions for a still whose pose was read, in one call: the posture
 * question when the keypoints can't read the still's posture against a clear guide
 * (`pose-posture-question.ts`), and the beat's gesture questions (only beats with a visible
 * action; `gesture: false` skips them). Returns the match with both verdicts folded in. Asks
 * nothing for a still that already missed; a failed or unanswered call never calls a miss.
 *
 * `realism: true` also asks the realism rating (`still-realism.ts`) in the same request — its own
 * model call on the server, since folded into the questions it stopped working — and returns its
 * verdict beside the match (the match itself is left alone: callers decide what a computer-made
 * take means for them).
 */
export async function checkStillPoseVision(input: {
  imageUrl: string;
  beat?: string | null;
  poseKey?: string | null;
  lead?: GestureLead;
  guide: NormalizedBody[];
  guideAspect: number;
  detected: DetectedPose;
  match: PoseMatchResult;
  /** Ask the beat's gesture questions too (default true). */
  gesture?: boolean;
  /** Rate how real the still looks too (default false). */
  realism?: boolean;
  shared?: VisionShared;
}): Promise<{
  match: PoseMatchResult;
  gesture: GestureVerdict | null;
  realism: RealismVerdict | null;
}> {
  const { match } = input;
  // LLM turned off: no vision model to ask, and the hand reads alone never call a miss.
  if (input.shared?.sessionLlmEnabled === false || match.score < DEFAULT_MIN_POSE_MATCH) {
    return { match, gesture: null, realism: null };
  }
  const posture = postureQuestion(match, input.lead);
  const plan = input.gesture === false ? { questions: [], hands: [] } : planGestureCheck(input);
  const questions = [...(posture ? [posture] : []), ...plan.questions];
  const askRealism = input.realism === true;
  if (questions.length === 0 && !askRealism) return { match, gesture: null, realism: null };
  const reply = await askStillGesture({
    imageUrl: input.imageUrl,
    questions,
    realism: askRealism,
    shared: input.shared,
  }).catch(() => null);
  const answers = reply?.answers ?? null;
  const realism = decideRealism(reply?.realism);
  const checked = applyPostureAnswer(match, posture, answers);
  if (plan.questions.length === 0) return { match: checked, gesture: null, realism };
  const ids = new Set(plan.questions.map(question => question.id));
  const gesture = decideGesture({
    questions: plan.questions,
    answers: answers?.filter(answer => ids.has(answer.id)) ?? null,
    hands: plan.hands,
  });
  return { match: applyGestureVerdict(checked, gesture), gesture, realism };
}

/**
 * The realism rating alone for a still no pose check looks at (no guide): one vision call. Null
 * when the LLM is off, no vision model is set up or the call fails (never a miss).
 */
export async function checkStillRealism(input: {
  imageUrl: string;
  shared?: VisionShared;
}): Promise<RealismVerdict | null> {
  if (input.shared?.sessionLlmEnabled === false) return null;
  const reply = await askStillGesture({
    imageUrl: input.imageUrl,
    questions: [],
    realism: true,
    shared: input.shared,
  }).catch(() => null);
  return decideRealism(reply?.realism);
}
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from './vision-scan-still';

/**
 * Ask `/api/pose-gesture` the pose check's yes/no questions about a still, and the realism rating
 * when `realism` is set (one vision call). Null when there is nothing to ask; the fields are null
 * when no vision model is set up; rejects on transport errors (callers skip the check then).
 */
export async function askStillGesture(options: {
  imageUrl: string;
  questions: GestureQuestion[];
  realism?: boolean;
  shared?: VisionShared;
}): Promise<{ answers: GestureAnswer[] | null; realism: number | null } | null> {
  if (options.questions.length === 0 && options.realism !== true) return null;
  const still = await resolveStillFileForVisionScan({
    file: null,
    urls: [options.imageUrl],
    fallbackName: 'gesture-still.png',
  });
  const { image, mimeType } = await prepareVisionScanImagePayload(still);
  const response = await fetch('/api/pose-gesture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      image,
      mimeType,
      questions: options.questions,
      ...(options.realism ? { realism: true } : {}),
      ...(options.shared ? sharedLlmRequestBody(options.shared) : {}),
    }),
  });
  const data = await parseVisionScanApiResponse<{
    answers?: GestureAnswer[] | null;
    realism?: number | null;
    error?: string;
  }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? 'Gesture check failed.');
  }
  return {
    answers: data.answers ?? null,
    realism: typeof data.realism === 'number' ? data.realism : null,
  };
}
