import 'server-only';

import {
  DEFAULT_FAL_EXTEND_MODEL,
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_IMG2IMG_MODEL,
  DEFAULT_FAL_T2V_MODEL,
  DEFAULT_FAL_TXT2IMG_MODEL,
  FAL_QUEUE_HOST,
} from '../engine/capabilities';
import { extraCloudComposeFilenames, isFalMultiRefEditModel } from './cloud-compose-refs';
import {
  canFalExtendFromParentUrl,
  falExtendQueueFields,
  falVideoDurationPayload,
  inferVideoClipMode,
  resolveFalVideoModel,
} from '../video/clip-mode';
import {
  encodeFalPromptId,
  falModelToSubfolder,
  falSubfolderToModel,
  isAllowedFalMediaUrl,
  mapFalQueueStatus,
  parseFalPromptId,
  sanitizeFalModelId,
  isFalRequestId,
  type FalJobStatusName,
} from './fal-protocol';

export {
  encodeFalPromptId,
  falModelToSubfolder,
  falSubfolderToModel,
  isAllowedFalMediaUrl,
  mapFalQueueStatus,
  parseFalPromptId,
  sanitizeFalModelId,
};
export type { FalJobStatusName } from './fal-protocol';

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_FAL_CDN_BYTES = 90 * 1024 * 1024;
const FAL_STORAGE_HOST = 'https://rest.alpha.fal.ai';
const MAX_CACHED_UPLOADS = 24;
const MAX_CACHED_OUTPUTS = 48;
const UPLOAD_TTL_MS = 30 * 60 * 1000;
const OUTPUT_TTL_MS = 6 * 60 * 60 * 1000;

export type FalOutputImage = {
  filename: string;
  subfolder: string;
  type: string;
};

export type FalQueueResult = {
  ok: boolean;
  status: number;
  promptId?: string;
  engineUrl?: string;
  error?: string;
  raw: Record<string, unknown>;
};

export type FalJobStatus = {
  promptId: string;
  status: FalJobStatusName;
  statusMessage?: string;
  engineUrl: string;
  images?: FalOutputImage[];
  queuePosition?: number | null;
  progressValue?: number;
  progressMax?: number;
};

type FalUploadRecord = {
  bytes: Buffer;
  mimeType: string;
  createdAt: number;
};

type FalOutputRecord = {
  bytes: Buffer;
  mimeType: string;
  createdAt: number;
};

const uploads = new Map<string, FalUploadRecord>();
const outputs = new Map<string, FalOutputRecord>();
const jobKeys = new Map<string, { key: string; createdAt: number }>();

export function resolveFalApiKey(requestKey?: string): string {
  const fromRequest = requestKey?.trim() ?? '';
  const fromEnv = process.env.FAL_KEY?.trim() || process.env.FAL_API_KEY?.trim() || '';
  const key = fromRequest || fromEnv;
  if (!key) {
    throw new Error(
      'Fal API key is required. Set FAL_KEY on the server, or add a key in Settings → Inference engine.'
    );
  }
  return key;
}

function falAuthHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Key ${apiKey}`,
    Accept: 'application/json',
  };
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

export function storeFalUpload(input: { filename?: string; bytes: Buffer; mimeType?: string }): {
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
  const name = `fal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  uploads.set(name, {
    bytes: input.bytes,
    mimeType: input.mimeType?.startsWith('image/') ? input.mimeType : `image/${ext}`,
    createdAt: Date.now(),
  });
  return { name, subfolder: '', type: 'input' };
}

/** Documented Fal storage: initiate + PUT, then pass file_url as video_url. */
export async function uploadFalCdnFile(input: {
  bytes: Buffer;
  fileName: string;
  contentType: string;
  apiKey?: string;
}): Promise<{ ok: boolean; status: number; fileUrl?: string; error?: string }> {
  if (input.bytes.length === 0) {
    return { ok: false, status: 400, error: 'Clip file is empty.' };
  }
  if (input.bytes.length > MAX_FAL_CDN_BYTES) {
    return { ok: false, status: 400, error: 'Clip must be 90MB or smaller to upload to Fal.' };
  }
  let apiKey: string;
  try {
    apiKey = resolveFalApiKey(input.apiKey);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Fal API key is required.',
    };
  }
  const initiated = await falFetchJson(`${FAL_STORAGE_HOST}/storage/upload/initiate`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      content_type: input.contentType || 'video/mp4',
      file_name: input.fileName || 'clip.mp4',
    }),
  });
  const uploadUrl =
    (typeof initiated.raw.upload_url === 'string' && initiated.raw.upload_url.trim()) || '';
  const fileUrl =
    (typeof initiated.raw.file_url === 'string' && initiated.raw.file_url.trim()) || '';
  if (!initiated.ok || !uploadUrl || !fileUrl) {
    return {
      ok: false,
      status: initiated.status || 502,
      error: falErrorMessage(initiated.raw, 'Fal storage did not issue an upload URL.'),
    };
  }
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': input.contentType || 'application/octet-stream' },
    body: new Uint8Array(input.bytes),
    signal: AbortSignal.timeout(120_000),
  });
  if (!put.ok) {
    return {
      ok: false,
      status: put.status || 502,
      error: `Fal storage PUT failed (HTTP ${put.status}).`,
    };
  }
  if (!isAllowedFalMediaUrl(fileUrl)) {
    return {
      ok: false,
      status: 502,
      error: 'Fal storage returned a URL that is not a Fal media host.',
    };
  }
  return { ok: true, status: 200, fileUrl };
}

