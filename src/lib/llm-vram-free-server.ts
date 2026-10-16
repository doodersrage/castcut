/**
 * Server-only: unload the models a same-machine LLM server holds on the GPU, so a ComfyUI job
 * that ran out of memory can retry at the same quality. A 24 GB card fits a Qwen render or the
 * LM Studio vision model comfortably — not always both.
 *
 * Only loopback LLM hosts (they share this machine's GPU with ComfyUI). LM Studio unloads via its
 * REST API; Ollama via keep_alive 0. Both reload on the next request (LM Studio JIT loading,
 * Ollama on demand), so the only cost is that reload.
 */

import { getLlmConfig } from './llm-client';

export type FreeLlmVramResult = {
  /** Model / instance ids that were unloaded. */
  freed: string[];
  /** Why nothing was done (remote host, nothing loaded, unknown server). */
  skipped?: string;
};

const TIMEOUT_MS = 8_000;

export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  return response.ok ? response.json() : null;
}

async function postJson(url: string, body: unknown): Promise<boolean> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response.ok;
}

/** LM Studio `GET /api/v1/models` → loaded instance ids. */
export function lmStudioLoadedInstanceIds(payload: unknown): string[] {
  const models = (payload as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return [];
  return models.flatMap(model => {
    const instances = (model as { loaded_instances?: unknown }).loaded_instances;
    return Array.isArray(instances)
      ? instances
          .map(instance => (instance as { id?: unknown }).id)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
  });
}

/**
 * LM Studio `GET /api/v1/models` → the context length the model is loaded with (its first loaded
 * instance), or null when it isn't loaded / the server isn't LM Studio. A model loaded at 2,048
 * tokens cut the Story writer's answer off mid-scene (2026-10-15).
 */
export function lmStudioLoadedContextLength(payload: unknown, model: string): number | null {
  const models = (payload as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return null;
  const want = model.trim().toLowerCase();
  for (const entry of models) {
    const record = entry as { key?: unknown; loaded_instances?: unknown };
    const instances = Array.isArray(record.loaded_instances) ? record.loaded_instances : [];
    for (const instance of instances) {
      const item = instance as { id?: unknown; config?: { context_length?: unknown } };
      const names = [record.key, item.id].map(value => String(value ?? '').toLowerCase());
      const length = Number(item.config?.context_length);
      if ((!want || names.includes(want)) && Number.isFinite(length) && length > 0) return length;
    }
  }
  return null;
}

/** The loaded context length of a same-machine LM Studio model, or null (quick, never throws). */
export async function localLlmContextLength(
  model: string,
  baseUrl = getLlmConfig().baseUrl
): Promise<number | null> {
  if (!isLoopbackUrl(baseUrl)) return null;
  try {
    const origin = new URL(baseUrl).origin;
    const response = await fetch(`${origin}/api/v1/models`, { signal: AbortSignal.timeout(1_500) });
    return response.ok ? lmStudioLoadedContextLength(await response.json(), model) : null;
  } catch {
    return null;
  }
}

/** Ollama `GET /api/ps` → loaded model names. */
export function ollamaLoadedModelNames(payload: unknown): string[] {
  const models = (payload as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return [];
  return models
    .map(
      model =>
        (model as { name?: unknown; model?: unknown }).name ?? (model as { model?: unknown }).model
    )
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
}

export async function freeLocalLlmVram(
  baseUrl = getLlmConfig().baseUrl
): Promise<FreeLlmVramResult> {
  if (!isLoopbackUrl(baseUrl)) {
    return { freed: [], skipped: 'LLM server is not on this machine' };
  }
  const origin = new URL(baseUrl).origin;
  try {
    const lmStudio = await getJson(`${origin}/api/v1/models`).catch(() => null);
    const lmIds = lmStudioLoadedInstanceIds(lmStudio);
    if (lmStudio && (lmStudio as { models?: unknown }).models) {
      const freed: string[] = [];
      for (const id of lmIds) {
        if (
          await postJson(`${origin}/api/v1/models/unload`, { instance_id: id }).catch(() => false)
        ) {
          freed.push(id);
        }
      }
      return freed.length ? { freed } : { freed, skipped: 'no LM Studio model loaded' };
    }
    const ollama = await getJson(`${origin}/api/ps`).catch(() => null);
    if (ollama && (ollama as { models?: unknown }).models) {
      const freed: string[] = [];
      for (const name of ollamaLoadedModelNames(ollama)) {
        if (
          await postJson(`${origin}/api/generate`, { model: name, keep_alive: 0 }).catch(
            () => false
          )
        ) {
          freed.push(name);
        }
      }
      return freed.length ? { freed } : { freed, skipped: 'no Ollama model loaded' };
    }
    return { freed: [], skipped: 'LLM server has no unload API (not LM Studio or Ollama)' };
  } catch (error) {
    return { freed: [], skipped: error instanceof Error ? error.message : 'unload failed' };
  }
}
