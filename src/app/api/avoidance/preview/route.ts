import { previewAvoidance } from '@/lib/prompt/avoidance-preview';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string; extraTokens?: string[] };
    if (!body.prompt?.trim()) {
      return apiError('prompt is required.', 400);
    }
    return apiJson(previewAvoidance(body.prompt, body.extraTokens));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Avoidance preview failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/avoidance/preview');
}
