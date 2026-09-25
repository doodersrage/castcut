import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';
import { suggestLookTileRole } from '@/lib/look-tile-role-server';
import { normalizeImageDataUrl } from '@/lib/specialized/image-prompt-generator';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/look-tile-role');
}

/** Suggest a Look tile's role (mood / lighting / location / style / palette) from its image. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(error => {
      if (error instanceof SyntaxError) {
        throw new Error('Upload was too large or incomplete. Try a smaller image.');
      }
      throw error;
    })) as {
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
    const role = await suggestLookTileRole({
      imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
      llm: parseLlmRequestOptions(body),
    });
    return apiJson({ role });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tile role suggestion failed.';
    const status = /required|too large|need a vision|needs a vision/i.test(message) ? 400 : 500;
    return apiError(message, status);
  }
}
