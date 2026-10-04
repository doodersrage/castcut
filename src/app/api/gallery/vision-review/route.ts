import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { reviewGalleryImage, VisionModelUnavailableError } from '@/lib/gallery-vision-review';
import { parseLlmRequestOptions, type LlmRequestBody } from '@/lib/llm-request-options';

export const runtime = 'nodejs';
export const maxDuration = 120;

function formatVisionReviewError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Vision review failed.';
  }
  if (error.message === 'fetch failed') {
    const cause = error.cause as { code?: string; message?: string } | undefined;
    const detail = cause?.code || cause?.message || 'network error';
    return `Cannot reach vision LLM (${detail}). Check LLM_API_BASE_URL / LM Studio.`;
  }
  return error.message;
}

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
    const message = formatVisionReviewError(error);
    console.error('[gallery/vision-review]', message);
    return apiError(message, 500);
  }
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['POST'], '/api/gallery/vision-review');
}
