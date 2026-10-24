import { collectComfyFileRefs, type ComfyFileRef } from '../storage/media-backup-refs';
import { isServerStorageEnabled } from '../storage/server-storage';
import { captureComfyInputs } from './input-store-server';

/**
 * Fill the app's picture store (input-store-server) from ComfyUI with every file the saved data
 * names — Cast plates and the renders a Cast look uses as its plate, clothing and shoe photos,
 * face crops — so pictures from before the store existed survive a ComfyUI switch too. Run once
 * after the server starts; files already kept cost a stat each. Gallery rows and prompt history
 * are left out: the Gallery keeps its own copies of renders.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function savedComfyInputRefs(): Promise<ComfyFileRef[]> {
  if (!isServerStorageEnabled()) return [];
  const { getStudioDb } = await import('../sqlite/studio-db');
  const found = new Map<string, ComfyFileRef>();
  const rows = getStudioDb()
    .prepare("SELECT json FROM kv WHERE key != 'prompt-history'")
    .iterate() as Iterable<{ json?: unknown }>;
  for (const row of rows) {
    if (typeof row.json !== 'string' || !row.json.includes('.')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.json);
    } catch {
      continue;
    }
    for (const ref of collectComfyFileRefs(parsed)) {
      if (ref.type !== 'temp') found.set(`${ref.type}/${ref.subfolder}/${ref.filename}`, ref);
    }
  }
  // A Cast look names its plate render both by view link (type=output) and by a bare
  // `…Filename`, which reads as an input: keep the render, not a phantom upload.
  return [...found.values()].filter(
    ref => ref.type !== 'input' || !found.has(`output/${ref.subfolder}/${ref.filename}`)
  );
}

export async function backfillComfyInputStore(input: {
  baseUrl: string;
  fetchImpl?: FetchLike;
}): Promise<{ named: number; kept: number }> {
  const refs = await savedComfyInputRefs();
  const kept = await captureComfyInputs(input.baseUrl, refs, {
    fetchImpl: input.fetchImpl,
    concurrency: 2,
  });
  return { named: refs.length, kept };
}
