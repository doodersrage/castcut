import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { mainModelKeyFromGraph, normalizeModelKey } from './comfy-model-batch';
import {
  buildWarmUpGraph,
  decideWarmUp,
  type ApiGraph,
  type WarmUpSkipReason,
} from './comfy-warm-up';
import { getComfyUiRoot } from './comfy-asset-paths';
import { parseComfyUiSystemStats } from './comfyui-system-stats';
import { resolvePromptDataDir } from './prompt-data-paths';

/**
 * Server side of the model-aware queue: what ComfyUI is doing (whose jobs wait on which model,
 * which model ran last, free VRAM) and the engine warm-up.
 *
 * Warm-up graphs are copied from the app's own last still on each engine (kept here when it
 * queued, so they survive a ComfyUI restart — the coldest start of all).
 */

export type ComfyQueueJob = {
  promptId: string;
  number: number;
  modelKey: string | null;
  clientId?: string;
};

export type ComfyEngineState = {
  running: ComfyQueueJob[];
  pending: ComfyQueueJob[];
  /** Main model of the newest finished job that loaded one. */
  lastModelKey: string | null;
  vram?: { free: number; total: number };
  /** Engine id → main model key, from what the app last queued on each (for burst planning). */
  modelKeysById: Record<string, string>;
};

type QueueTuple = [number, string, unknown, { client_id?: string }?, ...unknown[]];

function parseQueueJobs(raw: unknown): ComfyQueueJob[] {
  if (!Array.isArray(raw)) return [];
  const jobs: ComfyQueueJob[] = [];
  for (const entry of raw as QueueTuple[]) {
    if (!Array.isArray(entry) || typeof entry[1] !== 'string') continue;
    jobs.push({
      promptId: entry[1],
      number: typeof entry[0] === 'number' ? entry[0] : 0,
      modelKey: mainModelKeyFromGraph(entry[2]),
      ...(typeof entry[3]?.client_id === 'string' ? { clientId: entry[3].client_id } : {}),
    });
  }
  // ComfyUI runs the lowest number first (front jobs are negative).
  return jobs.sort((a, b) => a.number - b.number);
}

type HistoryRecord = {
  prompt?: unknown[];
  status?: { messages?: Array<[string, { timestamp?: number }]> };
};

function historyEndTime(entry: HistoryRecord): number {
  const messages = entry.status?.messages ?? [];
  let latest = 0;
  for (const [, data] of messages) {
    if (typeof data?.timestamp === 'number' && data.timestamp > latest) latest = data.timestamp;
  }
  return latest;
}

/** The newest finished job's main model, from `/history`. */
export function lastModelKeyFromHistory(history: unknown): { key: string | null; at: number } {
  if (!history || typeof history !== 'object') return { key: null, at: 0 };
  let best: { key: string | null; at: number } = { key: null, at: 0 };
  for (const entry of Object.values(history as Record<string, HistoryRecord>)) {
    const key = mainModelKeyFromGraph(entry?.prompt?.[2]);
    if (!key) continue;
    const at = historyEndTime(entry);
    if (!best.key || at >= best.at) best = { key, at };
  }
  return best;
}

/** Last warm-up this server sent — its history entry is removed, so remember it here. */
let lastWarmUp: { key: string; at: number } | null = null;

export async function fetchComfyEngineState(baseUrl: string): Promise<ComfyEngineState> {
  const timeout = () => AbortSignal.timeout(5000);
  const [queueResponse, historyResponse, statsResponse] = await Promise.all([
    fetch(`${baseUrl}/queue`, { signal: timeout(), redirect: 'manual', cache: 'no-store' }),
    fetch(`${baseUrl}/history?max_items=24`, {
      signal: timeout(),
      redirect: 'manual',
      cache: 'no-store',
    }).catch(() => null),
    fetch(`${baseUrl}/system_stats`, {
      signal: timeout(),
      redirect: 'manual',
      cache: 'no-store',
    }).catch(() => null),
  ]);
  if (!queueResponse.ok) throw new Error(`ComfyUI /queue failed: HTTP ${queueResponse.status}`);
  const queue = (await queueResponse.json()) as {
    queue_running?: unknown;
    queue_pending?: unknown;
  };
  const history = historyResponse?.ok ? await historyResponse.json().catch(() => null) : null;
  const last = lastModelKeyFromHistory(history);
  const lastModelKey =
    lastWarmUp && lastWarmUp.at > last.at ? lastWarmUp.key : (last.key ?? lastWarmUp?.key ?? null);
  const stats = statsResponse?.ok
    ? parseComfyUiSystemStats(await statsResponse.json().catch(() => null))
    : undefined;
  return {
    running: parseQueueJobs(queue.queue_running),
    pending: parseQueueJobs(queue.queue_pending),
    lastModelKey,
    ...(stats?.vram ? { vram: stats.vram } : {}),
    modelKeysById: templateModelKeysById(),
  };
}

// ── Warm-up templates ────────────────────────────────────────────────────────────────────────

type Template = { graph: ApiGraph; modelIds: string[]; files: string[]; at: number };

const MAX_TEMPLATES = 16;
let templates: Map<string, Template> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function templatesFile(): string {
  return path.join(resolvePromptDataDir(), 'comfy-warm-up-templates.json');
}

function loadTemplates(): Map<string, Template> {
  if (templates) return templates;
  templates = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(templatesFile(), 'utf8')) as Record<string, Template>;
    for (const [key, value] of Object.entries(raw)) {
      if (value?.graph && Array.isArray(value.modelIds)) templates.set(key, value);
    }
  } catch {
    // none yet
  }
  return templates;
}

