import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { fitLineToClip } from '@/lib/audio/line-fit-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

export function GET() {
  return apiMethodNotAllowed(['POST'], '/api/film/line-fit');
}

/**
 * POST { clipUrl, entryId?, readFile, comfyUrl? } → { url } | 422: the talking clip's line as the
 * voice engine read it (readFile, a ComfyUI input), fitted to where the clip says it.
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const clipUrl = typeof body.clipUrl === 'string' ? body.clipUrl.trim().slice(0, 2000) : '';
  const readFile = typeof body.readFile === 'string' ? body.readFile.trim() : '';
  // An input file under ComfyUI's input folder: a name, maybe one subfolder deep, no climbing.
  if (!clipUrl || !/^(?:[\w-]+\/)?[\w.-]+\.(?:wav|flac|mp3)$/i.test(readFile)) {
    return apiError('clipUrl and readFile are required.', 400);
  }
  const fitted = await fitLineToClip({
    clipUrl,
    readFile,
    entryId: typeof body.entryId === 'string' ? body.entryId.trim().slice(0, 200) : undefined,
    comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl.trim().slice(0, 300) : undefined,
    userId: user?.id ?? null,
    requestOrigin: new URL(request.url).origin,
  });
  return fitted ? apiJson(fitted) : apiError('The line could not be fitted to that clip.', 422);
}
