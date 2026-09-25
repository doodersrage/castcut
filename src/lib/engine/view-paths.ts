import type { EngineId, EngineOutputImage, EngineViewPathOptions } from './types';
import { isCloudEngine, type CloudEngineId } from './capabilities';
import { shouldSkipGalleryThumbProxy } from '../comfyui-outputs';

/** Bounded per-URL cache to avoid re-allocating URLSearchParams across render passes. */
const _viewPathCacheMaxSize = 4096;
const _viewPathCache = new Map<string, string>();

function appendWidth(
  params: URLSearchParams,
  image: EngineOutputImage,
  options?: EngineViewPathOptions
): void {
  if (shouldSkipGalleryThumbProxy(image.filename)) {
    return;
  }
  const width = options?.width;
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
    params.set('w', String(Math.min(Math.floor(width), 2048)));
  }
}

function buildCacheKey(
  engineId: EngineId | undefined,
  engineUrl: string,
  image: EngineOutputImage,
  width?: number
): string {
  return `${engineId ?? 'none'}::${engineUrl}::${image.filename}::${image.subfolder}::${image.type}::w=${width ?? -1}`;
}

/** Studio-proxied Diffusers view URL (mirrors Comfy view query shape). */
export function buildDiffusersViewPath(
  engineUrl: string,
  image: EngineOutputImage,
  options?: EngineViewPathOptions
): string {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
    engineUrl: engineUrl.replace(/\/+$/, ''),
  });
  appendWidth(params, image, options);
  return `/api/diffusers/view?${params.toString()}`;
}

export function buildFalViewPath(
  _engineUrl: string,
  image: EngineOutputImage,
  options?: EngineViewPathOptions
): string {
  return buildNamedCloudViewPath('fal', _engineUrl, image, options);
}

export function buildReplicateViewPath(
  _engineUrl: string,
  image: EngineOutputImage,
  options?: EngineViewPathOptions
): string {
  return buildNamedCloudViewPath('replicate', _engineUrl, image, options);
}

export function buildNamedCloudViewPath(
  engineId: CloudEngineId,
  _engineUrl: string,
  image: EngineOutputImage,
  options?: EngineViewPathOptions
): string {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
  });
  appendWidth(params, image, options);
  return `/api/${engineId}/view?${params.toString()}`;
}

export function buildEngineViewPath(
  engineId: EngineId | undefined,
  engineUrlInput: string | null | undefined,
  image: EngineOutputImage,
  options?: EngineViewPathOptions
): string {
  // Older / imported gallery entries (e.g. saved films) can lack an engine URL; the view route
  // falls back to the configured ComfyUI when `comfyUrl` is absent, so omit it instead of crashing.
  const engineUrl = engineUrlInput?.trim() ?? '';
  const cacheKey = buildCacheKey(engineId, engineUrl, image, options?.width);
  const cached = _viewPathCache.get(cacheKey);
  if (cached) return cached;

  let result: string;
  if (engineId === 'diffusers') {
    result = buildDiffusersViewPath(engineUrl, image, options);
  } else if (isCloudEngine(engineId)) {
    result = buildNamedCloudViewPath(engineId, engineUrl, image, options);
  } else {
    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder,
      type: image.type,
    });
    if (engineUrl) {
      params.set('comfyUrl', engineUrl.replace(/\/+$/, ''));
    }
    appendWidth(params, image, options);
    result = `/api/comfyui/view?${params.toString()}`;
  }

  if (_viewPathCache.size >= _viewPathCacheMaxSize) {
    const half = Math.floor(_viewPathCacheMaxSize / 2);
    let evicted = 0;
    for (const k of _viewPathCache.keys()) {
      if (evicted >= half) break;
      _viewPathCache.delete(k);
      evicted += 1;
    }
  }
  _viewPathCache.set(cacheKey, result);
  return result;
}
