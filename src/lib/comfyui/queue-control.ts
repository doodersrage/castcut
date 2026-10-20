export type ComfyQueueDeleteInput = {
  promptId?: string;
  clear?: boolean;
};

export type ComfyQueueDeletePayload = {
  delete?: string[];
  clear?: boolean;
};

/** Builds the ComfyUI `POST /queue` body used to cancel or clear queue entries. */
export function buildComfyQueueDeletePayload(
  input: ComfyQueueDeleteInput
): ComfyQueueDeletePayload {
  const payload: ComfyQueueDeletePayload = {};
  const promptId = input.promptId?.trim();
  if (promptId) {
    payload.delete = [promptId];
  }
  if (input.clear) {
    payload.clear = true;
  }
  return payload;
}

export type ComfyQueueActionResult = {
  ok: boolean;
  error?: string;
  missingManager?: boolean;
};

async function postComfyQueueAction(
  path: string,
  body: Record<string, unknown>
): Promise<ComfyQueueActionResult> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      missingManager?: boolean;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: data.error ?? `Request failed: HTTP ${response.status}`,
        missingManager: data.missingManager,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Request failed.',
    };
  }
}

/** Cancels a single queued/running ComfyUI job via `/api/comfyui/queue/delete`. */
export function deleteComfyQueuePrompt(input: {
  promptId: string;
  comfyUrl?: string;
  clear?: boolean;
}): Promise<ComfyQueueActionResult> {
  return postComfyQueueAction('/api/comfyui/queue/delete', {
    promptId: input.promptId,
    comfyUrl: input.comfyUrl,
    clear: input.clear,
  });
}

/** Sends ComfyUI's `/interrupt`, optionally scoped to a host and prompt. */
export function interruptComfyUiQueue(
  comfyUrl?: string,
  promptId?: string
): Promise<ComfyQueueActionResult> {
  const body: Record<string, unknown> = {};
  if (comfyUrl?.trim()) {
    body.comfyUrl = comfyUrl.trim();
  }
  if (promptId?.trim()) {
    body.promptId = promptId.trim();
  }
  return postComfyQueueAction('/api/comfyui/interrupt', body);
}

/** Cancels one job via interrupt + queue delete + history prune. */
export function cancelComfyUiJob(input: {
  promptId: string;
  comfyUrl?: string;
  deleteHistory?: boolean;
}): Promise<ComfyQueueActionResult> {
  return postComfyQueueAction('/api/comfyui/cancel', {
    promptId: input.promptId,
    comfyUrl: input.comfyUrl,
    deleteHistory: input.deleteHistory,
  });
}

/** Best-effort prune of ComfyUI `/history` entries after gallery delete. */
export function deleteComfyHistoryPrompts(input: {
  promptIds: string[];
  comfyUrl?: string;
}): Promise<ComfyQueueActionResult> {
  return postComfyQueueAction('/api/comfyui/history', {
    promptIds: input.promptIds,
    comfyUrl: input.comfyUrl,
  });
}

/**
 * Sends ComfyUI's `/free` (unload models + free VRAM), optionally scoped to a
 * specific pooled host. Best-effort — safe to call after any job completes.
 */
export function freeComfyUiMemory(comfyUrl?: string): Promise<ComfyQueueActionResult> {
  return postComfyQueueAction('/api/comfyui/free', comfyUrl ? { comfyUrl } : {});
}

/**
 * Asks ComfyUI-Manager to reboot. Vanilla ComfyUI has no restart API.
 */
export function restartComfyUi(comfyUrl?: string): Promise<ComfyQueueActionResult> {
  return postComfyQueueAction('/api/comfyui/restart', comfyUrl ? { comfyUrl } : {});
}
