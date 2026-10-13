import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { mediaBackupComfyUrl, mediaBackupRequestOwner } from '@/lib/media-backup-route';
import {
  appendMediaRestoreChunk,
  getMediaRestoreJob,
  mediaRestoreUploadedBytes,
  startMediaRestoreJob,
  startMediaRestoreUpload,
} from '@/lib/media-backup-server';
import { isServerStorageEnabled } from '@/lib/server-storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_CHUNK = 64 * 1024 * 1024;

/**
 * Pictures backup restore.
 * POST { action: 'start' } → { id }
 * PUT ?id=…&offset=… (raw bytes, ≤ 64 MB) → { received }
 * POST { action: 'finish', id, comfyUrl? } → job
 * GET ?id=… → job (or { received } while uploading)
 */
export async function POST(request: Request) {
  const owner = mediaBackupRequestOwner(request);
  if (!owner) return apiError('Sign in required.', 401);
  if (!isServerStorageEnabled()) {
    return apiError(
      'Server storage is off (PROMPT_DATA_DIR is not set), so there is nowhere to restore the Gallery copies.',
      409
    );
  }
  let body: { action?: string; id?: string; comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  try {
    if (body.action === 'start') return apiJson({ id: startMediaRestoreUpload() });
    if (body.action === 'finish' && body.id) {
      const job = startMediaRestoreJob({
        uploadId: body.id,
        owner,
        comfyUrl: mediaBackupComfyUrl(body.comfyUrl),
      });
      return apiJson(job);
    }
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Restore failed.', 400);
  }
  return apiError('Unknown action.', 400);
}

export async function PUT(request: Request) {
  const owner = mediaBackupRequestOwner(request);
  if (!owner) return apiError('Sign in required.', 401);
  const params = new URL(request.url).searchParams;
  const id = params.get('id') ?? '';
  const offset = Number(params.get('offset'));
  if (!Number.isSafeInteger(offset) || offset < 0) return apiError('Invalid offset.', 400);
  const chunk = new Uint8Array(await request.arrayBuffer());
  if (chunk.length === 0 || chunk.length > MAX_CHUNK) return apiError('Invalid chunk size.', 400);
  try {
    return apiJson({ received: appendMediaRestoreChunk(id, offset, chunk) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Upload failed.', 409, {
      received: mediaRestoreUploadedBytes(id),
    });
  }
}

export async function GET(request: Request) {
  const owner = mediaBackupRequestOwner(request);
  if (!owner) return apiError('Sign in required.', 401);
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const job = getMediaRestoreJob(id);
  if (job) return apiJson(job);
  const received = mediaRestoreUploadedBytes(id);
  if (received === null) return apiError('Restore not found.', 404);
  return apiJson({ received });
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['GET', 'POST', 'PUT'], '/api/storage/media-restore');
}
