/**
 * A run's ComfyUI job waited for on the server (FINISHING_PLAN Phase 3): waitForGalleryPromptIds'
 * shape, polled with watchedPromptStatus (a job the run watcher queued again, or one ComfyUI
 * forgot, is followed), and a finished job's picture named as the page names it.
 */
import type { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import type { ComfyPromptStatus } from '@/lib/comfyui/status';
import { watchedPromptStatus } from '@/lib/server/run-watcher-server';

/** A finished job's first picture as the page names it (/api/comfyui/view?…). */
export function comfyOutputViewUrl(
  status: Pick<ComfyPromptStatus, 'images' | 'comfyUrl'>
): string | null {
  const image = status.images?.[0];
  if (!image?.filename) return null;
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type || 'output',
  });
  if (status.comfyUrl?.trim()) params.set('comfyUrl', status.comfyUrl.trim());
  return `/api/comfyui/view?${params.toString()}`;
}

export type ServerJobWait = {
  /** One entry per id once each is done (or failed), else what it was when the time ran out. */
  waitForPromptIds: typeof waitForGalleryPromptIds;
  /** comfyOutputViewUrl, typed as the page's gallery-entry namer. */
  resultUrl: (entry: unknown) => string | null;
};

export function serverJobWait(input: {
  comfyUrl: string;
  /** A job's status (tests); watchedPromptStatus against ComfyUI otherwise. */
  status?: (promptId: string) => Promise<ComfyPromptStatus>;
  sleep?: (ms: number) => Promise<void>;
}): ServerJobWait {
  const status =
    input.status ??
    ((promptId: string) => watchedPromptStatus(promptId, { apiUrl: input.comfyUrl }));
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>(done => setTimeout(done, ms)));
  const waitForPromptIds = async (
    ids: string[],
    options?: { timeoutMs?: number; pollMs?: number }
  ) => {
    const deadline = Date.now() + (options?.timeoutMs ?? 8 * 60_000);
    const pollMs = options?.pollMs ?? 2_500;
    let latest: ComfyPromptStatus[] = [];
    for (;;) {
      latest = await Promise.all(ids.map(id => status(id)));
      const settled = latest.every(
        entry => entry.status === 'completed' || entry.status === 'error'
      );
      if (settled || Date.now() >= deadline) break;
      await sleep(pollMs);
    }
    return latest;
  };
  return {
    waitForPromptIds: waitForPromptIds as unknown as typeof waitForGalleryPromptIds,
    resultUrl: entry => comfyOutputViewUrl(entry as ComfyPromptStatus),
  };
}
