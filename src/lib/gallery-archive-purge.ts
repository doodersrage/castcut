/**
 * Client Archive & purge: server-staged single ZIP with progress, then purge.
 * Pending job state is stored in sessionStorage so a refresh can finish
 * download + purge instead of leaving the gallery full.
 */

import { loadCharacters } from './character-os';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import {
  toArchiveEntryDescriptor,
  type GalleryArchiveEntryDescriptor,
} from './gallery-archive-job-client';
import { partitionGalleryForArchivePurge } from './gallery-protected-ids';

export type ArchiveThenPurgeResult = {
  archived: number;
  purged: number;
  kept: number;
  skipped: boolean;
  zipCount: number;
  message: string;
};

export type ArchiveThenPurgeProgress = {
  phase: 'start' | 'fetching' | 'zipping' | 'downloading' | 'purge';
  processed: number;
  total: number;
  progress: number;
  message: string;
};

export type PendingArchivePurge = {
  jobId: string;
  purgeIds: string[];
  keptCount: number;
  downloadName: string;
  startedAt: number;
};

export const PENDING_ARCHIVE_PURGE_KEY = 'prompt-studio.gallery-archive-purge-pending';

type ArchiveJobStatusResponse = {
  jobId: string;
  status: string;
  phase: string;
  progress: number;
  processed: number;
  total: number;
  imageCount: number;
  message: string;
  error?: string | null;
  downloadName?: string;
};

export function readPendingArchivePurge(): PendingArchivePurge | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(PENDING_ARCHIVE_PURGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingArchivePurge;
    if (
      !parsed?.jobId ||
      !Array.isArray(parsed.purgeIds) ||
      parsed.purgeIds.length === 0 ||
      typeof parsed.startedAt !== 'number'
    ) {
      return null;
    }
    // Drop stale pendings older than 6 hours.
    if (Date.now() - parsed.startedAt > 6 * 60 * 60_000) {
      clearPendingArchivePurge();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writePendingArchivePurge(pending: PendingArchivePurge): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.setItem(PENDING_ARCHIVE_PURGE_KEY, JSON.stringify(pending));
}

export function clearPendingArchivePurge(): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.removeItem(PENDING_ARCHIVE_PURGE_KEY);
}

async function pollArchiveJob(
  jobId: string,
  onProgress?: (progress: ArchiveThenPurgeProgress) => void
): Promise<ArchiveJobStatusResponse> {
  const started = Date.now();
  const timeoutMs = 45 * 60_000;
  let lastMessage = '';
  let lastSeenAt = Date.now();
  let busyTicks = 0;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`/api/gallery/archive/${encodeURIComponent(jobId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Archive status HTTP ${response.status}`);
      }
      const status = (await response.json()) as ArchiveJobStatusResponse;
      if (status.status === 'error') {
        throw new Error(status.error || status.message || 'Archive failed.');
      }
      busyTicks = 0;
      if (status.message !== lastMessage) {
        lastMessage = status.message;
        lastSeenAt = Date.now();
      }
      const staleMs = Date.now() - lastSeenAt;
      const heartbeat =
        staleMs > 4_000
          ? ` (still working · ${Math.round(staleMs / 1000)}s since last change)`
          : '';
      onProgress?.({
        phase:
          status.phase === 'zipping'
            ? 'zipping'
            : status.phase === 'ready' || status.phase === 'downloaded'
              ? 'downloading'
              : 'fetching',
        processed: status.processed,
        total: status.total,
        progress: status.progress,
        message: `${status.message}${heartbeat}`,
      });
      if (status.status === 'ready' || status.status === 'downloaded') {
        return status;
      }
    } catch (error) {
      // Server may briefly block during heavy zip I/O, or a leave-dialog may
      // abort in-flight polls — keep UI alive and retry.
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' ||
          error.name === 'AbortError' ||
          /abort|timeout/i.test(error.message))
      ) {
        busyTicks += 1;
        onProgress?.({
          phase: 'zipping',
          processed: 0,
          total: 0,
          progress: 0.9,
          message: lastMessage
            ? `${lastMessage.replace(/\s*\(still working[^)]*\)\s*$/, '')} — server busy, still archiving…`
            : `Server busy archiving${'.'.repeat((busyTicks % 3) + 1)}`,
        });
      } else {
        throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  throw new Error('Archive timed out.');
}

async function downloadArchiveZip(jobId: string, _downloadName: string): Promise<void> {
  // Stream to disk via the browser — do not buffer the ZIP as a Blob in tab RAM.
  const url = `/api/gallery/archive/${encodeURIComponent(jobId)}/download`;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Wait until the download handler marks the job downloaded (stream started).
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const response = await fetch(`/api/gallery/archive/${encodeURIComponent(jobId)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Archive status HTTP ${response.status}`);
    }
    const status = (await response.json()) as ArchiveJobStatusResponse;
    if (status.status === 'downloaded') {
      return;
    }
    if (status.status === 'error') {
      throw new Error(status.error || status.message || 'Archive download failed.');
    }
    // Already ready — keep waiting for the download request to flip status.
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('Archive download did not start in time.');
}

