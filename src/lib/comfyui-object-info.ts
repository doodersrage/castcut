import { getComfyUiBaseUrl } from './comfyui-client';
import { readComboOptionList } from './comfyui-combo';
import type { ComfyUiRuntimeConfig } from './comfyui-config';
import { fetchComfyModelFilenames } from './comfyui-models';
import { readStringNameList } from './comfyui-features';
import { discoverWebpSaveAdapters, type WebpSaveAdapter } from './workflow-save-format';

export type ComfyUiModelLists = {
  checkpoints: string[];
  unets: string[];
  vaes: string[];
  upscaleModels: string[];
  clips: string[];
  dualClipTypes: string[];
  clipLoaderTypes: string[];
  loras: string[];
  controlNets: string[];
  /** CLIPVisionLoader clip_name inventory (IP-Adapter packs). Optional for older caches. */
  clipVisions?: string[];
  /** Textual-inversion embedding stems from `GET /embeddings`. */
  embeddings?: string[];
};

function readNodeInputOptions(
  objectInfo: Record<string, unknown>,
  classType: string,
  inputName: string
): string[] {
  const node = objectInfo[classType];
  if (!node || typeof node !== 'object') {
    return [];
  }
  const input = (node as { input?: Record<string, unknown> }).input;
  if (!input || typeof input !== 'object') {
    return [];
  }

  const candidates: unknown[] = [input[inputName]];
  for (const group of ['required', 'optional'] as const) {
    const section = input[group];
    if (section && typeof section === 'object') {
      candidates.push((section as Record<string, unknown>)[inputName]);
    }
  }

  for (const candidate of candidates) {
    const list = readComboOptionList(candidate);
    if (list.length > 0) {
      return list;
    }
  }

  return [];
}

/** True when ComfyUI object_info declares an input on the node (required or optional). */
export function nodeDefinesInput(
  objectInfo: Record<string, unknown>,
  classType: string,
  inputName: string
): boolean {
  const node = objectInfo[classType];
  if (!node || typeof node !== 'object') {
    return false;
  }
  const input = (node as { input?: Record<string, unknown> }).input;
  if (!input || typeof input !== 'object') {
    return false;
  }
  if (inputName in input) {
    return true;
  }
  for (const group of ['required', 'optional'] as const) {
    const section = input[group];
    if (section && typeof section === 'object' && inputName in section) {
      return true;
    }
  }
  return false;
}

export function parseComfyObjectInfoModelLists(
  objectInfo: Record<string, unknown>
): ComfyUiModelLists {
  return {
    checkpoints: readNodeInputOptions(objectInfo, 'CheckpointLoaderSimple', 'ckpt_name'),
    unets: [
      ...new Set([
        ...readNodeInputOptions(objectInfo, 'UNETLoader', 'unet_name'),
        // GGUF custom node uses a separate loader with its own filename list.
        ...readNodeInputOptions(objectInfo, 'UnetLoaderGGUF', 'unet_name'),
      ]),
    ],
    vaes: readNodeInputOptions(objectInfo, 'VAELoader', 'vae_name'),
    upscaleModels: readNodeInputOptions(objectInfo, 'UpscaleModelLoader', 'model_name'),
    clips: [
      ...new Set([
        ...readNodeInputOptions(objectInfo, 'DualCLIPLoader', 'clip_name1'),
        ...readNodeInputOptions(objectInfo, 'DualCLIPLoader', 'clip_name2'),
        ...readNodeInputOptions(objectInfo, 'CLIPLoader', 'clip_name'),
      ]),
    ],
    dualClipTypes: readNodeInputOptions(objectInfo, 'DualCLIPLoader', 'type'),
    clipLoaderTypes: readNodeInputOptions(objectInfo, 'CLIPLoader', 'type'),
    loras: [
      ...new Set([
        ...readNodeInputOptions(objectInfo, 'LoraLoader', 'lora_name'),
        ...readNodeInputOptions(objectInfo, 'LoraLoaderModelOnly', 'lora_name'),
      ]),
    ],
    controlNets: readNodeInputOptions(objectInfo, 'ControlNetLoader', 'control_net_name'),
    clipVisions: readNodeInputOptions(objectInfo, 'CLIPVisionLoader', 'clip_name'),
    embeddings: [],
  };
}

export async function fetchComfyObjectInfoModelLists(
  runtime?: ComfyUiRuntimeConfig
): Promise<ComfyUiModelLists | null> {
  try {
    const payload = await fetchComfyObjectInfoPayload(runtime);
    return payload?.models ?? null;
  } catch {
    return null;
  }
}

export type ComfyObjectInfoPayload = {
  models: ComfyUiModelLists;
  nodeTypes: Set<string>;
  supportsNeuralUpscaleTileSize: boolean;
  webpSaveAdapters: WebpSaveAdapter[];
};

