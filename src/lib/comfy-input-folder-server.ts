import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import {
  buildInputCleanupCommand,
  collectInputNameTokens,
  comfyInputDirFromArgv,
  findUnreferencedAppInputs,
  INPUT_CLEANUP_MIN_AGE_MS,
  isAppMadeInputName,
  namesAllowedToDelete,
  parseComfyInputListing,
  type ComfyInputFolderReport,
  type InputFileInfo,
} from './comfy-input-cleanup';
import {
  castcutInputDelete,
  castcutRoutes,
  type CastcutInputDeleteResult,
} from './castcut-routes-server';
import { forgetKnownComfyInputs } from './comfy-input-upload-server';
import { isServerStorageEnabled } from './server-storage';

/**
 * Settings → ComfyUI → Input folder: a report of the app-made files in ComfyUI's input folder
 * that nothing references, and a command to remove them. With the Castcut pack (1.3.0+) the
 * player can have them deleted instead, after confirming (deleteUnreferencedComfyInputs).
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_CLIENT_REFERENCES = 200_000;

function isLoopbackUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '::1' || /^127\./.test(host);
  } catch {
    return false;
  }
}

async function fetchJson(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]!);
      }
    })
  );
  return out;
}

async function statLocal(dir: string, name: string): Promise<InputFileInfo> {
  try {
    const stat = await fs.stat(/* turbopackIgnore: true */ path.join(dir, name));
    return { name, size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { name };
  }
}

async function statRemote(fetchImpl: FetchLike, baseUrl: string, name: string) {
  const params = new URLSearchParams({ filename: name, type: 'input', subfolder: '' });
  try {
    const response = await fetchImpl(`${baseUrl}/view?${params.toString()}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { name };
    const size = Number(response.headers.get('content-length'));
    const modified = Date.parse(response.headers.get('last-modified') ?? '');
    return {
      name,
      ...(Number.isFinite(size) ? { size } : {}),
      ...(Number.isFinite(modified) ? { mtimeMs: modified } : {}),
    };
  } catch {
    return { name };
  }
}

export async function buildComfyInputFolderReport(input: {
  baseUrl: string;
  browserReferences?: readonly string[];
  now?: number;
  fetchImpl?: FetchLike;
}): Promise<ComfyInputFolderReport> {
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now();

  let listing: unknown;
  try {
    listing = await fetchJson(fetchImpl, `${baseUrl}/internal/files/input`, 30000);
  } catch {
    listing = await fetchJson(fetchImpl, `${baseUrl}/api/internal/files/input`, 30000);
  }
  const names = parseComfyInputListing(listing);

  let inputDir: string | null = null;
  try {
    const stats = (await fetchJson(fetchImpl, `${baseUrl}/system_stats`, 8000)) as {
      system?: { argv?: unknown };
    };
    inputDir = comfyInputDirFromArgv(stats.system?.argv);
  } catch {
    /* the command then names a placeholder folder */
  }

  let local = false;
  let writable = false;
  if (inputDir && path.isAbsolute(inputDir) && isLoopbackUrl(baseUrl)) {
    try {
      // ComfyUI's input folder is outside this project: keep it out of Turbopack's file tracing.
      await fs.access(/* turbopackIgnore: true */ inputDir, fsConstants.R_OK);
      local = (await fs.stat(/* turbopackIgnore: true */ inputDir)).isDirectory();
    } catch {
      local = false;
    }
    if (local) {
      writable = await fs
        .access(inputDir, fsConstants.W_OK)
        .then(() => true)
        .catch(() => false);
    }
  }

  const appMade = names.filter(isAppMadeInputName);
  const files = await mapLimit(appMade, local ? 32 : 12, name =>
    local && inputDir ? statLocal(inputDir, name) : statRemote(fetchImpl, baseUrl, name)
  );

  const referenced = new Set<string>();
  for (const token of (input.browserReferences ?? []).slice(0, MAX_CLIENT_REFERENCES)) {
    if (typeof token === 'string' && isAppMadeInputName(token)) referenced.add(token.trim());
  }
  const keep = isAppMadeInputName;
  let serverStorage = false;
  if (isServerStorageEnabled()) {
    const { forEachStoredJsonText } = await import('./sqlite/stored-json-scan');
    forEachStoredJsonText(text => collectInputNameTokens(text, referenced, keep));
    serverStorage = true;
  }
  let comfyQueue = false;
  try {
    const queue = await fetchJson(fetchImpl, `${baseUrl}/queue`, 8000);
    collectInputNameTokens(JSON.stringify(queue), referenced, keep);
    comfyQueue = true;
  } catch {
    /* a queue we cannot read: refuse to call anything unreferenced */
  }

  const result = comfyQueue
    ? findUnreferencedAppInputs({ files, referenced, now })
    : findUnreferencedAppInputs({ files: [], referenced, now });
  // The player may delete these now: stop trusting remembered upload names for this ComfyUI.
  forgetKnownComfyInputs(baseUrl);

  return {
    inputDir,
    local,
    writable,
    totalFiles: names.length,
    appMadeCount: comfyQueue ? result.appMadeCount : appMade.length,
    appMadeBytes: comfyQueue
      ? result.appMadeBytes
      : files.reduce((sum, file) => sum + (file.size ?? 0), 0),
    referencedCount: result.referencedCount,
    removable: result.removable,
    removableBytes: result.removableBytes,
    tooNewCount: result.tooNew.length,
    minAgeDays: Math.round(INPUT_CLEANUP_MIN_AGE_MS / 86_400_000),
    byCategory: result.byCategory,
    command: buildInputCleanupCommand({
      inputDir,
      names: result.removable.map(file => file.name),
    }),
    sources: {
      browser: input.browserReferences?.length ?? 0,
      serverStorage,
      comfyQueue,
    },
    canDelete: Boolean((await castcutRoutes(baseUrl, fetchImpl))?.routes.includes('input-delete')),
  };
}

export type ComfyInputDeleteOutcome = CastcutInputDeleteResult & {
  /** Asked for but not in this scan's removable list, so not sent to ComfyUI. */
  refused: number;
};

/**
 * Delete files the player confirmed, through the Castcut pack (ComfyUI's folder belongs to the
 * ComfyUI user, and ComfyUI has no delete API). The folder is scanned again first and only names
 * that scan still offers as removable go; the pack then refuses anything younger than the scan's
 * minimum age or named by a queued job.
 */
export async function deleteUnreferencedComfyInputs(input: {
  baseUrl: string;
  browserReferences: readonly string[];
  names: readonly string[];
  now?: number;
  fetchImpl?: FetchLike;
}): Promise<ComfyInputDeleteOutcome> {
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl ?? fetch;
  const report = await buildComfyInputFolderReport({
    baseUrl,
    browserReferences: input.browserReferences,
    now: input.now,
    fetchImpl,
  });
  if (!report.canDelete) {
    throw new Error('The Castcut nodes on this ComfyUI cannot delete inputs (update to 1.3.0).');
  }
  const names = namesAllowedToDelete(report, input.names);
  const result = names.length
    ? await castcutInputDelete(
        baseUrl,
        { names, minAgeSeconds: Math.round(INPUT_CLEANUP_MIN_AGE_MS / 1000) },
        fetchImpl
      )
    : { deleted: [], freedBytes: 0, skipped: [] };
  forgetKnownComfyInputs(baseUrl);
  return { ...result, refused: new Set(input.names).size - names.length };
}
