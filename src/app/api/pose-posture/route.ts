import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';
import { askPostureVision } from '@/lib/pose-posture-vision-server';
import { normalizeImageDataUrl } from '@/lib/specialized/image-prompt-generator';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/pose-posture');
}

/** The pose check's optional posture question: `{ posture: VisionPosture | null }`. */
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
    };
    if (!body.image?.trim()) {
      return apiError('Image data is required.', 400);
    }
    if (body.image.length > 12_000_000) {
      return apiError('Image payload is too large.', 400);
    }
    const posture = await askPostureVision({
      imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
      llm: parseLlmRequestOptions(body),
    });
    return apiJson({ posture });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Posture check failed.', 500);
  }
}