async function finishDownloadAndPurge(input: {
  jobId: string;
  purgeIds: string[];
  keptCount: number;
  downloadName: string;
  imageCount: number;
  removeEntries: (ids: string[]) => void;
  onProgress?: (progress: ArchiveThenPurgeProgress) => void;
  downloadArchive?: typeof downloadArchiveZip;
  resumed?: boolean;
  /** When true, skip the browser download (ZIP already saved). */
  skipDownload?: boolean;
}): Promise<ArchiveThenPurgeResult> {
  if (!input.skipDownload) {
    const download = input.downloadArchive ?? downloadArchiveZip;
    input.onProgress?.({
      phase: 'downloading',
      processed: input.purgeIds.length,
      total: input.purgeIds.length,
      progress: 1,
      message: input.resumed ? 'Resuming — downloading ZIP…' : 'Downloading ZIP…',
    });
    await download(input.jobId, input.downloadName);
  }

  input.onProgress?.({
    phase: 'purge',
    processed: input.purgeIds.length,
    total: input.purgeIds.length,
    progress: 1,
    message: `Purging ${input.purgeIds.length}…`,
  });
  input.removeEntries(input.purgeIds);
  clearPendingArchivePurge();
  try {
    await fetch(`/api/gallery/archive/${encodeURIComponent(input.jobId)}/complete`, {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // best-effort — local purge already happened
  }

  const prefix = input.resumed ? 'Resumed archive: ' : '';
  const downloadNote = input.skipDownload ? ' (download skipped)' : '';
  return {
    archived: input.purgeIds.length,
    purged: input.purgeIds.length,
    kept: input.keptCount,
    skipped: false,
    zipCount: 1,
    message: `${prefix}Archived ${input.purgeIds.length} (${input.imageCount} image${input.imageCount === 1 ? '' : 's'} in 1 ZIP)${downloadNote} then purged ${input.purgeIds.length}; ${input.keptCount} kept (favorites, ratings, Cast look plates).`,
  };
}

/**
 * Continue a pending Archive & purge after a tab refresh / remount.
 * Uses sessionStorage first, then falls back to the server's latest
 * ready/downloaded job (purgeEntryIds stored on the job).
 * Returns null when there is nothing to resume.
 */
export async function resumePendingArchivePurge(options: {
  removeEntries: (ids: string[]) => void;
  /** Only purge ids that still exist in the gallery (optional filter). */
  remainingEntryIds?: Set<string> | string[];
  onProgress?: (progress: ArchiveThenPurgeProgress) => void;
  pollArchive?: typeof pollArchiveJob;
  downloadArchive?: typeof downloadArchiveZip;
  /** Skip browser download when the ZIP is already saved. */
  skipDownload?: boolean;
}): Promise<ArchiveThenPurgeResult | null> {
  let pending = readPendingArchivePurge();

  if (!pending) {
    try {
      const response = await fetch('/api/gallery/archive', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok) {
        const body = (await response.json()) as {
          pending?: {
            jobId: string;
            purgeIds: string[];
            downloadName?: string;
            imageCount?: number;
          } | null;
        };
        if (body.pending?.jobId && body.pending.purgeIds?.length) {
          pending = {
            jobId: body.pending.jobId,
            purgeIds: body.pending.purgeIds,
            keptCount: 0,
            downloadName: body.pending.downloadName || `gallery-archive-${body.pending.jobId}`,
            startedAt: Date.now(),
          };
          writePendingArchivePurge(pending);
        }
      }
    } catch {
      // ignore — nothing to resume from server
    }
  }

  if (!pending) {
    return null;
  }

  const remaining =
    options.remainingEntryIds instanceof Set
      ? options.remainingEntryIds
      : options.remainingEntryIds
        ? new Set(options.remainingEntryIds)
        : null;
  const purgeIds = remaining ? pending.purgeIds.filter(id => remaining.has(id)) : pending.purgeIds;

  if (purgeIds.length === 0) {
    clearPendingArchivePurge();
    return {
      archived: 0,
      purged: 0,
      kept: pending.keptCount,
      skipped: true,
      zipCount: 0,
      message: 'Pending archive already purged — nothing left to remove.',
    };
  }

  // Keep pending in sync if some ids already disappeared.
  writePendingArchivePurge({ ...pending, purgeIds });

  options.onProgress?.({
    phase: 'fetching',
    processed: 0,
    total: purgeIds.length,
    progress: 0,
    message: `Resuming archive job…`,
  });

  try {
    const poll = options.pollArchive ?? pollArchiveJob;
    const ready = await poll(pending.jobId, options.onProgress);
    if (ready.imageCount === 0) {
      clearPendingArchivePurge();
      return {
        archived: 0,
        purged: 0,
        kept: pending.keptCount,
        skipped: true,
        zipCount: 0,
        message: 'Archive failed (no images in ZIP) — nothing was deleted.',
      };
    }
    return await finishDownloadAndPurge({
      jobId: pending.jobId,
      purgeIds,
      keptCount: pending.keptCount,
      downloadName: ready.downloadName || pending.downloadName,
      imageCount: ready.imageCount,
      removeEntries: options.removeEntries,
      onProgress: options.onProgress,
      downloadArchive: options.downloadArchive,
      resumed: true,
      skipDownload: options.skipDownload,
    });
  } catch (error) {
    // Keep pending so another remount can retry unless the job is gone/failed hard.
    const message = error instanceof Error ? error.message : 'Archive resume failed.';
    if (/not found|Archive failed/i.test(message)) {
      clearPendingArchivePurge();
    }
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Purge non-keepers / non-Cast-plates without building a ZIP.
 * Use after a successful archive download, or when the user accepts loss risk.
 */
export function purgeGalleryRestOnly(
  entries: ComfyGalleryEntry[],
  options: {
    removeEntries: (ids: string[]) => void;
    characters?: ReturnType<typeof loadCharacters>;
  }
): ArchiveThenPurgeResult {
  const characters = options.characters ?? loadCharacters();
  const { protected: kept, purgeable } = partitionGalleryForArchivePurge(entries, characters);
  if (purgeable.length === 0) {
    return {
      archived: 0,
      purged: 0,
      kept: kept.length,
      skipped: true,
      zipCount: 0,
      message:
        kept.length > 0
          ? `Nothing to purge — ${kept.length} keeper(s) / Cast look plate(s) stay.`
          : 'Gallery is empty.',
    };
  }
  options.removeEntries(purgeable.map(entry => entry.id));
  clearPendingArchivePurge();
  return {
    archived: 0,
    purged: purgeable.length,
    kept: kept.length,
    skipped: false,
    zipCount: 0,
    message: `Purged ${purgeable.length} without a new archive; ${kept.length} kept (favorites, ratings, Cast look plates).`,
  };
}

/** Server-staged archive: one ZIP on disk, then purge after download. */
export async function archiveThenPurgeGalleryEntries(
  entries: ComfyGalleryEntry[],
  options: {
    removeEntries: (ids: string[]) => void;
    characters?: ReturnType<typeof loadCharacters>;
    filename?: string;
    onProgress?: (progress: ArchiveThenPurgeProgress) => void;
    /** Injected for tests. */
    startArchive?: (descriptors: GalleryArchiveEntryDescriptor[]) => Promise<{ jobId: string }>;
    pollArchive?: typeof pollArchiveJob;
    downloadArchive?: typeof downloadArchiveZip;
  }
): Promise<ArchiveThenPurgeResult> {
  const characters = options.characters ?? loadCharacters();
  const { protected: kept, purgeable } = partitionGalleryForArchivePurge(entries, characters);

  if (purgeable.length === 0) {
    return {
      archived: 0,
      purged: 0,
      kept: kept.length,
      skipped: true,
      zipCount: 0,
      message:
        kept.length > 0
          ? `Nothing to purge — ${kept.length} keeper(s) / Cast look plate(s) stay.`
          : 'Gallery is empty.',
    };
  }

  const descriptors = purgeable.map(toArchiveEntryDescriptor);
  const downloadName =
    options.filename?.trim().replace(/\.zip$/i, '') || `gallery-archive-purge-${Date.now()}`;

  options.onProgress?.({
    phase: 'start',
    processed: 0,
    total: purgeable.length,
    progress: 0,
    message: `Starting archive of ${purgeable.length}…`,
  });

  const startArchive =
    options.startArchive ??
    (async (bodyEntries: GalleryArchiveEntryDescriptor[]) => {
      const response = await fetch('/api/gallery/archive', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: bodyEntries, downloadName }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Archive start HTTP ${response.status}`);
      }
      return (await response.json()) as { jobId: string };
    });

  const { jobId } = await startArchive(descriptors);
  writePendingArchivePurge({
    jobId,
    purgeIds: purgeable.map(entry => entry.id),
    keptCount: kept.length,
    downloadName,
    startedAt: Date.now(),
  });

  try {
    const poll = options.pollArchive ?? pollArchiveJob;
    const ready = await poll(jobId, options.onProgress);
    if (ready.imageCount === 0) {
      clearPendingArchivePurge();
      const expectsImages = purgeable.some(
        entry => entry.status === 'completed' && (entry.images?.length ?? 0) > 0
      );
      return {
        archived: 0,
        purged: 0,
        kept: kept.length,
        skipped: true,
        zipCount: 0,
        message: expectsImages
          ? 'Archive failed (no images in ZIP) — nothing was deleted.'
          : 'Archive failed — nothing was deleted.',
      };
    }

    return await finishDownloadAndPurge({
      jobId,
      purgeIds: purgeable.map(entry => entry.id),
      keptCount: kept.length,
      downloadName: ready.downloadName || downloadName,
      imageCount: ready.imageCount,
      removeEntries: options.removeEntries,
      onProgress: options.onProgress,
      downloadArchive: options.downloadArchive,
    });
  } catch (error) {
    // Leave pending in sessionStorage so a remount can resume after refresh.
    throw error;
  }
}
