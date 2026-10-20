import 'server-only';

import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseEngineUploadRequest } from '@/lib/engine-upload-parse';
import {
  cloudEngineOption,
  cloudSettingsHref,
  defaultCloudImg2ImgModel,
  defaultCloudTxt2ImgModel,
} from '@/lib/engine/capabilities';
import {
  ensureLlmImageOutput,
  fetchLlmImageJobStatus,
  queueLlmImage,
  storeLlmEngineUpload,
  type LlmImageEngineId,
} from '@/lib/llm-image-client';
import {
  DEFAULT_GEMINI_VIDEO_MODEL,
  DEFAULT_GROK_EXTEND_MODEL,
  DEFAULT_GROK_VIDEO_MODEL,
  fetchCloudVideoJobStatus,
  isCloudVideoModelId,
  queueCloudVideo,
} from '@/lib/cloud-video-client';
import {
  contentTypeForViewBytes,
  isAnimatedImageBytes,
  isHtmlVideoContentType,
} from '@/lib/comfyui/outputs';
import { sanitizeComfyViewFilename, sanitizeComfyViewSubfolder } from '@/lib/url-safety';

type QueueBody = {
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  img2imgModel?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  grokApiKey?: string;
  clientId?: string;
  hasInputImage?: boolean;
  inputImageFilename?: string;
  tool?: string;
  clipMode?: 't2v' | 'i2v' | 'extend';
  videoUrl?: string;
  params?: {
    seed?: string | number;
    width?: string | number;
    height?: string | number;
    videoFrames?: string | number;
    videoFps?: string | number;
  };
};

