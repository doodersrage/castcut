/**
 * An empty place rendered on the server (FINISHING_PLAN Phase 3): renderEmptyPlace's own steps —
 * its fixed graph queued as POST /api/comfyui queues a final graph (queue-take-server.ts), waited
 * for in ComfyUI (job-wait-server.ts), read back and uploaded on the server (picture-io-server.ts).
 */
import type { ComfyPromptStatus } from '@/lib/comfyui/status';
import { serverJobWait } from '@/lib/comfyui/job-wait-server';
import { queueTakeToComfyUi } from '@/lib/comfyui/queue-take-server';
import { serverPictureIo } from '@/lib/media/picture-io-server';
import type { EmptyPlaceSteps } from './picture-client';

export function serverEmptyPlaceSteps(input: {
  comfyUrl: string;
  /** Where the app's own picture paths are fetched from (the server's own origin). */
  appOrigin?: string;
  fetchImpl?: typeof fetch;
  status?: (promptId: string) => Promise<ComfyPromptStatus>;
  sleep?: (ms: number) => Promise<void>;
  /** How a built request reaches ComfyUI (tests record it); queueTakeToComfyUi otherwise. */
  queue?: typeof queueTakeToComfyUi;
}): EmptyPlaceSteps {
  const wait = serverJobWait({
    comfyUrl: input.comfyUrl,
    ...(input.status ? { status: input.status } : {}),
    ...(input.sleep ? { sleep: input.sleep } : {}),
  });
  return {
    queue: async job => {
      const queued = await (input.queue ?? queueTakeToComfyUi)(
        {
          prompt: job.prompt,
          negativePrompt: job.negativePrompt,
          model: job.model,
          front: true,
          comfy: { apiUrl: input.comfyUrl, workflowJson: job.workflowJson, workflowFinal: true },
        },
        job.prompt
      );
      return {
        ok: queued.ok,
        ...(queued.promptId ? { promptId: queued.promptId } : {}),
        ...(queued.error ? { error: queued.error } : {}),
      };
    },
    waitForPromptIds: wait.waitForPromptIds,
    resultUrl: wait.resultUrl,
    io: serverPictureIo({
      comfyUrl: input.comfyUrl,
      ...(input.appOrigin ? { appOrigin: input.appOrigin } : {}),
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    }),
  };
}
