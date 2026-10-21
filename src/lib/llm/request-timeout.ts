/**
 * How long a language-model request may wait for its answer to start. LM Studio can accept a
 * request and then fail to load its model (VRAM held by ComfyUI) — the request never answered,
 * and Day's queue waited on it with nothing on screen (2026-10-21). Loading a model and writing a
 * long reply can take a minute or two, so the default is generous. LLM_REQUEST_TIMEOUT_MS
 * overrides it (0 = no limit).
 */
export const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 240_000;

export function llmRequestTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.LLM_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 0 && env.LLM_REQUEST_TIMEOUT_MS?.trim()) return raw;
  return DEFAULT_LLM_REQUEST_TIMEOUT_MS;
}

export class LlmTimeoutError extends Error {
  constructor(readonly ms: number) {
    super(
      `The language model didn't start answering within ${Math.round(ms / 1000)} s — it may still be loading or out of GPU memory. Check LM Studio (or turn the LLM off in Settings).`
    );
    this.name = 'LlmTimeoutError';
  }
}

/**
 * fetch with a limit on the wait for the response to START (headers) — a streamed reply may then
 * take as long as it needs. A caller's own signal still aborts it.
 */
export async function fetchLlm(
  url: string,
  init: RequestInit,
  timeoutMs: number = llmRequestTimeoutMs(),
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  if (!(timeoutMs > 0)) return fetchImpl(url, init);
  const controller = new AbortController();
  const outer = init.signal;
  const forward = () => controller.abort(outer?.reason);
  if (outer?.aborted) forward();
  else outer?.addEventListener('abort', forward, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new LlmTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', forward);
  }
}
