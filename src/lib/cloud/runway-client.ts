import 'server-only';

import {
  DEFAULT_RUNWAY_EXTEND_MODEL,
  DEFAULT_RUNWAY_I2V_MODEL,
  DEFAULT_RUNWAY_IMG2IMG_MODEL,
  DEFAULT_RUNWAY_T2V_MODEL,
  DEFAULT_RUNWAY_TXT2IMG_MODEL,
  RUNWAY_API_HOST,
} from '../engine/capabilities';
import {
  encodeRunwayPromptId,
  isAllowedRunwayMediaUrl,
  isRunwayTaskId,
  mapRunwayTaskStatus,
  parseRunwayPromptId,
  runwayImageRatioFromSize,
  runwayModelToSubfolder,
  runwaySubfolderToModel,
  runwayVideoDurationSec,
  runwayVideoRatioFromSize,
  sanitizeRunwayModelId,
  type RunwayJobStatusName,
} from './runway-protocol';
import { inferVideoClipMode, resolveRunwayVideoModel } from '../video/clip-mode';

export type { RunwayJobStatusName } from './runway-protocol';

const RUNWAY_API_VERSION = '2024-11-06';
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_EXTEND_BYTES = 48 * 1024 * 1024;
const MAX_CACHED_UPLOADS = 24;
const MAX_CACHED_OUTPUTS = 48;
const UPLOAD_TTL_MS = 30 * 60 * 1000;
const OUTPUT_TTL_MS = 6 * 60 * 60 * 1000;

export type RunwayOutputImage = {
  filename: string;
  subfolder: string;
  type: string;
};

export type RunwayQueueResult = {
  ok: boolean;
  status: number;
  promptId?: string;
  engineUrl?: string;
  error?: string;
  raw: Record<string, unknown>;
};

