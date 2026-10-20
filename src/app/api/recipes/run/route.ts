import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { runPromptRecipeSteps } from '@/lib/prompt/recipes';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    prompt?: string;
    model?: string;
    steps?: import('@/lib/prompt/recipes').PromptRecipeStep[];
  };
  if (!body.prompt?.trim() || !body.steps?.length) {
    return apiError('prompt and steps are required.', 400);
  }
  const result = await runPromptRecipeSteps(body.prompt, body.steps, body.model ?? 'sdxl');
  return apiJson(result);
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['POST'], '/api/recipes/run');
}
