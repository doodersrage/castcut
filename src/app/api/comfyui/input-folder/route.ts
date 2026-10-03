import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { buildComfyInputFolderReport } from '@/lib/comfy-input-folder-server';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/input-folder');
}

/**
 * Report only: which app-made files in ComfyUI's input folder nothing references, and a command
 * to remove them. Nothing is deleted here. It reads every user's saved data, so admin when auth
 * is on.
 */
export async function POST(request: Request) {
  if (isAuthEnabled()) {
    const user = resolveRequestUser(request);
    if (!user?.enabled || user.role !== 'admin') {
      return apiError('Admin sign-in required to scan the ComfyUI input folder.', 401);
    }
  }

  let body: { comfyUrl?: unknown; references?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Expected a JSON body.', 400);
  }
  if (!Array.isArray(body.references)) {
    // Without the browser's own references, its Cast, Day and gallery would look unused.
    return apiError('references (the names this browser still uses) is required.', 400);
  }

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

  try {
    const report = await buildComfyInputFolderReport({
      baseUrl,
      browserReferences: body.references.filter(
        (value): value is string => typeof value === 'string'
      ),
    });
    return apiJson(report);
  } catch (error) {
    return apiError(
      `Could not read ComfyUI's input folder (${error instanceof Error ? error.message : 'unknown error'}).`,
      502
    );
  }
}