function toNumber(value: string | number | undefined, fallback?: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function tokenFromBody(engineId: LlmImageEngineId, body: QueueBody): string | undefined {
  if (engineId === 'gemini') {
    return body.geminiApiKey;
  }
  if (engineId === 'grok') {
    return body.grokApiKey;
  }
  return body.openaiApiKey;
}

function cors(methods: string) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function parseThumbWidth(raw: string | null): number | null {
  if (!raw?.trim()) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.min(Math.floor(value), 2048);
}

export function llmImageQueueHandlers(engineId: LlmImageEngineId) {
  const option = cloudEngineOption(engineId)!;
  return {
    runtime: 'nodejs' as const,
    maxDuration: 120,
    GET() {
      return apiMethodNotAllowed(['POST'], `/api/${engineId}`);
    },
    async POST(request: Request) {
      try {
        const body = (await request.json()) as QueueBody;
        const prompt = body.prompt?.trim();
        if (!prompt) {
          return apiError('Prompt is required.', 400);
        }
        const params = body.params ?? {};
        const imageFilename =
          body.hasInputImage === true ? body.inputImageFilename?.trim() : undefined;
        const isVideo = body.tool?.trim() === 'video';
        if (isVideo && engineId === 'openai') {
          return apiError(
            'ChatGPT cannot queue clips. Sora is deprecated. Switch to Fal, Replicate, Grok, Gemini, Runway, or local WAN.',
            400
          );
        }
        const frames = toNumber(params.videoFrames);
        const fps = toNumber(params.videoFps, 16);
        const durationSec = frames && fps ? Math.max(1, Math.round(frames / Math.max(1, fps))) : 8;
        const clipMode =
          body.clipMode === 't2v' || body.clipMode === 'i2v' || body.clipMode === 'extend'
            ? body.clipMode
            : undefined;
        const result = isVideo
          ? await queueCloudVideo(engineId, {
              prompt,
              model: isCloudVideoModelId(body.model)
                ? body.model?.trim()
                : engineId === 'gemini'
                  ? DEFAULT_GEMINI_VIDEO_MODEL
                  : clipMode === 'extend'
                    ? DEFAULT_GROK_EXTEND_MODEL
                    : DEFAULT_GROK_VIDEO_MODEL,
              apiToken: tokenFromBody(engineId, body),
              imageFilename,
              videoUrl: body.videoUrl?.trim() || undefined,
              clipMode,
              width: toNumber(params.width, 1024),
              height: toNumber(params.height, 1024),
              durationSec,
              requestOrigin: new URL(request.url).origin,
            })
          : await queueLlmImage(engineId, {
              prompt,
              negativePrompt: body.negativePrompt?.trim() || undefined,
              model: body.model?.trim() || defaultCloudTxt2ImgModel(engineId),
              img2imgModel: body.img2imgModel?.trim() || defaultCloudImg2ImgModel(engineId),
              apiToken: tokenFromBody(engineId, body),
              width: toNumber(params.width, 1024),
              height: toNumber(params.height, 1024),
              imageFilename,
            });
        if (!result.ok || !result.promptId) {
          const missingKey = /api key is required/i.test(result.error ?? '');
          return apiError(
            result.error ?? `${option.shortLabel} queue failed.`,
            result.status || 502,
            {
              engineId,
              engineUrl: result.engineUrl,
              href: missingKey ? cloudSettingsHref() : undefined,
            }
          );
        }
        return apiJson({
          ok: true,
          promptId: result.promptId,
          clientId: body.clientId?.trim() || undefined,
          engineId,
          engineUrl: result.engineUrl,
          comfyUrl: result.engineUrl,
          workflowSource: engineId,
        });
      } catch (error) {
        return apiError(
          error instanceof Error ? error.message : `${option.shortLabel} queue failed.`,
          502
        );
      }
    },
    OPTIONS() {
      return cors('POST, OPTIONS');
    },
  };
}

export function llmImageStatusHandlers(engineId: LlmImageEngineId) {
  return {
    runtime: 'nodejs' as const,
    maxDuration: 60,
    async GET(request: Request) {
      const { searchParams } = new URL(request.url);
      const promptId = searchParams.get('promptId')?.trim();
      if (!promptId) {
        return apiError('promptId query parameter is required.', 400);
      }
      const videoStatus = await fetchCloudVideoJobStatus(engineId, promptId);
      const status = videoStatus ?? (await fetchLlmImageJobStatus(engineId, promptId));
      return apiJson({
        promptId: status.promptId,
        status: status.status,
        statusMessage: status.statusMessage,
        engineUrl: status.engineUrl,
        comfyUrl: status.engineUrl,
        engineId,
        images: status.images,
        progressValue: status.progressValue,
        progressMax: status.progressMax,
        queuePosition: status.queuePosition ?? null,
      });
    },
    POST() {
      return apiMethodNotAllowed(['GET'], `/api/${engineId}/status`);
    },
    OPTIONS() {
      return cors('GET, OPTIONS');
    },
  };
}

export function llmImageViewHandlers(engineId: LlmImageEngineId) {
  const option = cloudEngineOption(engineId)!;
  return {
    runtime: 'nodejs' as const,
    maxDuration: 60,
    async GET(request: Request) {
      const { searchParams } = new URL(request.url);
      let filename: string;
      let subfolder: string;
      try {
        filename = sanitizeComfyViewFilename(searchParams.get('filename') ?? '');
        subfolder = sanitizeComfyViewSubfolder(searchParams.get('subfolder') ?? '');
      } catch (error) {
        return apiError(error instanceof Error ? error.message : 'Invalid view parameters.', 400);
      }
      try {
        const file = await ensureLlmImageOutput({ engineId, filename, subfolder });
        if (!file) {
          return apiError(`${option.shortLabel} image is not available yet.`, 404);
        }
        const contentType = contentTypeForViewBytes(filename, file.mimeType, file.bytes);
        const isVideo = isHtmlVideoContentType(contentType);
        const thumbWidth = parseThumbWidth(searchParams.get('w'));
        if (thumbWidth && !isVideo && !isAnimatedImageBytes(filename, file.bytes)) {
          const sharp = (await import('sharp')).default;
          const resized = await sharp(file.bytes)
            .rotate()
            .resize({
              width: thumbWidth,
              height: thumbWidth,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .png()
            .toBuffer();
          const body = new Uint8Array(resized.byteLength);
          body.set(resized);
          return new NextResponse(body, {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'private, max-age=3600',
            },
          });
        }
        const body = new Uint8Array(file.bytes.byteLength);
        body.set(file.bytes);
        return new NextResponse(body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'private, max-age=3600',
            ...(isVideo ? { 'Accept-Ranges': 'bytes' } : {}),
          },
        });
      } catch (error) {
        return apiError(
          error instanceof Error ? error.message : `${option.shortLabel} view failed.`,
          502
        );
      }
    },
    POST() {
      return apiMethodNotAllowed(['GET'], `/api/${engineId}/view`);
    },
  };
}

export function llmImageUploadHandlers(engineId: LlmImageEngineId) {
  const option = cloudEngineOption(engineId)!;
  return {
    runtime: 'nodejs' as const,
    GET() {
      return apiMethodNotAllowed(['POST'], `/api/${engineId}/upload`);
    },
    async POST(request: Request) {
      try {
        const incoming = await parseEngineUploadRequest(request);
        const buffer = Buffer.from(await incoming.file.arrayBuffer());
        const stored = storeLlmEngineUpload(engineId, {
          bytes: buffer,
          mimeType: incoming.file.type || 'image/png',
        });
        return apiJson({
          name: stored.name,
          subfolder: stored.subfolder,
          type: stored.type,
          engineUrl: option.host,
          comfyUrl: option.host,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `${option.shortLabel} upload failed.`;
        const status = /required|empty|must be|too large|12mb|invalid/i.test(message) ? 400 : 502;
        return apiError(message, status);
      }
    },
    OPTIONS() {
      return cors('POST, OPTIONS');
    },
  };
}
