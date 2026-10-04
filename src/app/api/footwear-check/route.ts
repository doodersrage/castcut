import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { checkFootwearInStill } from '@/lib/footwear-check-server';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';
import { normalizeImageDataUrl } from '@/lib/specialized/image-prompt-generator';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/footwear-check');
}

/** Does the still show the picked shoes on both feet? (footwear-check.ts) */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(error => {
      if (error instanceof SyntaxError) {
        throw new Error('Upload was too large or incomplete.');
      }
      throw error;
    })) as {
      image?: string;
      mimeType?: string;
      shoes?: string;
      llmTemperature?: number;
      allowTemplateFallback?: boolean;
      llmModel?: string;
      llmVisionModel?: string;
      llmEnabled?: boolean;
      llmProvider?: string;
      llmApiKey?: string;
    };
    if (!body.image?.trim()) {
      return apiError('Image data is required.', 400);
    }
    if (body.image.length > 12_000_000) {
      return apiError('Image payload is too large.', 400);
    }
    const result = await checkFootwearInStill({
      imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
      shoeWords: String(body.shoes ?? '').slice(0, 300),
      llm: parseLlmRequestOptions(body),
    });
    return apiJson(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shoe check failed.';
    if (/needs a vision/i.test(message)) {
      // No vision model: the check is skipped (the try-on keeps its unchecked rule), not failed —
      // a 400 here was a console error on every try-on of a fresh install.
      return apiJson({ verdict: null, unavailable: message });
    }
    const status = /required|must be|too large|needs a vision|unreadable/i.test(message)
      ? 400
      : 500;
    return apiError(message, status);
  }
}
