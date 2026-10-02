import { getComfyModelDefinition, type ComfyImageModel } from './comfy-models/client';
import { readAnyCachedComfyObjectInfoModels } from './comfyui-object-info-cache';
import { loadSettingsCache } from './settings-cache';
import { installedComfyModels } from './model-picker';

export function getReformatTargetModel(current: ComfyImageModel): ComfyImageModel {
  return current === 'flux-2-klein' ? 'qwen-image-2512' : 'flux-2-klein';
}

/**
 * False only when ComfyUI's model list is known and the target's weights are not in it —
 * "Reformat for FLUX.2 Klein" was offered on Qwen set-ups that have no Klein model.
 */
export function isReformatTargetInstalled(current: ComfyImageModel): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  const target = getComfyModelDefinition(getReformatTargetModel(current));
  const installed = installedComfyModels(
    [target],
    readAnyCachedComfyObjectInfoModels(),
    // A model kept under a mapped (non-default) filename is installed too.
    loadSettingsCache().shared.modelCheckpointMap
  );
  return installed === null || installed.has(target.id);
}

/** The button's label; empty (no button) when the target model is not installed. */
export function getReformatTargetLabel(current: ComfyImageModel): string {
  if (!isReformatTargetInstalled(current)) {
    return '';
  }
  return getComfyModelDefinition(getReformatTargetModel(current)).label;
}
