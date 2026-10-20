import { fetchComfyObjectInfoCached } from './comfyui/object-info-cache';
import { isVideoModel } from './queue-tool-model';
import { ensureVideoWorkflowScaffold } from './ensure-video-workflow';
import type { ComfyImageModel } from './comfy-models/client';
import type { SharedToolSettings } from './settings-cache';

export async function pinVideoWeightsAfterInstall(model: string): Promise<{
  sharedPatch?: Partial<SharedToolSettings>;
  checkpointFilename?: string;
  note: string;
}> {
  if (!isVideoModel(model)) {
    return { note: 'Installed weights. Refresh ComfyUI if loaders stay empty.' };
  }
  const objectInfo = await fetchComfyObjectInfoCached({ forceRefresh: true });
  const result = ensureVideoWorkflowScaffold(model as ComfyImageModel, {
    inventory: objectInfo?.models ?? null,
  });
  const mapped = result.checkpointFilename?.trim();
  return {
    sharedPatch: result.sharedPatch,
    checkpointFilename: mapped,
    note: mapped
      ? `Mapped ${result.model} → ${mapped}${result.created ? ' and created a video scaffold' : ''}. Refresh ComfyUI if a loader still looks empty.`
      : 'Video weights installed — refresh ComfyUI, then Refresh here so the checkpoint map can pick them up.',
  };
}
