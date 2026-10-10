import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';
import { suggestSpokenLine } from '@/lib/spoken-line-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/spoken-line');
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** POST { scene, setting?, when?, name?, personality?, lead?, adult?, avoid? } → { line }. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const line = await suggestSpokenLine(
      {
        scene: text(body.scene, 400),
        setting: text(body.setting, 200) || undefined,
        when: text(body.when, 40) || undefined,
        name: text(body.name, 60) || undefined,
        personality: text(body.personality, 300) || undefined,
        lead: body.lead === 'man' ? 'man' : 'woman',
        adult: body.adult === true,
        avoid: Array.isArray(body.avoid)
          ? body.avoid
              .filter((entry): entry is string => typeof entry === 'string')
              .map(entry => entry.slice(0, 120))
              .slice(0, 6)
          : undefined,
      },
      parseLlmRequestOptions(body as Parameters<typeof parseLlmRequestOptions>[0])
    );
    return apiJson({ line });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not suggest a line.';
    return apiError(message, /first|needs the LLM/i.test(message) ? 400 : 502);
  }
}
