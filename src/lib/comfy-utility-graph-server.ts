/**
 * Server-only helpers for small "utility" ComfyUI graphs — a few nodes run to measure a
 * finished still (pose detection, face similarity), not to render one.
 *
 * Nodes are discovered through `/object_info` (so a missing node pack is reported, not
 * crashed on), widgets are filled from their declared defaults, the graph jumps the queue, and
 * its history entry is deleted afterwards so checks never show up as gallery items.
 */

import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import { deleteComfyUiHistoryItems } from '@/lib/comfyui-status';

type NodeInputSpec = [unknown, Record<string, unknown>?];

export type ComfyNodeInfo = {
  input?: { required?: Record<string, NodeInputSpec> };
  output?: string[];
};

export type ComfyImageRef = { filename: string; subfolder: string; type: string };

export type ComfyHistoryEntry = {
  outputs?: Record<string, Record<string, unknown[] | undefined>>;
  status?: { status_str?: string; completed?: boolean };
};

const nodeCache = new Map<string, { node: string; info: ComfyNodeInfo; at: number } | null>();
const NODE_CACHE_MS = 5 * 60 * 1000;

export function comfyBaseUrl(comfyUrl?: string): string {
  return getComfyUiBaseUrl(stripEmptyComfyUiRuntime({ apiUrl: comfyUrl })).replace(/\/+$/, '');
}

/** First installed node among `candidates` (cached per host), or null. */
export async function resolveComfyNode(
  baseUrl: string,
  candidates: readonly string[]
): Promise<{ node: string; info: ComfyNodeInfo } | null> {
  const key = `${baseUrl}::${candidates.join('|')}`;
  const cached = nodeCache.get(key);
  if (cached !== undefined && (cached === null || Date.now() - cached.at < NODE_CACHE_MS)) {
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

/**
 * Fill every required input: links for the named sockets, declared defaults (or the first
 * option) for widgets, then any overrides whose widget actually exists on this node version.
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
    if (name in inputs) {
      const [type] = info.input?.required?.[name] ?? [];
      // Only pick an option the node actually offers.
      if (!Array.isArray(type) || type.includes(value)) {
        inputs[name] = value;
      }
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
  const blob = await view.blob();
  const form = new FormData();
  form.append('image', blob, `${prefix}-${ref.filename}`);
  form.append('overwrite', 'true');
  const upload = await fetch(`${baseUrl}/upload/image`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!upload.ok) {
    throw new Error(`ComfyUI upload for ${prefix} failed (HTTP ${upload.status}).`);
  }
  const data = (await upload.json()) as { name?: string; subfolder?: string };
  const name = data.name?.trim();
  if (!name) {
    throw new Error(`ComfyUI upload for ${prefix} returned no filename.`);
  }
  return data.subfolder?.trim() ? `${data.subfolder.trim()}/${name}` : name;
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
}): Promise<{ result: T } | { result: undefined; completed: true }> {
  const { baseUrl, label } = input;
  const queued = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Jump pending renders: a check is a few seconds of work and should not wait for them.
    body: JSON.stringify({ prompt: input.prompt, client_id: `castcut-${label}`, front: true }),
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
        throw new Error(`${label} failed in ComfyUI — check the ComfyUI log.`);
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
