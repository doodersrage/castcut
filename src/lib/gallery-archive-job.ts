import 'server-only';

/**
 * Server-staged gallery archive jobs: stage files under the data dir, stream
 * one ZIP to disk, expose progress for Archive & purge.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fetchEngineOutputBuffer } from './engine-output-fetch';
import { type GalleryArchiveEntryDescriptor } from './gallery-archive-job-client';
import { readGalleryOriginalFile } from './gallery-media-store';
import { createZipFileFromDiskPaths, type ZipDiskEntry } from './gallery-zip-stream';
import { resolvePromptDataDir } from './prompt-data-paths';
import {
  normalizeComfyViewType,
  sanitizeComfyViewFilename,
  sanitizeComfyViewSubfolder,
} from './url-safety';

export type { GalleryArchiveEntryDescriptor } from './gallery-archive-job-client';
export { toArchiveEntryDescriptor } from './gallery-archive-job-client';

export type GalleryArchiveJobStatus =
  'queued' | 'fetching' | 'zipping' | 'ready' | 'downloaded' | 'error';

export type GalleryArchiveJobPhase = GalleryArchiveJobStatus;

export type GalleryArchiveJob = {
  id: string;
  ownerId: string;
  status: GalleryArchiveJobStatus;
  phase: GalleryArchiveJobPhase;
  progress: number;
  processed: number;
  total: number;
  imageCount: number;
  message: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  downloadName: string;
  /** Gallery entry ids to purge after a successful download (client resume). */
  purgeEntryIds?: string[];
};

const JOB_ID = /^[a-zA-Z0-9_-]{8,64}$/;
const JOB_TTL_MS = 60 * 60 * 1000;
const runningJobs = new Set<string>();

function jobsRoot(): string {
  return path.join(resolvePromptDataDir(), 'gallery-archive-jobs');
}

function jobDir(jobId: string): string {
  return path.join(jobsRoot(), jobId);
}

function jobJsonPath(jobId: string): string {
  return path.join(jobDir(jobId), 'job.json');
}

function stagingDir(jobId: string): string {
  return path.join(jobDir(jobId), 'staging');
}

