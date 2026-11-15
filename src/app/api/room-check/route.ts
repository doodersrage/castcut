import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseLlmRequestOptions, type LlmRequestBody } from '@/lib/llm/request-options';
import { serverPictureIo } from '@/lib/media/picture-io-server';
import { askSameRoom } from '@/lib/still/room-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/room-check');
}

/** The app's own picture paths only (its ComfyUI proxy, its media): never another host. */
function ownPath(value: unknown): string | null {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url.startsWith('/') || url.startsWith('//') || url.length > 2000) return null;
  return url;
}

/** Same room? A take beside its scene's reference (still/room.ts; advisory). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    ({ imageUrl?: unknown; referenceUrl?: unknown } & LlmRequestBody) | null;
  const imageUrl = ownPath(body?.imageUrl);
  const referenceUrl = ownPath(body?.referenceUrl);
  if (!imageUrl || !referenceUrl)
    return apiError('Two of the app’s own picture paths are needed.', 400);
  const verdict = await askSameRoom({
    io: serverPictureIo({ appOrigin: new URL(request.url).origin }),
    referenceUrl,
    imageUrl,
    llm: parseLlmRequestOptions(body ?? {}),
  });
  return apiJson({ verdict });
}
