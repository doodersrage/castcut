import {
  buildControlNetPrompt,
  normalizeControlNetMode,
  type ControlNetMode,
} from '@/lib/prompt/controlnet-prompt';
import { generateImagePrompt } from '@/lib/specialized/image-prompt-generator';
import { normalizeDetailLevel } from '@/lib/prompt/detail-level';
import { normalizeComfyModel } from '@/lib/comfy-models';
import type { ImagePromptFocus } from '@/lib/specialized/types';
import { parseLlmRequestOptions } from '@/lib/llm/request-options';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

function modeToFocus(mode: ControlNetMode): ImagePromptFocus {
  if (mode === 'pose') {
    return 'subject';
  }
  if (mode === 'lineart' || mode === 'canny') {
    return 'style';
  }
  return 'full';
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: string;
      subject?: string;
      scene?: string;
      detail?: string;
      image?: string;
      mimeType?: string;
      model?: string;
      detailLevel?: string;
      llmTemperature?: number;
      allowTemplateFallback?: boolean;
      llmModel?: string;
      llmVisionModel?: string;
      llmEnabled?: boolean;
    };

    const mode = normalizeControlNetMode(body.mode);
    let subject = body.subject?.trim() ?? '';

    if (body.image?.trim()) {
      const vision = await generateImagePrompt({
        model: normalizeComfyModel(body.model),
        detail: normalizeDetailLevel(body.detailLevel),
        imageDataUrl: body.image.trim(),
        mimeType: body.mimeType,
        focus: modeToFocus(mode),
        extraHints: `ControlNet ${mode} structure analysis. ${body.detail?.trim() || ''}`.trim(),
        llm: parseLlmRequestOptions(body),
      });
      subject = vision.prompt;
    }

    if (!subject) {
      return apiError('subject or image is required.', 400);
    }

    const prompt = buildControlNetPrompt({
      mode,
      subject,
      scene: body.scene,
      detail: body.detail,
    });
    return apiJson({
      prompt,
      mode,
      source: body.image?.trim() ? 'vision' : 'text',
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ControlNet prompt failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/controlnet');
}
