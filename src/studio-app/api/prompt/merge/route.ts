import { mergePrompts } from '@/lib/prompt-merge';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { left?: string; right?: string };
    if (!body.left?.trim() || !body.right?.trim()) {
      return apiError('left and right prompts are required.', 400);
    }
    return apiJson(mergePrompts(body.left, body.right));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Prompt merge failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/prompt/merge');
}
