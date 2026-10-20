'use client';

import { loadEngineSettings } from '@/lib/engine/settings';
import { loadSettingsCache } from '@/lib/settings/cache';
import { createComfyUiClientId } from '@/lib/comfyui/websocket';
import { cloudEngineOption, cloudSettingsHref, type CloudEngineId } from './capabilities';
import {
  createNoopProgressSubscription,
  fetchCloudStatusViaProxy,
  subscribeCloudProgress,
} from './cloud-poll';
import { buildNamedCloudViewPath } from './view-paths';
import type {
  EngineAdapter,
  EngineOutputImage,
  EngineQueueResult,
  EngineStatusResult,
  EngineSubscribeProgressInput,
  EngineUploadInput,
  EngineViewPathOptions,
} from './types';

export function createCloudEngineAdapter(id: CloudEngineId): EngineAdapter {
  const option = cloudEngineOption(id);
  if (!option) {
    throw new Error(`Unknown cloud engine "${id}".`);
  }
  const host = option.host;
  const label = option.shortLabel;

  return {
    id,

    async postPrompt(body: Record<string, unknown>): Promise<EngineQueueResult> {
      const settings = loadEngineSettings();
      const shared = loadSettingsCache().shared;
      const clientId =
        (typeof body.clientId === 'string' && body.clientId.trim()) || createComfyUiClientId();
      const fromBody = body[option.tokenBodyKey];
      const token =
        (typeof fromBody === 'string' && fromBody.trim()) ||
        (typeof shared[option.sessionTokenField] === 'string'
          ? shared[option.sessionTokenField]?.trim()
          : undefined);
      const params =
        body.params && typeof body.params === 'object' && !Array.isArray(body.params)
          ? (body.params as Record<string, unknown>)
          : {};

      const payload: Record<string, unknown> = {
        prompt: body.prompt,
        negativePrompt: body.negativePrompt,
        model: typeof body.model === 'string' ? body.model : settings[option.modelField],
        img2imgModel: settings[option.img2imgField],
        [option.tokenBodyKey]: token,
        clientId,
        tool: typeof body.tool === 'string' ? body.tool : undefined,
        clipMode:
          body.clipMode === 't2v' || body.clipMode === 'i2v' || body.clipMode === 'extend'
            ? body.clipMode
            : undefined,
        videoUrl:
          typeof body.videoUrl === 'string' && body.videoUrl.trim()
            ? body.videoUrl.trim()
            : undefined,
        hasInputImage: body.hasInputImage === true,
        inputImageFilename:
          (typeof body.inputImageFilename === 'string' && body.inputImageFilename.trim()) ||
          (typeof params.inputImageFilename === 'string' && params.inputImageFilename.trim()) ||
          undefined,
        params: {
          seed: params.seed,
          width: params.width,
          height: params.height,
          steps: params.steps,
          cfg: params.cfg,
          denoise: params.denoise,
          videoFrames: params.videoFrames,
          videoFps: params.videoFps,
        },
      };

      try {
        const response = await fetch(`/api/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const promptId = typeof raw.promptId === 'string' ? raw.promptId.trim() : undefined;
        const engineUrl = (typeof raw.engineUrl === 'string' && raw.engineUrl.trim()) || host;

        if (!response.ok || !promptId) {
          return {
            ok: false,
            status: response.status,
            error: typeof raw.error === 'string' ? raw.error : `${label} queue failed.`,
            href: typeof raw.href === 'string' ? raw.href : cloudSettingsHref(),
            engineUrl,
            engineId: id,
            raw,
            releaseLiveSocket: () => undefined,
          };
        }

        return {
          ok: true,
          status: response.status,
          promptId,
          clientId: (typeof raw.clientId === 'string' && raw.clientId.trim()) || clientId,
          engineUrl,
          engineId: id,
          workflowSource: id,
          raw,
          releaseLiveSocket: () => undefined,
        };
      } catch (error) {
        return {
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : `${label} queue failed.`,
          engineId: id,
          raw: {},
          releaseLiveSocket: () => undefined,
        };
      }
    },

    async fetchJobStatus(promptId: string): Promise<EngineStatusResult | null> {
      return fetchCloudStatusViaProxy(`/api/${id}/status`, promptId, host);
    },

    buildViewPath(
      engineUrl: string,
      image: EngineOutputImage,
      options?: EngineViewPathOptions
    ): string {
      return buildNamedCloudViewPath(id, engineUrl, image, options);
    },

    async uploadInputImage(input: EngineUploadInput) {
      const { compressImageForEngineUpload } = await import('@/lib/storage/browser-compress-image');
      const prepared = await compressImageForEngineUpload(input.file, {
        maxEdge: 2048,
        maxBytes: 3_500_000,
        quality: 0.9,
      });
      const formData = new FormData();
      formData.append('image', prepared, prepared.name);
      const response = await fetch(`/api/${id}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as {
        name?: string;
        subfolder?: string;
        type?: string;
        error?: string;
      };
      if (!response.ok || !data.name?.trim()) {
        throw new Error(data.error ?? `${label} image upload failed.`);
      }
      return {
        name: data.name.trim(),
        subfolder: data.subfolder?.trim() || undefined,
        type: data.type?.trim() || undefined,
      };
    },

    subscribeProgress(input: EngineSubscribeProgressInput) {
      return subscribeCloudProgress({
        statusPath: `/api/${id}/status`,
        fallbackHost: host,
        engineLabel: label,
        subscribe: input,
      });
    },

    async openProgressBeforeQueue(input) {
      return createNoopProgressSubscription(input.clientId);
    },
  };
}

export const openaiEngineAdapter = createCloudEngineAdapter('openai');
export const geminiEngineAdapter = createCloudEngineAdapter('gemini');
export const grokEngineAdapter = createCloudEngineAdapter('grok');
