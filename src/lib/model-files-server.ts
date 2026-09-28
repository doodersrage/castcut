/**
 * Server-only: what's in COMFYUI_ROOT/models, how big it is, when each file was last used, and
 * guarded deletes.
 *
 * "Last used" comes from the graphs ComfyUI itself ran: its /history (since the last restart)
 * plus the `prompt` chunk every output PNG carries (newest outputs first, cached per file).
 */

import fs from 'node:fs';
import path from 'node:path';
import { getComfyUiRoot } from '@/lib/comfy-asset-paths';
import { parseTextChunks } from '@/lib/png-metadata';
import {
  collectGraphModelNames,
  isModelFileName,
  modelFileKey,
  MODEL_FILE_RECENT_USE_DAYS,
  type ModelFileRow,
  type ModelFilesSummary,
} from '@/lib/model-files';

/** Files under this size are configs / tokenizers, not weights. */
const MIN_WEIGHT_BYTES = 1024 * 1024;
const MAX_WALK_DEPTH = 5;
/**
 * Output PNGs read for usage: every one from the delete guard's window (plus a week), and at
 * least the newest few thousand when output is sparse.
 */
const MIN_OUTPUT_SCAN = 4000;
const SCAN_WINDOW_MS = (MODEL_FILE_RECENT_USE_DAYS + 7) * 24 * 60 * 60 * 1000;
/** ComfyUI writes the `prompt` chunk first; a big graph gets a second, larger read. */
const PNG_HEAD_BYTES = 64 * 1024;
const PNG_MAX_HEAD_BYTES = 2 * 1024 * 1024;

type UsageHit = { lastUsedAt: number; renders: number };

function modelsRoot(): string | null {
  const root = getComfyUiRoot();
  if (!root) return null;
  const models = path.join(/* turbopackIgnore: true */ root, 'models');
  return fs.existsSync(/* turbopackIgnore: true */ models) ? models : null;
}

function walk(dir: string, depth: number, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(/* turbopackIgnore: true */ dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < MAX_WALK_DEPTH) walk(full, depth + 1, out);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      out.push(full);
    }
  }
}

/** Every weight file (and symlink) under models/, keyed the way ComfyUI names them. */
export function listModelFilesOnDisk(): { root: string | null; files: ModelFileRow[] } {
  const root = modelsRoot();
  if (!root) return { root: null, files: [] };
  const paths: string[] = [];
  walk(root, 0, paths);
  const rows: ModelFileRow[] = [];
  for (const full of paths) {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(/* turbopackIgnore: true */ full);
    } catch {
      continue;
    }
    const rel = path.relative(root, full).split(path.sep).join('/');
    const [folder, ...rest] = rel.split('/');
    if (!folder || rest.length === 0) continue;
    const isLink = stat.isSymbolicLink();
    const partial = /\.(partial|part|tmp|download)$/i.test(full);
    if (!isLink && !partial && (stat.size < MIN_WEIGHT_BYTES || !isModelFileName(full))) continue;
    let linkTarget: string | undefined;
    if (isLink) {
      try {
        const target = fs.realpathSync(/* turbopackIgnore: true */ full);
        linkTarget = target.startsWith(root + path.sep)
          ? path.relative(root, target).split(path.sep).join('/')
          : target;
      } catch {
        linkTarget = '(missing target)';
      }
    }
    rows.push({
      path: rel,
      folder,
      name: rest.join('/'),
      bytes: isLink ? 0 : stat.size,
      modifiedAt: stat.mtimeMs,
      ...(isLink ? { linkTarget } : {}),
      ...(partial ? { partial: true } : {}),
    });
  }
  // Mark files that a symlink points at.
  const linkTargets = new Map<string, number>();
  for (const row of rows) {
    if (row.linkTarget) linkTargets.set(row.linkTarget, (linkTargets.get(row.linkTarget) ?? 0) + 1);
  }
  for (const row of rows) {
    const links = linkTargets.get(row.path);
    if (links) row.linkedBy = links;
  }
  return { root, files: rows.sort((a, b) => b.bytes - a.bytes) };
}

// ── Usage index ────────────────────────────────────────────────────────────────────────────

const pngCache = new Map<string, { mtimeMs: number; names: string[] }>();

function readPngHead(fd: number, size: number): Record<string, string> {
  const buffer = Buffer.alloc(size);
  const read = fs.readSync(fd, buffer, 0, size, 0);
  const bytes = buffer.subarray(0, read);
  return parseTextChunks(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  );
}

