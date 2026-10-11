/**
 * Shared ComfyUI /prompt helper that keeps live progress + latent previews working.
 *
 * Always sends a clientId, opens the live bridge before queue when WS progress is
 * enabled, and returns that same clientId for gallery registration/polling.
 */

import { parseEngineId } from './engine/capabilities';
import { registerAppComfyJob } from './comfy-model-turn';
import { loadComfyUiSettings } from './comfyui-settings';
import { assertRenderBackendReachable } from './render-backend-status';
import {
  createComfyUiClientId,
  openComfyPreviewSocketBeforeQueue,
  type ComfyUiWebSocketSubscription,
} from './comfyui-websocket';

export type ComfyUiQueueRequestResult = {
  ok: boolean;
  status: number;
  promptId?: string;
  clientId?: string;
  comfyUrl?: string;
  error?: string;
  href?: string;
  workflowSource?: string;
  engineId?: import('./engine/types').EngineId;
  family?: string;
  diffusersFallbackReason?: string;
  raw: Record<string, unknown>;
  /** Call after registerComfyGalleryJob + scheduleComfyGalleryPoll. */
  releaseLiveSocket: () => void;
};

function resolveComfyUrlHint(body: Record<string, unknown>): string | undefined {
  const comfy = body.comfy;
  if (comfy && typeof comfy === 'object' && !Array.isArray(comfy)) {
    const apiUrl = (comfy as { apiUrl?: unknown }).apiUrl;
    if (typeof apiUrl === 'string' && apiUrl.trim()) {
      return apiUrl.trim();
    }
  }
  return loadComfyUiSettings().apiUrl?.trim() || undefined;
}

/** Pure success check for single-prompt and batch /api/comfyui responses. */
export function isComfyQueueResponseOk(responseOk: boolean, raw: Record<string, unknown>): boolean {
  if (!responseOk) {
    return false;
  }
  if (typeof raw.promptId === 'string' && raw.promptId.trim()) {
    return true;
  }
  const batchResults = Array.isArray(raw.results)
    ? (raw.results as Array<{ promptId?: unknown }>)
    : undefined;
  if (batchResults?.some(entry => typeof entry?.promptId === 'string' && entry.promptId.trim())) {
    return true;
  }
  return typeof raw.queued === 'number' && Number.isFinite(raw.queued) && raw.queued > 0;
}

/**
 * The queue route's JSON — or, when something in between answered with a page or plain text (a
 * proxy, a crashed server), an `error` in words instead of "Unexpected token … is not valid JSON"
 * (UI audit 2026-10-11: that reached a Story toast verbatim).
 */
export async function readQueueResponseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {
    error:
      response.status >= 500 || response.status === 0
        ? `The server couldn’t reach ComfyUI (HTTP ${response.status}). Check that ComfyUI is running, then try again.`
        : `The server answered in an unexpected way (HTTP ${response.status}). Try again in a moment.`,
  };
}

/**
 * POST /api/comfyui with a live-preview client id. Prefer this over raw fetch
 * whenever the job will appear in the gallery.
 */
export async function postComfyUiPrompt(
  body: Record<string, unknown>
): Promise<ComfyUiQueueRequestResult> {
  // Known offline: say so plainly instead of queueing into nothing.
  await assertRenderBackendReachable();
  const settings = loadComfyUiSettings();
  const clientId =
    (typeof body.clientId === 'string' && body.clientId.trim()) || createComfyUiClientId();

  let early: ComfyUiWebSocketSubscription | undefined;
  if (settings.useWebSocketProgress !== false) {
    try {
      early = await openComfyPreviewSocketBeforeQueue({
        clientId,
        comfyUrl: resolveComfyUrlHint(body),
      });
    } catch {
      early = undefined;
    }
  }

  const releaseLiveSocket = () => {
    early?.close();
    early = undefined;
  };

  try {
    const response = await fetch('/api/comfyui', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, clientId }),
    });
    const raw = await readQueueResponseJson(response);
    const promptId = typeof raw.promptId === 'string' ? raw.promptId : undefined;
    const batchResults = Array.isArray(raw.results)
      ? (raw.results as Array<{ promptId?: unknown }>)
      : undefined;
    const firstBatchPromptId = batchResults?.find(
      entry => typeof entry?.promptId === 'string' && entry.promptId.trim()
    )?.promptId as string | undefined;
    const previewPromptId = promptId ?? firstBatchPromptId;
    const resolvedClientId = (typeof raw.clientId === 'string' && raw.clientId.trim()) || clientId;

    if (previewPromptId) {
      early?.setPromptId(previewPromptId);
    }
    // Model-aware queue: the app's own jobs, told apart from everyone else's in ComfyUI.
    registerAppComfyJob(promptId);
    for (const entry of batchResults ?? []) {
      if (typeof entry?.promptId === 'string') registerAppComfyJob(entry.promptId);
    }

    return {
      ok: isComfyQueueResponseOk(response.ok, raw),
      status: response.status,
      promptId,
      clientId: resolvedClientId,
      comfyUrl:
        (typeof raw.engineUrl === 'string' && raw.engineUrl.trim()) ||
        (typeof raw.comfyUrl === 'string' ? raw.comfyUrl : undefined),
      error: typeof raw.error === 'string' ? raw.error : undefined,
      href: typeof raw.href === 'string' ? raw.href : undefined,
      workflowSource: typeof raw.workflowSource === 'string' ? raw.workflowSource : undefined,
      engineId: parseEngineId(raw.engineId),
      family: typeof raw.family === 'string' ? raw.family : undefined,
      diffusersFallbackReason:
        typeof raw.diffusersFallbackReason === 'string' ? raw.diffusersFallbackReason : undefined,
      raw,
      releaseLiveSocket,
    };
  } catch (error) {
    releaseLiveSocket();
    throw error;
  }
}
