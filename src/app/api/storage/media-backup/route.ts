import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import {
  comfyRefFromViewUrl,
  MEDIA_BACKUP_MAX_COMFY_FILES,
  type ComfyFileRef,
} from '@/lib/media-backup-refs';
import { mediaBackupComfyUrl, mediaBackupRequestOwner } from '@/lib/media-backup-route';
import {
  createMediaBackupTicket,
  mediaBackupWebStream,
  takeMediaBackupTicket,
} from '@/lib/media-backup-server';
import { isServerStorageEnabled } from '@/lib/server-storage';

export const runtime = 'nodejs';
export const maxDuration = 3600;

function cleanRefs(raw: unknown): ComfyFileRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ComfyFileRef[] = [];
  for (const item of raw.slice(0, MEDIA_BACKUP_MAX_COMFY_FILES)) {
    if (!item || typeof item !== 'object') continue;
    const ref = item as Partial<ComfyFileRef>;
    const params = new URLSearchParams({
      filename: String(ref.filename ?? ''),
      subfolder: String(ref.subfolder ?? ''),
      type: String(ref.type ?? ''),
    });
    const clean = comfyRefFromViewUrl(`/view?${params.toString()}`);
    if (clean) out.push(clean);
  }
  return out;
}

/** POST { comfyFiles, comfyUrl? } → { url }: a one-time download link for the Pictures backup. */
export async function POST(request: Request) {
  const owner = mediaBackupRequestOwner(request);
  if (!owner) return apiError('Sign in required.', 401);
  let body: { comfyFiles?: unknown; comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const comfyFiles = cleanRefs(body.comfyFiles);
  const ticket = createMediaBackupTicket({
    owner,
    comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl : undefined,
    comfyFiles,
  });
  return apiJson({
    url: `/api/storage/media-backup?ticket=${ticket}`,
    comfyFiles: comfyFiles.length,
    serverStorage: isServerStorageEnabled(),
  });
}

/** GET ?ticket=… → the .tar, streamed. */
export async function GET(request: Request) {
  const owner = mediaBackupRequestOwner(request);
  if (!owner) return apiError('Sign in required.', 401);
  const ticket = takeMediaBackupTicket(
    new URL(request.url).searchParams.get('ticket') ?? '',
    owner
  );
  if (!ticket) return apiError('This download link has expired. Start the backup again.', 410);
  let comfyUrl: string;
  try {
    comfyUrl = mediaBackupComfyUrl(ticket.comfyUrl);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(mediaBackupWebStream({ owner, comfyUrl, comfyFiles: ticket.comfyFiles }), {
    headers: {
      'Content-Type': 'application/x-tar',
      'Content-Disposition': `attachment; filename="castcut-pictures-${day}.tar"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/storage/media-backup');
}
