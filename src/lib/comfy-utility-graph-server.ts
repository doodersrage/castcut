/**
 * Server-only helpers for small "utility" ComfyUI graphs — a few nodes run to measure a
 * finished still (pose detection, face similarity), not to render one.
 *
 * Nodes are discovered through `/object_info` (so a missing node pack is reported, not
 * crashed on), widgets are filled from their declared defaults, the graph jumps the queue, and
 * its history entry is deleted afterwards so checks never show up as gallery items.
 */

import { uploadComfyInputContent } from '@/lib/comfy-input-upload-server';
import {
  castcutPngPrompt,
  castcutRoutes,
  castcutStageAsInput,
  recordCastcutFallback,
} from '@/lib/castcut-routes-server';
import { checkQueueNumber } from '@/lib/comfy-model-batch';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import { deleteComfyUiHistoryItems } from '@/lib/comfyui-status';
import { parseTextChunks } from '@/lib/png-metadata';

type NodeInputSpec = [unknown, Record<string, unknown>?];

export type ComfyNodeInfo = {
  input?: {
    required?: Record<string, NodeInputSpec>;
    optional?: Record<string, NodeInputSpec>;
  };
  output?: string[];
};

export type ComfyImageRef = { filename: string; subfolder: string; type: string };

export type ComfyHistoryEntry = {
  outputs?: Record<string, Record<string, unknown[] | undefined>>;
  status?: {
    status_str?: string;
    completed?: boolean;
    /** `[event, data]` pairs; an `execution_error` carries the node's exception message. */
    messages?: Array<[string, { exception_message?: unknown } | undefined]>;
  };
};

/** The exception message of a failed run, if ComfyUI recorded one. */
export function comfyRunErrorMessage(entry: ComfyHistoryEntry): string {
  const error = entry.status?.messages?.find(message => message?.[0] === 'execution_error');
  const text = error?.[1]?.exception_message;
  return typeof text === 'string' ? text.trim().slice(0, 200) : '';
}

const nodeCache = new Map<string, { node: string; info: ComfyNodeInfo; at: number } | null>();
const NODE_CACHE_MS = 5 * 60 * 1000;

export function comfyBaseUrl(comfyUrl?: string): string {
  return getComfyUiBaseUrl(stripEmptyComfyUiRuntime({ apiUrl: comfyUrl })).replace(/\/+$/, '');
}

/**
 * First installed node among `candidates` (cached per host), or null. `fresh` skips the cache
 * (the readiness check, right after a pack install) and refreshes it for the real checks.
 */
