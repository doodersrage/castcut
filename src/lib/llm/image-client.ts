import 'server-only';

import {
  DEFAULT_GEMINI_IMG2IMG_MODEL,
  DEFAULT_GEMINI_TXT2IMG_MODEL,
  DEFAULT_GROK_IMG2IMG_MODEL,
  DEFAULT_GROK_TXT2IMG_MODEL,
  DEFAULT_OPENAI_IMG2IMG_MODEL,
  DEFAULT_OPENAI_TXT2IMG_MODEL,
  GEMINI_API_HOST,
  GROK_API_HOST,
  OPENAI_API_HOST,
  cloudEngineOption,
  type CloudEngineId,
} from '../engine/capabilities';
import {
  getLlmImageOutput,
  getLlmImageUpload,
  putLlmImageOutput,
  storeLlmImageUpload,
} from './image-cache';
import {
  aspectRatioFromSize,
  cloudLlmModelToSubfolder,
  encodeCloudLlmPromptId,
  extractBase64Image,
  extractHttpsImageUrl,
  grokResolutionFromSize,
  isAllowedGrokMediaUrl,
  isAllowedOpenaiMediaUrl,
  newCloudLlmJobId,
  openaiSizeFromDimensions,
  parseCloudLlmPromptId,
  providerErrorMessage,
  sanitizeCloudLlmModelId,
  type CloudLlmJobStatusName,
} from './image-protocol';

export type LlmImageEngineId = Extract<CloudEngineId, 'openai' | 'gemini' | 'grok'>;

export type LlmImageQueueInput = {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  img2imgModel?: string;
  apiToken?: string;
  width?: number;
  height?: number;
  imageFilename?: string;
};

export type LlmImageQueueResult = {
  ok: boolean;
  status: number;
  promptId?: string;
  engineUrl?: string;
  error?: string;
  raw: Record<string, unknown>;
};

export type LlmImageJobStatus = {
  promptId: string;
  status: CloudLlmJobStatusName;
  statusMessage?: string;
  engineUrl: string;
  images?: Array<{ filename: string; subfolder: string; type: string }>;
  queuePosition?: number | null;
  progressValue?: number;
  progressMax?: number;
};

const GENERATE_TIMEOUT_MS = 110_000;

function isLlmImageEngine(id: string): id is LlmImageEngineId {
  return id === 'openai' || id === 'gemini' || id === 'grok';
}

function defaultsFor(engineId: LlmImageEngineId): { txt2img: string; img2img: string } {
  if (engineId === 'gemini') {
    return { txt2img: DEFAULT_GEMINI_TXT2IMG_MODEL, img2img: DEFAULT_GEMINI_IMG2IMG_MODEL };
  }
  if (engineId === 'grok') {
    return { txt2img: DEFAULT_GROK_TXT2IMG_MODEL, img2img: DEFAULT_GROK_IMG2IMG_MODEL };
  }
  return { txt2img: DEFAULT_OPENAI_TXT2IMG_MODEL, img2img: DEFAULT_OPENAI_IMG2IMG_MODEL };
}

export function resolveLlmImageApiToken(engineId: LlmImageEngineId, requestToken?: string): string {
  const option = cloudEngineOption(engineId);
  const fromRequest = requestToken?.trim() ?? '';
  const fromEnv =
    option?.envTokenKeys.map(key => process.env[key]?.trim() ?? '').find(Boolean) ?? '';
  const token = fromRequest || fromEnv;
  if (!token) {
    const name = option?.shortLabel ?? engineId;
    const envName = option?.envTokenName ?? 'API key';
    throw new Error(
      `${name} API key is required. Set ${envName} on the server, or add a key in Settings → Inference engine.`
    );
  }
  return token;
}