function persistTemplatesSoon(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const file = templatesFile();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(Object.fromEntries(loadTemplates())), 'utf8');
    } catch {
      // best-effort
    }
  }, 2000);
  persistTimer.unref?.();
}

function mainModelFiles(graph: unknown): string[] {
  if (!graph || typeof graph !== 'object') return [];
  const files: string[] = [];
  for (const node of Object.values(graph as Record<string, { inputs?: Record<string, unknown> }>)) {
    const name = node?.inputs?.unet_name ?? node?.inputs?.ckpt_name;
    if (typeof name === 'string' && name.trim()) files.push(name.trim());
  }
  return files;
}

/** Remember a just-queued graph as its engine's warm-up template (called for every queue). */
export function rememberWarmUpTemplate(input: { graph: unknown; model?: string }): void {
  try {
    const key = mainModelKeyFromGraph(input.graph);
    if (!key) return;
    const warm = buildWarmUpGraph(input.graph);
    if (!warm) return;
    const store = loadTemplates();
    const previous = store.get(key);
    const modelId = input.model?.trim();
    store.delete(key);
    store.set(key, {
      graph: warm,
      modelIds: [...new Set([...(previous?.modelIds ?? []), ...(modelId ? [modelId] : [])])].slice(
        -8
      ),
      files: mainModelFiles(input.graph),
      at: Date.now(),
    });
    while (store.size > MAX_TEMPLATES) store.delete(store.keys().next().value!);
    persistTemplatesSoon();
  } catch {
    // never let warm-up bookkeeping break a queue
  }
}

/** Engine id → main model key of the newest template queued under it. */
function templateModelKeysById(): Record<string, string> {
  const byId: Record<string, { key: string; at: number }> = {};
  for (const [key, template] of loadTemplates()) {
    for (const id of template.modelIds) {
      if (!byId[id] || template.at > byId[id].at) byId[id] = { key, at: template.at };
    }
  }
  return Object.fromEntries(Object.entries(byId).map(([id, entry]) => [id, entry.key]));
}

/** The newest template queued under any of `models` (engine ids, as the app names them). */
function findTemplate(models: readonly string[]): { key: string; template: Template } | null {
  const wanted = new Set(models.map(model => model.trim()).filter(Boolean));
  let best: { key: string; template: Template } | null = null;
  for (const [key, template] of loadTemplates()) {
    if (!template.modelIds.some(id => wanted.has(id))) continue;
    if (!best || template.at > best.template.at) best = { key, template };
  }
  return best;
}

function modelBytesOnDisk(files: readonly string[]): number | undefined {
  const root = getComfyUiRoot();
  if (!root || files.length === 0) return undefined;
  let total = 0;
  for (const file of files) {
    let found = false;
    for (const folder of ['diffusion_models', 'unet', 'checkpoints']) {
      try {
        const stat = fs.statSync(
          /* turbopackIgnore: true */ path.join(root, 'models', folder, file)
        );
        total += stat.size;
        found = true;
        break;
      } catch {
        // next folder
      }
    }
    if (!found) return undefined;
  }
  return total;
}

export type EngineWarmUpResult =
  | { queued: true; promptId: string; modelKey: string }
  | { queued: false; reason: WarmUpSkipReason; modelKey?: string };

/**
 * Queue the warm-up for the first of `models` the app has rendered on, when ComfyUI is idle,
 * that model did not run last, and VRAM has room. Front of the queue — only ever an empty one.
 * `onQueued` gets the prompt id (the route removes the history entry once it has run).
 */
export async function runEngineWarmUp(input: {
  baseUrl: string;
  models: readonly string[];
}): Promise<EngineWarmUpResult> {
  const found = findTemplate(input.models);
  if (!found) return { queued: false, reason: 'no-template' };
  let state: ComfyEngineState;
  try {
    state = await fetchComfyEngineState(input.baseUrl);
  } catch {
    return { queued: false, reason: 'unreachable', modelKey: found.key };
  }
  const decision = decideWarmUp({
    queueRunning: state.running.length,
    queuePending: state.pending.length,
    targetModelKey: found.key,
    lastModelKey: state.lastModelKey,
    vramFreeBytes: state.vram?.free,
    vramTotalBytes: state.vram?.total,
    modelBytes: modelBytesOnDisk(found.template.files),
  });
  if (!decision.go) return { queued: false, reason: decision.reason, modelKey: found.key };

  const response = await fetch(`${input.baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: found.template.graph,
      client_id: 'castcut-warmup',
      // The queue was empty a moment ago; front keeps it ahead of the still about to follow.
      front: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return { queued: false, reason: 'unreachable', modelKey: found.key };
  const { prompt_id: promptId } = (await response.json()) as { prompt_id?: string };
  if (!promptId) return { queued: false, reason: 'unreachable', modelKey: found.key };
  lastWarmUp = { key: normalizeModelKey(found.key), at: Date.now() };
  return { queued: true, promptId, modelKey: found.key };
}

/** Wait for a warm-up to finish, then drop its history entry (nothing worth keeping). */
export async function cleanUpWarmUp(
  baseUrl: string,
  promptId: string,
  modelKey: string
): Promise<void> {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as Record<string, HistoryRecord>;
      if (!payload[promptId]) continue;
      lastWarmUp = { key: normalizeModelKey(modelKey), at: Date.now() };
      await fetch(`${baseUrl}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: [promptId] }),
        signal: AbortSignal.timeout(5000),
      });
      return;
    } catch {
      // keep polling
    }
  }
}
