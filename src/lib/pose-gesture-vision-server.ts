import { resolveVisionModel } from '@/lib/vision-model-auto';
import { visionCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from './llm-request-options';
import {
  gestureVisionPrompt,
  MAX_GESTURE_QUESTIONS,
  parseGestureAnswers,
  type GestureAnswer,
  type GestureQuestion,
} from './pose-gesture';

/**
 * Server: ask the vision model the gesture check's yes/no questions about a still, all in one
 * call. Null when no vision model is set up or the reply can't be read.
 */
export async function askGestureVision(options: {
  imageDataUrl: string;
  questions: GestureQuestion[];
  llm?: LlmRequestOptions;
}): Promise<GestureAnswer[] | null> {
  const questions = options.questions.slice(0, MAX_GESTURE_QUESTIONS);
  if (questions.length === 0) return null;
  if (!resolveRequestLlmEnabled(options.llm)) return null;
  const model = await resolveVisionModel(options.llm);
  if (!model) return null;
  const text = await visionCompletion({
    systemPrompt: '',
    textPrompt: gestureVisionPrompt(questions),
    imageDataUrl: options.imageDataUrl,
    maxTokens: 300,
    temperature: 0,
    model,
    endpoint: resolveRequestLlmEndpoint(options.llm),
    usageContext: { route: 'pose-gesture' },
  });
  return parseGestureAnswers(text, questions);
}
