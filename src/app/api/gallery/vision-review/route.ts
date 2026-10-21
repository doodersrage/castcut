import { apiError, apiErrorFrom, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { reviewGalleryImage, VisionModelUnavailableError } from '@/lib/gallery/vision-review';
import { parseLlmRequestOptions, type LlmRequestBody } from '@/lib/llm/request-options';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: { imageDataUrl?: string; prompt?: string; optional?: boolean } & LlmRequestBody;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  if (!body.imageDataUrl?.trim() || !body.prompt?.trim()) {
    return apiError('imageDataUrl and prompt are required.', 400);
  }
  try {
    const review = await reviewGalleryImage({
      imageDataUrl: body.imageDataUrl,
      prompt: body.prompt,
      llm: parseLlmRequestOptions(body),
    });
    return apiJson(review);
  } catch (error) {
    if (error instanceof VisionModelUnavailableError) {
      // Auto-tagging asks after every still: no vision model is a skip, not an error.
      return body.optional ? apiJson({ unavailable: error.message }) : apiError(error.message, 400);
    }
    return apiErrorFrom(error, 500, { service: 'llm', fallback: 'Vision review failed.' });
  }
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['POST'], '/api/gallery/vision-review');
}
