'use client';

import type { ComfyUiModelLists } from './comfyui-object-info';
import { resolveComfyUiRuntime } from './comfyui-runtime';
import type { WebpSaveAdapter } from './workflow-save-format';

const CACHE_TTL_MS = 5 * 60 * 1000;

export type ComfyObjectInfoCachePayload = {
  models: ComfyUiModelLists;
  nodeTypes: Set<string>;
  supportsNeuralUpscaleTileSize: boolean;
  webpSaveAdapters: WebpSaveAdapter[];
};

type CacheEntry = {
  fetchedAt: number;
  comfyUrl: string;
} & ComfyObjectInfoCachePayload;

let memoryCache: CacheEntry | null = null;

function resolveCacheUrl(comfyUrl?: string): string {
  return (
    comfyUrl?.trim().replace(/\/+$/, '') ||
    resolveComfyUiRuntime()?.apiUrl?.trim().replace(/\/+$/, '') ||
    ''
  );
}

export function readCachedComfyObjectInfoModels(comfyUrl?: string): ComfyUiModelLists | null {
  return readCachedComfyObjectInfo(comfyUrl)?.models ?? null;
}

export function readCachedComfyObjectInfo(comfyUrl?: string): ComfyObjectInfoCachePayload | null {
  const resolved = resolveCacheUrl(comfyUrl);
  if (!resolved || !memoryCache) {
    return null;
  }
  if (memoryCache.comfyUrl !== resolved) {
    return null;
  }
  if (Date.now() - memoryCache.fetchedAt > CACHE_TTL_MS) {
    return null;
  }
  return {
    models: memoryCache.models,
    nodeTypes: memoryCache.nodeTypes,
    supportsNeuralUpscaleTileSize: memoryCache.supportsNeuralUpscaleTileSize,
    webpSaveAdapters: memoryCache.webpSaveAdapters,
  };
}

/** Requests under way, by ComfyUI URL — callers that arrive before the first answer share it. */
const inFlight = new Map<string, Promise<ComfyObjectInfoCachePayload | null>>();

/**
 * ComfyUI's model lists and node types, cached. A page's panels all ask for it on mount, before
 * any answer is cached: each sent its own request (7 on a Day load), and a few page changes used
 * up the route's rate limit (HTTP 429). Concurrent callers now wait on one request.
 */
export async function fetchComfyObjectInfoCached(input?: {
  comfyUrl?: string;
  forceRefresh?: boolean;
}): Promise<ComfyObjectInfoCachePayload | null> {
  const runtime = resolveComfyUiRuntime();
  const comfyUrl = input?.comfyUrl?.trim() || runtime?.apiUrl?.trim() || '';
  if (!input?.forceRefresh) {
    const cached = readCachedComfyObjectInfo(comfyUrl);
    if (cached) {
      return cached;
    }
    const pending = inFlight.get(comfyUrl);
    if (pending) {
      return pending;
    }
  } else {
    clearComfyObjectInfoCache();
  }
  const request = requestComfyObjectInfo(comfyUrl, input?.forceRefresh === true).finally(() => {
    if (inFlight.get(comfyUrl) === request) inFlight.delete(comfyUrl);
  });
  inFlight.set(comfyUrl, request);
  return request;
}

