import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseLlmRequestOptions, type LlmRequestBody } from '@/lib/llm/request-options';
import { checkOutfitInStill } from '@/lib/still/outfit-check-server';
import { normalizeImageDataUrl } from '@/lib/specialized/image-prompt-generator';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/outfit-check');
}

/** Whether a still's lead wears the planned outfit (play/outfit-check.ts). */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => {
      throw new Error('Upload was too large or incomplete.');
    })) as { image?: string; mimeType?: string; outfit?: string; wearer?: string } & LlmRequestBody;
    if (!body.image?.trim()) return apiError('Image data is required.', 400);
    if (body.image.length > 12_000_000) return apiError('Image payload is too large.', 400);
    const outfit = body.outfit?.trim().slice(0, 240);
    if (!outfit) return apiError('The planned outfit is required.', 400);
    const verdict = await checkOutfitInStill({
      imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
      outfit,
      wearer: body.wearer === 'man' ? 'man' : 'woman',
      llm: parseLlmRequestOptions(body),
    });
    return apiJson({ verdict });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Outfit check failed.';
    if (/needs a vision/i.test(message)) return apiJson({ verdict: null, unavailable: message });
    return apiError(message, /required|too large|unreadable/i.test(message) ? 400 : 500);
  }
}
