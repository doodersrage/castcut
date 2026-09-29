import { workflowFileKind } from './workflow-kind';
import {
  upsertComfyWorkflowFile,
  loadComfyWorkflowFiles,
  type ComfyWorkflowFile,
} from './comfyui-workflow-files';
import { assignWorkflowToInferredModels, resolveWorkflowForModel } from './model-workflow-map';
import { buildWorkflowScaffoldForModel, suggestedScaffoldName } from './workflow-scaffold';
import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_MESH_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
} from './comfy-models/client';
import { AUDIO_SECONDS_TOKEN, MESH_RESOLUTION_TOKEN } from './audio-mesh-prompt';
import { DEFAULT_CHECKPOINT_TOKEN } from './model-checkpoint-map';

export type EnsureMediaWorkflowResult = {
  created: boolean;
  assigned: boolean;
  workflow: ComfyWorkflowFile;
  model: ComfyImageModel;
  sharedPatch: Partial<SharedToolSettings>;
  note: string;
};

function looksLikeAudioScaffold(file: ComfyWorkflowFile): boolean {
  return workflowFileKind(file) === 'audio';
}

function looksLikeMeshScaffold(file: ComfyWorkflowFile): boolean {
  return workflowFileKind(file) === 'mesh';
}

function withMediaTokens(workflow: ComfyWorkflowFile, kind: 'audio' | 'mesh'): ComfyWorkflowFile {
  const token = kind === 'audio' ? AUDIO_SECONDS_TOKEN : MESH_RESOLUTION_TOKEN;
  const defaultValue = kind === 'audio' ? '10' : '512';
  const others = (workflow.customTokens ?? []).filter(
    entry => entry.token.trim() !== token && entry.token.trim() !== DEFAULT_CHECKPOINT_TOKEN
  );
  const checkpoint = (workflow.customTokens ?? []).find(
    entry => entry.token.trim() === DEFAULT_CHECKPOINT_TOKEN
  );
  return upsertComfyWorkflowFile({
    ...workflow,
    customTokens: [...others, ...(checkpoint ? [checkpoint] : []), { token, value: defaultValue }],
  });
}

/**
 * Ensure an audio or mesh scaffold exists and is mapped for the active model.
 * Idempotent when a map entry already resolves.
 */
export function ensureMediaWorkflowScaffold(
  kind: 'audio' | 'mesh',
  model?: ComfyImageModel,
  options?: { overwriteMap?: boolean }
): EnsureMediaWorkflowResult {
  const resolvedModel = model ?? (kind === 'audio' ? DEFAULT_AUDIO_MODEL : DEFAULT_MESH_MODEL);
  const category = getComfyModelDefinition(resolvedModel).category;
  if (category !== kind) {
    throw new Error(
      `ensureMediaWorkflowScaffold(${kind}) requires a ${kind} model (got ${resolvedModel}).`
    );
  }

  const shared = loadSettingsCache().shared;
  const files = loadComfyWorkflowFiles();
  const existingId = resolveWorkflowForModel(resolvedModel, shared.modelWorkflowMap);

  let workflow: ComfyWorkflowFile | undefined;
  let created = false;

  if (existingId?.trim() && !options?.overwriteMap) {
    workflow = files.find(file => file.id === existingId);
  }

  if (workflow && existingId?.trim() && !options?.overwriteMap) {
    workflow = withMediaTokens(workflow, kind);
    const sharedPatch: Partial<SharedToolSettings> = {
      model: resolvedModel,
    };
    if (!shared.selectedWorkflowFileId?.trim()) {
      sharedPatch.selectedWorkflowFileId = workflow.id;
    }
    saveSharedSettings({ ...shared, ...sharedPatch });
    return {
      created: false,
      assigned: true,
      workflow,
      model: resolvedModel,
      sharedPatch,
      note: `Using workflow “${workflow.name}” for ${resolvedModel}.`,
    };
  }

  if (!workflow) {
    workflow = files.find(file =>
      kind === 'audio' ? looksLikeAudioScaffold(file) : looksLikeMeshScaffold(file)
    );
  }

  if (!workflow) {
    const scaffold = buildWorkflowScaffoldForModel(resolvedModel);
    workflow = upsertComfyWorkflowFile({
      name: suggestedScaffoldName(resolvedModel, 'template'),
      workflowJson: scaffold.json,
    });
    created = true;
  }

  workflow = withMediaTokens(workflow, kind);

  const nextMap = assignWorkflowToInferredModels(
    workflow.id,
    [resolvedModel],
    shared.modelWorkflowMap,
    options?.overwriteMap === true
  );

  const sharedPatch: Partial<SharedToolSettings> = {
    model: resolvedModel,
    selectedWorkflowFileId: workflow.id,
    modelWorkflowMap: nextMap,
  };
  saveSharedSettings({ ...shared, ...sharedPatch });

  return {
    created,
    assigned: true,
    workflow,
    model: resolvedModel,
    sharedPatch,
    note: created
      ? `Created and assigned “${workflow.name}” for ${resolvedModel}. Import a pack-accurate graph when you have one.`
      : `Using workflow “${workflow.name}” for ${resolvedModel}.`,
  };
}

export function ensureAudioWorkflowScaffold(
  model?: ComfyImageModel,
  options?: { overwriteMap?: boolean }
): EnsureMediaWorkflowResult {
  return ensureMediaWorkflowScaffold('audio', model, options);
}

export function ensureMeshWorkflowScaffold(
  model?: ComfyImageModel,
  options?: { overwriteMap?: boolean }
): EnsureMediaWorkflowResult {
  return ensureMediaWorkflowScaffold('mesh', model, options);
}
