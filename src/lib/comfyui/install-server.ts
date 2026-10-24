import fs from 'node:fs';
import path from 'node:path';
import { resolveComfyUiRoot } from './comfy-asset-paths';
import {
  comfyDeployLabel,
  comfyInputDir,
  comfyInstallIdentity,
  comfyOutputDir,
  comfyRootForModelsDir,
  modelsDirFromModelPaths,
  parseComfyInstallInfo,
  type ComfyInstallInfo,
} from './install-info';
import {
  acknowledgeComfyInstall,
  noteComfyInstall,
  type ComfyInstallRecord,
} from './install-store-server';
import { comfyInputStoreRoot, uploadComfyInputCopy } from './input-store-server';
import {
  COMFY_NODE_PACKS,
  comfyNodePackState,
  managerInstalledNames,
  missingPythonFix,
} from './node-pack-catalog';
import { forgetKnownComfyInputs } from './comfy-input-upload-server';
import type { ComfyInstallJob, ComfyInstallReport, FolderAccess } from './install-report';

export type { ComfyInstallJob, ComfyInstallReport, FolderAccess };

/**
 * The Switching ComfyUI assistant's server half: which install answers at the URL (and which did
 * before), where it keeps inputs, outputs and models, whether model downloads go there, how many
 * pictures the app holds copies of, and which node packs load — plus the two jobs that bring an
 * install up to date: the app's kept pictures put into it, and (same machine) everything in the
 * previous install's input and output folders copied over, never overwriting.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function isLoopback(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

async function getJson(fetchImpl: FetchLike, url: string, timeoutMs = 8000): Promise<unknown> {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function folderAccess(dir: string | undefined): FolderAccess | undefined {
  if (!dir || !path.isAbsolute(dir)) return undefined;
  const check = (mode: number) => {
    try {
      fs.accessSync(/* turbopackIgnore: true */ dir, mode);
      return true;
    } catch {
      return false;
    }
  };
  const exists = check(fs.constants.F_OK);
  return {
    path: dir,
    exists,
    readable: exists && check(fs.constants.R_OK),
    writable: exists && check(fs.constants.W_OK),
  };
}

/** Files and bytes under a folder (capped walk). */
function folderSize(dir: string, cap = 400_000): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const stack = [dir];
  while (stack.length && files < cap) {
    const at = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(/* turbopackIgnore: true */ at, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        files += 1;
        try {
          bytes += fs.statSync(full).size;
        } catch {
          /* gone */
        }
      }
    }
  }
  return { files, bytes };
}

const sizeCache = new Map<string, { at: number; size: { files: number; bytes: number } }>();
function cachedFolderSize(dir: string): { files: number; bytes: number } {
  const hit = sizeCache.get(dir);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.size;
  const size = folderSize(dir);
  sizeCache.set(dir, { at: Date.now(), size });
  return size;
}

function modelsDirFor(info: ComfyInstallInfo, local: boolean): string | undefined {
  if (local) {
    for (const file of info.modelPathFiles) {
      try {
        const found = modelsDirFromModelPaths(
          fs.readFileSync(/* turbopackIgnore: true */ file, 'utf8')
        );
        if (found) return found;
      } catch {
        /* not readable from here */
      }
    }
  }
  const base =
    info.baseDir ??
    (info.mainPath && path.isAbsolute(info.mainPath) ? path.dirname(info.mainPath) : undefined);
  return base ? path.join(base, 'models') : undefined;
}

function withSize(access: FolderAccess | undefined) {
  if (!access) return undefined;
  return access.readable ? { ...access, ...cachedFolderSize(access.path) } : access;
}

