import 'server-only';

import {
  DEFAULT_LUMA_I2V_MODEL,
  DEFAULT_LUMA_T2V_MODEL,
  LUMA_API_HOST,
} from './engine/capabilities';
import {
  encodeLumaPromptId,
  isAllowedLumaMediaUrl,
  isLumaGenerationId,
  lumaAspectRatioFromSize,
  lumaModelToSubfolder,
  lumaResolutionFromSize,
  lumaSubfolderToModel,
  lumaVideoDuration,
  mapLumaGenerationState,
  parseLumaPromptId,
  sanitizeLumaModelId,
  type LumaJobStatusName,
} from './luma-protocol';
import { inferVideoClipMode, resolveLumaVideoModel } from './video-clip-mode';

export type { LumaJobStatusName } from './luma-protocol';

const GENERATIONS_PATH = '/dream-machine/v1/generations';
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_CACHED_UPLOADS = 24;
const MAX_CACHED_OUTPUTS = 48;
const UPLOAD_TTL_MS = 30 * 60 * 1000;
const OUTPUT_TTL_MS = 6 * 60 * 60 * 1000;

export type LumaOutputImage = {
  filename: string;
  subfolder: string;
  type: string;
};

export type LumaQueueResult = {
  ok: boolean;
  status: number;
  promptId?: string;
  engineUrl?: string;
  error?: string;
  raw: Record<string, unknown>;
};

export type LumaJobStatus = {
  promptId: string;
  status: LumaJobStatusName;
  statusMessage?: string;
  engineUrl: string;
  images?: LumaOutputImage[];
  queuePosition?: number | null;
  progressValue?: number;
  progressMax?: number;
};

type BinaryRecord = {
  bytes: Buffer;
  mimeType: string;
  createdAt: number;
};

const uploads = new Map<string, BinaryRecord>();
const outputs = new Map<string, BinaryRecord>();
const jobKeys = new Map<string, { key: string; createdAt: number }>();

export function resolveLumaApiKey(requestKey?: string): string {
  const fromRequest = requestKey?.trim() ?? '';
  const fromEnv = process.env.LUMA_API_KEY?.trim() || '';
  const key = fromRequest || fromEnv;
  if (!key) {
    throw new Error(
      'Luma API key is required. Set LUMA_API_KEY on the server, or add a key in Settings → Inference engine.'
    );
  }
  return key;
}

function pruneMap<T extends { createdAt: number }>(
  map: Map<string, T>,
  ttlMs: number,
  maxSize: number
): void {
  const now = Date.now();
  for (const [key, value] of map) {
    if (now - value.createdAt > ttlMs) {
      map.delete(key);
    }
  }
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (typeof oldest !== 'string') {
      break;
    }
    map.delete(oldest);
  }
}

function outputCacheKey(subfolder: string, filename: string): string {
  return `${subfolder}/${filename}`;
}

