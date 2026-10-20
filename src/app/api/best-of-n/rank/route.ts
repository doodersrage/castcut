import { rankPromptsWithLlm } from '@/lib/best-of-n/rank-server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

type RankBody = {
  prompts?: string[];
  keep?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RankBody;
    const prompts = Array.isArray(body.prompts)
      ? body.prompts.filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
        )
      : [];
    const keep = Number.isFinite(body.keep) ? Math.max(1, Math.floor(body.keep!)) : 1;

    if (prompts.length === 0) {
      return apiError('prompts array is required.', 400);
    }

    const ranked = await rankPromptsWithLlm(prompts, keep);
    return apiJson({ prompts: ranked });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Best-of-N rank failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/best-of-n/rank');
}
