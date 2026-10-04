import type { NormalizedBody } from './pose-library';
import { sharedLlmRequestBody } from './llm-request-options';
import {
  decideGesture,
  planGestureCheck,
  type GestureAnswer,
  type GestureLead,
  type GestureQuestion,
  type GestureVerdict,
} from './pose-gesture';
import type { DetectedPose, PoseMatchResult } from './pose-score';
import type { SharedToolSettings } from './settings-cache';

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
 * The gesture check for a still whose pose was read: plan the beat's questions and hand reads,
 * ask the vision model once (only when the beat has a visible action), decide. Null when there is
 * nothing to check; a failed or unanswered vision call never calls a miss.
 */
export async function checkStillGesture(input: {
  imageUrl: string;
  beat?: string | null;
  poseKey?: string | null;
  lead?: GestureLead;
  guide: NormalizedBody[];
  guideAspect: number;
  detected: DetectedPose;
  match: Pick<PoseMatchResult, 'assignment'>;
  shared?: VisionShared;
}): Promise<GestureVerdict | null> {
  // LLM turned off: no vision model to ask, and the hand reads alone never call a miss.
  if (input.shared?.sessionLlmEnabled === false) return null;
  const plan = planGestureCheck(input);
  if (plan.questions.length === 0) return null;
  const answers = await askStillGesture({
    imageUrl: input.imageUrl,
    questions: plan.questions,
    shared: input.shared,
  }).catch(() => null);
  return decideGesture({ questions: plan.questions, answers, hands: plan.hands });
}
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from './vision-scan-still';

/**
 * Ask `/api/pose-gesture` the gesture check's questions about a still (one vision call). Null
 * when there is nothing to ask or no vision model is set up; rejects on transport errors
 * (callers skip the check then).
 */
export async function askStillGesture(options: {
  imageUrl: string;
  questions: GestureQuestion[];
  shared?: VisionShared;
}): Promise<GestureAnswer[] | null> {
  if (options.questions.length === 0) return null;
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
      ...(options.shared ? sharedLlmRequestBody(options.shared) : {}),
    }),
  });
  const data = await parseVisionScanApiResponse<{
    answers?: GestureAnswer[] | null;
    error?: string;
  }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? 'Gesture check failed.');
  }
  return data.answers ?? null;
}