/** The assistant's report for the ComfyUI at `baseUrl` (and note the install it found). */
export async function readComfyInstallReport(
  baseUrl: string,
  fetchImpl: FetchLike = fetch,
  /** Is it a new install? only — no node list, no folder sizes (the app-wide notice asks this). */
  brief = false
): Promise<ComfyInstallReport> {
  const url = baseUrl.replace(/\/+$/, '');
  const local = isLoopback(url);
  const envRoot = process.env.COMFYUI_ROOT?.trim() || null;
  let { root, source } = resolveComfyUiRoot();
  const kept = brief ? { files: 0, bytes: 0 } : cachedFolderSize(comfyInputStoreRoot());
  const stats = await getJson(fetchImpl, `${url}/system_stats`);
  const info = parseComfyInstallInfo(stats);
  if (!info) {
    return {
      reachable: false,
      url,
      local,
      isNew: false,
      downloads: {
        root,
        source,
        envRoot,
        matches: null,
      },
      kept,
      packs: [],
    };
  }
  const modelsDir = modelsDirFor(info, local);
  const record: ComfyInstallRecord = {
    identity: comfyInstallIdentity(info, modelsDir),
    seenAt: Date.now(),
    info,
    ...(comfyInputDir(info) ? { inputDir: comfyInputDir(info) } : {}),
    ...(comfyOutputDir(info) ? { outputDir: comfyOutputDir(info) } : {}),
    ...(modelsDir ? { modelsDir } : {}),
  };
  const entry = noteComfyInstall(url, record);
  // Noting this install can be what finds the downloads folder (COMFYUI_ROOT unset or gone).
  ({ root, source } = resolveComfyUiRoot());
  const suggestedRoot = comfyRootForModelsDir(modelsDir);
  const normalize = (p: string) => path.resolve(p).replace(/[\\/]+$/, '');
  const matches =
    root && modelsDir ? normalize(path.join(root, 'models')) === normalize(modelsDir) : null;

  const isNew = entry.acknowledged !== record.identity;
  if (brief) {
    return {
      reachable: true,
      url,
      local,
      label: comfyDeployLabel(info.deploy),
      identity: record.identity,
      isNew,
      downloads: {
        root,
        source,
        envRoot,
        ...(suggestedRoot ? { suggestedRoot } : {}),
        matches,
      },
      kept,
      packs: [],
    };
  }
  // Node packs: loaded, installed but not loading, or missing.
  const [objectInfo, installed] = await Promise.all([
    getJson(fetchImpl, `${url}/object_info`, 20_000),
    getJson(fetchImpl, `${url}/api/customnode/installed`).then(
      async payload => payload ?? getJson(fetchImpl, `${url}/customnode/installed`)
    ),
  ]);
  const nodeTypes = new Set(
    objectInfo && typeof objectInfo === 'object' ? Object.keys(objectInfo) : []
  );
  const installedNames = managerInstalledNames(installed);
  const packs = COMFY_NODE_PACKS.map(pack => {
    const state = comfyNodePackState(pack, nodeTypes, installedNames);
    const fix =
      state === 'not-loading' || state === 'unknown'
        ? missingPythonFix(pack.missingPython, { os: info.os, embeddedPython: info.embeddedPython })
        : null;
    return {
      id: pack.id,
      label: pack.label,
      usedFor: pack.usedFor,
      state,
      ...(fix ? { fix } : {}),
    };
  });

  const previous = entry.previous;
  return {
    reachable: true,
    url,
    local,
    label: comfyDeployLabel(info.deploy),
    info,
    identity: record.identity,
    folders: local
      ? {
          input: folderAccess(record.inputDir),
          output: folderAccess(record.outputDir),
          models: folderAccess(modelsDir),
        }
      : undefined,
    isNew,
    ...(previous
      ? {
          previous: {
            label: comfyDeployLabel(previous.info.deploy),
            ...(previous.info.version ? { version: previous.info.version } : {}),
            seenAt: previous.seenAt,
            ...(local
              ? {
                  input: withSize(folderAccess(previous.inputDir)),
                  output: withSize(folderAccess(previous.outputDir)),
                }
              : {}),
          },
        }
      : {}),
    downloads: {
      root,
      source,
      envRoot,
      ...(suggestedRoot ? { suggestedRoot } : {}),
      matches,
    },
    kept,
    packs,
  };
}

export function markComfyInstallSetUp(baseUrl: string, identity: string): void {
  acknowledgeComfyInstall(baseUrl.replace(/\/+$/, ''), identity);
}

// ── Jobs ──────────────────────────────────────────────────────────────────────────────────

const jobs = new Map<string, ComfyInstallJob>();

