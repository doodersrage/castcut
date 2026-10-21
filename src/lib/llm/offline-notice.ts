/** Client-safe: when to show the "language model is offline" notice, from /api/health. */

export type LlmOfflineNotice = {
  /** Address the server tried (LM Studio / Ollama / the built-in LLM). */
  baseUrl?: string;
  /** Why it failed, as the health check put it. */
  error?: string;
};

type HealthShape = {
  llm?: { ok?: boolean; enabled?: boolean; baseUrl?: string; error?: string };
  config?: { llmEnabled?: boolean };
} | null;

/**
 * The notice shows only when the LLM is meant to be used — on for the server
 * (LLM_ENABLED) and not switched off or pointed at a hosted provider in this
 * browser's Settings — and the server's health check says it isn't answering.
 */
export function llmOfflineNotice(
  health: Record<string, unknown> | null,
  shared: { sessionLlmEnabled?: boolean; sessionLlmProvider?: string } | null | undefined
): LlmOfflineNotice | null {
  const typed = health as HealthShape;
  if (!typed?.llm) return null;
  if (typed.config?.llmEnabled === false || typed.llm.enabled === false) return null;
  if (shared?.sessionLlmEnabled === false) return null;
  // A hosted provider picked in the browser isn't what the server health checks.
  if (shared?.sessionLlmProvider && shared.sessionLlmProvider !== 'server') return null;
  if (typed.llm.ok !== false) return null;
  return {
    ...(typed.llm.baseUrl ? { baseUrl: typed.llm.baseUrl } : {}),
    ...(typed.llm.error ? { error: typed.llm.error } : {}),
  };
}
