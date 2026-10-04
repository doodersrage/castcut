import { captionGalleryImage, VisionModelUnavailableError } from '@/lib/gallery-vision-review';
import { parseLlmRequestOptions, type LlmRequestBody } from '@/lib/llm-request-options';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let optional = false;
  try {
    const body = (await request.json()) as {
      imageDataUrl?: string;
      prompt?: string;
      optional?: boolean;
    } & LlmRequestBody;
    optional = body.optional === true;
    if (!body.imageDataUrl?.trim()) {
      return apiError('imageDataUrl is required.', 400);
    }
    const caption = await captionGalleryImage({
      imageDataUrl: body.imageDataUrl.trim(),
      prompt: body.prompt,
      llm: parseLlmRequestOptions(body),
    });
    return apiJson({ caption });
  } catch (error) {
    if (error instanceof VisionModelUnavailableError) {
      return optional ? apiJson({ unavailable: error.message }) : apiError(error.message, 400);
    }
    return apiError(error instanceof Error ? error.message : 'Caption failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/gallery/caption');
}