function engineHost(engineId: LlmImageEngineId): string {
  return cloudEngineOption(engineId)?.host ?? OPENAI_API_HOST;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

async function downloadAllowedImage(
  url: string,
  allow: (value: string) => boolean
): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!allow(url)) {
    throw new Error('Provider returned an image URL that is not on an allowed host.');
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`Could not download generated image (HTTP ${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('Generated image download was empty.');
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { bytes, mimeType };
}

function storeGeneratedImage(
  engineId: LlmImageEngineId,
  modelId: string,
  jobId: string,
  image: { bytes: Buffer; mimeType: string }
): { filename: string; subfolder: string; type: string } {
  const subfolder = cloudLlmModelToSubfolder(modelId);
  const ext = image.mimeType.includes('jpeg')
    ? 'jpg'
    : image.mimeType.includes('webp')
      ? 'webp'
      : 'png';
  const filename = `${jobId}.${ext}`;
  putLlmImageOutput({
    engineId,
    subfolder,
    filename,
    bytes: image.bytes,
    mimeType: image.mimeType,
  });
  return { filename, subfolder, type: 'output' };
}

async function generateOpenai(
  input: LlmImageQueueInput,
  token: string,
  modelId: string
): Promise<{ image: { bytes: Buffer; mimeType: string }; raw: Record<string, unknown> }> {
  const width = input.width ?? 1024;
  const height = input.height ?? 1024;
  const size = openaiSizeFromDimensions(width, height);
  let response: Response;
  if (input.imageFilename?.trim()) {
    const upload = getLlmImageUpload(input.imageFilename.trim());
    const form = new FormData();
    form.append('model', modelId);
    form.append('prompt', input.prompt.trim());
    form.append('size', size);
    form.append('n', '1');
    form.append(
      'image',
      new Blob([new Uint8Array(upload.bytes)], { type: upload.mimeType }),
      input.imageFilename.trim()
    );
    response = await fetch(`${OPENAI_API_HOST}/v1/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });
  } else {
    response = await fetch(`${OPENAI_API_HOST}/v1/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        prompt: input.prompt.trim(),
        n: 1,
        size,
        output_format: 'png',
      }),
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });
  }
  const raw = await readJson(response);
  if (!response.ok) {
    throw Object.assign(
      new Error(providerErrorMessage(raw, `OpenAI returned HTTP ${response.status}.`)),
      {
        status: response.status,
        raw,
      }
    );
  }
  const b64 = extractBase64Image(raw);
  if (b64 && b64.bytes.length > 0) {
    return { image: b64, raw };
  }
  const url = extractHttpsImageUrl(raw);
  if (url) {
    return { image: await downloadAllowedImage(url, isAllowedOpenaiMediaUrl), raw };
  }
  throw Object.assign(new Error('OpenAI completed without image bytes.'), { status: 502, raw });
}

async function generateGemini(
  input: LlmImageQueueInput,
  token: string,
  modelId: string
): Promise<{ image: { bytes: Buffer; mimeType: string }; raw: Record<string, unknown> }> {
  const width = input.width ?? 1024;
  const height = input.height ?? 1024;
  const parts: Array<Record<string, unknown>> = [{ text: input.prompt.trim() }];
  if (input.imageFilename?.trim()) {
    const upload = getLlmImageUpload(input.imageFilename.trim());
    parts.unshift({
      inline_data: {
        mime_type: upload.mimeType,
        data: upload.bytes.toString('base64'),
      },
    });
  }
  const response = await fetch(
    `${GEMINI_API_HOST}/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': token,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatioFromSize(width, height),
          },
        },
      }),
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    }
  );
  const raw = await readJson(response);
  if (!response.ok) {
    throw Object.assign(
      new Error(providerErrorMessage(raw, `Gemini returned HTTP ${response.status}.`)),
      {
        status: response.status,
        raw,
      }
    );
  }
  const b64 = extractBase64Image(raw);
  if (!b64 || b64.bytes.length === 0) {
    const blocked =
      typeof (raw.promptFeedback as { blockReason?: unknown } | undefined)?.blockReason === 'string'
        ? String((raw.promptFeedback as { blockReason: string }).blockReason)
        : '';
    throw Object.assign(
      new Error(
        blocked
          ? `Gemini blocked the request (${blocked}).`
          : 'Gemini completed without image bytes.'
      ),
      { status: 502, raw }
    );
  }
  return { image: b64, raw };
}

async function generateGrok(
  input: LlmImageQueueInput,
  token: string,
  modelId: string
): Promise<{ image: { bytes: Buffer; mimeType: string }; raw: Record<string, unknown> }> {
  const width = input.width ?? 1024;
  const height = input.height ?? 1024;
  let response: Response;
  if (input.imageFilename?.trim()) {
    const upload = getLlmImageUpload(input.imageFilename.trim());
    const form = new FormData();
    form.append('model', modelId);
    form.append('prompt', input.prompt.trim());
    form.append('aspect_ratio', aspectRatioFromSize(width, height));
    form.append('resolution', grokResolutionFromSize(width, height));
    form.append('response_format', 'b64_json');
    form.append(
      'image',
      new Blob([new Uint8Array(upload.bytes)], { type: upload.mimeType }),
      input.imageFilename.trim()
    );
    response = await fetch(`${GROK_API_HOST}/v1/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });
  } else {
    response = await fetch(`${GROK_API_HOST}/v1/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        prompt: input.prompt.trim(),
        n: 1,
        aspect_ratio: aspectRatioFromSize(width, height),
        resolution: grokResolutionFromSize(width, height),
        response_format: 'b64_json',
      }),
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });
  }
  const raw = await readJson(response);
  if (!response.ok) {
    throw Object.assign(
      new Error(providerErrorMessage(raw, `Grok returned HTTP ${response.status}.`)),
      {
        status: response.status,
        raw,
      }
    );
  }
  const b64 = extractBase64Image(raw);
  if (b64 && b64.bytes.length > 0) {
    return { image: b64, raw };
  }
  const url = extractHttpsImageUrl(raw);
  if (url) {
    return { image: await downloadAllowedImage(url, isAllowedGrokMediaUrl), raw };
  }
  throw Object.assign(new Error('Grok completed without image bytes.'), { status: 502, raw });
}

