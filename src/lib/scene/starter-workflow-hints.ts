import type { ComfyImageModel } from '../comfy-models/client';
import type { SceneStarterPreset } from './starter-presets';

export function applySceneStarterWorkflowHints(
  preset: SceneStarterPreset,
  updateShared: (patch: { model?: ComfyImageModel; selectedWorkflowFileId?: string }) => void
): void {
  const patch: {
    model?: ComfyImageModel;
    selectedWorkflowFileId?: string;
  } = {};
  if (preset.suggestedModel) {
    patch.model = preset.suggestedModel as ComfyImageModel;
  }
  if (preset.suggestedWorkflowFileId) {
    patch.selectedWorkflowFileId = preset.suggestedWorkflowFileId;
  }
  if (Object.keys(patch).length > 0) {
    updateShared(patch);
  }
}
