/**
 * What each library workflow is used for: models pinned to it in the map, whether it is the
 * selected "Send to ComfyUI" file, and (with system workflows on) the models whose automatic
 * pack pick lands on it. A file with none of these is unused.
 */
import { COMFY_IMAGE_MODELS } from './comfy-models/registry';
import type { ComfyImageModel } from './comfy-models/types';
import type { ComfyUiModelLists } from './comfyui-object-info';
import type { ComfyWorkflowFile } from './comfyui-workflow-files';
import type { SharedToolSettings } from './settings-cache';
import { pickPackWorkflowForModel } from './system-workflow-runtime';

export type WorkflowFileUsage = {
  /** Map keys pinned to this file (model ids, or "faceDetailer"). */
  pinned: string[];
  /** Models system workflows would pick this file for (unpinned models only). */
  auto: string[];
  selected: boolean;
};

export function workflowLibraryUsage(input: {
  files: ComfyWorkflowFile[];
  shared: Pick<
    SharedToolSettings,
    'modelWorkflowMap' | 'selectedWorkflowFileId' | 'useSystemWorkflows'
  >;
  inventory?: ComfyUiModelLists | null;
  /** Injected in tests; defaults to the real pack scorer. */
  pickPack?: (
    model: ComfyImageModel,
    files: ComfyWorkflowFile[]
  ) => { file: { id: string } } | null;
}): Map<string, WorkflowFileUsage> {
  const usage = new Map<string, WorkflowFileUsage>(
    input.files.map(file => [
      file.id,
      { pinned: [], auto: [], selected: input.shared.selectedWorkflowFileId === file.id },
    ])
  );
  const map = input.shared.modelWorkflowMap ?? {};
  for (const [model, id] of Object.entries(map)) {
    usage.get(id?.trim() ?? '')?.pinned.push(model);
  }
  if (input.shared.useSystemWorkflows === true) {
    const pick =
      input.pickPack ??
      ((model: ComfyImageModel, files: ComfyWorkflowFile[]) =>
        pickPackWorkflowForModel(model, files, input.inventory ?? null));
    for (const { id: model } of COMFY_IMAGE_MODELS) {
      if (map[model]?.trim()) continue;
      const picked = pick(model, input.files);
      if (picked) usage.get(picked.file.id)?.auto.push(model);
    }
  }
  return usage;
}

export function isWorkflowFileUnused(usage: WorkflowFileUsage | undefined): boolean {
  return !usage || (usage.pinned.length === 0 && usage.auto.length === 0 && !usage.selected);
}
