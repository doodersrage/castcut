import { normalizeComfyModel } from '@/lib/comfy-models';
import { normalizeDetailLevel } from '@/lib/prompt/detail-level';
import { parseLlmRequestOptions } from '@/lib/llm/request-options';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { normalizeImageDataUrl } from '@/lib/specialized/image-prompt-generator';
import { normalizeStillScanPurpose, scanStillReference } from '@/lib/vision/still-scan';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/vision-scan');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(error => {
      if (error instanceof SyntaxError) {
        throw new Error(
          'Upload was too large or incomplete. Use a still image or pick a smaller frame from Gallery.'
        );
      }
      throw error;
    })) as {
      purpose?: string;
      image?: string;
      mimeType?: string;
      model?: string;
      detail?: string;
      extraHints?: string;
      llmTemperature?: number;
      allowTemplateFallback?: boolean;
      llmModel?: string;
      llmVisionModel?: string;
      llmEnabled?: boolean;
      llmProvider?: string;
      llmApiKey?: string;
    };
    const purpose = normalizeStillScanPurpose(body.purpose);
    if (!purpose) {
      return apiError('Unknown vision-scan purpose.', 400);
    }
    if (!body.image?.trim()) {
      return apiError('Image data is required.', 400);
    }
    if (body.image.length > 12_000_000) {
      return apiError('Image payload is too large.', 400);
    }
    const scanned = await scanStillReference({
      purpose,
      imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
      model: body.model ? normalizeComfyModel(body.model) : undefined,
      detail: normalizeDetailLevel(body.detail),
      extraHints: body.extraHints?.trim() || undefined,
      llm: parseLlmRequestOptions(body),
    });
    return apiJson(scanned);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Vision scan failed.';
    const status = /required|must be|too large|not set|needs a vision|unknown/i.test(message)
      ? 400
      : 500;
    return apiError(message, status);
  }
}
