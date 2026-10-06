import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { deleteUnreferencedComfyInputs } from '@/lib/comfy-input-folder-server';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/input-folder/delete');
}

/**
 * Delete the unused app-made input files the player confirmed, through the Castcut pack. The
 * folder is scanned again and only names that scan offers as removable are deleted (see
 * deleteUnreferencedComfyInputs). Admin when auth is on, like the scan.
 */
export async function POST(request: Request) {
  if (isAuthEnabled()) {
    const user = resolveRequestUser(request);
    if (!user?.enabled || user.role !== 'admin') {
      return apiError('Admin sign-in required to delete ComfyUI input files.', 401);
    }
  }

  let body: { comfyUrl?: unknown; references?: unknown; names?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Expected a JSON body.', 400);
  }
  if (!Array.isArray(body.references) || !Array.isArray(body.names)) {
    return apiError('references and names are required.', 400);
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

  const strings = (values: unknown[]) =>
    values.filter((value): value is string => typeof value === 'string');
  try {
    const outcome = await deleteUnreferencedComfyInputs({
      baseUrl,
      browserReferences: strings(body.references),
      names: strings(body.names),
    });
    return apiJson(outcome);
  } catch (error) {
    return apiError(
      `Could not delete ComfyUI input files (${error instanceof Error ? error.message : 'unknown error'}).`,
      502
    );
  }
}
