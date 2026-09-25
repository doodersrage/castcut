/**
 * Server-side vision model resolution: the request's own pick (Settings → LLM session vision
 * model), then LLM_VISION_MODEL, then a vision model found in the provider's model list.
 * The detected one is cached per provider for a few minutes.
 */

import { resolveRequestVisionModel, type LlmRequestOptions } from './llm-request-options';
import { listRemoteLlmModels } from './llm-models';
import { normalizeSessionLlmProvider } from './llm-providers';
import { pickVisionCapableModel } from './vision-model-pick';

const CACHE_MS = 5 * 60_000;
const LIST_TIMEOUT_MS = 4_000;
const cache = new Map<string, { at: number; model: string | undefined }>();

/** Vision model found in the provider's list (cached), or undefined. */
export async function detectVisionModel(llm?: LlmRequestOptions): Promise<string | undefined> {
  const provider = normalizeSessionLlmProvider(llm?.llmProvider);
  const key = `${provider}:${llm?.llmApiKey ? 'key' : 'env'}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.model;
  }
  let model: string | undefined;
  try {
    const catalog = await Promise.race([
      listRemoteLlmModels({ provider, apiKey: llm?.llmApiKey }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), LIST_TIMEOUT_MS)),
    ]);
    model = catalog && catalog.ok ? pickVisionCapableModel(catalog.entries) : undefined;
  } catch {
    model = undefined;
  }
  cache.set(key, { at: Date.now(), model });
  return model;
}

/** The vision model a request should use, or undefined when none is set or detectable. */
export async function resolveVisionModel(llm?: LlmRequestOptions): Promise<string | undefined> {
  return (
    resolveRequestVisionModel(llm) ??
    (process.env.LLM_VISION_MODEL?.trim() || undefined) ??
    (await detectVisionModel(llm))
  );
}

/** Tests only. */
export function clearVisionModelCacheForTests(): void {
  cache.clear();
}
