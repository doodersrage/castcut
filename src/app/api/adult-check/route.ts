import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { askAdultAppearanceVision } from '@/lib/adult-appearance-gate-server';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';
import { normalizeImageDataUrl } from '@/lib/specialized/image-prompt-generator';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/adult-check');
}

/**
 * The adult-appearance gate's vision question about one still (adult-appearance-gate.ts):
 * `{ available, reply }`. `available` false: no vision model is set up (the still is allowed
 * unchecked). `reply` null with `available` true: the model gave no readable answer (withheld).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      image?: string;
      mimeType?: string;
      llmTemperature?: number;
      allowTemplateFallback?: boolean;
      llmModel?: string;
      llmVisionModel?: string;
      llmEnabled?: boolean;
      llmProvider?: string;
      llmApiKey?: string;
      /** A clothed-mood still (Day Suggestive): also ask the bare-skin question. */
      clothed?: boolean;
    };
    if (!body.image?.trim()) {
      return apiError('Image data is required.', 400);
    }
    if (body.image.length > 12_000_000) {
      return apiError('Image payload is too large.', 400);
    }
    const result = await askAdultAppearanceVision({
      imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
      llm: parseLlmRequestOptions(body),
      clothed: body.clothed === true,
    });
    return apiJson({ available: result.available, reply: result.reply, model: result.model });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Adult check failed.', 500);
  }
}
