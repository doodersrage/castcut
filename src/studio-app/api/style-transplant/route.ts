import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { transplantPromptStyle } from '@/lib/prompt-style-transplant';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = resolveRequestUser(request);
  const body = (await request.json()) as {
    styleSource?: string;
    subjectPrompt?: string;
    model?: string;
  };
  if (!body.styleSource?.trim() || !body.subjectPrompt?.trim()) {
    return apiError('styleSource and subjectPrompt are required.', 400);
  }
  try {
    const prompt = await transplantPromptStyle({
      styleSource: body.styleSource,
      subjectPrompt: body.subjectPrompt,
      model: body.model,
    });
    return apiJson({
      prompt,
      usageContext: user ? { userId: user.id, username: user.username } : undefined,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Style transplant failed.', 500);
  }
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['POST'], '/api/style-transplant');
}