function uploadToDataUrl(name: string): string {
  const record = uploads.get(name);
  if (!record) {
    throw new Error('Reference image expired. Upload it again, then queue.');
  }
  return `data:${record.mimeType};base64,${record.bytes.toString('base64')}`;
}

export function getFalOutput(subfolder: string, filename: string): FalOutputRecord | null {
  pruneMap(outputs, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
  return outputs.get(outputCacheKey(subfolder, filename)) ?? null;
}

function putFalOutput(subfolder: string, filename: string, bytes: Buffer, mimeType: string): void {
  pruneMap(outputs, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
  outputs.set(outputCacheKey(subfolder, filename), {
    bytes,
    mimeType,
    createdAt: Date.now(),
  });
}

function extractImageUrls(raw: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const pushUrl = (value: unknown) => {
    if (typeof value === 'string' && value.startsWith('https://')) {
      urls.push(value);
      return;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const url = (value as { url?: unknown }).url;
      if (typeof url === 'string' && url.startsWith('https://')) {
        urls.push(url);
      }
    }
  };
  if (Array.isArray(raw.images)) {
    for (const item of raw.images) {
      pushUrl(item);
    }
  }
  pushUrl(raw.image);
  pushUrl(raw.video);
  if (Array.isArray(raw.videos)) {
    for (const item of raw.videos) {
      pushUrl(item);
    }
  }
  if (Array.isArray(raw.output)) {
    for (const item of raw.output) {
      pushUrl(item);
    }
  }
  return [...new Set(urls)];
}

function falErrorMessage(raw: Record<string, unknown>, fallback: string): string {
  const detail = raw.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }
  if (typeof raw.error === 'string' && raw.error.trim()) {
    return raw.error.trim();
  }
  if (typeof raw.message === 'string' && raw.message.trim()) {
    return raw.message.trim();
  }
  return fallback;
}

async function falFetchJson(
  url: string,
  apiKey: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; raw: Record<string, unknown> }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...falAuthHeaders(apiKey),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(45_000),
  });
  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, raw };
}

