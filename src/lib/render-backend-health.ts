/** Pure half of render-backend-status.ts (testable without the browser). */

import type { RawHealthResponse } from '@/lib/shared-health-poll';

export type RenderBackendState = 'checking' | 'online' | 'offline';

export type RenderBackendStatus = {
  state: RenderBackendState;
  /** The local LLM (suggestions, written beats, reviews) answers. Null while checking. */
  llmOk: boolean | null;
  /** The ComfyUI address the server tried, and why it got no answer (shown on the banner). */
  comfyUrl?: string;
  error?: string;
};

/** Checks in a row that must fail before the banner shows: one slow answer is not "offline". */
export const RENDER_BACKEND_FAILURES_TO_OFFLINE = 2;

/**
 * The status to show after a check: offline only once `RENDER_BACKEND_FAILURES_TO_OFFLINE` checks
 * in a row found nothing (a ComfyUI busy loading a model can miss one); until then the last answer
 * stands. Pure.
 */
export function settleRenderBackend(
  previous: RenderBackendStatus,
  failures: number,
  next: RenderBackendStatus
): { status: RenderBackendStatus; failures: number } {
  if (next.state !== 'offline') return { status: next, failures: 0 };
  const count = failures + 1;
  if (count >= RENDER_BACKEND_FAILURES_TO_OFFLINE) return { status: next, failures: count };
  return {
    status: {
      ...previous,
      llmOk: next.llmOk,
      state: previous.state === 'offline' ? 'offline' : previous.state,
    },
    failures: count,
  };
}

/** Shown wherever a render is refused because nothing answers. */
export const RENDER_BACKEND_OFFLINE_MESSAGE =
  'ComfyUI isn’t reachable, so nothing can render right now. Your Day, Story and settings are kept — start ComfyUI (or check its address in Settings → ComfyUI) and try again.';

/** Health JSON → status. A failed fetch (null) means the app server itself did not answer. */
export function renderBackendFromHealth(
  data: RawHealthResponse,
  options: { cloudEngine?: boolean } = {}
): RenderBackendStatus {
  if (data == null) return { state: 'offline', llmOk: false };
  const typed = data as {
    llm?: { ok?: boolean };
    comfyui?: { ok?: boolean; url?: string; error?: string };
    diffusers?: { ok?: boolean };
  };
  const imageOk =
    options.cloudEngine === true || Boolean(typed.comfyui?.ok) || Boolean(typed.diffusers?.ok);
  return {
    state: imageOk ? 'online' : 'offline',
    llmOk: Boolean(typed.llm?.ok),
    ...(!imageOk && typed.comfyui?.url ? { comfyUrl: typed.comfyui.url } : {}),
    ...(!imageOk && typed.comfyui?.error ? { error: typed.comfyui.error } : {}),
  };
}
