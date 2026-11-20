/**
 * Server-only: room on the GPU for a local LLM (ENGINE_PLAN.md phase 6). The other half of
 * heavy-graph-server.ts, which frees the LLM when a ComfyUI job runs out of memory: here the LLM
 * can't load (or run) because an idle ComfyUI kept its models on the card. LM Studio unloads its
 * model after a while idle and loads it again on the next request — and on a 24 GB card that
 * reload failed while ComfyUI held 17 GB between jobs ("failed to allocate compute pp buffers",
 * live 2026-11-19), so a run's vision checks would fail and its takes go unchecked.
 *
 * Freed only when ComfyUI is on the same machine as the LLM and has nothing running or waiting:
 * a job's models are never pulled out from under it. ComfyUI loads them again on its next job.
 */

import { getComfyUiBaseUrl } from '../comfyui/client';
import { freeComfyUiMemoryServer } from '../comfyui/free-server';
import { isLoopbackUrl } from './vram-free-server';

/**
 * The LLM failed for want of GPU memory (loading the model, or its buffers), not a bad request.
 * LM Studio's API says only "Failed to load model" when a just-in-time load has no room (its log
 * says "failed to allocate compute pp buffers"), so a failed load counts: freeing an idle ComfyUI
 * costs it only a reload.
 */
export function isLlmGpuRoomFailure(body: string): boolean {
  return /failed to load model|failed to allocate|compute pp buffers?|out of (?:device |gpu |cuda )?memory|cudaMalloc|not enough (?:gpu |video |device )?memory|insufficient (?:gpu |video |device )?memory|unable to allocate/i.test(
    body
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** The LLM and ComfyUI share a machine (so a GPU): both loopback, or the same host name. */
export function llmSharesComfyMachine(llmBaseUrl: string, comfyBaseUrl: string): boolean {
  if (isLoopbackUrl(llmBaseUrl) && isLoopbackUrl(comfyBaseUrl)) return true;
  const llm = hostOf(llmBaseUrl);
  return Boolean(llm) && llm === hostOf(comfyBaseUrl);
}

export type LlmRoomDeps = {
  comfyUrl?: string;
  fetchQueue?: (baseUrl: string) => Promise<{ running: number; pending: number } | null>;
  free?: (comfyUrl: string) => Promise<boolean>;
  wait?: (ms: number) => Promise<void>;
};

async function comfyQueue(baseUrl: string): Promise<{ running: number; pending: number } | null> {
  try {
    const response = await fetch(`${baseUrl}/queue`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const queue = (await response.json()) as {
      queue_running?: unknown[];
      queue_pending?: unknown[];
    };
    return {
      running: queue.queue_running?.length ?? 0,
      pending: queue.queue_pending?.length ?? 0,
    };
  } catch {
    return null;
  }
}

/** Time for ComfyUI's worker to unload after /free (heavy-graph-server's COMFY_FREE_SETTLE_MS). */
const SETTLE_MS = 1500;

/**
 * Free an idle same-machine ComfyUI's cached models so the LLM at `llmBaseUrl` can load. True when
 * it freed them; false when ComfyUI is elsewhere, busy, unreachable or the call failed. Never
 * throws.
 */
export async function makeRoomForLocalLlm(
  llmBaseUrl: string,
  deps: LlmRoomDeps = {}
): Promise<boolean> {
  try {
    const comfy = (deps.comfyUrl ?? getComfyUiBaseUrl()).replace(/\/+$/, '');
    if (!llmSharesComfyMachine(llmBaseUrl, comfy)) return false;
    const queue = await (deps.fetchQueue ?? comfyQueue)(comfy);
    if (!queue || queue.running > 0 || queue.pending > 0) return false;
    const freed = await (deps.free ?? freeComfyUiMemoryServer)(comfy);
    if (freed)
      await (deps.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(SETTLE_MS);
    return freed;
  } catch {
    return false;
  }
}
