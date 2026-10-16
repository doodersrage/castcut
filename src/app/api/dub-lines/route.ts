import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { normalizeDubLanguage } from '@/lib/day-dub';
import { translateDubLines } from '@/lib/day-dub-server';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/dub-lines');
}

/** POST { lines: string[], language } → { lines }: the spoken lines translated for a dub. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const language = normalizeDubLanguage(body.language);
    if (!language) return apiError('Pick a language.', 400);
    const lines = Array.isArray(body.lines)
      ? body.lines
          .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
          .map(entry => entry.trim().slice(0, 200))
          .slice(0, 40)
      : [];
    if (lines.length === 0) return apiError('No lines to dub.', 400);
    const translated = await translateDubLines(
      lines,
      language,
      parseLlmRequestOptions(body as Parameters<typeof parseLlmRequestOptions>[0])
    );
    return apiJson({ lines: translated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not translate the lines.';
    return apiError(message, /needs the LLM/i.test(message) ? 400 : 502);
  }
}
