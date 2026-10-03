'use client';

import {
  decideModelTurn,
  frontQueueSubmissionOrder,
  planModelBatchOrder,
  type AppPendingJob,
  type ModelTurnDecision,
} from '@/lib/comfy-model-batch';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';

/**
 * Browser side of the model-aware queue (comfy-model-batch.ts): which ComfyUI jobs this app
 * sent, and a wait that holds a follow-up on another model until the app's own jobs on the
 * current model have run. Everyone else's jobs in the shared queue are only ever read.
 */

export type ComfyEngineStateJob = {
  promptId: string;
  number: number;
  modelKey: string | null;
  clientId?: string;
};

export type ComfyEngineStateResponse = {
  running: ComfyEngineStateJob[];
  pending: ComfyEngineStateJob[];
  lastModelKey: string | null;
  vram?: { free: number; total: number };
  /** Engine id → main model key, from what the app last queued on each. */
  modelKeysById?: Record<string, string>;
};

/**
 * Run order for a burst of the app's jobs (planModelBatchOrder), and the order to submit them
 * in so ComfyUI's front-of-queue runs them that way. `models` are engine ids; ComfyUI's state
 * maps them to weights and says what is loaded. Without ComfyUI the burst keeps its order.
 */
export async function planAppBurst<T extends { id: string; model: string | null }>(
  items: readonly T[]
): Promise<{ submit: T[]; runOrder: T[]; reordered: boolean }> {
  const state = items.length > 1 ? await fetchComfyEngineState() : null;
  if (!state) return { submit: [...items], runOrder: [...items], reordered: false };
  const keyOf = (model: string | null) =>
    model ? (state.modelKeysById?.[model] ?? `engine:${model}`) : null;
  // One model: nothing to group — keep the burst exactly as it was.
  if (new Set(items.map(item => keyOf(item.model)).filter(Boolean)).size < 2) {
    return { submit: [...items], runOrder: [...items], reordered: false };
  }
  const order = planModelBatchOrder(
    items.map(item => ({ id: item.id, modelKey: keyOf(item.model) })),
    { currentModelKey: state.lastModelKey }
  );
  const byId = new Map(items.map(item => [item.id, item]));
  const runOrder = order.map(id => byId.get(id)!).filter(Boolean);
  const submit = frontQueueSubmissionOrder(runOrder, {
    firstStartsNow: state.running.length === 0 && state.pending.length === 0,
  });
  const reordered = submit.some((item, index) => item.id !== items[index]?.id);
  return { submit, runOrder, reordered };
}

const APP_JOB_TTL_MS = 6 * 60 * 60 * 1000;
const appJobs = new Map<string, number>();

/** Called for every prompt the app queues (postComfyUiPrompt). */
export function registerAppComfyJob(promptId: string | undefined | null): void {
  const id = promptId?.trim();
  if (!id) return;
  const now = Date.now();
  appJobs.set(id, now);
  if (appJobs.size > 500) {
    for (const [key, at] of appJobs) {
      if (now - at > APP_JOB_TTL_MS) appJobs.delete(key);
    }
  }
}

export function isAppComfyJob(promptId: string): boolean {
  return appJobs.has(promptId);
}

export async function fetchComfyEngineState(): Promise<ComfyEngineStateResponse | null> {
  try {
    const comfyUrl = loadComfyUiSettings().apiUrl?.trim();
    const query = comfyUrl ? `?comfyUrl=${encodeURIComponent(comfyUrl)}` : '';
    const response = await fetch(`/api/comfyui/engine-state${query}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    return (await response.json()) as ComfyEngineStateResponse;
  } catch {
    return null;
  }
}

/** The app's own jobs still waiting (not running) in ComfyUI. */
export function appPendingJobs(state: ComfyEngineStateResponse): AppPendingJob[] {
  return state.pending.filter(job => appJobs.has(job.promptId));
}

/**
 * Resolve when a follow-up on `modelKey` may be submitted (decideModelTurn), polling ComfyUI's
 * queue. Never throws and never waits past `maxWaitMs`; an unreachable ComfyUI means go now.
 */
export async function waitForModelTurn(input: {
  modelKey: string | null | undefined;
  maxWaitMs?: number;
  pollMs?: number;
  /** Told how many of the app's jobs on another model are still ahead, while waiting. */
  onWait?: (blocking: number) => void;
  isCancelled?: () => boolean;
}): Promise<{ waitedMs: number; decision: ModelTurnDecision }> {
  const maxWaitMs = input.maxWaitMs ?? 120_000;
  const pollMs = input.pollMs ?? 3000;
  const started = Date.now();
  for (;;) {
    const state = await fetchComfyEngineState();
    const waitedMs = Date.now() - started;
    if (!state) return { waitedMs, decision: { wait: false, reason: 'no-app-jobs' } };
    const decision = decideModelTurn({
      modelKey: input.modelKey,
      appPending: appPendingJobs(state),
      waitedMs,
      maxWaitMs,
    });
    if (!decision.wait || input.isCancelled?.()) return { waitedMs, decision };
    input.onWait?.(decision.blocking);
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}
