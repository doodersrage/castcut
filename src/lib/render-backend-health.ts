/** Pure half of render-backend-status.ts (testable without the browser). */

import type { RawHealthResponse } from '@/lib/shared-health-poll';

export type RenderBackendState = 'checking' | 'online' | 'offline';

export type RenderBackendStatus = {
  state: RenderBackendState;
  /** The local LLM (suggestions, written beats, reviews) answers. Null while checking. */
  llmOk: boolean | null;
};

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
    comfyui?: { ok?: boolean };
    diffusers?: { ok?: boolean };
  };
  const imageOk =
    options.cloudEngine === true || Boolean(typed.comfyui?.ok) || Boolean(typed.diffusers?.ok);
  return { state: imageOk ? 'online' : 'offline', llmOk: Boolean(typed.llm?.ok) };
}
