import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { assetIsDownloadable, getCatalogAsset, isAllowlistedAssetUrl } from './comfy-asset-catalog';
import {
  canWriteComfyModelsRoot,
  comfyModelsWriteErrorMessage,
  getComfyUiRoot,
  resolveAssetDestinationPath,
} from './comfy-asset-paths';
import type { ComfyAssetKind } from './comfy-asset-kinds';
import {
  civitaiLoraDownloadUrl,
  isCivitaiDownloadUrl,
  parseCivitaiVersionId,
} from './civitai-lora';

export type ComfyAssetJobStatus =
  'queued' | 'downloading' | 'verifying' | 'complete' | 'error' | 'cancelled';

export type ComfyAssetJob = {
  id: string;
  assetId: string;
  label: string;
  filename: string;
  status: ComfyAssetJobStatus;
  progress: number;
  bytesReceived: number;
  bytesTotal: number | null;
  error?: string;
  /** Per-fetch retry counter within one download run. */
  attempt?: number;
  /** Full download restarts after a terminal failure in `runDownload`. */
  runAttempt?: number;
  destPath?: string;
  createdAt: string;
  updatedAt: string;
};

type DownloadParams = {
  url: string;
  destPath: string;
  partialPath: string;
  modelsDir: string;
  expectedSha256?: string;
  expectedBytes?: number;
  fetchImpl: typeof fetch;
};

type ComfyAssetDownloadRuntime = {
  jobs: Map<string, ComfyAssetJob>;
  pendingDownloadParams: Map<string, DownloadParams>;
  /** Prevents double-scheduling the same job after HMR / resume. */
  runningJobIds: Set<string>;
  downloadHandles: Set<Promise<void>>;
  downloadQueue: Promise<void>;
  abortControllers: Map<string, AbortController>;
};

const RUNTIME_KEY = Symbol.for('comfy.promptStudio.assetDownloadRuntime');

function getRuntime(): ComfyAssetDownloadRuntime {
  const globalRecord = globalThis as typeof globalThis & {
    [RUNTIME_KEY]?: ComfyAssetDownloadRuntime;
  };
  if (!globalRecord[RUNTIME_KEY]) {
    globalRecord[RUNTIME_KEY] = {
      jobs: new Map(),
      pendingDownloadParams: new Map(),
      runningJobIds: new Set(),
      downloadHandles: new Set(),
      downloadQueue: Promise.resolve(),
      abortControllers: new Map(),
    };
    queueMicrotask(() => {
      resumeInterruptedComfyAssetDownloads();
    });
  }
  return globalRecord[RUNTIME_KEY]!;
}