function archiveZipPath(jobId: string): string {
  return path.join(jobDir(jobId), 'archive.zip');
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function isValidGalleryArchiveJobId(id: string): boolean {
  return JOB_ID.test(id.trim());
}

export function readGalleryArchiveJob(jobId: string): GalleryArchiveJob | null {
  if (!isValidGalleryArchiveJobId(jobId)) {
    return null;
  }
  const filePath = jobJsonPath(jobId.trim());
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as GalleryArchiveJob;
    if (!raw?.id || raw.id !== jobId.trim()) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function writeJob(job: GalleryArchiveJob): GalleryArchiveJob {
  const dir = jobDir(job.id);
  fs.mkdirSync(dir, { recursive: true });
  const next = { ...job, updatedAt: Date.now() };
  fs.writeFileSync(jobJsonPath(job.id), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function patchJob(jobId: string, patch: Partial<GalleryArchiveJob>): GalleryArchiveJob | null {
  const current = readGalleryArchiveJob(jobId);
  if (!current) {
    return null;
  }
  return writeJob({ ...current, ...patch, id: current.id, ownerId: current.ownerId });
}

export function createGalleryArchiveJob(input: {
  ownerId: string;
  total: number;
  downloadName?: string;
  purgeEntryIds?: string[];
}): GalleryArchiveJob {
  const id = crypto.randomBytes(12).toString('hex');
  const stamp = Date.now();
  const purgeEntryIds = (input.purgeEntryIds ?? [])
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, 20_000);
  const job: GalleryArchiveJob = {
    id,
    ownerId: input.ownerId.trim() || '_global',
    status: 'queued',
    phase: 'queued',
    progress: 0,
    processed: 0,
    total: Math.max(0, input.total),
    imageCount: 0,
    message: 'Queued…',
    createdAt: stamp,
    updatedAt: stamp,
    downloadName:
      input.downloadName?.trim().replace(/\.zip$/i, '') || `gallery-archive-purge-${stamp}`,
    ...(purgeEntryIds.length > 0 ? { purgeEntryIds } : {}),
  };
  fs.mkdirSync(stagingDir(id), { recursive: true });
  return writeJob(job);
}

function safeEntryFolder(index: number, promptId: string): string {
  const slug = (promptId || 'entry').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8) || 'entry';
  return `entry-${index + 1}-${slug}`;
}

function sanitizeArchiveFilename(name: string, fallback: string): string {
  const trimmed = name.trim().replace(/[/\\?%*:|"<>]/g, '_');
  return trimmed.slice(0, 120) || fallback;
}

function buildArchiveSidecar(entry: GalleryArchiveEntryDescriptor): Record<string, unknown> {
  return {
    positive: entry.prompt ?? '',
    negative: entry.negativePrompt ?? '',
    model: entry.model ?? 'unknown',
    tool: entry.tool,
    metadata: {
      promptId: entry.promptId,
      galleryEntryId: entry.id,
      comfyUrl: entry.comfyUrl,
      engineId: entry.engineId,
      status: entry.status,
      queuedAt: entry.queuedAt,
      completedAt: entry.completedAt,
      images: entry.images,
      characterId: entry.characterId,
      lookId: entry.lookId,
      favorite: entry.favorite,
      reviewRating: entry.reviewRating,
    },
  };
}

async function stageEntryImages(input: {
  jobId: string;
  ownerId: string;
  entry: GalleryArchiveEntryDescriptor;
  entryIndex: number;
}): Promise<{ diskEntries: ZipDiskEntry[]; imageCount: number }> {
  const folder = safeEntryFolder(input.entryIndex, input.entry.promptId);
  const entryDir = path.join(stagingDir(input.jobId), folder);
  fs.mkdirSync(entryDir, { recursive: true });

  const sidecarPath = path.join(entryDir, 'sidecar.json');
  fs.writeFileSync(sidecarPath, JSON.stringify(buildArchiveSidecar(input.entry), null, 2), 'utf8');

  const diskEntries: ZipDiskEntry[] = [
    { archivePath: `${folder}/sidecar.json`, diskPath: sidecarPath },
  ];
  let imageCount = 0;

  if (input.entry.status !== 'completed' || !input.entry.images?.length) {
    return { diskEntries, imageCount };
  }

  for (let imageIndex = 0; imageIndex < input.entry.images.length; imageIndex += 1) {
    const image = input.entry.images[imageIndex];
    if (!image) {
      continue;
    }
    let buffer: Buffer | null = null;

    const durable =
      input.entry.durableOriginalPaths?.[imageIndex] ??
      (imageIndex === 0 ? input.entry.durableOriginalPath : undefined);
    if (durable) {
      try {
        const file = readGalleryOriginalFile({
          userId: input.ownerId === '_global' ? null : input.ownerId,
          entryId: input.entry.id,
          index: imageIndex,
        });
        if (file?.buffer?.length) {
          buffer = file.buffer;
        }
      } catch {
        // fall through to engine fetch
      }
    }

    if (!buffer) {
      const filename = sanitizeComfyViewFilename(image.filename);
      if (!filename) {
        continue;
      }
      try {
        const fetched = await fetchEngineOutputBuffer({
          engineId: input.entry.engineId,
          engineUrl: input.entry.comfyUrl,
          promptId: input.entry.promptId,
          filename,
          subfolder: sanitizeComfyViewSubfolder(image.subfolder ?? ''),
          type: normalizeComfyViewType(image.type ?? 'output'),
        });
        buffer = fetched?.buffer ?? null;
      } catch {
        buffer = null;
      }
    }

    if (!buffer?.length) {
      continue;
    }

    const outName = sanitizeArchiveFilename(
      image.filename || `output-${imageIndex + 1}`,
      `output-${imageIndex + 1}`
    );
    const diskPath = path.join(entryDir, outName);
    fs.writeFileSync(diskPath, buffer);
    diskEntries.push({ archivePath: `${folder}/${outName}`, diskPath });
    imageCount += 1;
  }

  return { diskEntries, imageCount };
}

export async function runGalleryArchiveJob(
  jobId: string,
  entries: GalleryArchiveEntryDescriptor[]
): Promise<void> {
  if (runningJobs.has(jobId)) {
    return;
  }
  runningJobs.add(jobId);
  try {
    const job = readGalleryArchiveJob(jobId);
    if (!job) {
      return;
    }

    const total = entries.length;
    patchJob(jobId, {
      status: 'fetching',
      phase: 'fetching',
      total,
      processed: 0,
      progress: 0.01,
      message: `Fetching 0/${total}…`,
    });

    const allDiskEntries: ZipDiskEntry[] = [];
    let imageCount = 0;
    let expectsImages = false;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      if (entry.status === 'completed' && (entry.images?.length ?? 0) > 0) {
        expectsImages = true;
      }
      const staged = await stageEntryImages({
        jobId,
        ownerId: job.ownerId,
        entry,
        entryIndex: index,
      });
      allDiskEntries.push(...staged.diskEntries);
      imageCount += staged.imageCount;
      const processed = index + 1;
      // Fetching is 0–85% of the job.
      const progress = clampProgress(0.01 + (processed / Math.max(1, total)) * 0.84);
      patchJob(jobId, {
        status: 'fetching',
        phase: 'fetching',
        processed,
        imageCount,
        progress,
        message: `Fetching ${processed}/${total}…`,
      });
    }

    if (allDiskEntries.length === 0 || (expectsImages && imageCount === 0)) {
      patchJob(jobId, {
        status: 'error',
        phase: 'error',
        progress: 0,
        imageCount,
        error: expectsImages
          ? 'Archive failed (no images fetched) — nothing was deleted.'
          : 'Archive failed — nothing was deleted.',
        message: expectsImages
          ? 'Archive failed (no images fetched) — nothing was deleted.'
          : 'Archive failed — nothing was deleted.',
      });
      return;
    }

    const zipTotal = allDiskEntries.length;
    patchJob(jobId, {
      status: 'zipping',
      phase: 'zipping',
      progress: 0.86,
      processed: 0,
      message: `Zipping 0/${zipTotal}…`,
      imageCount,
    });

    const zipPath = archiveZipPath(jobId);
    let lastZipPatch = 0;
    await createZipFileFromDiskPaths(zipPath, allDiskEntries, {
      onProgress: ({ processed, total, bytesWritten }) => {
        const now = Date.now();
        // Throttle disk job.json writes (~2/s) while still yielding the event loop often.
        if (processed < total && now - lastZipPatch < 500) {
          return;
        }
        lastZipPatch = now;
        const gb = bytesWritten / (1024 * 1024 * 1024);
        const sizeLabel = gb >= 0.1 ? ` · ${gb.toFixed(1)} GB` : '';
        patchJob(jobId, {
          status: 'zipping',
          phase: 'zipping',
          processed,
          // Zipping occupies 86% → 99% of the overall bar.
          progress: clampProgress(0.86 + (processed / Math.max(1, total)) * 0.13),
          message: `Zipping ${processed}/${total}${sizeLabel}…`,
          imageCount,
        });
      },
    });

    // Free staging files after ZIP is on disk.
    try {
      fs.rmSync(stagingDir(jobId), { recursive: true, force: true });
    } catch {
      // best-effort
    }

    patchJob(jobId, {
      status: 'ready',
      phase: 'ready',
      progress: 1,
      processed: total,
      imageCount,
      message: `Ready — ${total} entries (${imageCount} image${imageCount === 1 ? '' : 's'}).`,
    });
  } catch (error) {
    patchJob(jobId, {
      status: 'error',
      phase: 'error',
      progress: 0,
      error: error instanceof Error ? error.message : 'Archive job failed.',
      message: error instanceof Error ? error.message : 'Archive job failed.',
    });
  } finally {
    runningJobs.delete(jobId);
  }
}

export function getGalleryArchiveZipPath(jobId: string): string | null {
  const job = readGalleryArchiveJob(jobId);
  if (!job || (job.status !== 'ready' && job.status !== 'downloaded')) {
    return null;
  }
  const zipPath = archiveZipPath(jobId);
  return fs.existsSync(zipPath) ? zipPath : null;
}

export function markGalleryArchiveDownloaded(jobId: string): void {
  patchJob(jobId, {
    status: 'downloaded',
    phase: 'downloaded',
    message: 'Downloaded.',
  });
  // Cleanup after TTL so the file is available for a moment if the browser retries.
  const dir = jobDir(jobId);
  setTimeout(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }, JOB_TTL_MS).unref?.();
}

/** Clear purge ids after the client finishes removeEntries (stops auto-resume loops). */
export function markGalleryArchivePurgeComplete(jobId: string): GalleryArchiveJob | null {
  const current = readGalleryArchiveJob(jobId);
  if (!current) {
    return null;
  }
  return writeJob({
    ...current,
    purgeEntryIds: [],
    message: 'Purge complete.',
    updatedAt: Date.now(),
  });
}

/** Newest ready/downloaded job for an owner that still has a ZIP + purge ids. */
export function findResumableGalleryArchiveJob(ownerId: string): GalleryArchiveJob | null {
  const root = jobsRoot();
  if (!fs.existsSync(root)) {
    return null;
  }
  let best: GalleryArchiveJob | null = null;
  for (const name of fs.readdirSync(root)) {
    if (!isValidGalleryArchiveJobId(name)) {
      continue;
    }
    const job = readGalleryArchiveJob(name);
    if (!job || job.ownerId !== ownerId) {
      continue;
    }
    if (job.status !== 'ready' && job.status !== 'downloaded') {
      continue;
    }
    if (!job.purgeEntryIds?.length || job.imageCount <= 0) {
      continue;
    }
    if (!getGalleryArchiveZipPath(job.id)) {
      continue;
    }
    if (!best || job.updatedAt > best.updatedAt) {
      best = job;
    }
  }
  return best;
}

/** Drop stale job dirs older than TTL (best-effort housekeeping). */
export function cleanupStaleGalleryArchiveJobs(now = Date.now()): number {
  const root = jobsRoot();
  if (!fs.existsSync(root)) {
    return 0;
  }
  let removed = 0;
  for (const name of fs.readdirSync(root)) {
    if (!isValidGalleryArchiveJobId(name)) {
      continue;
    }
    const job = readGalleryArchiveJob(name);
    const updatedAt = job?.updatedAt ?? 0;
    if (updatedAt && now - updatedAt < JOB_TTL_MS) {
      continue;
    }
    if (!job && now - fs.statSync(path.join(root, name)).mtimeMs < JOB_TTL_MS) {
      continue;
    }
    try {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
      removed += 1;
    } catch {
      // ignore
    }
  }
  return removed;
}