export type RunwayJobStatus = {
  promptId: string;
  status: RunwayJobStatusName;
  statusMessage?: string;
  engineUrl: string;
  images?: RunwayOutputImage[];
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

export function resolveRunwayApiKey(requestKey?: string): string {
  const fromRequest = requestKey?.trim() ?? '';
  const fromEnv =
    process.env.RUNWAY_API_KEY?.trim() || process.env.RUNWAYML_API_SECRET?.trim() || '';
  const key = fromRequest || fromEnv;
  if (!key) {
    throw new Error(
      'Runway API key is required. Set RUNWAY_API_KEY on the server, or add a key in Settings → Inference engine.'
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

export function storeRunwayUpload(input: { bytes: Buffer; mimeType?: string }): {
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
  const name = `runway-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  uploads.set(name, {
    bytes: input.bytes,
    mimeType: input.mimeType?.startsWith('image/') ? input.mimeType : `image/${ext}`,
    createdAt: Date.now(),
  });
  return { name, subfolder: '', type: 'input' };
}

function uploadToDataUrl(name: string): string {
  const record = uploads.get(name);
  if (!record) {
    throw new Error('Reference image expired. Upload it again, then queue.');
  }
  return `data:${record.mimeType};base64,${record.bytes.toString('base64')}`;
}

export function getRunwayOutput(subfolder: string, filename: string): BinaryRecord | null {
  pruneMap(outputs, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
  return outputs.get(outputCacheKey(subfolder, filename)) ?? null;
}

function putRunwayOutput(
  subfolder: string,
  filename: string,
  bytes: Buffer,
  mimeType: string
): void {
  pruneMap(outputs, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
  outputs.set(outputCacheKey(subfolder, filename), { bytes, mimeType, createdAt: Date.now() });
}

function runwayErrorMessage(raw: Record<string, unknown>, fallback: string): string {
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
  if (typeof raw.failure === 'string' && raw.failure.trim()) {
    return raw.failure.trim();
  }
  if (typeof raw.failureCode === 'string' && raw.failureCode.trim()) {
    return raw.failureCode.trim();
  }
  return fallback;
}

async function runwayFetchJson(
  url: string,
  apiKey: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; raw: Record<string, unknown> }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Runway-Version': RUNWAY_API_VERSION,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(60_000),
  });
  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, raw };
}

/** Resolve parent clip to https or data URI Runway accepts for video_to_video. */
async function resolveRunwayVideoUri(
  videoUrl: string,
  requestOrigin?: string
): Promise<{ uri: string } | { error: string }> {
  const trimmed = videoUrl.trim();
  if (!trimmed) {
    return { error: 'Runway extend needs a parent clip URL.' };
  }
  if (/^data:video\//i.test(trimmed) || /^runway:\/\//i.test(trimmed)) {
    return { uri: trimmed };
  }
  if (/^https:\/\//i.test(trimmed)) {
    return { uri: trimmed };
  }

  let fetchUrl = trimmed;
  if (trimmed.startsWith('/') && requestOrigin?.trim()) {
    fetchUrl = `${requestOrigin.replace(/\/$/, '')}${trimmed}`;
  } else if (!/^https?:\/\//i.test(trimmed) && requestOrigin?.trim()) {
    fetchUrl = `${requestOrigin.replace(/\/$/, '')}/${trimmed.replace(/^\//, '')}`;
  } else if (/^http:\/\//i.test(trimmed)) {
    fetchUrl = trimmed;
  } else {
    return { error: 'Runway extend needs an https or studio-proxied parent clip URL.' };
  }

  try {
    const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) {
      return { error: `Could not read parent clip for Runway extend (HTTP ${response.status}).` };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      return { error: 'Parent clip for Runway extend was empty.' };
    }
    if (bytes.length > MAX_EXTEND_BYTES) {
      return { error: 'Parent clip is too large for Runway extend (48MB max).' };
    }
    const mime =
      response.headers.get('content-type')?.split(';')[0]?.trim() ||
      (/\.webm(\?|$)/i.test(trimmed) ? 'video/webm' : 'video/mp4');
    return { uri: `data:${mime};base64,${bytes.toString('base64')}` };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Could not read parent clip for Runway extend.',
    };
  }
}

function extractOutputUrls(raw: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
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
  if (Array.isArray(raw.output)) {
    for (const item of raw.output) {
      push(item);
    }
  } else {
    push(raw.output);
  }
  return [...new Set(urls)];
}

export async function queueRunwayImage(input: {
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
  requestOrigin?: string;
  apiKey?: string;
  width?: number;
  height?: number;
  seed?: number | null;
  imageFilename?: string;
}): Promise<RunwayQueueResult> {
  let apiKey: string;
  try {
    apiKey = resolveRunwayApiKey(input.apiKey);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Runway API key is required.',
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

  if (isI2v && !hasImage) {
    return {
      ok: false,
      status: 400,
      error: 'Cloud image-to-video needs a first frame.',
      raw: {},
    };
  }
  if (isExtend && !input.videoUrl?.trim()) {
    return {
      ok: false,
      status: 400,
      error: 'Runway extend needs a parent clip URL (video-to-video).',
      raw: {},
    };
  }

  let modelId: string;
  try {
    const videoModel = isVideo
      ? resolveRunwayVideoModel({
          clipMode: clipMode ?? 't2v',
          i2vModel: input.i2vModel,
          t2vModel: input.t2vModel,
          extendModel: input.extendModel,
        })
      : undefined;
    modelId = sanitizeRunwayModelId(
      isVideo
        ? videoModel ||
            (isExtend
              ? DEFAULT_RUNWAY_EXTEND_MODEL
              : isI2v
                ? DEFAULT_RUNWAY_I2V_MODEL
                : DEFAULT_RUNWAY_T2V_MODEL)
        : hasImage
          ? input.img2imgModel || DEFAULT_RUNWAY_IMG2IMG_MODEL
          : input.model || DEFAULT_RUNWAY_TXT2IMG_MODEL,
      isExtend
        ? DEFAULT_RUNWAY_EXTEND_MODEL
        : isI2v
          ? DEFAULT_RUNWAY_I2V_MODEL
          : isT2v
            ? DEFAULT_RUNWAY_T2V_MODEL
            : hasImage
              ? DEFAULT_RUNWAY_IMG2IMG_MODEL
              : DEFAULT_RUNWAY_TXT2IMG_MODEL
    );
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Invalid Runway model id.',
      raw: {},
    };
  }

  const width = Math.max(256, Math.min(2048, Math.round(input.width ?? 1024)));
  const height = Math.max(256, Math.min(2048, Math.round(input.height ?? 1024)));
  const duration = runwayVideoDurationSec(input.durationSec);
  const body: Record<string, unknown> = {
    model: modelId,
    promptText: input.prompt.trim().slice(0, 1000),
  };

  if (typeof input.seed === 'number' && Number.isFinite(input.seed) && input.seed >= 0) {
    body.seed = Math.trunc(input.seed);
  }

  if (isExtend) {
    const resolved = await resolveRunwayVideoUri(input.videoUrl!.trim(), input.requestOrigin);
    if ('error' in resolved) {
      return { ok: false, status: 400, error: resolved.error, raw: {} };
    }
    body.videoUri = resolved.uri;
    body.ratio = runwayVideoRatioFromSize(width, height);
  } else if (isI2v || isT2v) {
    body.ratio = isT2v
      ? width >= height
        ? '1280:720'
        : '720:1280'
      : runwayVideoRatioFromSize(width, height);
    body.duration = duration;
    if (isI2v) {
      try {
        body.promptImage = uploadToDataUrl(input.imageFilename!.trim());
      } catch (error) {
        return {
          ok: false,
          status: 400,
          error: error instanceof Error ? error.message : 'Reference image is missing.',
          raw: {},
        };
      }
    }
  } else {
    body.ratio = runwayImageRatioFromSize(width, height);
    if (hasImage) {
      try {
        body.referenceImages = [{ uri: uploadToDataUrl(input.imageFilename!.trim()) }];
      } catch (error) {
        return {
          ok: false,
          status: 400,
          error: error instanceof Error ? error.message : 'Reference image is missing.',
          raw: {},
        };
      }
    }
  }

  const endpoint = isExtend
    ? `${RUNWAY_API_HOST}/v1/video_to_video`
    : isI2v
      ? `${RUNWAY_API_HOST}/v1/image_to_video`
      : isT2v
        ? `${RUNWAY_API_HOST}/v1/text_to_video`
        : `${RUNWAY_API_HOST}/v1/text_to_image`;

  try {
    const submitted = await runwayFetchJson(endpoint, apiKey, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const taskId = (typeof submitted.raw.id === 'string' && submitted.raw.id.trim()) || '';
    if (!submitted.ok || !isRunwayTaskId(taskId)) {
      return {
        ok: false,
        status: submitted.status || 502,
        error: runwayErrorMessage(submitted.raw, `Runway queue returned HTTP ${submitted.status}.`),
        raw: submitted.raw,
        engineUrl: RUNWAY_API_HOST,
      };
    }
    const promptId = encodeRunwayPromptId(modelId, taskId);
    pruneMap(jobKeys, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
    jobKeys.set(promptId, { key: apiKey, createdAt: Date.now() });
    return {
      ok: true,
      status: submitted.status,
      promptId,
      engineUrl: RUNWAY_API_HOST,
      raw: submitted.raw,
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'Runway queue request failed.',
      raw: {},
      engineUrl: RUNWAY_API_HOST,
    };
  }
}

async function downloadRunwayMedia(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!isAllowedRunwayMediaUrl(url)) {
    // Allow any https CDN Runway returns; host allowlist is best-effort.
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        throw new Error('Runway returned a non-https media URL.');
      }
    } catch {
      throw new Error('Runway returned an invalid media URL.');
    }
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
    throw new Error(`Could not download Runway media (HTTP ${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('Runway media download was empty.');
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { bytes, mimeType };
}

export async function fetchRunwayJobStatus(
  promptId: string,
  keyHint?: string
): Promise<RunwayJobStatus | null> {
  const parsed = parseRunwayPromptId(promptId);
  if (!parsed) {
    return {
      promptId,
      status: 'error',
      statusMessage: 'Invalid Runway job id.',
      engineUrl: RUNWAY_API_HOST,
    };
  }

  let apiKey: string;
  try {
    apiKey = resolveRunwayApiKey(keyHint || jobKeys.get(promptId)?.key);
  } catch (error) {
    return {
      promptId,
      status: 'error',
      statusMessage: error instanceof Error ? error.message : 'Runway API key is required.',
      engineUrl: RUNWAY_API_HOST,
    };
  }

  try {
    const statusRes = await runwayFetchJson(`${RUNWAY_API_HOST}/v1/tasks/${parsed.taskId}`, apiKey);
    if (statusRes.status === 404) {
      return {
        promptId,
        status: 'error',
        statusMessage: runwayErrorMessage(statusRes.raw, 'Runway job not found.'),
        engineUrl: RUNWAY_API_HOST,
      };
    }
    if (!statusRes.ok) {
      return {
        promptId,
        status: 'error',
        statusMessage: runwayErrorMessage(
          statusRes.raw,
          `Runway status returned HTTP ${statusRes.status}.`
        ),
        engineUrl: RUNWAY_API_HOST,
      };
    }

    const mapped = mapRunwayTaskStatus(
      typeof statusRes.raw.status === 'string' ? statusRes.raw.status : undefined
    );
    if (mapped !== 'completed') {
      return {
        promptId,
        status: mapped,
        statusMessage:
          mapped === 'running'
            ? 'Running on Runway'
            : mapped === 'error'
              ? runwayErrorMessage(statusRes.raw, 'Runway job failed.')
              : 'Queued on Runway',
        engineUrl: RUNWAY_API_HOST,
        queuePosition: mapped === 'pending' ? 1 : mapped === 'running' ? 0 : null,
        progressValue: mapped === 'running' ? 1 : 0,
        progressMax: 2,
      };
    }

    const urls = extractOutputUrls(statusRes.raw);
    if (urls.length === 0) {
      return {
        promptId,
        status: 'error',
        statusMessage: 'Runway completed without an image or video URL.',
        engineUrl: RUNWAY_API_HOST,
      };
    }

    const subfolder = runwayModelToSubfolder(parsed.modelId);
    const images: RunwayOutputImage[] = [];
    for (const [index, url] of urls.entries()) {
      const downloaded = await downloadRunwayMedia(url);
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
      const filename = `${parsed.taskId}${index === 0 ? '' : `-${index}`}.${ext}`;
      putRunwayOutput(subfolder, filename, downloaded.bytes, mimeType);
      images.push({ filename, subfolder, type: 'output' });
    }

    return {
      promptId,
      status: 'completed',
      statusMessage: 'Completed on Runway',
      engineUrl: RUNWAY_API_HOST,
      images,
      queuePosition: null,
      progressValue: 2,
      progressMax: 2,
    };
  } catch (error) {
    return {
      promptId,
      status: 'error',
      statusMessage: error instanceof Error ? error.message : 'Runway status check failed.',
      engineUrl: RUNWAY_API_HOST,
    };
  }
}

export async function ensureRunwayOutput(input: {
  promptId?: string;
  filename: string;
  subfolder: string;
  apiKey?: string;
}): Promise<BinaryRecord | null> {
  const cached = getRunwayOutput(input.subfolder, input.filename);
  if (cached) {
    return cached;
  }
  const promptId =
    input.promptId?.trim() ||
    (() => {
      const modelId = runwaySubfolderToModel(input.subfolder);
      const taskId = input.filename.replace(/\.[a-z0-9]+$/i, '');
      return modelId && isRunwayTaskId(taskId) ? encodeRunwayPromptId(modelId, taskId) : '';
    })();
  if (!promptId) {
    return null;
  }
  const status = await fetchRunwayJobStatus(promptId, input.apiKey);
  if (status?.status !== 'completed') {
    return getRunwayOutput(input.subfolder, input.filename);
  }
  return getRunwayOutput(input.subfolder, input.filename);
}
