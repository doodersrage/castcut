import { resolveVisionModel } from '@/lib/vision-model-auto';
import {
  adultGateVisionPrompt,
  parseAdultGateReply,
  type AdultGateReply,
} from './adult-appearance-gate';
import { visionCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from './llm-request-options';

export type AdultGateVisionResult = {
  /** A vision model is configured (or found on the LLM server). */
  available: boolean;
  /** The model's answer; null when the call failed or the reply could not be read. */
  reply: AdultGateReply | null;
  model?: string;
  /** Raw reply text (capped), for the log. */
  text?: string;
};

/**
 * Server: ask the vision model the adult-appearance question about one still. `available`
 * false when the LLM is off or no vision model is set up — the gate then lets the still through
 * unchecked. A failed call with a model set up is `reply: null` (uncertain, withheld).
 */
export async function askAdultAppearanceVision(options: {
  imageDataUrl: string;
  llm?: LlmRequestOptions;
}): Promise<AdultGateVisionResult> {
  if (!resolveRequestLlmEnabled(options.llm)) return { available: false, reply: null };
  const model = await resolveVisionModel(options.llm);
  if (!model) return { available: false, reply: null };
  try {
    const text = await visionCompletion({
      systemPrompt: '',
      textPrompt: adultGateVisionPrompt(),
      imageDataUrl: options.imageDataUrl,
      maxTokens: 200,
      temperature: 0,
      model,
      endpoint: resolveRequestLlmEndpoint(options.llm),
      usageContext: { route: 'adult-check' },
    });
    return { available: true, reply: parseAdultGateReply(text), model, text: text?.slice(0, 400) };
  } catch {
    return { available: true, reply: null, model };
  }
}