function newJob(kind: ComfyInstallJob['kind']): ComfyInstallJob {
  const job: ComfyInstallJob = {
    id: `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    status: 'running',
    done: 0,
    total: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
  };
  jobs.set(job.id, job);
  // Keep the last few.
  while (jobs.size > 10) jobs.delete(jobs.keys().next().value!);
  return job;
}

export function comfyInstallJob(id: string): ComfyInstallJob | null {
  return jobs.get(id) ?? null;
}

/** The kept copies as ComfyUI files: `<store>/<type>/<subfolder…>/<filename>`. */
function keptFiles(): Array<{ type: string; subfolder: string; filename: string; size: number }> {
  const root = comfyInputStoreRoot();
  const out: Array<{ type: string; subfolder: string; filename: string; size: number }> = [];
  for (const type of ['input', 'output']) {
    const stack: string[] = [];
    const top = path.join(root, type);
    stack.push(top);
    while (stack.length) {
      const at = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(/* turbopackIgnore: true */ at, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(at, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && !entry.name.endsWith('.part')) {
          const rel = path.relative(top, at).split(path.sep).filter(Boolean).join('/');
          let size = 0;
          try {
            size = fs.statSync(full).size;
          } catch {
            /* gone */
          }
          out.push({ type, subfolder: rel, filename: entry.name, size });
        }
      }
    }
  }
  return out;
}

/** Put every kept picture ComfyUI lacks back into it (HEAD first: present ones are left alone). */
export function startRestorePicturesJob(
  baseUrl: string,
  fetchImpl: FetchLike = fetch
): ComfyInstallJob {
  const job = newJob('restore-pictures');
  const url = baseUrl.replace(/\/+$/, '');
  void (async () => {
    try {
      const files = keptFiles();
      job.total = files.length;
      let next = 0;
      const worker = async () => {
        while (next < files.length) {
          const file = files[next++]!;
          const params = new URLSearchParams({
            filename: file.filename,
            subfolder: file.subfolder,
            type: file.type,
          });
          let present = false;
          try {
            const head = await fetchImpl(`${url}/view?${params}`, {
              method: 'HEAD',
              signal: AbortSignal.timeout(10_000),
            });
            present = head.ok;
          } catch {
            present = false;
          }
          if (present) job.skipped += 1;
          else if (await uploadComfyInputCopy(url, file, { fetchImpl })) {
            job.copied += 1;
            job.bytes += file.size;
          } else job.failed += 1;
          job.done += 1;
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      forgetKnownComfyInputs(url);
      job.status = 'completed';
    } catch (error) {
      job.status = 'error';
      job.error = error instanceof Error ? error.message : 'Could not put the pictures back.';
    }
  })();
  return job;
}

/**
 * Copy the previous install's input and output folders into this one's (same machine), never
 * overwriting a file this install already has. Renders collide by name when the new install
 * starts its numbering again (Castcut_00001_.png…): its own file is kept.
 */
export function startCopyFoldersJob(pairs: Array<{ from: string; to: string }>): ComfyInstallJob {
  const job = newJob('copy-folders');
  void (async () => {
    try {
      const work: Array<{ src: string; dst: string; size: number }> = [];
      for (const { from, to } of pairs) {
        const stack = [''];
        while (stack.length) {
          const rel = stack.pop()!;
          let entries: fs.Dirent[];
          try {
            entries = fs.readdirSync(/* turbopackIgnore: true */ path.join(from, rel), {
              withFileTypes: true,
            });
          } catch {
            continue;
          }
          for (const entry of entries) {
            const child = rel ? path.join(rel, entry.name) : entry.name;
            if (entry.isDirectory()) stack.push(child);
            else if (entry.isFile()) {
              let size = 0;
              try {
                size = fs.statSync(path.join(from, child)).size;
              } catch {
                continue;
              }
              work.push({ src: path.join(from, child), dst: path.join(to, child), size });
            }
          }
        }
      }
      job.total = work.length;
      let next = 0;
      const worker = async () => {
        while (next < work.length) {
          const item = work[next++]!;
          try {
            await fs.promises.mkdir(path.dirname(item.dst), { recursive: true });
            await fs.promises.copyFile(item.src, item.dst, fs.constants.COPYFILE_EXCL);
            job.copied += 1;
            job.bytes += item.size;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST') job.skipped += 1;
            else job.failed += 1;
          }
          job.done += 1;
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      job.status = 'completed';
    } catch (error) {
      job.status = 'error';
      job.error = error instanceof Error ? error.message : 'Could not copy the folders.';
    }
  })();
  return job;
}
