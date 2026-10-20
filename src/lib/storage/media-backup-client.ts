'use client';

/** Pictures backup from the browser: ask for a download link; restore a .tar in chunks. */
import { loadComfyUiSettings } from '../comfyui/settings';
import { collectComfyFileRefs } from './media-backup-refs';
import { exportStudioBackup } from './studio-backup';

/** Under the server's 80 MB request cap, with room for a reverse proxy's own limit. */
export const MEDIA_RESTORE_CHUNK_BYTES = 32 * 1024 * 1024;

export type MediaRestoreStatus = {
  state: 'running' | 'done' | 'failed';
  bytesTotal: number;
  bytesDone: number;
  galleryFiles: number;
  identityFiles: number;
  comfyUploaded: number;
  skipped: number;
  errors: string[];
  message?: string;
  /** A Cast bundle's data file. */
  castData?: string;
  /** Files the exporting install already lacked. */
  missingAtExport?: string[];
};

export type MediaRestoreProgress =
  | { phase: 'upload'; sent: number; total: number }
  | { phase: 'unpack'; status: MediaRestoreStatus };

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // not JSON
  }
  return `HTTP ${response.status}`;
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Start the download; resolves with how many ComfyUI pictures it will carry. */
export async function downloadPicturesBackup(): Promise<{ comfyFiles: number }> {
  const comfyFiles = collectComfyFileRefs(exportStudioBackup());
  const response = await fetch('/api/storage/media-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comfyFiles,
      comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
    }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  const { url } = (await response.json()) as { url: string };
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return { comfyFiles: comfyFiles.length };
}

async function putChunk(id: string, offset: number, chunk: Blob): Promise<number> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetch(
        `/api/storage/media-restore?id=${encodeURIComponent(id)}&offset=${offset}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk }
      );
    } catch (error) {
      if (attempt >= 5) throw error;
    }
    if (response?.ok) return ((await response.json()) as { received: number }).received;
    if (response?.status === 409) {
      // The server holds a different amount (a retried chunk landed): carry on from there.
      const body = (await response.json().catch(() => ({}))) as {
        received?: number;
        error?: string;
      };
      if (typeof body.received === 'number') return body.received;
      throw new Error(body.error ?? 'Upload out of step.');
    }
    if (response && response.status !== 429 && response.status < 500) {
      throw new Error(await errorText(response));
    }
    if (attempt >= 5) throw new Error(response ? await errorText(response) : 'Network error.');
    const retryAfter = Number(response?.headers.get('Retry-After'));
    await wait(
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1)
    );
  }
}

/** Upload a Pictures backup and unpack it on this server. */
export async function restorePicturesBackup(
  file: File,
  onProgress: (progress: MediaRestoreProgress) => void
): Promise<MediaRestoreStatus> {
  const start = await fetch('/api/storage/media-restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start' }),
  });
  if (!start.ok) throw new Error(await errorText(start));
  const { id } = (await start.json()) as { id: string };

  let sent = 0;
  onProgress({ phase: 'upload', sent, total: file.size });
  while (sent < file.size) {
    sent = await putChunk(id, sent, file.slice(sent, sent + MEDIA_RESTORE_CHUNK_BYTES));
    onProgress({ phase: 'upload', sent, total: file.size });
  }

  const finish = await fetch('/api/storage/media-restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'finish',
      id,
      comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
    }),
  });
  if (!finish.ok) throw new Error(await errorText(finish));
  let status = (await finish.json()) as MediaRestoreStatus;
  onProgress({ phase: 'unpack', status });
  while (status.state === 'running') {
    await wait(1500);
    const poll = await fetch(`/api/storage/media-restore?id=${encodeURIComponent(id)}`);
    if (poll.status === 429) continue;
    if (!poll.ok) throw new Error(await errorText(poll));
    status = (await poll.json()) as MediaRestoreStatus;
    onProgress({ phase: 'unpack', status });
  }
  return status;
}
