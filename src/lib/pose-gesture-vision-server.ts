import { resolveVisionModel } from '@/lib/vision-model-auto';
import { visionCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from './llm-request-options';
import {
  gestureVisionPrompt,
  MAX_STILL_VISION_QUESTIONS,
  parseGestureAnswers,
  type GestureAnswer,
  type GestureQuestion,
} from './pose-gesture';
import { parseRealismReply, realismVisionPrompt } from './still-realism';

/**
 * Server: ask the vision model the pose check's yes/no questions about a still (the beat's
 * gesture questions and the posture question), all in one call — and, when `realism` is set, the
 * realism rating (`still-realism.ts`) in the same request but as its own model call: folded into
 * the question prompt it stopped seeing computer-made stills (2026-10-04: caught 4 of 20 merged,
 * 15 of 20 alone). `answers` null when nothing was asked or the reply can't be read; both null
 * when no vision model is set up. A failed realism call is null (never a miss).
 */
export async function askGestureVision(options: {
  imageDataUrl: string;
  questions: GestureQuestion[];
  realism?: boolean;
  llm?: LlmRequestOptions;
}): Promise<{ answers: GestureAnswer[] | null; realism: number | null }> {
  const questions = options.questions.slice(0, MAX_STILL_VISION_QUESTIONS);
  const realism = options.realism === true;
  const none = { answers: null, realism: null };
  if (questions.length === 0 && !realism) return none;
  if (!resolveRequestLlmEnabled(options.llm)) return none;
  const model = await resolveVisionModel(options.llm);
  if (!model) return none;
  const ask = (textPrompt: string, maxTokens: number) =>
    visionCompletion({
      systemPrompt: '',
      textPrompt,
      imageDataUrl: options.imageDataUrl,
      maxTokens,
      temperature: 0,
      model,
      endpoint: resolveRequestLlmEndpoint(options.llm),
      usageContext: { route: 'pose-gesture' },
    });
  const answers =
    questions.length > 0
      ? parseGestureAnswers(await ask(gestureVisionPrompt(questions), 300), questions)
      : null;
  const rating = realism
    ? await ask(realismVisionPrompt(), 60)
        .then(parseRealismReply)
        .catch(() => null)
    : null;
  return { answers, realism: rating };
}