const SERVER_OBJECT_INFO_TTL_MS = 5 * 60 * 1000;
const OBJECT_INFO_FETCH_TIMEOUT_MS = 8_000;

function readFetchErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'fetch failed';
  }
  const cause = error.cause;
  if (cause instanceof Error) {
    const code =
      'code' in cause && typeof (cause as NodeJS.ErrnoException).code === 'string'
        ? (cause as NodeJS.ErrnoException).code
        : null;
    return code ? `${cause.message} (${code})` : cause.message;
  }
  return error.message;
}

function comfyObjectInfoFetchError(baseUrl: string, detail: string): Error {
  return new Error(
    `ComfyUI object_info unreachable at ${baseUrl}: ${detail}. Start ComfyUI or check Settings → ComfyUI URL / COMFYUI_API_URL.`
  );
}

type ServerObjectInfoCacheEntry = {
  fetchedAt: number;
  baseUrl: string;
  payload: ComfyObjectInfoPayload;
};

/** Process-local cache for server queue / API routes (client has its own cache). */
const serverObjectInfoCache = new Map<string, ServerObjectInfoCacheEntry>();

export function clearServerComfyObjectInfoCache(): void {
  serverObjectInfoCache.clear();
}

function cloneObjectInfoPayload(payload: ComfyObjectInfoPayload): ComfyObjectInfoPayload {
  return {
    models: {
      checkpoints: [...payload.models.checkpoints],
      unets: [...payload.models.unets],
      vaes: [...payload.models.vaes],
      upscaleModels: [...payload.models.upscaleModels],
      clips: [...payload.models.clips],
      dualClipTypes: [...payload.models.dualClipTypes],
      clipLoaderTypes: [...payload.models.clipLoaderTypes],
      loras: [...payload.models.loras],
      controlNets: [...payload.models.controlNets],
      clipVisions: [...(payload.models.clipVisions ?? [])],
      embeddings: [...(payload.models.embeddings ?? [])],
    },
    nodeTypes: new Set(payload.nodeTypes),
    supportsNeuralUpscaleTileSize: payload.supportsNeuralUpscaleTileSize,
    webpSaveAdapters: payload.webpSaveAdapters.map(adapter => ({ ...adapter })),
  };
}

export async function fetchComfyObjectInfoPayload(
  runtime?: ComfyUiRuntimeConfig,
  options?: { forceRefresh?: boolean }
): Promise<ComfyObjectInfoPayload | null> {
  const baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, '');
  if (!options?.forceRefresh) {
    const cached = serverObjectInfoCache.get(baseUrl);
    if (cached && Date.now() - cached.fetchedAt <= SERVER_OBJECT_INFO_TTL_MS) {
      return cloneObjectInfoPayload(cached.payload);
    }
  }

  let response: Response;
  const liveLorasPromise = fetchComfyModelFilenames('loras', runtime);
  const embeddingsPromise = fetch(`${baseUrl}/embeddings`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(OBJECT_INFO_FETCH_TIMEOUT_MS),
    redirect: 'manual',
  })
    .then(async res => (res.ok ? readStringNameList(await res.json()) : []))
    .catch(() => [] as string[]);
  try {
    response = await fetch(`${baseUrl}/object_info`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(OBJECT_INFO_FETCH_TIMEOUT_MS),
      redirect: 'manual',
    });
  } catch (error) {
    throw comfyObjectInfoFetchError(baseUrl, readFetchErrorDetail(error));
  }
  if (!response.ok) {
    throw comfyObjectInfoFetchError(baseUrl, `HTTP ${response.status}`);
  }
  const objectInfo = (await response.json()) as Record<string, unknown>;
  const models = parseComfyObjectInfoModelLists(objectInfo);
  const liveLoras = await liveLorasPromise;
  if (liveLoras && liveLoras.length > 0) {
    models.loras = [...new Set([...models.loras, ...liveLoras])];
  }
  const embeddings = await embeddingsPromise;
  if (embeddings.length > 0) {
    models.embeddings = embeddings;
  }
  const payload: ComfyObjectInfoPayload = {
    models,
    nodeTypes: new Set(Object.keys(objectInfo)),
    supportsNeuralUpscaleTileSize: nodeDefinesInput(
      objectInfo,
      'ImageUpscaleWithModel',
      'tile_size'
    ),
    webpSaveAdapters: discoverWebpSaveAdapters(objectInfo),
  };
  serverObjectInfoCache.set(baseUrl, {
    fetchedAt: Date.now(),
    baseUrl,
    payload,
  });
  return cloneObjectInfoPayload(payload);
}

export async function fetchComfyObjectInfoNodeTypes(
  runtime?: ComfyUiRuntimeConfig
): Promise<Set<string> | null> {
  try {
    const payload = await fetchComfyObjectInfoPayload(runtime);
    return payload?.nodeTypes ?? null;
  } catch {
    return null;
  }
}
