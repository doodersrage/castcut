import type { NormalizedBody } from './library';
import { freeComfyUiMemory } from '../comfyui/queue-control';
import { sharedLlmRequestBody } from '../llm/request-options';
import {
  applyGestureVerdict,
  decideGesture,
  planGestureCheck,
  type GestureAnswer,
  type GestureLead,
  type GestureQuestion,
  type GestureVerdict,
} from './gesture';
import { applyPostureAnswer, postureQuestion } from './posture-question';
import { DEFAULT_MIN_POSE_MATCH, type DetectedPose, type PoseMatchResult } from './score';
import type { SharedToolSettings } from '../settings/cache';
import { decideRealism, type RealismVerdict } from '../still/realism';

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
 * question when the keypoints can't read the still's posture against a clear guide, or whether
 * it is on its feet when a seat on the ground looks like its guide (`pose-posture-question.ts`), and the beat's gesture questions (only beats with a visible
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
  const posture = postureQuestion(match, input.lead, {
    body: input.guide[0],
    aspect: input.guideAspect,
  });
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
  return (await checkStillRealismAndPlace(input)).realism;
}

/** The realism rating and, with `place`, whether the still is in that place — one upload. */
export async function checkStillRealismAndPlace(input: {
  imageUrl: string;
  place?: string;
  shared?: VisionShared;
}): Promise<{ realism: RealismVerdict | null; place: PlaceVerdict | null }> {
  if (input.shared?.sessionLlmEnabled === false) return { realism: null, place: null };
  const reply = await askStillGesture({
    imageUrl: input.imageUrl,
    questions: [],
    realism: true,
    ...(input.place?.trim() ? { place: input.place.trim() } : {}),
    shared: input.shared,
  }).catch(() => null);
  return { realism: decideRealism(reply?.realism), place: reply?.place ?? null };
}
import type { PlaceVerdict } from '../still/place';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from '../vision/scan-still';

/** LM Studio's error when the vision model won't fit beside ComfyUI's models on the GPU. */
export function visionModelLoadFailed(message: string | undefined): boolean {
  return /failed to load model/i.test(message ?? '');
}

/**
 * Waits before each retry of a vision call the model couldn't load for. ComfyUI frees memory
 * only between jobs, so while a Day render is running one 4 s wait was not enough: a live Noct-Q
 * run (2026-10-23) skipped the pose check on a still sat on the ground for sport_ski-5 — both
 * tries "Failed to load model" — and passed it at 100% (the question answers "no" 95 on it once
 * asked). The tries now span about one render (~40 s).
 */
export const VISION_LOAD_RETRY_WAITS_MS: readonly number[] = [4000, 12000, 25000];

/**
 * Ask once and, while LM Studio says "Failed to load model" (the vision model won't fit beside
 * ComfyUI's models on the GPU), ask ComfyUI to free memory — between jobs, never interrupting
 * one — wait and try again, per {@link VISION_LOAD_RETRY_WAITS_MS}. Any other reply is returned
 * as is. A skipped check never calls a miss, so a check the model never answered passes.
 */
export async function retryOnVisionLoadFailure<
  T extends { response: { ok: boolean }; data: { error?: string } },
>(
  askOnce: () => Promise<T>,
  options: {
    free: () => Promise<void>;
    waits?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<T> {
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let reply = await askOnce();
  for (const wait of options.waits ?? VISION_LOAD_RETRY_WAITS_MS) {
    if (reply.response.ok || !visionModelLoadFailed(reply.data.error)) break;
    await options.free();
    await sleep(wait);
    reply = await askOnce();
  }
  return reply;
}

/**
 * Ask `/api/pose-gesture` the pose check's yes/no questions about a still, and the realism rating
 * when `realism` is set (one vision call). Null when there is nothing to ask; the fields are null
 * when no vision model is set up; rejects on transport errors (callers skip the check then).
 */
export async function askStillGesture(options: {
  imageUrl: string;
  questions: GestureQuestion[];
  realism?: boolean;
  place?: string;
  shared?: VisionShared;
  comfyUrl?: string;
}): Promise<{
  answers: GestureAnswer[] | null;
  realism: number | null;
  place: PlaceVerdict | null;
} | null> {
  if (options.questions.length === 0 && options.realism !== true) return null;
  const still = await resolveStillFileForVisionScan({
    file: null,
    urls: [options.imageUrl],
    fallbackName: 'gesture-still.png',
  });
  const { image, mimeType } = await prepareVisionScanImagePayload(still);
  const body = JSON.stringify({
    image,
    mimeType,
    questions: options.questions,
    ...(options.realism ? { realism: true } : {}),
    ...(options.place ? { place: options.place } : {}),
    ...(options.shared ? sharedLlmRequestBody(options.shared) : {}),
  });
  const askOnce = async () => {
    const response = await fetch('/api/pose-gesture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body,
    });
    const data = await parseVisionScanApiResponse<{
      answers?: GestureAnswer[] | null;
      realism?: number | null;
      place?: PlaceVerdict | null;
      error?: string;
    }>(response);
    return { response, data };
  };
  const { response, data } = await retryOnVisionLoadFailure(askOnce, {
    free: async () => {
      await freeComfyUiMemory(options.comfyUrl).catch(() => undefined);
    },
  });
  if (!response.ok) {
    throw new Error(data.error ?? 'Gesture check failed.');
  }
  return {
    answers: data.answers ?? null,
    realism: typeof data.realism === 'number' ? data.realism : null,
    place:
      data.place && typeof data.place.match === 'boolean' && typeof data.place.seen === 'string'
        ? data.place
        : null,
  };
}
