import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { renderFilmScore } from '@/lib/film-score-server';

export const runtime = 'nodejs';
export const maxDuration = 280;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/film/score');
}

/** POST { brief: { mood?, tone? }, cutSeconds, comfyUrl? } → { url, label }: an original score. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const raw = (body.brief ?? {}) as Record<string, unknown>;
  const word = (value: unknown) =>
    typeof value === 'string' && /^[a-z-]{2,24}$/.test(value) ? value : undefined;
  try {
    const result = await renderFilmScore({
      brief: { mood: word(raw.mood), tone: word(raw.tone) },
      cutSeconds: Number(body.cutSeconds) || 45,
      comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl : undefined,
    });
    return apiJson(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not score the film.';
    return apiError(message, /needs/.test(message) ? 400 : 502);
  }
}
