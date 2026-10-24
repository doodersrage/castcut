import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { keepComfyFilesInBackground } from '@/lib/comfyui/input-store-keep-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/input-store');
}

/**
 * POST { files: [{ filename, subfolder?, type }], comfyUrl? } → { named, kept, queued }: the
 * ComfyUI pictures the browser's data names (Cast plates, look renders, clothing — not Gallery
 * renders, which keep their own copies). The ones the app has no copy of yet are copied from
 * ComfyUI in the background (input-store-server.ts), so a ComfyUI switch does not lose them.
 */
export async function POST(request: Request) {
  let body: { files?: unknown; comfyUrl?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Expected a JSON body.', 400);
  }
  if (!Array.isArray(body.files)) return apiError('files is required.', 400);
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(
      stripEmptyComfyUiRuntime({
        apiUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl : undefined,
      })
    ).replace(/\/+$/, '');
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  return apiJson(keepComfyFilesInBackground(baseUrl, body.files));
}