async function requestComfyObjectInfo(
  comfyUrl: string,
  forceRefresh: boolean
): Promise<ComfyObjectInfoCachePayload | null> {
  const params = new URLSearchParams();
  if (comfyUrl) {
    params.set('comfyUrl', comfyUrl);
  }
  if (forceRefresh) {
    params.set('forceRefresh', '1');
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/comfyui/object-info${query}`);
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as {
    models?: ComfyUiModelLists;
    nodeTypes?: string[];
    supportsNeuralUpscaleTileSize?: boolean;
    webpSaveAdapters?: WebpSaveAdapter[];
  };
  if (!data.models) {
    return null;
  }

  memoryCache = {
    fetchedAt: Date.now(),
    comfyUrl: comfyUrl.replace(/\/+$/, '') || 'default',
    models: data.models,
    nodeTypes: new Set(data.nodeTypes ?? []),
    supportsNeuralUpscaleTileSize: data.supportsNeuralUpscaleTileSize === true,
    webpSaveAdapters: Array.isArray(data.webpSaveAdapters) ? data.webpSaveAdapters : [],
  };
  return {
    models: memoryCache.models,
    nodeTypes: memoryCache.nodeTypes,
    supportsNeuralUpscaleTileSize: memoryCache.supportsNeuralUpscaleTileSize,
    webpSaveAdapters: memoryCache.webpSaveAdapters,
  };
}

export async function fetchComfyObjectInfoModelsCached(input?: {
  comfyUrl?: string;
  forceRefresh?: boolean;
}): Promise<ComfyUiModelLists | null> {
  const payload = await fetchComfyObjectInfoCached(input);
  return payload?.models ?? null;
}

export async function fetchComfyObjectInfoNodeTypesCached(input?: {
  comfyUrl?: string;
}): Promise<Set<string> | null> {
  const comfyUrl = input?.comfyUrl?.trim() || resolveComfyUiRuntime()?.apiUrl?.trim() || '';
  const cached = readCachedComfyObjectInfo(comfyUrl);
  if (cached && cached.nodeTypes.size) {
    return cached.nodeTypes;
  }

  const payload = await fetchComfyObjectInfoCached({ comfyUrl });
  return payload?.nodeTypes ?? null;
}

export function patchCachedComfyLoraList(loras: string[], comfyUrl?: string): void {
  const resolved = resolveCacheUrl(comfyUrl);
  if (!memoryCache) {
    return;
  }
  if (resolved && memoryCache.comfyUrl !== resolved && memoryCache.comfyUrl !== 'default') {
    return;
  }
  memoryCache = {
    ...memoryCache,
    fetchedAt: Date.now(),
    models: {
      ...memoryCache.models,
      loras: [...new Set(loras.map(name => name.trim()).filter(Boolean))],
    },
  };
}

export async function fetchComfyLoraInventory(input?: {
  comfyUrl?: string;
  forceRefresh?: boolean;
}): Promise<string[] | null> {
  const files = await fetchComfyLoraInventoryFiles(input);
  return files ? files.map(file => file.name) : null;
}

export type ComfyLoraInventoryFile = {
  name: string;
  pathIndex: number;
};

export async function fetchComfyLoraInventoryFiles(input?: {
  comfyUrl?: string;
  forceRefresh?: boolean;
}): Promise<ComfyLoraInventoryFile[] | null> {
  const comfyUrl = input?.comfyUrl?.trim() || resolveComfyUiRuntime()?.apiUrl?.trim() || '';
  const params = new URLSearchParams({ folder: 'loras' });
  if (comfyUrl) {
    params.set('comfyUrl', comfyUrl);
  }
  try {
    const response = await fetch(`/api/comfyui/models?${params.toString()}`);
    if (response.ok) {
      const data = (await response.json()) as {
        files?: string[];
        models?: Array<{ name?: string; pathIndex?: number }>;
      };
      const fromModels = Array.isArray(data.models)
        ? data.models
            .map(file => ({
              name: file.name?.trim() ?? '',
              pathIndex: typeof file.pathIndex === 'number' ? file.pathIndex : 0,
            }))
            .filter(file => file.name)
        : [];
      const fromFiles = Array.isArray(data.files)
        ? data.files.map(name => ({ name: name.trim(), pathIndex: 0 })).filter(file => file.name)
        : [];
      const files = fromModels.length > 0 ? fromModels : fromFiles;
      if (files.length > 0) {
        patchCachedComfyLoraList(
          files.map(file => file.name),
          comfyUrl
        );
        return files;
      }
    }
  } catch {
    // fall through to object_info
  }

  const models = await fetchComfyObjectInfoModelsCached({
    comfyUrl: comfyUrl || undefined,
    forceRefresh: input?.forceRefresh,
  });
  const loras = models?.loras ?? null;
  return loras ? loras.map(name => ({ name, pathIndex: 0 })) : null;
}

export function comfyLoraPreviewSrc(filename: string, pathIndex = 0, comfyUrl?: string): string {
  const params = new URLSearchParams({
    folder: 'loras',
    filename,
    pathIndex: String(pathIndex),
  });
  if (comfyUrl?.trim()) {
    params.set('comfyUrl', comfyUrl.trim());
  }
  return `/api/comfyui/model-preview?${params.toString()}`;
}

export async function fetchLoraTriggerPhrase(filename: string, comfyUrl?: string): Promise<string> {
  const trimmed = filename.trim();
  if (!trimmed) {
    return '';
  }
  const params = new URLSearchParams({
    folder: 'loras',
    filename: trimmed,
  });
  if (comfyUrl?.trim()) {
    params.set('comfyUrl', comfyUrl.trim());
  }
  try {
    const response = await fetch(`/api/comfyui/view-metadata?${params.toString()}`);
    if (!response.ok) {
      return '';
    }
    const data = (await response.json()) as { triggerPhrase?: string };
    return typeof data.triggerPhrase === 'string' ? data.triggerPhrase.trim() : '';
  } catch {
    return '';
  }
}

export function clearComfyObjectInfoCache(): void {
  memoryCache = null;
}
