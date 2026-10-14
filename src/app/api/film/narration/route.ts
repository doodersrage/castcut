import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { renderNarration } from '@/lib/film-narration-server';

export const runtime = 'nodejs';
export const maxDuration = 200;

/** A narration line for a Day shot: { line, speaker, voiceSample, comfyUrl } → { url }. */
export async function POST(request: Request) {
  let body: { line?: unknown; speaker?: unknown; voiceSample?: unknown; comfyUrl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  try {
    return apiJson(
      await renderNarration({
        line: typeof body.line === 'string' ? body.line : '',
        speaker: body.speaker === 'man' ? 'man' : 'woman',
        ...(typeof body.voiceSample === 'string' &&
        /^[\w.-]+\.(wav|flac|mp3)$/i.test(body.voiceSample)
          ? { voiceSample: body.voiceSample }
          : {}),
        ...(typeof body.comfyUrl === 'string' ? { comfyUrl: body.comfyUrl } : {}),
      })
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Narration failed.', 502);
  }
}

export function GET() {
  return apiMethodNotAllowed(['POST'], '/api/film/narration');
}
