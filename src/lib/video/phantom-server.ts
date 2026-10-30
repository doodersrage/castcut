/**
 * Generate a shot with the Cast on Phantom (phantom.ts): the Cast's pictures uploaded to
 * ComfyUI, the graph queued, and its result read back from ComfyUI's own history — so a page
 * reload, or a restart of this server, does not lose the shot while it renders.
 */
import { randomInt } from 'node:crypto';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import {
  comfyBaseUrl,
  comfyRunErrorMessage,
  resolveComfyNode,
  type ComfyHistoryEntry,
  type ComfyImageRef,
} from '../comfyui/comfy-utility-graph-server';
import {
  buildPhantomGraph,
  PHANTOM_MAX_REFERENCES,
  PHANTOM_REQUIRED_NODE,
  PHANTOM_SAVE_NODE,
  phantomPrompt,
  phantomReadiness,
  phantomSize,
  type PhantomShape,
} from './phantom';

async function modelNames(baseUrl: string, folder: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/models/${folder}`, {
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  const names = response?.ok ? ((await response.json().catch(() => [])) as unknown) : [];
  return Array.isArray(names)
    ? names.filter((name): name is string => typeof name === 'string')
    : [];
}

/** Whether this ComfyUI can generate a shot with the Cast, and fast. */
export async function phantomReadinessIn(
  comfyUrl?: string
): Promise<{ available: boolean; fast: boolean }> {
  const baseUrl = comfyBaseUrl(comfyUrl);
  const [node, unets, legacy, loras] = await Promise.all([
    resolveComfyNode(baseUrl, [PHANTOM_REQUIRED_NODE]),
    modelNames(baseUrl, 'diffusion_models'),
    modelNames(baseUrl, 'unet'),
    modelNames(baseUrl, 'loras'),
  ]);
  return phantomReadiness({
    nodes: node ? [node.node] : [],
    unets: [...unets, ...legacy],
    loras,
  });
}

/** Queue the shot; returns ComfyUI's prompt id. */
export async function queuePhantomShot(input: {
  words: string;
  /** The Cast's pictures (face lock, look plate, outfit), most telling first. */
  references: string[];
  shape: PhantomShape;
  cast?: { name?: string; look?: string };
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
}): Promise<string> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const ready = await phantomReadinessIn(input.comfyUrl);
  if (!ready.available) {
    throw new Error(
      'This ComfyUI does not have Phantom — install it under Models (Cut: a shot with the Cast).'
    );
  }
  const { fetchFilmShotBytes } = await import('./shot-fetch');
  const uploaded: string[] = [];
  for (const url of input.references.slice(0, PHANTOM_MAX_REFERENCES)) {
    try {
      const fetched = await fetchFilmShotBytes({
        url,
        requestOrigin: input.requestOrigin,
        userId: input.userId,
      });
      const file = await uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(fetched.buffer),
        filename: 'castcut-phantom-ref.png',
        mimeType: fetched.contentType || 'image/png',
      });
      uploaded.push(file.name);
    } catch {
      // A picture that can't be read is left out; the others still carry her.
    }
  }
  if (!uploaded.length) throw new Error('None of the Cast’s pictures could be read.');
  const graph = buildPhantomGraph({
    prompt: phantomPrompt(input.words, input.cast),
    references: uploaded,
    ...phantomSize(input.shape),
    seed: randomInt(1, 2 ** 31),
    prefix: 'Castcut-phantom',
    fast: ready.fast,
  });
  const response = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: 'castcut-cut-phantom' }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    prompt_id?: string;
    error?: { message?: string };
  };
  if (!response.ok || !body.prompt_id) {
    throw new Error(`ComfyUI did not take the shot: ${body.error?.message ?? response.status}`);
  }
  return body.prompt_id;
}

export type PhantomShotStatus =
  { status: 'rendering' } | { status: 'ready'; url: string } | { status: 'failed'; error: string };

/** Where a queued shot stands, read from ComfyUI's history and queue. */
export async function phantomShotStatus(
  promptId: string,
  comfyUrl?: string
): Promise<PhantomShotStatus> {
  const baseUrl = comfyBaseUrl(comfyUrl);
  const history = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const entry = history.ok
    ? ((await history.json().catch(() => ({}))) as Record<string, ComfyHistoryEntry>)[promptId]
    : undefined;
  if (entry) {
    const file = (entry.outputs?.[PHANTOM_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined)
      ?.images?.[0];
    if (file?.filename) {
      return {
        status: 'ready',
        url: `/api/comfyui/view?${new URLSearchParams({
          filename: file.filename,
          subfolder: file.subfolder ?? '',
          type: file.type || 'output',
        }).toString()}`,
      };
    }
    if (entry.status?.completed || entry.status?.status_str === 'error') {
      return { status: 'failed', error: comfyRunErrorMessage(entry) || 'Phantom made no clip.' };
    }
    return { status: 'rendering' };
  }
  // Not in the history: still queued or running — or gone (ComfyUI restarted).
  const queue = await fetch(`${baseUrl}/queue`, { signal: AbortSignal.timeout(10_000) });
  const lists = queue.ok
    ? ((await queue.json().catch(() => ({}))) as {
        queue_running?: unknown[][];
        queue_pending?: unknown[][];
      })
    : {};
  const waiting = [...(lists.queue_running ?? []), ...(lists.queue_pending ?? [])].some(
    item => Array.isArray(item) && item[1] === promptId
  );
  return waiting
    ? { status: 'rendering' }
    : { status: 'failed', error: 'ComfyUI lost the shot (it restarted?) — generate it again.' };
}
