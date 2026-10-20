'use client';

import { postComfyUiPrompt } from '@/lib/comfyui/queue-request';
import { fetchComfyJobStatus } from '@/lib/gallery/comfyui-gallery-client';
import { buildComfyViewPath } from '@/lib/comfyui/outputs';
import { uploadComfyInputImage } from '@/lib/comfyui/image-upload';
import {
  openComfyPreviewSocketBeforeQueue,
  subscribeComfyUiWebSocket,
} from '@/lib/comfyui/websocket';
import type {
  EngineAdapter,
  EngineJobStatus,
  EngineOutputImage,
  EngineQueueResult,
  EngineStatusResult,
  EngineSubscribeProgressInput,
  EngineUploadInput,
  EngineViewPathOptions,
} from './types';

function normalizeJobStatus(status: string | undefined): EngineJobStatus {
  if (
    status === 'pending' ||
    status === 'running' ||
    status === 'completed' ||
    status === 'error'
  ) {
    return status;
  }
  return 'unknown';
}

/** ComfyUI implementation of EngineAdapter — thin wrappers, no behavior change. */
export const comfyEngineAdapter: EngineAdapter = {
  id: 'comfyui',

  async postPrompt(body: Record<string, unknown>): Promise<EngineQueueResult> {
    const result = await postComfyUiPrompt(body);
    return {
      ok: result.ok,
      promptId: result.promptId,
      clientId: result.clientId,
      engineUrl: result.comfyUrl,
      error: result.error,
      href: result.href,
      status: result.status,
      workflowSource: result.workflowSource,
      engineId: result.engineId ?? 'comfyui',
      family: result.family,
      raw: result.raw,
      releaseLiveSocket: result.releaseLiveSocket,
    };
  },

  async fetchJobStatus(promptId: string, engineUrl?: string): Promise<EngineStatusResult | null> {
    const result = await fetchComfyJobStatus(promptId, engineUrl);
    if (!result) {
      return null;
    }
    return {
      promptId,
      status: normalizeJobStatus(result.status),
      statusMessage: result.statusMessage,
      engineUrl: result.comfyUrl?.trim() || engineUrl?.trim() || '',
      images: result.images as EngineOutputImage[] | undefined,
      queuePosition: result.queuePosition,
      renderDurationMs: result.renderDurationMs,
      executionStartedAt: result.executionStartedAt,
    };
  },

  buildViewPath(
    engineUrl: string,
    image: EngineOutputImage,
    options?: EngineViewPathOptions
  ): string {
    return buildComfyViewPath(engineUrl, image, options);
  },

  async uploadInputImage(input: EngineUploadInput) {
    return uploadComfyInputImage({
      file: input.file,
      model: input.model,
      comfyUrl: input.engineUrl,
    });
  },

  subscribeProgress(input: EngineSubscribeProgressInput) {
    return subscribeComfyUiWebSocket({
      comfyUrl: input.engineUrl,
      promptId: input.promptId,
      clientId: input.clientId,
      onProgress: input.onProgress,
      onError: input.onError,
    });
  },

  openProgressBeforeQueue(input) {
    return openComfyPreviewSocketBeforeQueue({
      clientId: input.clientId,
      comfyUrl: input.engineUrl,
    });
  },
};
