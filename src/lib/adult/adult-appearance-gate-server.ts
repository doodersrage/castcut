import { resolveVisionModel } from '@/lib/vision/model-auto';
import {
  adultGateVisionPrompt,
  parseAdultGateReply,
  type AdultGateReply,
} from './adult-appearance-gate';
import { visionCompletion } from '../llm/client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from '../llm/request-options';

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
  /** A clothed-mood still: also ask whether anyone's chest, genitals or buttocks are bare. */
  clothed?: boolean;
  /** A nude adult still: also ask the anatomy question (anatomy-check.ts). */
  anatomy?: import('./anatomy-check').AnatomyAsk | null;
  /**
   * The still as a ComfyUI view URL: with the anatomy question, the crop check runs too
   * (anatomy-crops-server.ts) — a second opinion the whole-picture answer misses.
   */
  comfyImageUrl?: string;
  comfyUrl?: string;
}): Promise<AdultGateVisionResult> {
  if (!resolveRequestLlmEnabled(options.llm)) return { available: false, reply: null };
  const model = await resolveVisionModel(options.llm);
  if (!model) return { available: false, reply: null };
  try {
    const text = await visionCompletion({
      systemPrompt: '',
      textPrompt: adultGateVisionPrompt({
        clothed: options.clothed === true,
        anatomy: options.anatomy ?? null,
      }),
      imageDataUrl: options.imageDataUrl,
      maxTokens: 200,
      temperature: 0,
      model,
      endpoint: resolveRequestLlmEndpoint(options.llm),
      usageContext: { route: 'adult-check' },
    });
    const reply = parseAdultGateReply(text);
    // The crop check, when the whole picture read as adult and not already a mismatch: a woman's
    // extra penis given to the man beside her, a man's missing one filled in (anatomy-check.ts).
    if (
      reply &&
      options.anatomy &&
      !options.clothed &&
      options.comfyImageUrl &&
      reply.answer === 'yes' &&
      reply.anatomy !== 'mismatch'
    ) {
      const { anatomyFromCrops } = await import('./anatomy-crops-server');
      const comma = options.imageDataUrl.indexOf(',');
      const crops = await anatomyFromCrops({
        imageUrl: options.comfyImageUrl,
        image: Buffer.from(options.imageDataUrl.slice(comma + 1), 'base64'),
        ...(options.comfyUrl ? { comfyUrl: options.comfyUrl } : {}),
        ...(options.llm ? { llm: options.llm } : {}),
        ...(reply.people ? { peopleInPhoto: reply.people } : {}),
      });
      if (crops === 'mismatch') reply.anatomy = 'mismatch';
    }
    return { available: true, reply, model, text: text?.slice(0, 400) };
  } catch {
    return { available: true, reply: null, model };
  }
}
