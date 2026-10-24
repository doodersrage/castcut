import fs from 'node:fs';
import path from 'node:path';
import { resolvePromptDataDir } from '../prompt/data-paths';
import { comfyRootForModelsDir, type ComfyInstallInfo } from './install-info';

/**
 * What the app remembers about the ComfyUI installs it has talked to (`comfyui-install.json` in
 * the data folder): per ComfyUI URL the install answering now and the one before it — so a switch
 * is noticed and the old install's folders are known — and the models folder the player chose
 * for downloads in the Switching ComfyUI assistant. That choice wins over COMFYUI_ROOT, which
 * still named the old install after a switch (comfy-asset-paths.ts `getComfyUiRoot`).
 */

export type ComfyInstallRecord = {
  identity: string;
  seenAt: number;
  info: ComfyInstallInfo;
  inputDir?: string;
  outputDir?: string;
  modelsDir?: string;
};

type InstallEntry = {
  current?: ComfyInstallRecord;
  previous?: ComfyInstallRecord;
  /** The identity the player has finished setting up (no "new install" notice for it). */
  acknowledged?: string;
};

type InstallStore = {
  installs: Record<string, InstallEntry>;
  /** The ComfyUI folder model downloads go under (`<root>/models/…`), as the player chose it. */
  root?: { path: string; setAt: number };
};

const FILE = 'comfyui-install.json';

function storePath(): string {
  return path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), FILE);
}

let cache: { mtimeMs: number; store: InstallStore } | null = null;

function emptyStore(): InstallStore {
  return { installs: {} };
}

export function loadComfyInstallStore(): InstallStore {
  const file = storePath();
  try {
    const stat = fs.statSync(file);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.store;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<InstallStore>;
    const store: InstallStore = {
      installs: parsed.installs && typeof parsed.installs === 'object' ? parsed.installs : {},
      ...(parsed.root && typeof parsed.root.path === 'string' ? { root: parsed.root } : {}),
    };
    cache = { mtimeMs: stat.mtimeMs, store };
    return store;
  } catch {
    return emptyStore();
  }
}

function saveStore(store: InstallStore): void {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.part`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 1));
  fs.renameSync(temp, file);
  cache = null;
}

function urlKey(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * Note the install answering at `baseUrl`. A different identity than last time makes the old one
 * `previous` (the switch is what the assistant is for); the same one only refreshes it.
 */
export function noteComfyInstall(baseUrl: string, record: ComfyInstallRecord): InstallEntry {
  const store = loadComfyInstallStore();
  const key = urlKey(baseUrl);
  const known = store.installs[key];
  // The same install, seen within the hour: nothing to write.
  if (
    known?.current?.identity === record.identity &&
    record.seenAt - known.current.seenAt < 3_600_000
  ) {
    return known;
  }
  const entry: InstallEntry = { ...(known ?? {}) };
  if (entry.current && entry.current.identity !== record.identity) {
    entry.previous = entry.current;
  }
  const firstSight = !entry.current;
  entry.current = record;
  // The first install the app ever sees needs no "new install" notice.
  if (firstSight) entry.acknowledged = record.identity;
  saveStore({ ...store, installs: { ...store.installs, [key]: entry } });
  return entry;
}

export function acknowledgeComfyInstall(baseUrl: string, identity: string): void {
  const store = loadComfyInstallStore();
  const key = urlKey(baseUrl);
  const entry = store.installs[key];
  if (!entry) return;
  saveStore({
    ...store,
    installs: { ...store.installs, [key]: { ...entry, acknowledged: identity } },
  });
}

/** The models root the player chose (null: none — COMFYUI_ROOT, if set, is used). */
export function savedComfyRoot(): string | null {
  return loadComfyInstallStore().root?.path ?? null;
}

export function setSavedComfyRoot(root: string | null): void {
  const store = loadComfyInstallStore();
  const { root: _old, ...rest } = store;
  saveStore(root ? { ...rest, root: { path: root, setAt: Date.now() } } : rest);
}

function isLoopbackKey(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * The ComfyUI folder found from the install this app last talked to on this machine: the parent
 * of the models folder its start-up arguments / model-paths file name (null: none seen, it runs
 * elsewhere, or that folder is gone). Lets downloads work with COMFYUI_ROOT unset or stale.
 */
export function detectedComfyRoot(): string | null {
  let best: ComfyInstallRecord | undefined;
  for (const [url, entry] of Object.entries(loadComfyInstallStore().installs)) {
    const current = entry.current;
    if (!current?.modelsDir || !isLoopbackKey(url)) continue;
    if (!best || current.seenAt > best.seenAt) best = current;
  }
  const root = comfyRootForModelsDir(best?.modelsDir);
  return root && fs.existsSync(/* turbopackIgnore: true */ root) ? root : null;
}
