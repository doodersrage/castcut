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
import { watchedPromptStatus } from '@/lib/server/run-watcher-server';
import type { DayDressPlateDeps, DressPlateStore } from './dress-plate-client';

type Fetch = typeof fetch;

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
}): DayDressPlateDeps {
  const io = serverPictureIo({
    comfyUrl: input.comfyUrl,
    ...(input.appOrigin ? { appOrigin: input.appOrigin } : {}),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });
  const status =
    input.status ??
    ((promptId: string) => watchedPromptStatus(promptId, { apiUrl: input.comfyUrl }));
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>(done => setTimeout(done, ms)));
  const installed = installedComfyModels(
    COMFY_IMAGE_MODELS,
    input.inventory ?? null,
    input.settings.shared.modelCheckpointMap
  );
  let uploads = 0;
  return {
    io,
    store: input.store,
    comfyUrl: input.comfyUrl,
    installed: installed ? modelId => installed.has(modelId) : null,
    resultUrl: entry => comfyOutputViewUrl(entry as unknown as ComfyPromptStatus),
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
      const queued = await queueTakeToComfyUi({ ...body, comfy }, body.prompt ?? prompt);
      // The page shows why in its status line; the server says it in the error (the run reports it).
      if (!queued.ok) throw new Error(queued.error?.trim() || 'ComfyUI did not take the job.');
      return queued.promptId || undefined;
    },
    // waitForGalleryPromptIds' shape: one entry per id once each is done, or what it was then.
    waitForPromptIds: (async (ids: string[], options?: { timeoutMs?: number; pollMs?: number }) => {
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
    }) as unknown as DayDressPlateDeps['waitForPromptIds'],
  };
}
