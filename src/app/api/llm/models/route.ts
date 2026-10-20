import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { listRemoteLlmModels } from '@/lib/llm/models';

export const runtime = 'nodejs';

export async function GET() {
  return apiJson(await listRemoteLlmModels());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { provider?: string; apiKey?: string };
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim().slice(0, 256) : undefined;
    return apiJson(
      await listRemoteLlmModels({
        provider: typeof body.provider === 'string' ? body.provider : undefined,
        apiKey,
      })
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not list LLM models.', 400);
  }
}

export function PUT() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/llm/models');
}
