import { castcutObjectInfoFingerprint } from '../castcut/routes-server';
import { getComfyUiBaseUrl } from './client';
import { readComboOptionList } from './combo';
import type { ComfyUiRuntimeConfig } from './config';
import { fetchComfyModelFilenames } from './models';
import { readStringNameList } from './features';
import { discoverWebpSaveAdapters, type WebpSaveAdapter } from '../workflow/save-format';
import { FIBO2_UNET_RE } from '../engine/fibo2-renderer';

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
  /** ReActor face restore models (CodeFormer / GFPGAN) — the talking-clip face pass. */
  faceRestoreModels?: string[];
  /** Fibo 2.0 Edit Turbo files the ComfyUI-Fibo2 loader lists (only with the pack). */
  fibo2Unets?: string[];
  /**
   * Of those, the ones whose safetensors metadata marks the pack's converted format (read on the
   * server, `/view_metadata`). Missing: not read.
   */
  fibo2PackUnets?: string[];
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
    faceRestoreModels: readNodeInputOptions(objectInfo, 'ReActorRestoreFace', 'model').filter(
      name => name !== 'none'
    ),
    embeddings: [],
    fibo2Unets: readNodeInputOptions(objectInfo, 'Fibo2DiffusionModelLoader', 'model_name').filter(
      name => FIBO2_UNET_RE.test(name)
    ),
  };
}

/**
 * The Fibo files whose metadata says they are ComfyUI-Fibo2's converted checkpoint. Comfy-Org's
 * repackage for the built-in route carries the same filename upstream but no such metadata, and
 * the pack refuses it. Null when ComfyUI does not answer.
 */
async function readFibo2PackUnets(baseUrl: string, files: string[]): Promise<string[] | null> {
  try {
    const verdicts = await Promise.all(
      files.map(async file => {
        const res = await fetch(
          `${baseUrl}/view_metadata/diffusion_models?filename=${encodeURIComponent(file)}`,
          {
            cache: 'no-store',
            signal: AbortSignal.timeout(OBJECT_INFO_FETCH_TIMEOUT_MS),
            redirect: 'manual',
          }
        );
        // 404: no metadata at all (Comfy-Org's file).
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const meta = (await res.json()) as Record<string, unknown>;
        return meta.fibo2_native_format === '1' && meta.fibo2_component === 'diffusion_model'
          ? file
          : null;
      })
    );
    return verdicts.filter((file): file is string => file !== null);
  } catch {
    return null;
  }
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
  /** The Castcut pack's fingerprint when it was fetched (castcut-routes-server.ts), if any. */
  fingerprint?: string | null;
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
      faceRestoreModels: [...(payload.models.faceRestoreModels ?? [])],
      embeddings: [...(payload.models.embeddings ?? [])],
      ...(payload.models.fibo2Unets ? { fibo2Unets: [...payload.models.fibo2Unets] } : {}),
      ...(payload.models.fibo2PackUnets
        ? { fibo2PackUnets: [...payload.models.fibo2PackUnets] }
        : {}),
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
  // With the Castcut pack, an expired cache is kept while ComfyUI's nodes and model files are
  // unchanged: object_info is ~8 MB and was fetched again every five minutes.
  if (!options?.forceRefresh) {
    const cached = serverObjectInfoCache.get(baseUrl);
    if (cached && Date.now() - cached.fetchedAt <= SERVER_OBJECT_INFO_TTL_MS) {
      return cloneObjectInfoPayload(cached.payload);
    }
    if (cached?.fingerprint) {
      const fingerprint = await castcutObjectInfoFingerprint(baseUrl).catch(() => null);
      if (fingerprint === cached.fingerprint) {
        cached.fetchedAt = Date.now();
        return cloneObjectInfoPayload(cached.payload);
      }
    }
  }
  const fingerprintPromise = castcutObjectInfoFingerprint(baseUrl).catch(() => null);

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
  if (models.fibo2Unets?.length) {
    const verified = await readFibo2PackUnets(baseUrl, models.fibo2Unets);
    if (verified) models.fibo2PackUnets = verified;
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
    fingerprint: await fingerprintPromise,
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
