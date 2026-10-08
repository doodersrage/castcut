import { COMFY_IMAGE_MODELS } from './comfy-models/client';
import {
  fetchComfyObjectInfoModelsCached,
  readAnyCachedComfyObjectInfoModels,
  readCachedComfyObjectInfoModels,
} from './comfyui-object-info-cache';
import type { FootwearCheckVerdict } from './footwear-check';
import { sharedLlmRequestBody } from './llm-request-options';
import { installedComfyModels } from './model-picker';
import type { ModelCheckpointMap } from './model-checkpoint-map';
import type { SharedToolSettings } from './settings-cache';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from './vision-scan-still';

export type FootwearCheckShared = Pick<
  SharedToolSettings,
  | 'sessionLlmTemperature'
  | 'sessionAllowTemplateFallback'
  | 'sessionLlmModel'
  | 'sessionLlmVisionModel'
  | 'sessionLlmEnabled'
  | 'sessionLlmProvider'
  | 'sessionLlmApiKey'
>;

/**
 * Which engines ComfyUI has, from the cached inventory (for the feet pass's Edit 2511), or null
 * while it is unknown.
 */
export function cachedInstalledModelCheck(
  checkpointMap?: ModelCheckpointMap
): ((modelId: string) => boolean) | null {
  // No ComfyUI URL in the browser (the server's default): the cache is keyed "default" and the
  // URL-keyed read always missed — every "is it installed?" answer was unknown.
  const installed = installedComfyModels(
    COMFY_IMAGE_MODELS,
    readCachedComfyObjectInfoModels() ?? readAnyCachedComfyObjectInfoModels(),
    checkpointMap
  );
  return installed ? modelId => installed.has(modelId) : null;
}

/** {@link cachedInstalledModelCheck}, fetching ComfyUI's inventory when nothing is cached yet. */
export async function fetchInstalledModelCheck(
  checkpointMap?: ModelCheckpointMap
): Promise<((modelId: string) => boolean) | null> {
  const cached = cachedInstalledModelCheck(checkpointMap);
  if (cached) return cached;
  const models = await fetchComfyObjectInfoModelsCached().catch(() => null);
  const installed = installedComfyModels(COMFY_IMAGE_MODELS, models, checkpointMap);
  return installed ? modelId => installed.has(modelId) : null;
}

/**
 * Ask `/api/footwear-check` whether the landed still shows the picked shoes. Resolves null when
 * the check cannot run (no vision model, offline, unreadable reply) — the caller then falls back
 * to its unchecked rule. Never throws.
 */
export async function checkStillFootwear(options: {
  imageUrl: string;
  shoeWords: string;
  shared?: FootwearCheckShared;
}): Promise<FootwearCheckVerdict | null> {
  try {
    const still = await resolveStillFileForVisionScan({
      file: null,
      urls: [options.imageUrl],
      fallbackName: 'shoe-check.png',
    });
    const { image, mimeType } = await prepareVisionScanImagePayload(still);
    const response = await fetch('/api/footwear-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        image,
        mimeType,
        shoes: options.shoeWords,
        ...(options.shared ? sharedLlmRequestBody(options.shared) : {}),
      }),
    });
    const data = await parseVisionScanApiResponse<{
      verdict?: FootwearCheckVerdict;
      error?: string;
    }>(response);
    if (!response.ok || typeof data.verdict?.ok !== 'boolean') return null;
    return data.verdict;
  } catch (error) {
    console.warn('Shoe check skipped:', error);
    return null;
  }
}
