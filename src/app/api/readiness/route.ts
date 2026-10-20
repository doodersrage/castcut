import { scorePromptReadiness } from '@/lib/prompt/readiness';
import { normalizeDetailLevel } from '@/lib/prompt/detail-level';
import { normalizeComfyModel } from '@/lib/comfy-models';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      hints?: string;
      model?: string;
      detail?: string;
      negativePrompt?: string;
    };
    if (!body.prompt?.trim()) {
      return apiError('prompt is required.', 400);
    }
    return apiJson(
      scorePromptReadiness({
        prompt: body.prompt,
        hints: body.hints,
        model: normalizeComfyModel(body.model),
        detail: normalizeDetailLevel(body.detail),
        negativePrompt: body.negativePrompt,
      })
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Readiness check failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/readiness');
}
