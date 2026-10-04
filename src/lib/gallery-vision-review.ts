import { visionCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from './llm-request-options';
import { resolveVisionModel } from './vision-model-auto';

/** No vision model to ask (LLM off, or none set or found) — not a failure of the call. */
export class VisionModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisionModelUnavailableError';
  }
}

/**
 * The model and endpoint for a gallery vision call: the session / env / detected vision model,
 * like the other still checks. Only LLM_VISION_MODEL was read before, so a vision model set in
 * Settings → LLM or found on LM Studio still failed every auto-tag.
 */
export async function resolveGalleryVisionTarget(input: {
  llm?: LlmRequestOptions;
}): Promise<{ model: string; endpoint?: ReturnType<typeof resolveRequestLlmEndpoint> }> {
  if (!resolveRequestLlmEnabled(input.llm)) {
    throw new VisionModelUnavailableError(
      'The LLM is off — turn it on in Settings → LLM (LLM_ENABLED) to review stills.'
    );
  }
  const model = await resolveVisionModel(input.llm);
  if (!model) {
    throw new VisionModelUnavailableError(
      'No vision model found — pick one in Settings → LLM, set LLM_VISION_MODEL, or load one in LM Studio / Ollama.'
    );
  }
  return { model, endpoint: resolveRequestLlmEndpoint(input.llm) };
}

export type VisionReviewResult = {
  suggestedRating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  critique: string;
};

/** Short training-style caption for LoRA dataset export. */
export async function captionGalleryImage(input: {
  imageDataUrl: string;
  prompt?: string;
  model?: string;
  llm?: LlmRequestOptions;
}): Promise<string> {
  const target = await resolveGalleryVisionTarget({ llm: input.llm });
  const text = await visionCompletion({
    ...target,
    systemPrompt:
      'Write a short LoRA training caption for the image. Reply with JSON only: {"caption":"..."}. Prefer concrete visual details, 12–40 words, no quotes around the whole caption.',
    textPrompt: input.prompt?.trim()
      ? `Original prompt (for context, do not copy verbatim):\n${input.prompt.trim()}`
      : 'Describe the image for LoRA training.',
    imageDataUrl: input.imageDataUrl,
    maxTokens: 220,
    temperature: 0.3,
  });

  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      caption?: string;
    };
    if (parsed.caption?.trim()) {
      return parsed.caption.trim();
    }
  } catch {
    // fall through
  }
  return text
    .replace(/^["']|["']$/g, '')
    .trim()
    .slice(0, 320);
}

export async function reviewGalleryImage(input: {
  imageDataUrl: string;
  prompt: string;
  model?: string;
  llm?: LlmRequestOptions;
}): Promise<VisionReviewResult> {
  const target = await resolveGalleryVisionTarget({ llm: input.llm });
  const text = await visionCompletion({
    ...target,
    systemPrompt:
      'Review the image against the prompt. Reply with JSON only: {"rating":1-5,"tags":["..."],"critique":"one sentence"}. Rating 5=excellent match, 1=poor. No chain-of-thought.',
    textPrompt: `Prompt:\n${input.prompt}`,
    imageDataUrl: input.imageDataUrl,
    // Gemma/LM Studio often burns 100–300 tokens on reasoning_content first;
    // keep headroom so the JSON answer still fits in content (or reasoning fallback).
    maxTokens: 800,
    temperature: 0.2,
    usageContext: { route: 'best-of-n-vision-rank' },
  });

  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      rating?: number;
      tags?: string[];
      critique?: string;
    };
    const rating = Math.min(
      5,
      Math.max(1, Math.round(parsed.rating ?? 3))
    ) as VisionReviewResult['suggestedRating'];
    return {
      suggestedRating: rating,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8).map(String) : [],
      critique: parsed.critique?.trim() || 'No critique returned.',
    };
  } catch {
    // Reasoning dumps may bury JSON — pull the first object if present.
    const embedded = text.match(/\{[\s\S]*\}/);
    if (embedded) {
      try {
        const parsed = JSON.parse(embedded[0]) as {
          rating?: number;
          tags?: string[];
          critique?: string;
        };
        const rating = Math.min(
          5,
          Math.max(1, Math.round(parsed.rating ?? 3))
        ) as VisionReviewResult['suggestedRating'];
        return {
          suggestedRating: rating,
          tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8).map(String) : [],
          critique: parsed.critique?.trim() || 'No critique returned.',
        };
      } catch {
        // fall through
      }
    }
    return {
      suggestedRating: 3,
      tags: [],
      critique: text.slice(0, 240),
    };
  }
}
