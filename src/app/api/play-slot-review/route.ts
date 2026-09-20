import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';
import { reviewPlaySlotStill } from '@/lib/play-slot-review-server';
import { normalizeImageDataUrl } from '@/lib/specialized/image-prompt-generator';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/play-slot-review');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(error => {
      if (error instanceof SyntaxError) {
        throw new Error('Upload was too large or incomplete. Try again with a smaller still.');
      }
      throw error;
    })) as {
      image?: string;
      mimeType?: string;
      beat?: string;
      setting?: string;
      outfit?: string;
      expectedPeople?: number | 'any';
      referencePair?: boolean;
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
    const report = await reviewPlaySlotStill({
      imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
      context: {
        beat: body.beat?.trim() || undefined,
        setting: body.setting?.trim() || undefined,
        outfit: body.outfit?.trim() || undefined,
        expectedPeople: body.expectedPeople === 2 ? 2 : body.expectedPeople === 'any' ? 'any' : 1,
        referencePair: body.referencePair === true,
      },
      llm: parseLlmRequestOptions(body),
    });
    return apiJson(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Slot review failed.';
    const status = /required|must be|too large|not set|needs a vision|unknown/i.test(message)
      ? 400
      : 500;
    return apiError(message, status);
  }
}
