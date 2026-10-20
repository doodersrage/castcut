import type { ComfyUiModelLists } from '../comfyui/object-info';

export type LoaderMapRepairSuggestion = {
  mapKey: 'checkpoint' | 'vae' | 'upscale' | 'controlNet';
  modelId: string;
  currentFilename: string;
  suggestedFilename: string;
  reason: string;
};

function filenameInList(filename: string, list: string[]): boolean {
  return Boolean(filename.trim() && list.includes(filename.trim()));
}

function suggestClosestFilename(filename: string, list: string[]): string | undefined {
  const trimmed = filename.trim().toLowerCase();
  if (!trimmed || list.length === 0) {
    return undefined;
  }

  const exact = list.find(entry => entry.toLowerCase() === trimmed);
  if (exact) {
    return exact;
  }

  const stem = trimmed.replace(/\.(safetensors|ckpt|pt)$/i, '');
  const partial = list.find(entry => {
    const entryLower = entry.toLowerCase();
    return (
      entryLower.includes(stem) ||
      stem.includes(entryLower.replace(/\.(safetensors|ckpt|pt)$/i, ''))
    );
  });
  return partial;
}

export function suggestLoaderMapRepairs(input: {
  checkpointMap: Record<string, string | undefined>;
  vaeMap: Record<string, string | undefined>;
  upscaleMap: Record<string, string | undefined>;
  controlNetMap?: Record<string, string | undefined>;
  models: ComfyUiModelLists;
}): LoaderMapRepairSuggestion[] {
  const suggestions: LoaderMapRepairSuggestion[] = [];

  for (const [modelId, filename] of Object.entries(input.checkpointMap)) {
    if (!filename?.trim()) {
      continue;
    }
    const found =
      filenameInList(filename, input.models.checkpoints) ||
      filenameInList(filename, input.models.unets);
    if (found) {
      continue;
    }
    const suggested =
      suggestClosestFilename(filename, input.models.unets) ??
      suggestClosestFilename(filename, input.models.checkpoints);
    if (suggested) {
      suggestions.push({
        mapKey: 'checkpoint',
        modelId,
        currentFilename: filename,
        suggestedFilename: suggested,
        reason: 'Closest checkpoint/UNET match in ComfyUI',
      });
    }
  }

  for (const [modelId, filename] of Object.entries(input.vaeMap)) {
    if (!filename?.trim() || filenameInList(filename, input.models.vaes)) {
      continue;
    }
    const suggested = suggestClosestFilename(filename, input.models.vaes);
    if (suggested) {
      suggestions.push({
        mapKey: 'vae',
        modelId,
        currentFilename: filename,
        suggestedFilename: suggested,
        reason: 'Closest VAE match in ComfyUI',
      });
    }
  }

  for (const [modelId, filename] of Object.entries(input.upscaleMap)) {
    if (!filename?.trim() || filenameInList(filename, input.models.upscaleModels)) {
      continue;
    }
    const suggested = suggestClosestFilename(filename, input.models.upscaleModels);
    if (suggested) {
      suggestions.push({
        mapKey: 'upscale',
        modelId,
        currentFilename: filename,
        suggestedFilename: suggested,
        reason: 'Closest upscale model match in ComfyUI',
      });
    }
  }

  if (input.controlNetMap) {
    for (const [modelId, filename] of Object.entries(input.controlNetMap)) {
      if (!filename?.trim() || filenameInList(filename, input.models.controlNets)) {
        continue;
      }
      const suggested = suggestClosestFilename(filename, input.models.controlNets);
      if (suggested) {
        suggestions.push({
          mapKey: 'controlNet',
          modelId,
          currentFilename: filename,
          suggestedFilename: suggested,
          reason: 'Closest ControlNet match in ComfyUI',
        });
      }
    }
  }

  return suggestions;
}

export function applyLoaderMapRepairs(
  maps: {
    checkpointMap: Record<string, string | undefined>;
    vaeMap: Record<string, string | undefined>;
    upscaleMap: Record<string, string | undefined>;
    controlNetMap?: Record<string, string | undefined>;
  },
  repairs: LoaderMapRepairSuggestion[]
): {
  checkpointMap: Record<string, string>;
  vaeMap: Record<string, string>;
  upscaleMap: Record<string, string>;
  controlNetMap: Record<string, string>;
  applied: number;
} {
  const checkpointMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(maps.checkpointMap)) {
    if (typeof value === 'string') {
      checkpointMap[key] = value;
    }
  }
  const vaeMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(maps.vaeMap)) {
    if (typeof value === 'string') {
      vaeMap[key] = value;
    }
  }
  const upscaleMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(maps.upscaleMap)) {
    if (typeof value === 'string') {
      upscaleMap[key] = value;
    }
  }
  const controlNetMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(maps.controlNetMap ?? {})) {
    if (typeof value === 'string') {
      controlNetMap[key] = value;
    }
  }
  let applied = 0;

  for (const repair of repairs) {
    switch (repair.mapKey) {
      case 'checkpoint':
        checkpointMap[repair.modelId] = repair.suggestedFilename;
        applied += 1;
        break;
      case 'vae':
        vaeMap[repair.modelId] = repair.suggestedFilename;
        applied += 1;
        break;
      case 'upscale':
        upscaleMap[repair.modelId] = repair.suggestedFilename;
        applied += 1;
        break;
      case 'controlNet':
        controlNetMap[repair.modelId] = repair.suggestedFilename;
        applied += 1;
        break;
      default:
        break;
    }
  }

  return { checkpointMap, vaeMap, upscaleMap, controlNetMap, applied };
}
