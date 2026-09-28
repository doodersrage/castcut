import path from 'node:path';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import { comfyBaseUrl } from '@/lib/comfy-utility-graph-server';
import { listComfyAssetJobs } from '@/lib/comfy-asset-download';
import { getComfyUiRoot } from '@/lib/comfy-asset-paths';
import {
  deleteModelFile,
  listModelFilesWithUsage,
  ModelFileDeleteError,
} from '@/lib/model-files-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Deletes weight files from disk — admin-only on top of the comfyui-api feature gate.
function requireAdmin(request: Request) {
  if (!isAuthEnabled()) {
    return null;
  }
  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user?.enabled || user.role !== 'admin') {
    return apiError('Admin sign-in required.', 401);
  }
  return null;
}

/** Model files under COMFYUI_ROOT/models with size, symlinks and last use. */
export async function GET(request: Request) {
  const comfyUrl = new URL(request.url).searchParams.get('comfyUrl')?.trim() || undefined;
  try {
    return apiJson(await listModelFilesWithUsage(comfyBaseUrl(comfyUrl)));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not list model files.', 502);
  }
}

/** `{ action: 'delete', path, confirmName }` — guarded delete of one file. */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  let body: { action?: string; path?: string; confirmName?: string; comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  if (body.action !== 'delete' || !body.path?.trim()) {
    return apiError('action "delete" and path are required.', 400);
  }
  const root = getComfyUiRoot();
  const activeDownloads = new Set(
    listComfyAssetJobs()
      .filter(job => ['queued', 'downloading', 'verifying'].includes(job.status) && job.destPath)
      .map(job => path.resolve(job.destPath!))
  );
  try {
    const result = await deleteModelFile({
      path: body.path,
      confirmName: body.confirmName?.trim() ?? '',
      comfyBaseUrl: comfyBaseUrl(body.comfyUrl?.trim() || undefined),
      isDownloading: rel => {
        if (!root) return false;
        const full = path.resolve(root, 'models', rel);
        return activeDownloads.has(full) || activeDownloads.has(full.replace(/\.partial$/, ''));
      },
    });
    return apiJson({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ModelFileDeleteError) return apiError(error.message, error.status);
    return apiError(error instanceof Error ? error.message : 'Delete failed.', 500);
  }
}

export function PUT() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/comfyui/model-files');
}
