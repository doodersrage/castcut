import fs from 'node:fs';
import path from 'node:path';
import { resolvePromptDataDir } from '../prompt/data-paths';

/**
 * The app's own copy of every picture it puts in ComfyUI's input folder — clothing and shoe
 * photos, Cast plates, face crops, pose guides. Saved data names these files only by their
 * ComfyUI filename, so a fresh ComfyUI install (or a cleaned input folder) used to lose them
 * (user report 2026-10-24). The copy lives under `$PROMPT_DATA_DIR/comfy-inputs/<type>/…` and is
 * put back into ComfyUI when a job, a preview or a presence check finds the file missing there.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type StoredComfyInputRef = {
  filename: string;
  subfolder?: string;
  /** ComfyUI folder: `input` (uploads) or `output` (a render a graph loads). */
  type?: string;
};

const STORE_DIR = 'comfy-inputs';
const STORE_TYPES = new Set(['input', 'output']);
const MAX_COPY_BYTES = 200 * 1024 * 1024;

export function comfyInputStoreRoot(): string {
  const override = process.env.CASTCUT_INPUT_STORE_DIR?.trim();
  if (override) return path.resolve(/* turbopackIgnore: true */ override);
  return path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), STORE_DIR);
}

function cleanSegment(segment: string): string | null {
  if (!segment || segment === '.' || segment === '..' || /[\\\0]/.test(segment)) return null;
  return segment;
}

/** Where the copy of `ref` lives, or null for a name that is not a plain file in the store. */
export function comfyInputCopyPath(
  ref: StoredComfyInputRef,
  root = comfyInputStoreRoot()
): string | null {
  const type = (ref.type?.trim() || 'input').toLowerCase();
  if (!STORE_TYPES.has(type)) return null;
  const filename = ref.filename?.trim() ?? '';
  if (!filename || filename.length > 255 || filename.includes('/') || !cleanSegment(filename)) {
    return null;
  }
  const folder = (ref.subfolder ?? '').trim().replace(/^\/+|\/+$/g, '');
  const parts = folder ? folder.split('/') : [];
  if (parts.some(part => !cleanSegment(part))) return null;
  const full = path.join(/* turbopackIgnore: true */ root, type, ...parts, filename);
  const rel = path.relative(root, full);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? full : null;
}

function refKey(ref: StoredComfyInputRef): string {
  return `${ref.type?.trim() || 'input'}/${(ref.subfolder ?? '').trim()}/${ref.filename.trim()}`;
}

export function hasComfyInputCopy(ref: StoredComfyInputRef, root?: string): boolean {
  const file = comfyInputCopyPath(ref, root);
  if (!file) return false;
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function readComfyInputCopy(ref: StoredComfyInputRef, root?: string): Uint8Array | null {
  const file = comfyInputCopyPath(ref, root);
  if (!file) return null;
  try {
    return new Uint8Array(fs.readFileSync(file));
  } catch {
    return null;
  }
}

/**
 * Keep (or refresh) the copy of `ref`. Same-size copies are left alone; a fixed-name upload that
 * changed is replaced. Never throws — a full disk must not fail the upload it follows.
 */
export function keepComfyInputCopy(
  ref: StoredComfyInputRef,
  bytes: Uint8Array,
  root?: string
): boolean {
  const file = comfyInputCopyPath(ref, root);
  if (!file || bytes.byteLength === 0 || bytes.byteLength > MAX_COPY_BYTES) return false;
  try {
    try {
      if (fs.statSync(file).size === bytes.byteLength) return true;
    } catch {
      /* not kept yet */
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now().toString(36)}.part`;
    fs.writeFileSync(temp, bytes);
    fs.renameSync(temp, file);
    return true;
  } catch {
    return false;
  }
}

/** Drop the copies of files that were deleted from ComfyUI because nothing names them. */
export function removeComfyInputCopies(
  refs: readonly StoredComfyInputRef[],
  root?: string
): number {
  let removed = 0;
  for (const ref of refs) {
    const file = comfyInputCopyPath(ref, root);
    if (!file) continue;
    try {
      fs.unlinkSync(file);
      removed += 1;
    } catch {
      /* already gone */
    }
  }
  return removed;
}

async function mapLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/** Put one kept copy back into ComfyUI under its exact name and folder. */
export async function uploadComfyInputCopy(
  baseUrl: string,
  ref: StoredComfyInputRef,
  options: { fetchImpl?: FetchLike; root?: string } = {}
): Promise<boolean> {
  const bytes = readComfyInputCopy(ref, options.root);
  if (!bytes) return false;
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  const form = new FormData();
  form.set('image', new Blob([body]), ref.filename.trim());
  form.set('type', ref.type?.trim() || 'input');
  form.set('subfolder', (ref.subfolder ?? '').trim());
  form.set('overwrite', 'true');
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/upload/image`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Put back the files ComfyUI said it lacks, from the kept copies. Answers the ones that are
 * still missing (no copy, or the upload failed).
 */
export async function restoreComfyInputsFromStore<T extends StoredComfyInputRef>(
  baseUrl: string,
  missing: readonly T[],
  options: { fetchImpl?: FetchLike; root?: string } = {}
): Promise<{ restored: T[]; stillMissing: T[] }> {
  const restored: T[] = [];
  const stillMissing: T[] = [];
  await mapLimit(missing, 4, async ref => {
    if (await uploadComfyInputCopy(baseUrl, ref, options)) restored.push(ref);
    else stillMissing.push(ref);
  });
  return { restored, stillMissing };
}

/**
 * Copy the files ComfyUI has into the store when the store does not have them yet — the
 * pictures that were uploaded before the store existed. Answers how many were kept.
 */
export async function captureComfyInputs(
  baseUrl: string,
  refs: readonly StoredComfyInputRef[],
  options: { fetchImpl?: FetchLike; root?: string; concurrency?: number } = {}
): Promise<number> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = baseUrl.replace(/\/+$/, '');
  const seen = new Set<string>();
  const todo = refs.filter(ref => {
    if (!comfyInputCopyPath(ref, options.root)) return false;
    const key = refKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return !hasComfyInputCopy(ref, options.root);
  });
  let kept = 0;
  await mapLimit(todo, options.concurrency ?? 4, async ref => {
    const params = new URLSearchParams({
      filename: ref.filename.trim(),
      subfolder: (ref.subfolder ?? '').trim(),
      type: ref.type?.trim() || 'input',
    });
    try {
      const response = await fetchImpl(`${base}/view?${params.toString()}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) return;
      if (keepComfyInputCopy(ref, new Uint8Array(await response.arrayBuffer()), options.root)) {
        kept += 1;
      }
    } catch {
      /* ComfyUI down or slow: the next pass tries again */
    }
  });
  return kept;
}
