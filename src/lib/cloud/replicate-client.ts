import 'server-only';

import {
  DEFAULT_REPLICATE_I2V_MODEL,
  DEFAULT_REPLICATE_IMG2IMG_MODEL,
  DEFAULT_REPLICATE_T2V_MODEL,
  DEFAULT_REPLICATE_TXT2IMG_MODEL,
  REPLICATE_API_HOST,
} from '../engine/capabilities';
import { extraCloudComposeFilenames, isReplicateMultiRefEditModel } from './cloud-compose-refs';
import {
  inferVideoClipMode,
  replicateVideoDurationPayload,
  resolveReplicateVideoModel,
} from '../video/clip-mode';
import {
  aspectRatioFromSize,
  encodeReplicatePromptId,
  isAllowedReplicateMediaUrl,
  isReplicatePredictionId,
  mapReplicateStatus,
  parseReplicatePromptId,
  replicateModelToSubfolder,
  replicateSubfolderToModel,
  sanitizeReplicateModelId,
  type ReplicateJobStatusName,
} from './replicate-protocol';

export type { ReplicateJobStatusName } from './replicate-protocol';

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_CACHED_UPLOADS = 24;
const MAX_CACHED_OUTPUTS = 48;
const UPLOAD_TTL_MS = 30 * 60 * 1000;
const OUTPUT_TTL_MS = 6 * 60 * 60 * 1000;

export type ReplicateOutputImage = {
  filename: string;
  subfolder: string;
  type: string;
};

export type ReplicateQueueResult = {
  ok: boolean;
  status: number;
  promptId?: string;
  engineUrl?: string;
  error?: string;
  raw: Record<string, unknown>;
};

