import {
  captureComfyInputs,
  comfyInputCopyPath,
  hasComfyInputCopy,
  type StoredComfyInputRef,
} from './input-store-server';

/**
 * The browser's half of the picture store's backfill (the server's is input-store-backfill-
 * server.ts, over the data it holds — which may be days behind the browser's): the files a
 * browser's data names, checked against the store, the missing ones copied from ComfyUI one
 * pass at a time in the background. A file ComfyUI no longer has is skipped (nothing to copy).
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** At most this many names in one request (the browser sends more in several). */
export const KEEP_MAX_FILES = 5000;

function cleanRef(raw: unknown): StoredComfyInputRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const filename = typeof record.filename === 'string' ? record.filename.trim() : '';
  const subfolder = typeof record.subfolder === 'string' ? record.subfolder.trim() : '';
  const type = record.type === 'output' ? 'output' : record.type === 'input' ? 'input' : null;
  if (!filename || !type) return null;
  const ref = { filename, subfolder, type };
  return comfyInputCopyPath(ref) ? ref : null;
}

const queued = new Map<string, StoredComfyInputRef>();
let running: Promise<void> | null = null;

function refKey(ref: StoredComfyInputRef): string {
  return `${ref.type}/${ref.subfolder ?? ''}/${ref.filename}`;
}

async function drain(baseUrl: string, fetchImpl: FetchLike) {
  while (queued.size) {
    const batch = [...queued.values()].slice(0, 50);
    for (const ref of batch) queued.delete(refKey(ref));
    await captureComfyInputs(baseUrl, batch, { fetchImpl, concurrency: 2 });
  }
}

export function keepComfyFilesInBackground(
  baseUrl: string,
  files: readonly unknown[],
  fetchImpl: FetchLike = fetch
): { named: number; kept: number; queued: number } {
  const refs = files
    .slice(0, KEEP_MAX_FILES)
    .map(cleanRef)
    .filter((ref): ref is StoredComfyInputRef => ref !== null);
  let kept = 0;
  for (const ref of refs) {
    if (hasComfyInputCopy(ref)) kept += 1;
    else queued.set(refKey(ref), ref);
  }
  // (Counted before the copying starts: its first batch leaves the queue at once.)
  const waiting = queued.size;
  if (queued.size && !running) {
    running = drain(baseUrl, fetchImpl)
      .catch(() => {
        /* ComfyUI down: the next request queues them again */
      })
      .finally(() => {
        running = null;
      });
  }
  return { named: refs.length, kept, queued: waiting };
}

/** Wait for the background copies (tests). */
export async function keepComfyFilesSettled(): Promise<void> {
  while (running) await running;
}