const MAX_ATTEMPTS = 5;
const MAX_RUN_ATTEMPTS = 8;
const STALL_MS = 90_000;
const CONNECT_TIMEOUT_MS = 60_000;
const TOTAL_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export function listComfyAssetJobs(): ComfyAssetJob[] {
  return [...getRuntime().jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getComfyAssetJob(id: string): ComfyAssetJob | undefined {
  return getRuntime().jobs.get(id);
}

/** Test helper — clears in-memory jobs and the serial queue. */
export function __resetComfyAssetJobsForTests(): void {
  const globalRecord = globalThis as typeof globalThis & {
    [RUNTIME_KEY]?: ComfyAssetDownloadRuntime;
  };
  delete globalRecord[RUNTIME_KEY];
}

function saveJob(job: ComfyAssetJob): ComfyAssetJob {
  const next = { ...job, updatedAt: new Date().toISOString() };
  getRuntime().jobs.set(next.id, next);
  return next;
}

function rebuildDownloadParams(job: ComfyAssetJob): DownloadParams | null {
  if (!job.destPath?.trim()) {
    return null;
  }
  const destPath = path.resolve(job.destPath);
  const modelsDir = path.dirname(destPath);
  const civitaiVersionId = parseCivitaiVersionId(job.assetId);
  if (civitaiVersionId != null) {
    const url = civitaiLoraDownloadUrl(civitaiVersionId);
    if (!isAllowlistedAssetUrl(url)) {
      return null;
    }
    return {
      url,
      destPath,
      partialPath: `${destPath}.partial`,
      modelsDir,
      expectedBytes: job.bytesTotal ?? undefined,
      fetchImpl: fetch,
    };
  }
  const asset = getCatalogAsset(job.assetId);
  if (!asset?.url || !isAllowlistedAssetUrl(asset.url)) {
    return null;
  }
  return {
    url: asset.url,
    destPath,
    partialPath: `${destPath}.partial`,
    modelsDir,
    expectedSha256: asset.sha256,
    expectedBytes: asset.bytes,
    fetchImpl: fetch,
  };
}

/** Re-queue downloads orphaned by dev HMR or a dropped `after()` callback. */
export function resumeInterruptedComfyAssetDownloads(): void {
  const runtime = getRuntime();

  for (const job of runtime.jobs.values()) {
    if (job.status !== 'queued' && job.status !== 'downloading') {
      continue;
    }
    if (runtime.runningJobIds.has(job.id)) {
      continue;
    }

    const params = runtime.pendingDownloadParams.get(job.id) ?? rebuildDownloadParams(job);
    if (!params) {
      continue;
    }

    if (job.status === 'downloading') {
      saveJob({
        ...job,
        status: 'queued',
        error: 'Resuming download after server reload…',
      });
    }

    scheduleComfyAssetDownloadJob(job.id, params);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const handle = await fsp.open(filePath, 'r');
  try {
    const stream = handle.createReadStream();
    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

function withDownloadQuery(urlString: string): string {
  if (isCivitaiDownloadUrl(urlString)) {
    return urlString;
  }
  try {
    const url = new URL(urlString);
    if (!url.searchParams.has('download')) {
      url.searchParams.set('download', 'true');
    }
    return url.toString();
  } catch {
    return urlString;
  }
}

function buildDownloadHeaders(urlString: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/octet-stream,*/*',
    'User-Agent': 'Castcut/1.0 (+local; curated model install)',
  };
  if (isCivitaiDownloadUrl(urlString)) {
    const token = process.env.CIVITAI_API_TOKEN?.trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }
  const hfToken = process.env.HF_TOKEN?.trim() || process.env.HUGGING_FACE_HUB_TOKEN?.trim();
  if (hfToken) {
    headers.Authorization = `Bearer ${hfToken}`;
  }
  return headers;
}

function jobRetryDelayMs(runAttempt: number): number {
  const base = Math.min(120_000, 5_000 * 2 ** (runAttempt - 1));
  return base + Math.floor(Math.random() * 1_000);
}

function formatBytesForJob(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function isRetryableDownloadError(
  message: string,
  err?: Pick<NodeJS.ErrnoException, 'code'>
): boolean {
  if (err?.code === 'EACCES' || err?.code === 'EPERM') {
    return false;
  }
  if (/^cancelled\.?$/i.test(message.trim())) {
    return false;
  }
  if (
    /SHA-256 mismatch|Size mismatch|Permission denied writing|Download parameters could not/i.test(
      message
    )
  ) {
    return false;
  }
  if (/\b403\b|\b401\b|HTTP 403|HTTP 401|requires HF_TOKEN|blocked/i.test(message)) {
    return false;
  }
  return true;
}

function retryAfterMs(response: Response, attempt: number): number {
  const raw = response.headers.get('retry-after');
  if (raw) {
    const asSeconds = Number(raw);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) {
      return Math.min(120_000, Math.max(1_000, asSeconds * 1000));
    }
    const asDate = Date.parse(raw);
    if (!Number.isNaN(asDate)) {
      return Math.min(120_000, Math.max(1_000, asDate - Date.now()));
    }
  }
  // 429/503: exponential backoff with jitter, capped.
  const base = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
  return base + Math.floor(Math.random() * 500);
}

function httpErrorMessage(status: number, statusText: string): string {
  if (status === 429) {
    return `Hugging Face rate-limited this download (HTTP 429). Wait a bit, or set HF_TOKEN and retry one file at a time.`;
  }
  if (status === 503) {
    return `Hugging Face is temporarily unavailable (HTTP 503). Retry shortly.`;
  }
  if (status === 401 || status === 403) {
    return `Download failed with HTTP ${status} ${statusText}. Hugging Face may require HF_TOKEN for this file, or the URL is blocked.`;
  }
  return `Download failed with HTTP ${status} ${statusText}.`.trim();
}

export type StartComfyAssetDownloadOptions = {
  assetId: string;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
  root?: string | null;
  /**
   * When false, return the job without starting work (caller must invoke
   * `runComfyAssetDownloadJob`). Default starts immediately.
   */
  deferStart?: boolean;
};

/**
 * Start a curated weight download into COMFYUI_ROOT/models/….
 * Returns the job immediately; work continues in the background unless deferred.
 */
export function startComfyAssetDownload(options: StartComfyAssetDownloadOptions): ComfyAssetJob {
  const asset = getCatalogAsset(options.assetId);
  if (!asset) {
    throw new Error(`Unknown asset id: ${options.assetId}`);
  }
  if (!assetIsDownloadable(asset) || !asset.url) {
    throw new Error(
      `Asset “${asset.id}” has no allowlisted download URL — install the file manually.`
    );
  }
  if (!isAllowlistedAssetUrl(asset.url)) {
    throw new Error('Download URL host is not allowlisted.');
  }

  const root = options.root !== undefined ? options.root : getComfyUiRoot();
  if (!root) {
    throw new Error('COMFYUI_ROOT is not set. Point it at your ComfyUI install directory.');
  }
  if (!fs.existsSync(root)) {
    throw new Error(`COMFYUI_ROOT does not exist: ${root}`);
  }
  if (!canWriteComfyModelsRoot(root)) {
    throw new Error(comfyModelsWriteErrorMessage(root));
  }

  const { destPath, partialPath, modelsDir } = resolveAssetDestinationPath({
    root,
    kind: asset.kind,
    filename: asset.filename,
  });

  if (fs.existsSync(destPath)) {
    const existing: ComfyAssetJob = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      label: asset.label,
      filename: asset.filename,
      status: 'complete',
      progress: 1,
      bytesReceived: 0,
      bytesTotal: null,
      destPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return saveJob(existing);
  }

  // Reuse an in-flight or failed job for the same asset instead of stacking duplicates.
  for (const existing of getRuntime().jobs.values()) {
    if (existing.assetId !== asset.id) {
      continue;
    }
    if (
      existing.status === 'queued' ||
      existing.status === 'downloading' ||
      existing.status === 'verifying'
    ) {
      return existing;
    }
    if (existing.status === 'error' || existing.status === 'cancelled') {
      const restarted = retryComfyAssetDownload(existing.id, {
        deferStart: options.deferStart,
        fetchImpl: options.fetchImpl,
      });
      if (restarted) {
        return restarted;
      }
    }
  }

  const job: ComfyAssetJob = {
    id: crypto.randomUUID(),
    assetId: asset.id,
    label: asset.label,
    filename: asset.filename,
    status: 'queued',
    progress: 0,
    bytesReceived: 0,
    bytesTotal: asset.bytes ?? null,
    attempt: 0,
    runAttempt: 1,
    destPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveJob(job);

  const params: DownloadParams = {
    url: asset.url,
    destPath,
    partialPath,
    modelsDir,
    expectedSha256: asset.sha256,
    expectedBytes: asset.bytes,
    fetchImpl: options.fetchImpl ?? fetch,
  };

  if (!options.deferStart) {
    scheduleComfyAssetDownloadJob(job.id, params);
  } else {
    getRuntime().pendingDownloadParams.set(job.id, params);
  }

  return job;
}

export type StartAdhocAssetDownloadOptions = {
  assetId: string;
  label: string;
  filename: string;
  kind: ComfyAssetKind;
  url: string;
  bytes?: number;
  sha256?: string;
  fetchImpl?: typeof fetch;
  root?: string | null;
  deferStart?: boolean;
};

/**
 * Start a server-constructed (allowlisted) download that is not in the curated catalog.
 * Callers must pass a URL they built — never a client-supplied address.
 */
export function startAdhocAssetDownload(options: StartAdhocAssetDownloadOptions): ComfyAssetJob {
  if (!isAllowlistedAssetUrl(options.url)) {
    throw new Error('Download URL host is not allowlisted.');
  }

  const root = options.root !== undefined ? options.root : getComfyUiRoot();
  if (!root) {
    throw new Error('COMFYUI_ROOT is not set. Point it at your ComfyUI install directory.');
  }
  if (!fs.existsSync(root)) {
    throw new Error(`COMFYUI_ROOT does not exist: ${root}`);
  }
  if (!canWriteComfyModelsRoot(root)) {
    throw new Error(comfyModelsWriteErrorMessage(root));
  }

  const { destPath, partialPath, modelsDir } = resolveAssetDestinationPath({
    root,
    kind: options.kind,
    filename: options.filename,
  });

  if (fs.existsSync(destPath)) {
    const existing: ComfyAssetJob = {
      id: crypto.randomUUID(),
      assetId: options.assetId,
      label: options.label,
      filename: options.filename,
      status: 'complete',
      progress: 1,
      bytesReceived: 0,
      bytesTotal: options.bytes ?? null,
      destPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return saveJob(existing);
  }

  for (const existing of getRuntime().jobs.values()) {
    if (existing.assetId !== options.assetId) {
      continue;
    }
    if (
      existing.status === 'queued' ||
      existing.status === 'downloading' ||
      existing.status === 'verifying'
    ) {
      return existing;
    }
    if (existing.status === 'error' || existing.status === 'cancelled') {
      const restarted = retryComfyAssetDownload(existing.id, {
        deferStart: options.deferStart,
        fetchImpl: options.fetchImpl,
      });
      if (restarted) {
        return restarted;
      }
    }
  }

  const job: ComfyAssetJob = {
    id: crypto.randomUUID(),
    assetId: options.assetId,
    label: options.label,
    filename: options.filename,
    status: 'queued',
    progress: 0,
    bytesReceived: 0,
    bytesTotal: options.bytes ?? null,
    attempt: 0,
    runAttempt: 1,
    destPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveJob(job);

  const params: DownloadParams = {
    url: options.url,
    destPath,
    partialPath,
    modelsDir,
    expectedSha256: options.sha256,
    expectedBytes: options.bytes,
    fetchImpl: options.fetchImpl ?? fetch,
  };

  if (!options.deferStart) {
    scheduleComfyAssetDownloadJob(job.id, params);
  } else {
    getRuntime().pendingDownloadParams.set(job.id, params);
  }

  return job;
}

/** Cancel a queued/active download. Keeps `.partial` for a later resume. */
export function cancelComfyAssetDownload(jobId: string): ComfyAssetJob | undefined {
  const runtime = getRuntime();
  const job = runtime.jobs.get(jobId);
  if (!job) {
    return undefined;
  }
  if (job.status !== 'queued' && job.status !== 'downloading' && job.status !== 'verifying') {
    return job;
  }
  const controller = runtime.abortControllers.get(jobId);
  controller?.abort();
  runtime.abortControllers.delete(jobId);
  runtime.pendingDownloadParams.delete(jobId);
  runtime.runningJobIds.delete(jobId);
  return saveJob({
    ...job,
    status: 'cancelled',
    error: 'Cancelled.',
  });
}

/** Restart a failed or cancelled download (same job id). Resumes from `.partial` when present. */
export function retryComfyAssetDownload(
  jobId: string,
  options: Pick<StartComfyAssetDownloadOptions, 'deferStart' | 'fetchImpl'> = {}
): ComfyAssetJob | undefined {
  const runtime = getRuntime();
  const job = runtime.jobs.get(jobId);
  if (!job || (job.status !== 'error' && job.status !== 'cancelled')) {
    return job;
  }

  const params = rebuildDownloadParams(job);
  if (!params) {
    saveJob({
      ...job,
      error: 'Download parameters could not be restored.',
    });
    return runtime.jobs.get(jobId);
  }

  const restarted = saveJob({
    ...job,
    status: 'queued',
    progress: 0,
    bytesReceived: 0,
    bytesTotal: getCatalogAsset(job.assetId)?.bytes ?? job.bytesTotal,
    error: undefined,
    attempt: 0,
    runAttempt: 1,
  });

  const nextParams: DownloadParams = {
    ...params,
    fetchImpl: options.fetchImpl ?? params.fetchImpl,
  };

  if (options.deferStart) {
    runtime.pendingDownloadParams.set(jobId, nextParams);
  } else {
    scheduleComfyAssetDownloadJob(jobId, nextParams);
  }

  return restarted;
}

/** Run a previously deferred job (used with Next.js `after()`). */
export function runComfyAssetDownloadJob(jobId: string): Promise<void> {
  const runtime = getRuntime();
  let params = runtime.pendingDownloadParams.get(jobId);
  runtime.pendingDownloadParams.delete(jobId);
  if (!params) {
    const job = runtime.jobs.get(jobId);
    if (!job) {
      return Promise.resolve();
    }
    params = rebuildDownloadParams(job) ?? undefined;
  }
  if (!params) {
    const job = runtime.jobs.get(jobId);
    if (job && (job.status === 'queued' || job.status === 'downloading')) {
      saveJob({
        ...job,
        status: 'error',
        error: 'Download parameters could not be restored.',
      });
    }
    return Promise.resolve();
  }
  return scheduleComfyAssetDownloadJob(jobId, params);
}

function scheduleComfyAssetDownloadJob(jobId: string, params: DownloadParams): Promise<void> {
  const runtime = getRuntime();
  if (runtime.runningJobIds.has(jobId)) {
    return Promise.resolve();
  }
  runtime.runningJobIds.add(jobId);

  const run = () =>
    runDownload({ jobId, ...params }).finally(() => {
      runtime.runningJobIds.delete(jobId);
    });
  const handle = runtime.downloadQueue.then(run, run).finally(() => {
    runtime.downloadHandles.delete(handle);
  });
  runtime.downloadQueue = handle.catch(() => undefined);
  runtime.downloadHandles.add(handle);
  return handle;
}

function jobWasCancelled(jobId: string): boolean {
  return getRuntime().jobs.get(jobId)?.status === 'cancelled';
}

function registerAbortController(jobId: string): AbortController {
  const runtime = getRuntime();
  runtime.abortControllers.get(jobId)?.abort();
  const controller = new AbortController();
  runtime.abortControllers.set(jobId, controller);
  return controller;
}

function clearAbortController(jobId: string): void {
  getRuntime().abortControllers.delete(jobId);
}

async function fetchWithRetries(input: {
  jobId: string;
  url: string;
  fetchImpl: typeof fetch;
  rangeStart?: number;
}): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (jobWasCancelled(input.jobId)) {
      throw new Error('Cancelled.');
    }
    const job = getRuntime().jobs.get(input.jobId);
    if (job) {
      saveJob({
        ...job,
        status: 'downloading',
        attempt,
        error: attempt > 1 ? `Retrying (attempt ${attempt}/${MAX_ATTEMPTS})…` : undefined,
      });
    }

    const connectController = registerAbortController(input.jobId);
    const connectTimer = setTimeout(() => connectController.abort(), CONNECT_TIMEOUT_MS);
    const overallTimer = setTimeout(() => connectController.abort(), TOTAL_TIMEOUT_MS);

    try {
      const headers = buildDownloadHeaders(input.url);
      if (input.rangeStart && input.rangeStart > 0) {
        headers.Range = `bytes=${input.rangeStart}-`;
      }
      const response = await input.fetchImpl(withDownloadQuery(input.url), {
        redirect: 'follow',
        headers,
        signal: connectController.signal,
      });
      clearTimeout(connectTimer);

      if (response.ok || response.status === 206) {
        clearTimeout(overallTimer);
        // Caller owns the body; keep overall timer tied via stall watchdog instead.
        // Clear overall here — body read has its own stall detection.
        return response;
      }

      // Drain error bodies so sockets free promptly.
      try {
        await response.arrayBuffer();
      } catch {
        // ignore
      }

      if ((response.status === 429 || response.status === 503) && attempt < MAX_ATTEMPTS) {
        const waitMs = retryAfterMs(response, attempt);
        const waiting = getRuntime().jobs.get(input.jobId);
        if (waiting) {
          saveJob({
            ...waiting,
            status: 'downloading',
            attempt,
            progress: 0,
            error: `HTTP ${response.status} — waiting ${Math.ceil(waitMs / 1000)}s before retry ${attempt + 1}/${MAX_ATTEMPTS}…`,
          });
        }
        clearTimeout(overallTimer);
        await sleep(waitMs);
        continue;
      }

      clearTimeout(overallTimer);
      throw new Error(httpErrorMessage(response.status, response.statusText));
    } catch (error) {
      clearTimeout(connectTimer);
      clearTimeout(overallTimer);
      if (jobWasCancelled(input.jobId)) {
        throw new Error('Cancelled.');
      }
      const aborted =
        error instanceof Error &&
        (error.name === 'AbortError' ||
          error.name === 'TimeoutError' ||
          /aborted|timeout/i.test(error.message));
      lastError =
        error instanceof Error
          ? aborted
            ? new Error(
                `Connection stalled or timed out talking to the download host (attempt ${attempt}/${MAX_ATTEMPTS}).`
              )
            : error
          : new Error('Download failed.');

      if (aborted && attempt < MAX_ATTEMPTS) {
        const waiting = getRuntime().jobs.get(input.jobId);
        if (waiting) {
          saveJob({
            ...waiting,
            status: 'downloading',
            attempt,
            error: `${lastError.message} Retrying…`,
          });
        }
        await sleep(retryAfterMs(new Response(null, { status: 503 }), attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Download failed after retries.');
}

async function runDownload(input: {
  jobId: string;
  url: string;
  destPath: string;
  partialPath: string;
  modelsDir: string;
  expectedSha256?: string;
  expectedBytes?: number;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const current = getRuntime().jobs.get(input.jobId);
  if (!current) {
    return;
  }

  let received = 0;
  let total: number | null = input.expectedBytes ?? null;
  let lastProgressWrite = 0;
  let contentLength = 0;
  let keepPartial = false;

  try {
    await fsp.mkdir(path.dirname(input.destPath), { recursive: true });
    await fsp.mkdir(input.modelsDir, { recursive: true });

    let rangeStart = 0;
    try {
      const partialStat = await fsp.stat(input.partialPath);
      if (partialStat.isFile() && partialStat.size > 0) {
        rangeStart = partialStat.size;
        received = partialStat.size;
      }
    } catch {
      rangeStart = 0;
    }

    saveJob({
      ...current,
      status: 'downloading',
      progress: rangeStart > 0 && total ? Math.min(0.99, rangeStart / total) : 0,
      bytesReceived: received,
      error: rangeStart > 0 ? `Resuming from ${formatBytesForJob(rangeStart)}…` : undefined,
      attempt: 1,
    });

    const response = await fetchWithRetries({
      jobId: input.jobId,
      url: input.url,
      fetchImpl: input.fetchImpl,
      rangeStart: rangeStart > 0 ? rangeStart : undefined,
    });

    if (!response.body) {
      throw new Error('Download response had no body.');
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (/text\/html/i.test(contentType)) {
      throw new Error(
        isCivitaiDownloadUrl(input.url)
          ? 'Civitai returned a web page instead of a file. Set CIVITAI_API_TOKEN for gated models, or try another version.'
          : 'Download returned HTML instead of a weight file (login wall or bad URL).'
      );
    }

    // Server ignored Range — restart from byte 0.
    if (rangeStart > 0 && response.status === 200) {
      rangeStart = 0;
      received = 0;
      try {
        await fsp.unlink(input.partialPath);
      } catch {
        // ignore
      }
    }

    contentLength = Number(response.headers.get('content-length') || 0);
    const linkedSize = Number(response.headers.get('x-linked-size') || 0);
    const contentRange = response.headers.get('content-range') || '';
    const rangeTotalMatch = /\/(\d+)\s*$/.exec(contentRange);
    const rangeTotal = rangeTotalMatch ? Number(rangeTotalMatch[1]) : 0;
    // Prefer the largest credible size — HF often sends a short content-length
    // for the first hop while x-linked-size / catalog bytes are the real total.
    const sizeCandidates = [
      rangeTotal,
      rangeStart > 0 && contentLength > 0 ? rangeStart + contentLength : contentLength,
      linkedSize,
      input.expectedBytes ?? 0,
    ].filter(value => Number.isFinite(value) && value > 0);
    total = sizeCandidates.length > 0 ? Math.max(...sizeCandidates) : null;

    const started = getRuntime().jobs.get(input.jobId);
    if (started) {
      saveJob({
        ...started,
        status: 'downloading',
        error: undefined,
        bytesReceived: received,
        bytesTotal: total,
      });
    }

    const file = fs.createWriteStream(input.partialPath, {
      flags: rangeStart > 0 && response.status === 206 ? 'a' : 'w',
    });
    const reader = response.body.getReader();

    try {
      while (true) {
        if (jobWasCancelled(input.jobId)) {
          keepPartial = true;
          try {
            await reader.cancel('cancelled');
          } catch {
            // ignore
          }
          throw new Error('Cancelled.');
        }
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
              stallTimer = setTimeout(() => {
                reject(new Error('stall'));
              }, STALL_MS);
            }),
          ]);
        } catch (error) {
          if (error instanceof Error && error.message === 'stall') {
            try {
              await reader.cancel('stall');
            } catch {
              // ignore
            }
            keepPartial = true;
            throw new Error(`Download stalled — no data for ${Math.round(STALL_MS / 1000)}s.`);
          }
          throw error;
        } finally {
          if (stallTimer) {
            clearTimeout(stallTimer);
          }
        }

        const { done, value } = result;
        if (done) {
          break;
        }
        if (!value?.byteLength) {
          continue;
        }
        received += value.byteLength;
        // If the declared total was too small (common with HF redirects), drop it
        // so the UI keeps showing a growing byte count instead of a stuck fraction.
        if (total != null && received > total * 1.02) {
          total = null;
        }
        const now = Date.now();
        if (now - lastProgressWrite >= 200) {
          lastProgressWrite = now;
          const job = getRuntime().jobs.get(input.jobId);
          if (job) {
            const progress =
              total && total > 0
                ? Math.min(0.99, received / total)
                : Math.min(0.95, 0.05 + received / (2 * 1024 * 1024 * 1024));
            saveJob({
              ...job,
              status: 'downloading',
              bytesReceived: received,
              bytesTotal: total,
              progress,
              error: undefined,
            });
          }
        }
        const ok = file.write(Buffer.from(value));
        if (!ok) {
          await new Promise<void>(resolve => file.once('drain', () => resolve()));
          // Push a progress tick after backpressure so the UI does not freeze
          // while the disk catches up.
          lastProgressWrite = 0;
        }
      }
    } finally {
      file.end();
      await finished(file);
    }

    const verifying = getRuntime().jobs.get(input.jobId);
    if (!verifying) {
      return;
    }
    saveJob({
      ...verifying,
      status: 'verifying',
      progress: 0.99,
      bytesReceived: received,
      bytesTotal: total,
      error: undefined,
    });

    if (input.expectedBytes != null && contentLength <= 0 && received !== input.expectedBytes) {
      throw new Error(`Size mismatch: expected ${input.expectedBytes} bytes, got ${received}.`);
    }
    if (input.expectedSha256) {
      const digest = await sha256File(input.partialPath);
      if (digest.toLowerCase() !== input.expectedSha256.toLowerCase()) {
        throw new Error('SHA-256 mismatch after download.');
      }
    }

    await fsp.rename(input.partialPath, input.destPath);
    clearAbortController(input.jobId);
    const done = getRuntime().jobs.get(input.jobId);
    if (done) {
      saveJob({
        ...done,
        status: 'complete',
        progress: 1,
        bytesReceived: received,
        bytesTotal: total ?? received,
        destPath: input.destPath,
        error: undefined,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed.';
    const cancelled = /^cancelled\.?$/i.test(message.trim()) || jobWasCancelled(input.jobId);
    if (!keepPartial && !cancelled && !isRetryableDownloadError(message)) {
      try {
        await fsp.unlink(input.partialPath);
      } catch {
        // ignore cleanup errors
      }
    }
    clearAbortController(input.jobId);
    const failed = getRuntime().jobs.get(input.jobId);
    if (failed) {
      if (cancelled || failed.status === 'cancelled') {
        saveJob({
          ...failed,
          status: 'cancelled',
          error: 'Cancelled.',
          bytesReceived: received,
          bytesTotal: total,
        });
        return;
      }
      let nextMessage = message;
      const err = error as NodeJS.ErrnoException;
      if (
        err?.code === 'EACCES' ||
        err?.code === 'EPERM' ||
        /eacces|permission denied/i.test(nextMessage)
      ) {
        const root = getComfyUiRoot();
        nextMessage = root
          ? comfyModelsWriteErrorMessage(root)
          : 'Permission denied writing model files.';
      }

      const runAttempt = failed.runAttempt ?? 1;
      if (isRetryableDownloadError(nextMessage, err) && runAttempt < MAX_RUN_ATTEMPTS) {
        const waitMs = jobRetryDelayMs(runAttempt);
        const nextRunAttempt = runAttempt + 1;
        saveJob({
          ...failed,
          status: 'queued',
          bytesReceived: received,
          progress: total && total > 0 ? Math.min(0.99, received / total) : failed.progress,
          runAttempt: nextRunAttempt,
          error: `${nextMessage} Retrying in ${Math.ceil(waitMs / 1000)}s (run ${nextRunAttempt}/${MAX_RUN_ATTEMPTS})…`,
        });
        void sleep(waitMs).then(() => {
          const waiting = getRuntime().jobs.get(input.jobId);
          if (!waiting || waiting.status !== 'queued') {
            return;
          }
          scheduleComfyAssetDownloadJob(input.jobId, input);
        });
        return;
      }

      saveJob({
        ...failed,
        status: 'error',
        bytesReceived: received,
        bytesTotal: total,
        error: nextMessage,
      });
    }
  }
}
