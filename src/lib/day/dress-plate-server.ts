/**
 * A take's dress plate on the server (FINISHING_PLAN Phase 3): ensureDayDressPlate's own logic
 * (dress-plate-client.ts) with the server's steps — the try-on built as the page's sendComfyUi
 * builds it (queue-request-server.ts) and queued as POST /api/comfyui queues it
 * (queue-take-server.ts), waited for in ComfyUI (watchedPromptStatus: a job the run watcher
 * queued again, or one ComfyUI forgot, is followed), its picture fetched and uploaded on the
 * server (picture-io-server.ts), the plate kept in the store the caller passes (the run's own).
 */
import '@/lib/media/off-page-canvas-server';
import type { CharacterRecord } from '@/lib/character/os';
import { COMFY_IMAGE_MODELS } from '@/lib/comfy-models/client';
import type { ComfyUiModelLists } from '@/lib/comfyui/object-info';
import { comfyOutputViewUrl, serverJobWait } from '@/lib/comfyui/job-wait-server';
import { queueTakeToComfyUi } from '@/lib/comfyui/queue-take-server';
import type { ComfyPromptStatus } from '@/lib/comfyui/status';
import { serverPictureIo } from '@/lib/media/picture-io-server';
import { installedComfyModels } from '@/lib/model/picker';
import {
  buildServerQueueRequest,
  type ServerQueueConfig,
  type ServerQueueSettings,
} from '@/lib/queue/queue-request-server';
import type { VramSnapshot } from '@/lib/queue/vram-queue-guard';
import { checkStillFootwearOnServer } from '@/lib/wardrobe/footwear-check-server';
import type { DayDressPlateDeps, DressPlateStore } from './dress-plate-client';

type Fetch = typeof fetch;

export { comfyOutputViewUrl };

export function serverDressPlateDeps(input: {
  settings: ServerQueueSettings;
  /** The page's queue config for the take (the Day tool's model and tool). */
  config: ServerQueueConfig;
  comfyUrl: string;
  /** Where the app's own picture paths are fetched from (the server's own origin). */
  appOrigin?: string;
  inventory?: ComfyUiModelLists | null;
  character?: CharacterRecord;
  store: DressPlateStore;
  readVram?: (comfyUrl?: string) => Promise<VramSnapshot | null>;
  fetchImpl?: Fetch;
  /** A job's status (tests); watchedPromptStatus against ComfyUI otherwise. */
  status?: (promptId: string) => Promise<ComfyPromptStatus>;
  sleep?: (ms: number) => Promise<void>;
  /** How a built request reaches ComfyUI (tests record it); queueTakeToComfyUi otherwise. */
  queue?: (
    body: Parameters<typeof queueTakeToComfyUi>[0],
    prompt: string
  ) => ReturnType<typeof queueTakeToComfyUi>;
}): DayDressPlateDeps {
  const io = serverPictureIo({
    comfyUrl: input.comfyUrl,
    ...(input.appOrigin ? { appOrigin: input.appOrigin } : {}),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });
  const wait = serverJobWait({
    comfyUrl: input.comfyUrl,
    ...(input.status ? { status: input.status } : {}),
    ...(input.sleep ? { sleep: input.sleep } : {}),
  });
  const installed = installedComfyModels(
    COMFY_IMAGE_MODELS,
    input.inventory ?? null,
    input.settings.shared.modelCheckpointMap
  );
  let uploads = 0;
  return {
    io,
    // The shoe check on the server: the same vision check, the still read with the run's steps.
    visionShared: input.settings.shared,
    checkFootwear: options => checkStillFootwearOnServer(options, io),
    store: input.store,
    comfyUrl: input.comfyUrl,
    installed: installed ? modelId => installed.has(modelId) : null,
    resultUrl: wait.resultUrl,
    sendComfyUi: async (prompt, _sport, _historyId, options) => {
      const body = await buildServerQueueRequest(
        prompt,
        options as Parameters<typeof buildServerQueueRequest>[1],
        input.config,
        {
          settings: input.settings,
          inventory: input.inventory ?? null,
          ...(input.character ? { character: input.character } : {}),
          ...(input.readVram ? { readVram: input.readVram } : {}),
          upload: async url => {
            const blob = await io.loadBlob([url]);
            uploads += 1;
            return io.upload(
              new File([blob], `castcut-run-${Date.now()}-${uploads}.png`, {
                type: blob.type || 'image/png',
              })
            );
          },
        }
      );
      const comfy = { ...body.comfy, apiUrl: body.comfy?.apiUrl?.trim() || input.comfyUrl };
      const queued = await (input.queue ?? queueTakeToComfyUi)(
        { ...body, comfy },
        body.prompt ?? prompt
      );
      // The page shows why in its status line; the server says it in the error (the run reports it).
      if (!queued.ok) throw new Error(queued.error?.trim() || 'ComfyUI did not take the job.');
      return queued.promptId || undefined;
    },
    waitForPromptIds: wait.waitForPromptIds,
  };
}
