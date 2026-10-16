import { generateImagePrompt } from '@/lib/specialized/image-prompt-generator';
import { normalizeDetailLevel } from '@/lib/detail-level';
import { normalizeComfyModel } from '@/lib/comfy-models';
import { normalizeImagePromptDescriptionPreset } from '@/lib/image-prompt-presets';
import { mergeImagePromptParts, type ImageRefPart } from '@/lib/image-prompt-merge';
import type { ImagePromptFocus } from '@/lib/specialized/types';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { mapWithConcurrency } from '@/lib/concurrency';
import { getLlmMaxInflight } from '@/lib/llm-backpressure';
import { LlmBusyError } from '@/lib/llm-client';

export const runtime = 'nodejs';

type RefImage = {
  image: string;
  mimeType?: string;
  role?: string;
  focus?: ImagePromptFocus;
  strength?: number;
};

function normalizeFocus(value: unknown): ImagePromptFocus {
  if (value === 'subject' || value === 'background' || value === 'style' || value === 'full') {
    return value;
  }
  return 'full';
}

function normalizeStrength(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, value));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      images?: RefImage[];
      model?: string;
      detail?: string;
      extraHints?: string;
      descriptionPreset?: string;
      llmTemperature?: number;
      allowTemplateFallback?: boolean;
      llmModel?: string;
      llmVisionModel?: string;
      llmEnabled?: boolean;
      llmProvider?: string;
      llmApiKey?: string;
    };

    const images = body.images?.filter(entry => entry.image?.trim()) ?? [];
    if (images.length === 0) {
      return apiError('At least one image is required.', 400);
    }
    if (images.length > 4) {
      return apiError('At most 4 reference images are supported.', 400);
    }

    const model = normalizeComfyModel(body.model);
    const detail = normalizeDetailLevel(body.detail);
    const descriptionPreset = normalizeImagePromptDescriptionPreset(body.descriptionPreset);
    const llm = parseLlmRequestOptions(body);
    // Each reference image's vision description is independent — was previously described one at
    // a time, up to 4 in a row. Bounded by the same limit the text LLM client enforces
    // (llm-backpressure.ts) as a sensible ceiling, even though vision calls aren't currently
    // throttled by that module themselves.
    const parts: ImageRefPart[] = await mapWithConcurrency(
      images,
      getLlmMaxInflight(),
      async (ref, index) => {
        const role = ref.role?.trim() || `reference ${index + 1}`;
        const result = await generateImagePrompt({
          model,
          detail,
          imageDataUrl: ref.image.trim(),
          mimeType: ref.mimeType,
          focus: normalizeFocus(ref.focus),
          descriptionPreset,
          extraHints: `Reference role: ${role}. ${body.extraHints?.trim() || ''}`.trim(),
          llm,
        });
        return {
          role,
          focus: ref.focus ?? 'full',
          strength: normalizeStrength(ref.strength),
          prompt: result.prompt,
        };
      }
    );

    const prompt = mergeImagePromptParts(parts);
    return apiJson({ prompt, parts, model, detail });
  } catch (error) {
    if (error instanceof LlmBusyError) {
      return apiError(
        error.message,
        429,
        {
          busy: true,
          retryAfter: error.retryAfterSeconds,
        },
        { 'Retry-After': String(error.retryAfterSeconds) }
      );
    }
    return apiError(error instanceof Error ? error.message : 'Multi-ref prompt failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/image-prompt/multi');
}