export type ReplicateJobStatus = {
  promptId: string;
  status: ReplicateJobStatusName;
  statusMessage?: string;
  engineUrl: string;
  images?: ReplicateOutputImage[];
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

export function resolveReplicateApiToken(requestToken?: string): string {
  const fromRequest = requestToken?.trim() ?? '';
  const fromEnv =
    process.env.REPLICATE_API_TOKEN?.trim() || process.env.REPLICATE_API_KEY?.trim() || '';
  const token = fromRequest || fromEnv;
  if (!token) {
    throw new Error(
      'Replicate API token is required. Set REPLICATE_API_TOKEN on the server, or add a token in Settings → Inference engine.'
    );
  }
  return token;
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

export function storeReplicateUpload(input: { bytes: Buffer; mimeType?: string }): {
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
  const name = `replicate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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

export function getReplicateOutput(subfolder: string, filename: string): BinaryRecord | null {
  pruneMap(outputs, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
  return outputs.get(outputCacheKey(subfolder, filename)) ?? null;
}

function putReplicateOutput(
  subfolder: string,
  filename: string,
  bytes: Buffer,
  mimeType: string
): void {
  pruneMap(outputs, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
  outputs.set(outputCacheKey(subfolder, filename), { bytes, mimeType, createdAt: Date.now() });
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
  if (Array.isArray(raw.output)) {
    for (const item of raw.output) {
      pushUrl(item);
    }
  } else {
    pushUrl(raw.output);
  }
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
  return [...new Set(urls)];
}

function replicateErrorMessage(raw: Record<string, unknown>, fallback: string): string {
  const detail = raw.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }
  if (Array.isArray(detail) && typeof detail[0] === 'object' && detail[0]) {
    const first = detail[0] as { msg?: unknown };
    if (typeof first.msg === 'string' && first.msg.trim()) {
      return first.msg.trim();
    }
  }
  if (typeof raw.error === 'string' && raw.error.trim()) {
    return raw.error.trim();
  }
  if (typeof raw.title === 'string' && raw.title.trim()) {
    return raw.title.trim();
  }
  return fallback;
}

async function replicateFetchJson(
  url: string,
  token: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; raw: Record<string, unknown> }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(45_000),
  });
  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, raw };
}

export async function queueReplicateImage(input: {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  img2imgModel?: string;
  i2vModel?: string;
  t2vModel?: string;
  clipMode?: 't2v' | 'i2v' | 'extend';
  tool?: string;
  durationSec?: number;
  apiToken?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number | null;
  strength?: number;
  imageFilename?: string;
  imageFilenames?: string[];
}): Promise<ReplicateQueueResult> {
  let token: string;
  try {
    token = resolveReplicateApiToken(input.apiToken);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Replicate API token is required.',
      raw: {},
    };
  }

  const hasImage = Boolean(input.imageFilename?.trim());
  const isVideo = input.tool === 'video';
  const clipMode = isVideo
    ? inferVideoClipMode({ clipMode: input.clipMode, hasInitImage: hasImage })
    : undefined;
  // Replicate has no documented extend/V2V for our presets — extend = last-frame I2V.
  const isI2v = clipMode === 'i2v' || clipMode === 'extend';
  const isT2v = clipMode === 't2v';
  if (isI2v && !hasImage) {
    return {
      ok: false,
      status: 400,
      error:
        clipMode === 'extend'
          ? 'Replicate continue uses last-frame I2V — need a first frame from the parent clip.'
          : 'Cloud image-to-video needs a first frame.',
      raw: {},
    };
  }
  let modelId: string;
  try {
    const videoModel = isVideo
      ? resolveReplicateVideoModel({
          clipMode: clipMode ?? 't2v',
          i2vModel: input.i2vModel,
          t2vModel: input.t2vModel,
        })
      : undefined;
    modelId = sanitizeReplicateModelId(
      isVideo
        ? videoModel || (isI2v ? DEFAULT_REPLICATE_I2V_MODEL : DEFAULT_REPLICATE_T2V_MODEL)
        : hasImage
          ? input.img2imgModel || DEFAULT_REPLICATE_IMG2IMG_MODEL
          : input.model || DEFAULT_REPLICATE_TXT2IMG_MODEL,
      isI2v
        ? DEFAULT_REPLICATE_I2V_MODEL
        : isT2v
          ? DEFAULT_REPLICATE_T2V_MODEL
          : hasImage
            ? DEFAULT_REPLICATE_IMG2IMG_MODEL
            : DEFAULT_REPLICATE_TXT2IMG_MODEL
    );
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Invalid Replicate model id.',
      raw: {},
    };
  }

  const width = Math.max(256, Math.min(2048, Math.round((input.width ?? 1024) / 32) * 32));
  const height = Math.max(256, Math.min(2048, Math.round((input.height ?? 1024) / 32) * 32));
  const replicateInput: Record<string, unknown> = {
    prompt: input.prompt.trim(),
    aspect_ratio: aspectRatioFromSize(width, height),
  };
  if (!isI2v && !isT2v) {
    replicateInput.output_format = 'png';
    replicateInput.num_outputs = 1;
  }
  if (typeof input.steps === 'number' && Number.isFinite(input.steps) && !isI2v && !isT2v) {
    replicateInput.num_inference_steps = Math.max(1, Math.min(50, Math.trunc(input.steps)));
  }
  if (typeof input.cfg === 'number' && Number.isFinite(input.cfg) && input.cfg > 0) {
    replicateInput.guidance = input.cfg;
    replicateInput.guidance_scale = input.cfg;
  }
  if (typeof input.seed === 'number' && Number.isFinite(input.seed) && input.seed >= 0) {
    replicateInput.seed = Math.trunc(input.seed);
  }
  if (input.negativePrompt?.trim() && !/schnell/i.test(modelId)) {
    replicateInput.negative_prompt = input.negativePrompt.trim();
  }
  if (isI2v || isT2v) {
    if (/kling/i.test(modelId) || /ltx/i.test(modelId)) {
      replicateInput.duration = replicateVideoDurationPayload(modelId, input.durationSec);
    }
  }
  if (hasImage && !isT2v) {
    try {
      const positional = input.imageFilenames?.length
        ? input.imageFilenames
        : [input.imageFilename ?? ''];
      if (isReplicateMultiRefEditModel(modelId)) {
        const primary = input.imageFilename!.trim();
        const extras = extraCloudComposeFilenames(positional, 'replicate', modelId);
        const ordered = [primary, ...extras].filter(Boolean).slice(0, 2);
        if (ordered.length < 2) {
          return {
            ok: false,
            status: 400,
            error:
              'Replicate multi-image Kontext needs two reference images (input_image_1 + input_image_2).',
            raw: {},
          };
        }
        replicateInput.input_image_1 = uploadToDataUrl(ordered[0]!);
        replicateInput.input_image_2 = uploadToDataUrl(ordered[1]!);
      } else {
        const dataUrl = uploadToDataUrl(input.imageFilename!.trim());
        if (isI2v && /kling/i.test(modelId)) {
          replicateInput.start_image = dataUrl;
        } else {
          replicateInput.image = dataUrl;
          replicateInput.input_image = dataUrl;
        }
      }
    } catch (error) {
      return {
        ok: false,
        status: 400,
        error: error instanceof Error ? error.message : 'Reference image is missing.',
        raw: {},
      };
    }
    if (
      !isI2v &&
      !isReplicateMultiRefEditModel(modelId) &&
      typeof input.strength === 'number' &&
      Number.isFinite(input.strength)
    ) {
      const strength = Math.min(1, Math.max(0.05, input.strength));
      replicateInput.prompt_strength = strength;
      replicateInput.strength = strength;
    }
  }

  try {
    const submitted = await replicateFetchJson(
      `${REPLICATE_API_HOST}/v1/models/${modelId}/predictions`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ input: replicateInput }),
      }
    );
    const predictionId = (typeof submitted.raw.id === 'string' && submitted.raw.id.trim()) || '';
    if (!submitted.ok || !isReplicatePredictionId(predictionId)) {
      return {
        ok: false,
        status: submitted.status || 502,
        error: replicateErrorMessage(
          submitted.raw,
          `Replicate queue returned HTTP ${submitted.status}.`
        ),
        raw: submitted.raw,
        engineUrl: REPLICATE_API_HOST,
      };
    }
    const promptId = encodeReplicatePromptId(modelId, predictionId);
    pruneMap(jobKeys, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
    jobKeys.set(promptId, { key: token, createdAt: Date.now() });
    return {
      ok: true,
      status: submitted.status,
      promptId,
      engineUrl: REPLICATE_API_HOST,
      raw: submitted.raw,
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'Replicate queue request failed.',
      raw: {},
      engineUrl: REPLICATE_API_HOST,
    };
  }
}

async function downloadReplicateImage(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!isAllowedReplicateMediaUrl(url)) {
    throw new Error('Replicate returned an image URL that is not on replicate.delivery.');
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`Could not download Replicate image (HTTP ${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('Replicate image download was empty.');
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { bytes, mimeType };
}

export async function fetchReplicateJobStatus(
  promptId: string,
  tokenHint?: string
): Promise<ReplicateJobStatus | null> {
  const parsed = parseReplicatePromptId(promptId);
  if (!parsed) {
    return {
      promptId,
      status: 'error',
      statusMessage: 'Invalid Replicate job id.',
      engineUrl: REPLICATE_API_HOST,
    };
  }

  let token: string;
  try {
    token = resolveReplicateApiToken(tokenHint || jobKeys.get(promptId)?.key);
  } catch (error) {
    return {
      promptId,
      status: 'error',
      statusMessage: error instanceof Error ? error.message : 'Replicate API token is required.',
      engineUrl: REPLICATE_API_HOST,
    };
  }

  try {
    const statusRes = await replicateFetchJson(
      `${REPLICATE_API_HOST}/v1/predictions/${parsed.predictionId}`,
      token
    );
    if (statusRes.status === 404) {
      return {
        promptId,
        status: 'error',
        statusMessage: replicateErrorMessage(statusRes.raw, 'Replicate job not found.'),
        engineUrl: REPLICATE_API_HOST,
      };
    }
    if (!statusRes.ok) {
      return {
        promptId,
        status: 'error',
        statusMessage: replicateErrorMessage(
          statusRes.raw,
          `Replicate status returned HTTP ${statusRes.status}.`
        ),
        engineUrl: REPLICATE_API_HOST,
      };
    }

    const mapped = mapReplicateStatus(
      typeof statusRes.raw.status === 'string' ? statusRes.raw.status : undefined
    );
    if (mapped !== 'completed') {
      return {
        promptId,
        status: mapped,
        statusMessage:
          mapped === 'running'
            ? 'Running on Replicate'
            : mapped === 'error'
              ? replicateErrorMessage(statusRes.raw, 'Replicate job failed.')
              : 'Queued on Replicate',
        engineUrl: REPLICATE_API_HOST,
        queuePosition: mapped === 'pending' ? 1 : mapped === 'running' ? 0 : null,
        progressValue: mapped === 'running' ? 1 : 0,
        progressMax: 2,
      };
    }

    const urls = extractImageUrls(statusRes.raw);
    if (urls.length === 0) {
      return {
        promptId,
        status: 'error',
        statusMessage: 'Replicate completed without an image or video URL.',
        engineUrl: REPLICATE_API_HOST,
      };
    }

    const subfolder = replicateModelToSubfolder(parsed.modelId);
    const images: ReplicateOutputImage[] = [];
    for (const [index, url] of urls.entries()) {
      const downloaded = await downloadReplicateImage(url);
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
      const filename = `${parsed.predictionId}${index === 0 ? '' : `-${index}`}.${ext}`;
      putReplicateOutput(subfolder, filename, downloaded.bytes, mimeType);
      images.push({ filename, subfolder, type: 'output' });
    }

    return {
      promptId,
      status: 'completed',
      statusMessage: 'Completed on Replicate',
      engineUrl: REPLICATE_API_HOST,
      images,
      queuePosition: null,
      progressValue: 2,
      progressMax: 2,
    };
  } catch (error) {
    return {
      promptId,
      status: 'error',
      statusMessage: error instanceof Error ? error.message : 'Replicate status check failed.',
      engineUrl: REPLICATE_API_HOST,
    };
  }
}

export async function ensureReplicateOutput(input: {
  promptId?: string;
  filename: string;
  subfolder: string;
  apiToken?: string;
}): Promise<BinaryRecord | null> {
  const cached = getReplicateOutput(input.subfolder, input.filename);
  if (cached) {
    return cached;
  }
  const promptId =
    input.promptId?.trim() ||
    (() => {
      const modelId = replicateSubfolderToModel(input.subfolder);
      const predictionId = input.filename.replace(/\.[a-z0-9]+$/i, '');
      return modelId ? encodeReplicatePromptId(modelId, predictionId) : '';
    })();
  if (!promptId) {
    return null;
  }
  const status = await fetchReplicateJobStatus(promptId, input.apiToken);
  if (status?.status !== 'completed') {
    return getReplicateOutput(input.subfolder, input.filename);
  }
  return getReplicateOutput(input.subfolder, input.filename);
}