export async function resolveComfyNode(
  baseUrl: string,
  candidates: readonly string[],
  options?: { fresh?: boolean }
): Promise<{ node: string; info: ComfyNodeInfo } | null> {
  const key = `${baseUrl}::${candidates.join('|')}`;
  const cached = nodeCache.get(key);
  if (
    !options?.fresh &&
    cached !== undefined &&
    (cached === null || Date.now() - cached.at < NODE_CACHE_MS)
  ) {
    return cached;
  }
  for (const node of candidates) {
    try {
      const response = await fetch(`${baseUrl}/object_info/${node}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as Record<string, ComfyNodeInfo>;
      const info = payload[node];
      if (info?.input?.required) {
        const found = { node, info, at: Date.now() };
        nodeCache.set(key, found);
        return found;
      }
    } catch {
      // try the next candidate
    }
  }
  nodeCache.set(key, null);
  return null;
}

/** A combo widget's options: `[[…options]]` (older ComfyUI) or `["COMBO", { options }]`. */
function comboOptions(spec: NodeInputSpec | undefined): unknown[] | null {
  const [type, config] = spec ?? [];
  if (Array.isArray(type)) return type;
  const options = (config as { options?: unknown } | undefined)?.options;
  return type === 'COMBO' && Array.isArray(options) ? options : null;
}

/**
 * Fill every required input: links for the named sockets, declared defaults (or the first
 * option) for widgets, then any overrides whose widget actually exists on this node version —
 * required or optional. Optional widgets left alone are not sent (the node's own defaults
 * apply); an override on one is: DWPose's detect_body / detect_hand / detect_face are optional,
 * and dropping them ran the detector on its Python defaults (hands and face on).
 */
export function fillComfyNodeInputs(
  info: ComfyNodeInfo,
  links: Record<string, [string, number]>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(info.input?.required ?? {})) {
    const [type, config] = spec ?? [];
    if (links[name]) {
      inputs[name] = links[name];
    } else if (config && 'default' in config) {
      inputs[name] = config.default;
    } else if (Array.isArray(type) && type.length > 0) {
      inputs[name] = type[0];
    }
  }
  for (const [name, value] of Object.entries(overrides)) {
    const spec = info.input?.required?.[name] ?? info.input?.optional?.[name];
    if (!spec) continue;
    const options = comboOptions(spec);
    // Only pick an option the node actually offers.
    if (!options || options.includes(value)) {
      inputs[name] = value;
    }
  }
  return inputs;
}

/** Pull filename / subfolder / type out of a `/api/comfyui/view?…` or Comfy `/view?…` URL. */
export function parseComfyViewRef(imageUrl: string): ComfyImageRef | null {
  try {
    const url = new URL(imageUrl, 'http://local');
    const filename = url.searchParams.get('filename')?.trim();
    if (!filename) return null;
    return {
      filename,
      subfolder: url.searchParams.get('subfolder')?.trim() ?? '',
      type: url.searchParams.get('type')?.trim() || 'output',
    };
  } catch {
    return null;
  }
}

/** LoadImage only reads the input folder: copy an output/temp image there first. */
export async function stageComfyImageAsInput(
  baseUrl: string,
  ref: ComfyImageRef,
  prefix: string
): Promise<string> {
  if (ref.type === 'input') {
    return ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename;
  }
  // With the Castcut pack's routes ComfyUI copies the file itself, under the same content name.
  if ((await castcutRoutes(baseUrl))?.routes.includes('stage')) {
    try {
      return await castcutStageAsInput(baseUrl, ref, prefix);
    } catch (error) {
      console.warn('Castcut stage failed; staging through /view instead:', error);
      recordCastcutFallback('stage');
    }
  }
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  const view = await fetch(`${baseUrl}/view?${params.toString()}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!view.ok) {
    throw new Error(`Could not read the image from ComfyUI (HTTP ${view.status}).`);
  }
  const bytes = new Uint8Array(await view.arrayBuffer());
  const extension = /\.[A-Za-z0-9]{1,5}$/.exec(ref.filename)?.[0] ?? '.png';
  try {
    // Named by content: checking the same still twice reuses the copy already staged.
    const staged = await uploadComfyInputContent({
      baseUrl,
      bytes,
      filename: `${prefix}${extension}`,
      mimeType: view.headers.get('content-type') || undefined,
      timeoutMs: 30000,
    });
    return staged.subfolder ? `${staged.subfolder}/${staged.name}` : staged.name;
  } catch (error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      throw new Error(`ComfyUI upload for ${prefix} failed (HTTP ${status}).`);
    }
    throw error;
  }
}

/**
 * Queue a utility graph at the front, poll history until `read` finds its result (or the run
 * completes without one), then delete the history entry.
 */
export async function runComfyUtilityGraph<T>(input: {
  baseUrl: string;
  prompt: Record<string, unknown>;
  label: string;
  read: (entry: ComfyHistoryEntry) => T | undefined;
  timeoutMs?: number;
  /**
   * `check`: a few seconds of work that loads no diffusion model (DWPose, a face probe) — it
   * runs right after the current job, ahead of every front job (checkQueueNumber). Default
   * `front`: ahead of pending renders, like the app's singles. `queue`: at the back, after what is
   * already waiting (long jobs such as Make it 30 s, so they do not hold up queued renders).
   */
  priority?: 'check' | 'front' | 'queue';
}): Promise<{ result: T } | { result: undefined; completed: true }> {
  const { baseUrl, label } = input;
  const queued = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Jump pending renders: a check is a few seconds of work and should not wait for them.
    body: JSON.stringify({
      prompt: input.prompt,
      client_id: `castcut-${label}`,
      ...(input.priority === 'check'
        ? { number: checkQueueNumber() }
        : input.priority === 'queue'
          ? {}
          : { front: true }),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!queued.ok) {
    const text = await queued.text().catch(() => '');
    throw new Error(`${label} queue failed (HTTP ${queued.status}) ${text.slice(0, 160)}`);
  }
  const { prompt_id: promptId } = (await queued.json()) as { prompt_id?: string };
  if (!promptId) {
    throw new Error(`${label} queue returned no prompt id.`);
  }
  const deadline = Date.now() + (input.timeoutMs ?? 180_000);
  try {
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 800));
      const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as Record<string, ComfyHistoryEntry>;
      const entry = payload[promptId];
      if (!entry) continue;
      if (entry.status?.status_str === 'error') {
        const detail = comfyRunErrorMessage(entry);
        throw new Error(
          `${label} failed in ComfyUI — ${detail ? `${detail} (` : ''}check the ComfyUI log${detail ? ')' : ''}.`
        );
      }
      const result = input.read(entry);
      if (result !== undefined) {
        return { result };
      }
      if (entry.status?.completed) {
        return { result: undefined, completed: true };
      }
    }
    throw new Error(`${label} timed out waiting for ComfyUI.`);
  } finally {
    void deleteComfyUiHistoryItems(baseUrl, [promptId]);
  }
}

/** The API graph ComfyUI embedded in an output PNG (`prompt` text chunk), or null. */
export async function readComfyImageGraph(
  baseUrl: string,
  ref: ComfyImageRef
): Promise<Record<string, unknown> | null> {
  // With the Castcut pack only the text chunk comes back, not the ~1.5 MB picture.
  let text = await castcutPngPrompt(baseUrl, ref);
  if (text === undefined) {
    const params = new URLSearchParams({
      filename: ref.filename,
      subfolder: ref.subfolder,
      type: ref.type,
    });
    const response = await fetch(`${baseUrl}/view?${params.toString()}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    text = parseTextChunks(await response.arrayBuffer()).prompt ?? null;
  }
  try {
    const graph = text ? (JSON.parse(text) as unknown) : null;
    return graph && typeof graph === 'object' ? (graph as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