function readPngGraphNames(file: string): string[] {
  let fd: number | null = null;
  try {
    fd = fs.openSync(/* turbopackIgnore: true */ file, 'r');
    let chunks = readPngHead(fd, PNG_HEAD_BYTES);
    if (!chunks.prompt) chunks = readPngHead(fd, PNG_MAX_HEAD_BYTES);
    if (!chunks.prompt) return [];
    return collectGraphModelNames(JSON.parse(chunks.prompt));
  } catch {
    return [];
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

function outputDirCandidates(comfyFolderPaths: Record<string, string[]> | null): string[] {
  const dirs = new Set<string>();
  const env = process.env.COMFYUI_OUTPUT_DIR?.trim();
  if (env) dirs.add(path.resolve(env));
  const root = getComfyUiRoot();
  if (root) dirs.add(path.join(/* turbopackIgnore: true */ root, 'output'));
  // ComfyUI lists `<output>/checkpoints` etc. as save folders — the output dir is its parent.
  for (const list of Object.values(comfyFolderPaths ?? {})) {
    for (const entry of list ?? []) {
      const match = /^(.*\/output)\/[^/]+$/.exec(entry);
      if (match?.[1]) dirs.add(match[1]);
    }
  }
  return [...dirs].filter(dir => fs.existsSync(/* turbopackIgnore: true */ dir));
}

function scanOutputs(
  dirs: string[],
  usage: Map<string, UsageHit>
): { count: number; oldestAt: number | null } {
  const pngs: { file: string; mtimeMs: number }[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = fs.readdirSync(/* turbopackIgnore: true */ dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.png')) continue;
      const file = path.join(/* turbopackIgnore: true */ dir, name);
      try {
        pngs.push({ file, mtimeMs: fs.statSync(/* turbopackIgnore: true */ file).mtimeMs });
      } catch {
        // vanished
      }
    }
  }
  pngs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const since = Date.now() - SCAN_WINDOW_MS;
  const inWindow = pngs.filter(png => png.mtimeMs >= since).length;
  const scanned = pngs.slice(0, Math.max(inWindow, MIN_OUTPUT_SCAN));
  for (const { file, mtimeMs } of scanned) {
    let cached = pngCache.get(file);
    if (!cached || cached.mtimeMs !== mtimeMs) {
      cached = { mtimeMs, names: readPngGraphNames(file) };
      pngCache.set(file, cached);
    }
    for (const name of cached.names) note(usage, name, mtimeMs);
  }
  return {
    count: scanned.length,
    oldestAt: scanned.length > 0 ? scanned[scanned.length - 1]!.mtimeMs : null,
  };
}

function note(usage: Map<string, UsageHit>, name: string, at: number): void {
  const key = modelFileKey(name);
  const hit = usage.get(key);
  if (hit) {
    hit.renders += 1;
    if (at > hit.lastUsedAt) hit.lastUsedAt = at;
  } else {
    usage.set(key, { lastUsedAt: at, renders: 1 });
  }
}

async function comfyJson<T>(baseUrl: string, pathname: string): Promise<T | null> {
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

type HistoryEntry = {
  prompt?: [unknown, unknown, unknown];
  status?: { messages?: [string, { timestamp?: number }][] };
};

/** file key → last use + render count, from ComfyUI history and output PNG graphs. */
export async function buildModelUsageIndex(comfyBaseUrl: string): Promise<{
  usage: Map<string, UsageHit>;
  scannedOutputs: number;
  scannedSinceAt: number | null;
  historyItems: number;
}> {
  const usage = new Map<string, UsageHit>();
  const [history, folderPaths] = await Promise.all([
    comfyJson<Record<string, HistoryEntry>>(comfyBaseUrl, '/history'),
    comfyJson<Record<string, string[]>>(comfyBaseUrl, '/internal/folder_paths'),
  ]);
  let historyItems = 0;
  for (const entry of Object.values(history ?? {})) {
    const graph = entry.prompt?.[2];
    if (!graph) continue;
    historyItems += 1;
    const started = entry.status?.messages?.find(([type]) => type === 'execution_start')?.[1]
      ?.timestamp;
    const at = typeof started === 'number' ? started : Date.now();
    for (const name of collectGraphModelNames(graph)) note(usage, name, at);
  }
  const scan = scanOutputs(outputDirCandidates(folderPaths), usage);
  return { usage, scannedOutputs: scan.count, scannedSinceAt: scan.oldestAt, historyItems };
}

export async function listModelFilesWithUsage(comfyBaseUrl: string): Promise<ModelFilesSummary> {
  const { root, files } = listModelFilesOnDisk();
  if (!root) {
    return {
      root: null,
      files: [],
      freeBytes: null,
      totalBytes: null,
      scannedOutputs: 0,
      scannedSinceAt: null,
    };
  }
  const { usage, scannedOutputs, scannedSinceAt } = await buildModelUsageIndex(comfyBaseUrl);
  for (const file of files) {
    const hit = usage.get(modelFileKey(file.name));
    if (hit) {
      file.lastUsedAt = hit.lastUsedAt;
      file.renders = hit.renders;
    }
  }
  let freeBytes: number | null = null;
  let totalBytes: number | null = null;
  try {
    const stats = fs.statfsSync(/* turbopackIgnore: true */ root);
    freeBytes = stats.bavail * stats.bsize;
    totalBytes = stats.blocks * stats.bsize;
  } catch {
    // unsupported filesystem
  }
  return { root, files, freeBytes, totalBytes, scannedOutputs, scannedSinceAt };
}

// ── Delete ─────────────────────────────────────────────────────────────────────────────────

export class ModelFileDeleteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ModelFileDeleteError';
  }
}

/**
 * Delete one file under models/. Refuses paths outside it, directories, files a symlink still
 * points at, and anything a render used in the last {@link MODEL_FILE_RECENT_USE_DAYS} days.
 * A symlink is removed as a link; its target stays.
 */
export async function deleteModelFile(input: {
  path: string;
  confirmName: string;
  comfyBaseUrl: string;
  isDownloading?: (relPath: string) => boolean;
}): Promise<{ deleted: string; freedBytes: number }> {
  const root = modelsRoot();
  if (!root) throw new ModelFileDeleteError('COMFYUI_ROOT/models is not available.', 400);
  const rel = input.path.trim().replace(/\\/g, '/');
  if (!rel || rel.startsWith('/') || rel.split('/').some(part => part === '..' || part === '')) {
    throw new ModelFileDeleteError('Invalid path.', 400);
  }
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) {
    throw new ModelFileDeleteError('Path is outside the models folder.', 400);
  }
  const name = path.basename(full);
  if (input.confirmName !== name) {
    throw new ModelFileDeleteError('Type the file name to confirm.', 400);
  }
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(/* turbopackIgnore: true */ full);
  } catch {
    throw new ModelFileDeleteError('File not found.', 404);
  }
  if (stat.isDirectory()) throw new ModelFileDeleteError('Folders are not deleted here.', 400);
  const isLink = stat.isSymbolicLink();
  if (!isLink) {
    const real = fs.realpathSync(/* turbopackIgnore: true */ full);
    if (!real.startsWith(root + path.sep)) {
      throw new ModelFileDeleteError('Path is outside the models folder.', 400);
    }
  }
  if (input.isDownloading?.(rel)) {
    throw new ModelFileDeleteError(
      'This file is still downloading — cancel the download first.',
      409
    );
  }
  const { files } = listModelFilesOnDisk();
  const row = files.find(file => file.path === rel);
  if (row?.linkedBy) {
    throw new ModelFileDeleteError(
      `${row.linkedBy} link${row.linkedBy === 1 ? ' points' : 's point'} at this file — delete ${row.linkedBy === 1 ? 'it' : 'them'} first.`,
      409
    );
  }
  if (!isLink && !row?.partial) {
    const { usage } = await buildModelUsageIndex(input.comfyBaseUrl);
    const hit = row ? usage.get(modelFileKey(row.name)) : undefined;
    const cutoff = Date.now() - MODEL_FILE_RECENT_USE_DAYS * 24 * 60 * 60 * 1000;
    if (hit && hit.lastUsedAt >= cutoff) {
      throw new ModelFileDeleteError(
        `Used by a render on ${new Date(hit.lastUsedAt).toLocaleDateString()} — files used in the last ${MODEL_FILE_RECENT_USE_DAYS} days are kept.`,
        409
      );
    }
  }
  fs.unlinkSync(/* turbopackIgnore: true */ full);
  return { deleted: rel, freedBytes: isLink ? 0 : stat.size };
}