export async function queueFalImage(input: {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  img2imgModel?: string;
  i2vModel?: string;
  t2vModel?: string;
  extendModel?: string;
  clipMode?: 't2v' | 'i2v' | 'extend';
  tool?: string;
  durationSec?: number;
  videoUrl?: string;
  apiKey?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number | null;
  strength?: number;
  imageFilename?: string;
  imageFilenames?: string[];
}): Promise<FalQueueResult> {
  let apiKey: string;
  try {
    apiKey = resolveFalApiKey(input.apiKey);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Fal API key is required.',
      raw: {},
    };
  }

  const hasImage = Boolean(input.imageFilename?.trim());
  const isVideo = input.tool === 'video';
  const clipMode = isVideo
    ? inferVideoClipMode({ clipMode: input.clipMode, hasInitImage: hasImage })
    : undefined;
  const isI2v = clipMode === 'i2v';
  const isT2v = clipMode === 't2v';
  const isExtend = clipMode === 'extend';
  const parentVideoUrl = input.videoUrl?.trim() || '';
  if (isExtend && !canFalExtendFromParentUrl(parentVideoUrl)) {
    return {
      ok: false,
      status: 400,
      error: 'Cloud extend needs a public Fal clip URL.',
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
    const videoModel = isVideo
      ? resolveFalVideoModel({
          clipMode: clipMode ?? 't2v',
          i2vModel: input.i2vModel,
          t2vModel: input.t2vModel,
          extendModel: input.extendModel,
        })
      : undefined;
    modelId = sanitizeFalModelId(
      isVideo
        ? videoModel ||
            (isExtend
              ? DEFAULT_FAL_EXTEND_MODEL
              : isI2v
                ? DEFAULT_FAL_I2V_MODEL
                : DEFAULT_FAL_T2V_MODEL)
        : hasImage
          ? input.img2imgModel || DEFAULT_FAL_IMG2IMG_MODEL
          : input.model || DEFAULT_FAL_TXT2IMG_MODEL,
      isExtend
        ? DEFAULT_FAL_EXTEND_MODEL
        : isI2v
          ? DEFAULT_FAL_I2V_MODEL
          : isT2v
            ? DEFAULT_FAL_T2V_MODEL
            : hasImage
              ? DEFAULT_FAL_IMG2IMG_MODEL
              : DEFAULT_FAL_TXT2IMG_MODEL
    );
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Invalid Fal model id.',
      raw: {},
    };
  }

  const width = Math.max(256, Math.min(2048, Math.round((input.width ?? 1024) / 32) * 32));
  const height = Math.max(256, Math.min(2048, Math.round((input.height ?? 1024) / 32) * 32));
  const body: Record<string, unknown> = {
    prompt: input.prompt.trim(),
    enable_safety_checker: false,
    sync_mode: false,
  };
  if (!isI2v && !isT2v && !isExtend) {
    body.image_size = { width, height };
    body.num_images = 1;
  }
  if (
    typeof input.steps === 'number' &&
    Number.isFinite(input.steps) &&
    !isI2v &&
    !isT2v &&
    !isExtend
  ) {
    body.num_inference_steps = Math.max(1, Math.min(50, Math.trunc(input.steps)));
  }
  if (typeof input.cfg === 'number' && Number.isFinite(input.cfg) && input.cfg > 0) {
    body.guidance_scale = input.cfg;
  }
  if (typeof input.seed === 'number' && Number.isFinite(input.seed) && input.seed >= 0) {
    body.seed = Math.trunc(input.seed);
  }
  if (input.negativePrompt?.trim() && !/schnell/i.test(modelId)) {
    body.negative_prompt = input.negativePrompt.trim();
  }
  if (isExtend) {
    Object.assign(body, falExtendQueueFields(parentVideoUrl, input.durationSec));
  }
  if (hasImage && !isT2v && !isExtend) {
    try {
      const positional = input.imageFilenames?.length
        ? input.imageFilenames
        : [input.imageFilename ?? ''];
      const extraNames = extraCloudComposeFilenames(positional, 'fal', modelId);
      if (isFalMultiRefEditModel(modelId)) {
        body.image_urls = [input.imageFilename!.trim(), ...extraNames].map(name =>
          uploadToDataUrl(name)
        );
      } else {
        body.image_url = uploadToDataUrl(input.imageFilename!.trim());
      }
    } catch (error) {
      return {
        ok: false,
        status: 400,
        error: error instanceof Error ? error.message : 'Reference image is missing.',
        raw: {},
      };
    }
    if (!isI2v && typeof input.strength === 'number' && Number.isFinite(input.strength)) {
      body.strength = Math.min(1, Math.max(0.05, input.strength));
    }
  }
  if (isI2v || isT2v) {
    const seconds =
      typeof input.durationSec === 'number' && Number.isFinite(input.durationSec)
        ? input.durationSec
        : 5;
    body.duration = falVideoDurationPayload(modelId, seconds);
  }

  try {
    const submitted = await falFetchJson(`${FAL_QUEUE_HOST}/${modelId}`, apiKey, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const requestId =
      (typeof submitted.raw.request_id === 'string' && submitted.raw.request_id.trim()) ||
      (typeof submitted.raw.requestId === 'string' && submitted.raw.requestId.trim()) ||
      '';
    if (!submitted.ok || !isFalRequestId(requestId)) {
      return {
        ok: false,
        status: submitted.status || 502,
        error: falErrorMessage(submitted.raw, `Fal queue returned HTTP ${submitted.status}.`),
        raw: submitted.raw,
        engineUrl: FAL_QUEUE_HOST,
      };
    }
    const promptId = encodeFalPromptId(modelId, requestId);
    pruneMap(jobKeys, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
    jobKeys.set(promptId, { key: apiKey, createdAt: Date.now() });
    return {
      ok: true,
      status: submitted.status,
      promptId,
      engineUrl: FAL_QUEUE_HOST,
      raw: submitted.raw,
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'Fal queue request failed.',
      raw: {},
      engineUrl: FAL_QUEUE_HOST,
    };
  }
}

async function downloadFalImage(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!isAllowedFalMediaUrl(url)) {
    throw new Error('Fal returned an image URL that is not on fal.media.');
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`Could not download Fal image (HTTP ${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('Fal image download was empty.');
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { bytes, mimeType };
}

export async function fetchFalJobStatus(
  promptId: string,
  apiKeyHint?: string
): Promise<FalJobStatus | null> {
  const parsed = parseFalPromptId(promptId);
  if (!parsed) {
    return {
      promptId,
      status: 'error',
      statusMessage: 'Invalid Fal job id.',
      engineUrl: FAL_QUEUE_HOST,
    };
  }

  let apiKey: string;
  try {
    apiKey = resolveFalApiKey(apiKeyHint || jobKeys.get(promptId)?.key);
  } catch (error) {
    return {
      promptId,
      status: 'error',
      statusMessage: error instanceof Error ? error.message : 'Fal API key is required.',
      engineUrl: FAL_QUEUE_HOST,
    };
  }

  try {
    const statusUrl = `${FAL_QUEUE_HOST}/${parsed.modelId}/requests/${parsed.requestId}/status`;
    const statusRes = await falFetchJson(statusUrl, apiKey);
    if (statusRes.status === 404) {
      return {
        promptId,
        status: 'error',
        statusMessage: falErrorMessage(statusRes.raw, 'Fal job not found.'),
        engineUrl: FAL_QUEUE_HOST,
      };
    }
    if (!statusRes.ok) {
      return {
        promptId,
        status: 'error',
        statusMessage: falErrorMessage(
          statusRes.raw,
          `Fal status returned HTTP ${statusRes.status}.`
        ),
        engineUrl: FAL_QUEUE_HOST,
      };
    }

    const mapped = mapFalQueueStatus(
      typeof statusRes.raw.status === 'string' ? statusRes.raw.status : undefined
    );
    const queuePosition =
      typeof statusRes.raw.queue_position === 'number' ? statusRes.raw.queue_position : null;

    if (mapped !== 'completed') {
      return {
        promptId,
        status: mapped,
        statusMessage:
          mapped === 'running'
            ? 'Running on Fal'
            : mapped === 'error'
              ? falErrorMessage(statusRes.raw, 'Fal job failed.')
              : 'Queued on Fal',
        engineUrl: FAL_QUEUE_HOST,
        queuePosition: mapped === 'pending' ? queuePosition : mapped === 'running' ? 0 : null,
        progressValue: mapped === 'running' ? 1 : 0,
        progressMax: 2,
      };
    }

    const resultUrl = `${FAL_QUEUE_HOST}/${parsed.modelId}/requests/${parsed.requestId}`;
    const resultRes = await falFetchJson(resultUrl, apiKey);
    if (!resultRes.ok) {
      return {
        promptId,
        status: 'error',
        statusMessage: falErrorMessage(
          resultRes.raw,
          'Fal finished but the result could not be read.'
        ),
        engineUrl: FAL_QUEUE_HOST,
      };
    }

    const urls = extractImageUrls(resultRes.raw);
    if (urls.length === 0) {
      return {
        promptId,
        status: 'error',
        statusMessage: 'Fal completed without an image or video URL.',
        engineUrl: FAL_QUEUE_HOST,
      };
    }

    const subfolder = falModelToSubfolder(parsed.modelId);
    const images: FalOutputImage[] = [];
    for (const [index, url] of urls.entries()) {
      const downloaded = await downloadFalImage(url);
      const isVideo =
        downloaded.mimeType.startsWith('video/') || /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
      const ext = isVideo
        ? downloaded.mimeType.includes('webm')
          ? 'webm'
          : 'mp4'
        : downloaded.mimeType.includes('jpeg')
          ? 'jpg'
          : downloaded.mimeType.includes('webp')
            ? 'webp'
            : 'png';
      const mimeType = isVideo
        ? downloaded.mimeType.startsWith('video/')
          ? downloaded.mimeType
          : 'video/mp4'
        : downloaded.mimeType;
      const filename = `${parsed.requestId}${index === 0 ? '' : `-${index}`}.${ext}`;
      putFalOutput(subfolder, filename, downloaded.bytes, mimeType);
      images.push({ filename, subfolder, type: 'output' });
    }

    return {
      promptId,
      status: 'completed',
      statusMessage: 'Completed on Fal',
      engineUrl: FAL_QUEUE_HOST,
      images,
      queuePosition: null,
      progressValue: 2,
      progressMax: 2,
    };
  } catch (error) {
    return {
      promptId,
      status: 'error',
      statusMessage: error instanceof Error ? error.message : 'Fal status check failed.',
      engineUrl: FAL_QUEUE_HOST,
    };
  }
}

export async function ensureFalOutput(input: {
  promptId?: string;
  filename: string;
  subfolder: string;
  apiKey?: string;
}): Promise<FalOutputRecord | null> {
  const cached = getFalOutput(input.subfolder, input.filename);
  if (cached) {
    return cached;
  }
  const promptId =
    input.promptId?.trim() ||
    (() => {
      const modelId = falSubfolderToModel(input.subfolder);
      const requestId = input.filename.replace(/\.[a-z0-9]+$/i, '');
      return modelId ? encodeFalPromptId(modelId, requestId) : '';
    })();
  if (!promptId) {
    return null;
  }
  const status = await fetchFalJobStatus(promptId, input.apiKey);
  if (status?.status !== 'completed') {
    return getFalOutput(input.subfolder, input.filename);
  }
  return getFalOutput(input.subfolder, input.filename);
}
