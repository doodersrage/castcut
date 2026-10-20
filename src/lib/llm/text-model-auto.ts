/**
 * The chat model the server writes with: LLM_MODEL when set, else a text model found in the
 * server's model list (cached a few minutes), else the old built-in default. A request's own
 * pick (Settings → LLM session model) is passed by the caller and wins before this.
 */
import { listRemoteLlmModels } from './models';
import { pickTextChatModel } from '../vision/model-pick';
import { localLlmEndpoint } from './local';

const CACHE_MS = 5 * 60_000;
const LIST_TIMEOUT_MS = 4_000;
export const BUILT_IN_LLM_MODEL = 'dolphin-llama3';
let cached: { at: number; model: string | undefined } | null = null;

/** A text model the configured server lists (cached), or undefined. */
export async function detectTextModel(): Promise<string | undefined> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.model;
  let model: string | undefined;
  try {
    const catalog = await Promise.race([
      listRemoteLlmModels({ provider: 'server' }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), LIST_TIMEOUT_MS)),
    ]);
    model = catalog && catalog.ok ? pickTextChatModel(catalog.entries) : undefined;
  } catch {
    model = undefined;
  }
  cached = { at: Date.now(), model };
  return model;
}

export async function resolveServerTextModel(): Promise<string> {
  return (
    localLlmEndpoint()?.model ||
    process.env.LLM_MODEL?.trim() ||
    (await detectTextModel()) ||
    BUILT_IN_LLM_MODEL
  );
}

/** Tests, and after a model download. */
export function clearTextModelCache(): void {
  cached = null;
}
