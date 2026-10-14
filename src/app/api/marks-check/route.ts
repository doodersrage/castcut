import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readMarksInStill } from '@/lib/cast-marks-check-server';
import { parseLlmRequestOptions, type LlmRequestBody } from '@/lib/llm-request-options';
import { normalizeImageDataUrl } from '@/lib/specialized/image-prompt-generator';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/marks-check');
}

/** What a Day still shows on her — glasses, tattoos (cast-marks-check.ts). */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => {
      throw new Error('Upload was too large or incomplete.');
    })) as { image?: string; mimeType?: string } & LlmRequestBody;
    if (!body.image?.trim()) return apiError('Image data is required.', 400);
    if (body.image.length > 12_000_000) return apiError('Image payload is too large.', 400);
    const reading = await readMarksInStill({
      imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
      llm: parseLlmRequestOptions(body),
    });
    return apiJson({ reading });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Marks check failed.';
    if (/needs a vision/i.test(message)) return apiJson({ reading: null, unavailable: message });
    return apiError(message, /required|too large|unreadable/i.test(message) ? 400 : 500);
  }
}