export function storeLlmEngineUpload(
  engineId: LlmImageEngineId,
  input: { bytes: Buffer; mimeType?: string }
): { name: string; subfolder: string; type: string } {
  return storeLlmImageUpload({ engineId, bytes: input.bytes, mimeType: input.mimeType });
}

export async function queueLlmImage(
  engineId: LlmImageEngineId,
  input: LlmImageQueueInput
): Promise<LlmImageQueueResult> {
  const option = cloudEngineOption(engineId);
  const host = engineHost(engineId);
  const label = option?.shortLabel ?? engineId;
  let token: string;
  try {
    token = resolveLlmImageApiToken(engineId, input.apiToken);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : `${label} API key is required.`,
      raw: {},
      engineUrl: host,
    };
  }

  const hasImage = Boolean(input.imageFilename?.trim());
  const defaults = defaultsFor(engineId);
  let modelId: string;
  try {
    modelId = sanitizeCloudLlmModelId(
      hasImage ? input.img2imgModel || defaults.img2img : input.model || defaults.txt2img,
      hasImage ? defaults.img2img : defaults.txt2img
    );
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Invalid model id.',
      raw: {},
      engineUrl: host,
    };
  }

  const jobId = newCloudLlmJobId();
  const promptId = encodeCloudLlmPromptId(modelId, jobId);
  try {
    const generated =
      engineId === 'gemini'
        ? await generateGemini(input, token, modelId)
        : engineId === 'grok'
          ? await generateGrok(input, token, modelId)
          : await generateOpenai(input, token, modelId);
    storeGeneratedImage(engineId, modelId, jobId, generated.image);
    return {
      ok: true,
      status: 200,
      promptId,
      engineUrl: host,
      raw: generated.raw,
    };
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? Number((error as { status?: unknown }).status) || 502
        : 502;
    const raw =
      error && typeof error === 'object' && 'raw' in error
        ? ((error as { raw?: Record<string, unknown> }).raw ?? {})
        : {};
    return {
      ok: false,
      status,
      error: error instanceof Error ? error.message : `${label} image request failed.`,
      raw,
      engineUrl: host,
    };
  }
}

export async function fetchLlmImageJobStatus(
  engineId: LlmImageEngineId,
  promptId: string
): Promise<LlmImageJobStatus> {
  const host = engineHost(engineId);
  const parsed = parseCloudLlmPromptId(promptId);
  if (!parsed) {
    return {
      promptId,
      status: 'error',
      statusMessage: `Invalid ${engineId} job id.`,
      engineUrl: host,
    };
  }
  const subfolder = cloudLlmModelToSubfolder(parsed.modelId);
  const png = getLlmImageOutput(engineId, subfolder, `${parsed.jobId}.png`);
  const jpg = getLlmImageOutput(engineId, subfolder, `${parsed.jobId}.jpg`);
  const webp = getLlmImageOutput(engineId, subfolder, `${parsed.jobId}.webp`);
  const cached = png ?? jpg ?? webp;
  if (!cached) {
    return {
      promptId,
      status: 'error',
      statusMessage: 'Generated image expired. Queue the prompt again.',
      engineUrl: host,
    };
  }
  const filename = png
    ? `${parsed.jobId}.png`
    : jpg
      ? `${parsed.jobId}.jpg`
      : `${parsed.jobId}.webp`;
  return {
    promptId,
    status: 'completed',
    statusMessage: `Completed on ${cloudEngineOption(engineId)?.shortLabel ?? engineId}`,
    engineUrl: host,
    images: [{ filename, subfolder, type: 'output' }],
    queuePosition: null,
    progressValue: 1,
    progressMax: 1,
  };
}

export async function ensureLlmImageOutput(input: {
  engineId: string;
  filename: string;
  subfolder: string;
}): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!isLlmImageEngine(input.engineId)) {
    return null;
  }
  return getLlmImageOutput(input.engineId, input.subfolder, input.filename);
}
