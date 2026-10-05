import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import { countComfyQueue } from '@/lib/castcut-nodes-setup-server';
import { requestComfyUiRestart } from '@/lib/comfyui-restart';

export const runtime = 'nodejs';

/** Restarting ComfyUI interrupts everyone's jobs — admin when auth is on. */
function requireAdminWhenAuth(request: Request) {
  if (!isAuthEnabled()) {
    return null;
  }
  const user = resolveRequestUser(request);
  if (!user?.enabled || user.role !== 'admin') {
    return apiError('Admin sign-in required to restart ComfyUI.', 401);
  }
  return null;
}

export async function POST(request: Request) {
  const denied = requireAdminWhenAuth(request);
  if (denied) {
    return denied;
  }

  let body: { comfyUrl?: string; force?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const runtime = stripEmptyComfyUiRuntime({ apiUrl: body.comfyUrl });
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  // A restart stops every running render and empties the queue for everyone (the queue is shared):
  // refuse while anything is running or waiting, unless the caller explicitly forces it.
  if (body.force !== true) {
    const queue = await fetch(`${baseUrl}/queue`, { signal: AbortSignal.timeout(5000) })
      .then(response => (response.ok ? response.json() : null))
      .then(countComfyQueue)
      .catch(() => null);
    const busy = queue ? queue.running + queue.pending : 0;
    if (busy > 0) {
      return apiError(
        `ComfyUI has ${busy} job${busy === 1 ? '' : 's'} running or waiting — restart it when its queue is empty.`,
        409,
        { busy: true, running: queue?.running ?? 0, pending: queue?.pending ?? 0 }
      );
    }
  }

  const result = await requestComfyUiRestart(baseUrl);
  if (!result.ok) {
    return apiError(result.error, result.missingManager ? 501 : 502, {
      missingManager: result.missingManager ?? false,
    });
  }
  return apiJson({ ok: true, via: result.via });
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/restart');
}
