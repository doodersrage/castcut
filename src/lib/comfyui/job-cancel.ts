import { buildComfyQueueDeletePayload } from './queue-control';
import { deleteComfyUiHistoryItems } from './status';

export type ComfyJobCancelResult = {
  ok: boolean;
  error?: string;
};

async function postJson(
  url: string,
  body: Record<string, unknown> | undefined,
  timeoutMs = 5000
): Promise<{ ok: boolean; status: number }> {
  const response = await fetch(url, {
    method: 'POST',
    ...(body
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { ok: response.ok, status: response.status };
}

/**
 * Cancels one ComfyUI job: newer `/api/jobs/{id}/cancel` when present, then a
 * targeted `/interrupt` and `/queue` delete. Optionally prunes `/history`.
 */
export async function cancelComfyUiJobOnHost(input: {
  baseUrl: string;
  promptId: string;
  deleteHistory?: boolean;
}): Promise<ComfyJobCancelResult> {
  const base = input.baseUrl.replace(/\/+$/, '');
  const promptId = input.promptId.trim();
  if (!promptId) {
    return { ok: false, error: 'Missing prompt id.' };
  }

  try {
    await postJson(`${base}/api/jobs/${encodeURIComponent(promptId)}/cancel`, undefined);
  } catch {
    // Older ComfyUI has no jobs API.
  }

  let interruptOk = false;
  try {
    const interrupted = await postJson(`${base}/interrupt`, { prompt_id: promptId });
    interruptOk = interrupted.ok;
  } catch {
    interruptOk = false;
  }

  let queueOk = false;
  try {
    const deleted = await postJson(`${base}/queue`, buildComfyQueueDeletePayload({ promptId }));
    queueOk = deleted.ok;
  } catch {
    queueOk = false;
  }

  if (input.deleteHistory) {
    await deleteComfyUiHistoryItems(base, [promptId]);
  }

  if (!interruptOk && !queueOk) {
    return { ok: false, error: 'ComfyUI cancel failed.' };
  }

  return { ok: true };
}
