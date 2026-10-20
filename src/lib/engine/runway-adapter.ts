'use client';

import { loadEngineSettings } from '@/lib/engine/settings';
import { loadSettingsCache } from '@/lib/settings/cache';
import { createComfyUiClientId } from '@/lib/comfyui/websocket';
import { RUNWAY_API_HOST, cloudSettingsHref } from './capabilities';
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

function sessionRunwayApiKey(): string | undefined {
  const key = loadSettingsCache().shared.sessionRunwayApiKey?.trim();
  return key || undefined;
}

/** Runway cloud adapter: Gen-4 stills + Gen-4.5 / Aleph clips via `/api/runway`. */
export const runwayEngineAdapter: EngineAdapter = {
  id: 'runway',

  async postPrompt(body: Record<string, unknown>): Promise<EngineQueueResult> {
    const settings = loadEngineSettings();
    const clientId =
      (typeof body.clientId === 'string' && body.clientId.trim()) || createComfyUiClientId();
    const runwayApiKey =
      (typeof body.runwayApiKey === 'string' && body.runwayApiKey.trim()) || sessionRunwayApiKey();
    const params =
      body.params && typeof body.params === 'object' && !Array.isArray(body.params)
        ? (body.params as Record<string, unknown>)
        : {};

    const payload = {
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      model: typeof body.model === 'string' ? body.model : settings.runwayModel,
      img2imgModel: settings.runwayImg2ImgModel,
      i2vModel:
        (typeof body.i2vModel === 'string' && body.i2vModel.trim()) || settings.runwayI2vModel,
      t2vModel:
        (typeof body.t2vModel === 'string' && body.t2vModel.trim()) || settings.runwayT2vModel,
      extendModel:
        (typeof body.extendModel === 'string' && body.extendModel.trim()) ||
        settings.runwayExtendModel,
      tool: typeof body.tool === 'string' ? body.tool : undefined,
      clipMode:
        body.clipMode === 't2v' || body.clipMode === 'i2v' || body.clipMode === 'extend'
          ? body.clipMode
          : undefined,
      videoUrl:
        typeof body.videoUrl === 'string' && body.videoUrl.trim()
          ? body.videoUrl.trim()
          : undefined,
      runwayApiKey,
      clientId,
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
      const response = await fetch('/api/runway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const promptId = typeof raw.promptId === 'string' ? raw.promptId.trim() : undefined;
      const engineUrl =
        (typeof raw.engineUrl === 'string' && raw.engineUrl.trim()) || RUNWAY_API_HOST;

      if (!response.ok || !promptId) {
        return {
          ok: false,
          status: response.status,
          error: typeof raw.error === 'string' ? raw.error : 'Runway queue failed.',
          href: typeof raw.href === 'string' ? raw.href : cloudSettingsHref(),
          engineUrl,
          engineId: 'runway',
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
        engineId: 'runway',
        workflowSource: 'runway',
        raw,
        releaseLiveSocket: () => undefined,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Runway queue failed.',
        engineId: 'runway',
        raw: {},
        releaseLiveSocket: () => undefined,
      };
    }
  },

  async fetchJobStatus(promptId: string): Promise<EngineStatusResult | null> {
    return fetchCloudStatusViaProxy('/api/runway/status', promptId, RUNWAY_API_HOST);
  },

  buildViewPath(
    engineUrl: string,
    image: EngineOutputImage,
    options?: EngineViewPathOptions
  ): string {
    return buildNamedCloudViewPath('runway', engineUrl, image, options);
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
    const response = await fetch('/api/runway/upload', {
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
      throw new Error(data.error ?? 'Runway image upload failed.');
    }
    return {
      name: data.name.trim(),
      subfolder: data.subfolder?.trim() || undefined,
      type: data.type?.trim() || undefined,
    };
  },

  subscribeProgress(input: EngineSubscribeProgressInput) {
    return subscribeCloudProgress({
      statusPath: '/api/runway/status',
      fallbackHost: RUNWAY_API_HOST,
      engineLabel: 'Runway',
      subscribe: input,
    });
  },

  async openProgressBeforeQueue(input) {
    return createNoopProgressSubscription(input.clientId);
  },
};