export function storeLumaUpload(input: { bytes: Buffer; mimeType?: string }): {
  name: string;
  subfolder: string;
  type: string;
} {
  if (input.bytes.length === 0) {
    throw new Error('Image file is empty.');
  }
  if (input.bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error('Image must be 12MB or smaller.');
  }
  pruneMap(uploads, UPLOAD_TTL_MS, MAX_CACHED_UPLOADS);
  const ext =
    input.mimeType === 'image/jpeg' || input.mimeType === 'image/jpg'
      ? 'jpg'
      : input.mimeType === 'image/webp'
        ? 'webp'
        : 'png';
  const name = `luma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  uploads.set(name, {
    bytes: input.bytes,
    mimeType: input.mimeType?.startsWith('image/') ? input.mimeType : `image/${ext}`,
    createdAt: Date.now(),
  });
  return { name, subfolder: '', type: 'input' };
}

export function getLumaUpload(filename: string): BinaryRecord | null {
  pruneMap(uploads, UPLOAD_TTL_MS, MAX_CACHED_UPLOADS);
  const name = filename.trim();
  if (!name) {
    return null;
  }
  return uploads.get(name) ?? null;
}

export function getLumaOutput(subfolder: string, filename: string): BinaryRecord | null {
  pruneMap(outputs, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
  return outputs.get(outputCacheKey(subfolder, filename)) ?? null;
}

function putLumaOutput(subfolder: string, filename: string, bytes: Buffer, mimeType: string): void {
  pruneMap(outputs, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
  outputs.set(outputCacheKey(subfolder, filename), { bytes, mimeType, createdAt: Date.now() });
}

function lumaErrorMessage(raw: Record<string, unknown>, fallback: string): string {
  if (typeof raw.detail === 'string' && raw.detail.trim()) {
    return raw.detail.trim();
  }
  const error = raw.error;
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }
  if (typeof raw.message === 'string' && raw.message.trim()) {
    return raw.message.trim();
  }
  if (typeof raw.failure_reason === 'string' && raw.failure_reason.trim()) {
    return raw.failure_reason.trim();
  }
  return fallback;
}

async function lumaFetchJson(
  url: string,
  apiKey: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; raw: Record<string, unknown> }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(60_000),
  });
  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, raw };
}

function buildLumaReferenceUrl(requestOrigin: string | undefined, filename: string): string {
  const origin = requestOrigin?.trim().replace(/\/$/, '');
  if (!origin) {
    throw new Error(
      'Luma image-to-video needs a reachable studio URL to host the reference frame.'
    );
  }
  return `${origin}/api/luma/upload?filename=${encodeURIComponent(filename)}`;
}

function extractVideoUrl(raw: Record<string, unknown>): string | null {
  const assets = raw.assets;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) {
    return null;
  }
  const video = (assets as { video?: unknown }).video;
  return typeof video === 'string' && video.trim() ? video.trim() : null;
}

export async function queueLumaImage(input: {
  prompt: string;
  model?: string;
  img2imgModel?: string;
  i2vModel?: string;
  t2vModel?: string;
  clipMode?: 't2v' | 'i2v' | 'extend';
  tool?: string;
  durationSec?: number;
  requestOrigin?: string;
  apiKey?: string;
  width?: number;
  height?: number;
  imageFilename?: string;
}): Promise<LumaQueueResult> {
  let apiKey: string;
  try {
    apiKey = resolveLumaApiKey(input.apiKey);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Luma API key is required.',
      raw: {},
    };
  }

  const isVideo = input.tool === 'video';
  if (!isVideo) {
    return {
      ok: false,
      status: 400,
      error:
        'Luma only supports video generation (text-to-video / image-to-video). Use another engine for stills.',
      raw: {},
    };
  }

  const hasImage = Boolean(input.imageFilename?.trim());
  const clipMode = inferVideoClipMode({ clipMode: input.clipMode, hasInitImage: hasImage });
  const isI2v = clipMode === 'i2v';

  if (clipMode === 'extend') {
    return {
      ok: false,
      status: 400,
      error:
        'Luma does not support native clip extend here. Use Continue from last frame (image-to-video).',
      raw: {},
    };
  }
  if (isI2v && !hasImage) {
    return {
      ok: false,
      status: 400,
      error: 'Cloud image-to-video needs a first frame.',
      raw: {},
    };
  }

  let modelId: string;
  try {
    const videoModel = resolveLumaVideoModel({
      clipMode,
      i2vModel: input.i2vModel,
      t2vModel: input.t2vModel,
    });
    modelId = sanitizeLumaModelId(
      videoModel || (isI2v ? DEFAULT_LUMA_I2V_MODEL : DEFAULT_LUMA_T2V_MODEL),
      isI2v ? DEFAULT_LUMA_I2V_MODEL : DEFAULT_LUMA_T2V_MODEL
    );
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Invalid Luma model id.',
      raw: {},
    };
  }

  const width = Math.max(256, Math.min(2048, Math.round(input.width ?? 1024)));
  const height = Math.max(256, Math.min(2048, Math.round(input.height ?? 1024)));
  const body: Record<string, unknown> = {
    prompt: input.prompt.trim().slice(0, 2000),
    model: modelId,
    aspect_ratio: lumaAspectRatioFromSize(width, height),
    resolution: lumaResolutionFromSize(width, height),
    duration: lumaVideoDuration(input.durationSec),
  };

  if (isI2v) {
    try {
      body.keyframes = {
        frame0: {
          type: 'image',
          url: buildLumaReferenceUrl(input.requestOrigin, input.imageFilename!.trim()),
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: 400,
        error: error instanceof Error ? error.message : 'Reference image is missing.',
        raw: {},
      };
    }
  }

  try {
    const submitted = await lumaFetchJson(`${LUMA_API_HOST}${GENERATIONS_PATH}`, apiKey, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const generationId = (typeof submitted.raw.id === 'string' && submitted.raw.id.trim()) || '';
    if (!submitted.ok || !isLumaGenerationId(generationId)) {
      return {
        ok: false,
        status: submitted.status || 502,
        error: lumaErrorMessage(submitted.raw, `Luma queue returned HTTP ${submitted.status}.`),
        raw: submitted.raw,
        engineUrl: LUMA_API_HOST,
      };
    }
    const promptId = encodeLumaPromptId(modelId, generationId);
    pruneMap(jobKeys, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
    jobKeys.set(promptId, { key: apiKey, createdAt: Date.now() });
    return {
      ok: true,
      status: submitted.status,
      promptId,
      engineUrl: LUMA_API_HOST,
      raw: submitted.raw,
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'Luma queue request failed.',
      raw: {},
      engineUrl: LUMA_API_HOST,
    };
  }
}

async function downloadLumaMedia(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!isAllowedLumaMediaUrl(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        throw new Error('Luma returned a non-https media URL.');
      }
    } catch {
      throw new Error('Luma returned an invalid media URL.');
    }
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
    throw new Error(`Could not download Luma media (HTTP ${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('Luma media download was empty.');
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'video/mp4';
  return { bytes, mimeType };
}

export async function fetchLumaJobStatus(
  promptId: string,
  keyHint?: string
): Promise<LumaJobStatus | null> {
  const parsed = parseLumaPromptId(promptId);
  if (!parsed) {
    return {
      promptId,
      status: 'error',
      statusMessage: 'Invalid Luma job id.',
      engineUrl: LUMA_API_HOST,
    };
  }

  let apiKey: string;
  try {
    apiKey = resolveLumaApiKey(keyHint || jobKeys.get(promptId)?.key);
  } catch (error) {
    return {
      promptId,
      status: 'error',
      statusMessage: error instanceof Error ? error.message : 'Luma API key is required.',
      engineUrl: LUMA_API_HOST,
    };
  }

  try {
    const statusRes = await lumaFetchJson(
      `${LUMA_API_HOST}${GENERATIONS_PATH}/${parsed.generationId}`,
      apiKey
    );
    if (statusRes.status === 404) {
      return {
        promptId,
        status: 'error',
        statusMessage: lumaErrorMessage(statusRes.raw, 'Luma job not found.'),
        engineUrl: LUMA_API_HOST,
      };
    }
    if (!statusRes.ok) {
      return {
        promptId,
        status: 'error',
        statusMessage: lumaErrorMessage(
          statusRes.raw,
          `Luma status returned HTTP ${statusRes.status}.`
        ),
        engineUrl: LUMA_API_HOST,
      };
    }

    const mapped = mapLumaGenerationState(
      typeof statusRes.raw.state === 'string' ? statusRes.raw.state : undefined
    );
    if (mapped !== 'completed') {
      const failureReason =
        typeof statusRes.raw.failure_reason === 'string' ? statusRes.raw.failure_reason.trim() : '';
      return {
        promptId,
        status: mapped,
        statusMessage:
          mapped === 'running'
            ? 'Dreaming on Luma'
            : mapped === 'error'
              ? lumaErrorMessage(statusRes.raw, failureReason || 'Luma generation failed.')
              : 'Queued on Luma',
        engineUrl: LUMA_API_HOST,
        queuePosition: mapped === 'pending' ? 1 : mapped === 'running' ? 0 : null,
        progressValue: mapped === 'running' ? 1 : 0,
        progressMax: 2,
      };
    }

    const videoUrl = extractVideoUrl(statusRes.raw);
    if (!videoUrl) {
      return {
        promptId,
        status: 'error',
        statusMessage: 'Luma completed without a video URL.',
        engineUrl: LUMA_API_HOST,
      };
    }

    const downloaded = await downloadLumaMedia(videoUrl);
    const ext = downloaded.mimeType.includes('webm') ? 'webm' : 'mp4';
    const mimeType = downloaded.mimeType.startsWith('video/') ? downloaded.mimeType : 'video/mp4';
    const subfolder = lumaModelToSubfolder(parsed.modelId);
    const filename = `${parsed.generationId}.${ext}`;
    putLumaOutput(subfolder, filename, downloaded.bytes, mimeType);

    return {
      promptId,
      status: 'completed',
      statusMessage: 'Completed on Luma',
      engineUrl: LUMA_API_HOST,
      images: [{ filename, subfolder, type: 'output' }],
      queuePosition: null,
      progressValue: 2,
      progressMax: 2,
    };
  } catch (error) {
    return {
      promptId,
      status: 'error',
      statusMessage: error instanceof Error ? error.message : 'Luma status check failed.',
      engineUrl: LUMA_API_HOST,
    };
  }
}

export async function ensureLumaOutput(input: {
  promptId?: string;
  filename: string;
  subfolder: string;
  apiKey?: string;
}): Promise<BinaryRecord | null> {
  const cached = getLumaOutput(input.subfolder, input.filename);
  if (cached) {
    return cached;
  }
  const promptId =
    input.promptId?.trim() ||
    (() => {
      const modelId = lumaSubfolderToModel(input.subfolder);
      const generationId = input.filename.replace(/\.[a-z0-9]+$/i, '');
      return modelId && isLumaGenerationId(generationId)
        ? encodeLumaPromptId(modelId, generationId)
        : '';
    })();
  if (!promptId) {
    return null;
  }
  const status = await fetchLumaJobStatus(promptId, input.apiKey);
  if (status?.status !== 'completed') {
    return getLumaOutput(input.subfolder, input.filename);
  }
  return getLumaOutput(input.subfolder, input.filename);
}
