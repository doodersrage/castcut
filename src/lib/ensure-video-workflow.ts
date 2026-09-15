import {
  upsertComfyWorkflowFile,
  loadComfyWorkflowFiles,
  type ComfyWorkflowFile,
} from './comfyui-workflow-files';
import { assignWorkflowToInferredModels, resolveWorkflowForModel } from './model-workflow-map';
import { buildWorkflowScaffoldForModel, suggestedScaffoldName } from './workflow-scaffold';
import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import {
  DEFAULT_VIDEO_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
} from './comfy-models/client';
import { DEFAULT_CHECKPOINT_TOKEN, SUGGESTED_MODEL_CHECKPOINT_MAP } from './model-checkpoint-map';
import { matchInventoryFilename } from './loader-map-inventory-sync';
import { pickVideoCheckpointFromInventory } from './video-checkpoint-pick';
import type { ComfyUiModelLists } from './comfyui-object-info';

export { pickVideoCheckpointFromInventory } from './video-checkpoint-pick';

export type EnsureVideoWorkflowResult = {
  created: boolean;
  assigned: boolean;
  workflow: ComfyWorkflowFile;
  model: ComfyImageModel;
  /** Full shared patch to apply in React state (avoids clobbering the map). */
  sharedPatch: Partial<SharedToolSettings>;
  checkpointFilename?: string;
  checkpointNote?: string;
};

function looksLikeVideoScaffold(file: ComfyWorkflowFile): boolean {
  const json = file.workflowJson ?? '';
  if (
    json.includes('EmptyHunyuanLatentVideo') ||
    json.includes('EmptyHunyuanVideo15Latent') ||
    json.includes('EmptyLTXVLatentVideo') ||
    json.includes('WanImageToVideo') ||
    json.includes('HunyuanImageToVideo') ||
    json.includes('HunyuanVideo15ImageToVideo')
  ) {
    return true;
  }
  return /video|wan|hunyuan/i.test(`${file.name} ${file.filename ?? ''}`);
}

function findReusableVideoWorkflow(
  files: ComfyWorkflowFile[],
  model: ComfyImageModel
): ComfyWorkflowFile | undefined {
  const preferredName = suggestedScaffoldName(model, 'template').toLowerCase();
  const byName = files.find(file => file.name.trim().toLowerCase() === preferredName);
  if (byName) {
    return byName;
  }
  return files.find(file => looksLikeVideoScaffold(file));
}

function inventoryHasVideoWeight(
  filename: string | undefined,
  inventory?: ComfyUiModelLists | null
): boolean {
  const trimmed = filename?.trim();
  if (!trimmed || !inventory) {
    return false;
  }
  const pool = [...(inventory.checkpoints ?? []), ...(inventory.unets ?? [])];
  if (pool.length === 0) {
    return false;
  }
  return Boolean(matchInventoryFilename(trimmed, pool));
}

function videoWeightPool(inventory?: ComfyUiModelLists | null): string[] {
  if (!inventory) {
    return [];
  }
  return [...(inventory.checkpoints ?? []), ...(inventory.unets ?? [])];
}

function workflowCheckpointTokenValue(workflow: ComfyWorkflowFile): string | undefined {
  const value = (workflow.customTokens ?? [])
    .find(token => token.token.trim() === DEFAULT_CHECKPOINT_TOKEN)
    ?.value?.trim();
  return value || undefined;
}

/** Exported for unit tests — video page ensure uses the same preference order. */
export function resolveVideoCheckpointFilename(input: {
  model: ComfyImageModel;
  sharedCheckpointMap?: SharedToolSettings['modelCheckpointMap'];
  inventory?: ComfyUiModelLists | null;
  /** Per-workflow {{CHECKPOINT}} — beats a stale modelCheckpointMap entry. */
  workflowCheckpoint?: string;
}): { filename?: string; note?: string; clearInvalid?: boolean } {
  const pool = videoWeightPool(input.inventory);
  const hasInventory = pool.length > 0;
  const workflowCkpt = input.workflowCheckpoint?.trim();
  const mapped = input.sharedCheckpointMap?.[input.model]?.trim();

  // Workflow token is what the user edits in Settings → library. Prefer it over
  // the shared map so video-page ensure cannot clobber Rapid AIO with a stale
  // suggested T2V stem.
  if (workflowCkpt) {
    if (!hasInventory || inventoryHasVideoWeight(workflowCkpt, input.inventory)) {
      const resolved = hasInventory
        ? (matchInventoryFilename(workflowCkpt, pool) ?? workflowCkpt)
        : workflowCkpt;
      return { filename: resolved };
    }
    // Token not listed in inventory yet — still prefer it over a missing map
    // stem; only replace below when an installed WAN weight is available.
  }

  if (mapped) {
    // Only trust the map when inventory confirms the file exists. Without
    // inventory, never use the map to overwrite a workflow token we already
    // considered above; if there is no workflow token, keep the map as a soft hint.
    if (hasInventory && inventoryHasVideoWeight(mapped, input.inventory)) {
      return {
        filename: matchInventoryFilename(mapped, pool) ?? mapped,
      };
    }
    if (!hasInventory && !workflowCkpt) {
      return { filename: mapped };
    }
    // Mapped file is not in checkpoints or UNETs — fall through to pick.
  }

  if (!hasInventory) {
    if (workflowCkpt) {
      return { filename: workflowCkpt };
    }
    return {
      note: 'Connect ComfyUI to auto-map a video weight, or set Settings → checkpoint map for wan-video.',
    };
  }

  const fromInventory = pickVideoCheckpointFromInventory(input.model, pool);
  if (fromInventory) {
    return {
      filename: fromInventory,
      note: `Mapped {{CHECKPOINT}} → ${fromInventory} from ComfyUI checkpoints/UNETs.`,
    };
  }

  // Keep a user-edited workflow token even if object_info did not list it.
  if (workflowCkpt) {
    return { filename: workflowCkpt };
  }

  const hinted =
    getComfyModelDefinition(input.model)?.checkpointHint ??
    SUGGESTED_MODEL_CHECKPOINT_MAP[input.model];
  return {
    clearInvalid: true,
    note: hinted
      ? `No WAN/Hunyuan/LTX weight installed in ComfyUI (need something like “${hinted}” under models/checkpoints or models/diffusion_models). Your current loaders are image models only.`
      : 'No WAN/Hunyuan/LTX weight installed in ComfyUI models/checkpoints or models/diffusion_models.',
  };
}

/**
 * Fill {{CHECKPOINT}} only when the workflow has no override yet.
 * Never rewrite a non-empty token — video page load was clobbering user edits
 * (Rapid AIO) with stale map/suggested T2V stems.
 */
function withCheckpointTokenFillEmptyOnly(
  workflow: ComfyWorkflowFile,
  filename: string | undefined
): ComfyWorkflowFile {
  const existingValue = workflowCheckpointTokenValue(workflow);
  if (existingValue) {
    return workflow;
  }
  const next = filename?.trim();
  if (!next) {
    return workflow;
  }
  const others = (workflow.customTokens ?? []).filter(
    token => token.token.trim() !== DEFAULT_CHECKPOINT_TOKEN
  );
  return upsertComfyWorkflowFile({
    ...workflow,
    customTokens: [...others, { token: DEFAULT_CHECKPOINT_TOKEN, value: next }],
  });
}

/**
 * Ensure a video scaffold exists and is mapped for the given video model
 * (default `wan-video`). Idempotent when a map entry or existing scaffold resolves.
 * When `inventory` is provided, accepts weights from checkpoints or UNETs
 * (WAN 2.2 diffusion models often live under models/diffusion_models).
 */
export function ensureVideoWorkflowScaffold(
  model: ComfyImageModel = DEFAULT_VIDEO_MODEL,
  options?: {
    overwriteMap?: boolean;
    inventory?: ComfyUiModelLists | null;
  }
): EnsureVideoWorkflowResult {
  const shared = loadSettingsCache().shared;
  const files = loadComfyWorkflowFiles();
  const existingId = resolveWorkflowForModel(model, shared.modelWorkflowMap);

  let workflow: ComfyWorkflowFile | undefined;
  let created = false;

  if (existingId?.trim() && !options?.overwriteMap) {
    workflow = files.find(file => file.id === existingId);
  }

  // User already mapped this model to a real library workflow — don't steal the
  // picker or reassign wan/hunyuan/ltx to a scaffold.
  if (workflow && existingId?.trim() && !options?.overwriteMap) {
    const workflowCkpt = workflowCheckpointTokenValue(workflow);
    const checkpoint = resolveVideoCheckpointFilename({
      model,
      sharedCheckpointMap: shared.modelCheckpointMap,
      inventory: options?.inventory,
      workflowCheckpoint: workflowCkpt,
    });
    const nextCheckpointMap = { ...(shared.modelCheckpointMap ?? {}) };
    if (checkpoint.filename) {
      nextCheckpointMap[model] = checkpoint.filename;
    }
    // Existing mapped workflow: never touch customTokens on page load.
    // Heal the shared checkpoint map only (from workflow token / inventory).
    // Do not stamp `model` — the Video tool owns last-selected model persistence.
    const sharedPatch: Partial<SharedToolSettings> = {
      modelCheckpointMap: nextCheckpointMap,
    };
    // Only force the picker when nothing is selected yet.
    if (!shared.selectedWorkflowFileId?.trim()) {
      sharedPatch.selectedWorkflowFileId = workflow.id;
    }
    saveSharedSettings({
      ...shared,
      ...sharedPatch,
    });
    return {
      created: false,
      assigned: true,
      workflow,
      model,
      sharedPatch,
      checkpointFilename: nextCheckpointMap[model]?.trim() || checkpoint.filename,
      checkpointNote: checkpoint.note,
    };
  }

  if (!workflow) {
    workflow = findReusableVideoWorkflow(files, model);
  }
  if (!workflow) {
    const scaffold = buildWorkflowScaffoldForModel(model);
    workflow = upsertComfyWorkflowFile({
      name: suggestedScaffoldName(model, 'template'),
      workflowJson: scaffold.json,
    });
    created = true;
  }

  const workflowCkpt = workflowCheckpointTokenValue(workflow);
  const checkpoint = resolveVideoCheckpointFilename({
    model,
    sharedCheckpointMap: shared.modelCheckpointMap,
    inventory: options?.inventory,
    workflowCheckpoint: workflowCkpt,
  });

  const pool = videoWeightPool(options?.inventory);
  const hasInventory = pool.length > 0;
  // Auto-fill empty tokens only from live inventory — never plant a suggested
  // / stale map stem (e.g. official T2V) into the workflow library token.
  const inventoryFill = hasInventory ? pickVideoCheckpointFromInventory(model, pool) : undefined;
  workflow = withCheckpointTokenFillEmptyOnly(
    workflow,
    inventoryFill ?? (created ? checkpoint.filename : undefined)
  );

  const nextMap = assignWorkflowToInferredModels(
    workflow.id,
    // Only claim the active model when creating/filling — don't overwrite sibling
    // video model assignments the user already set in the library.
    [model],
    shared.modelWorkflowMap,
    options?.overwriteMap === true
  );

  const nextCheckpointMap = { ...(shared.modelCheckpointMap ?? {}) };

  // Persist whatever resolve preferred (workflow token > valid map > inventory pick).
  if (checkpoint.filename) {
    nextCheckpointMap[model] = checkpoint.filename;
    if (
      (model === 'wan-video' ||
        model === 'wan-video-rapid-aio' ||
        model === 'wan-video-lightning-4') &&
      !nextCheckpointMap['hunyuan-video']?.trim()
    ) {
      const hunyuan = pickVideoCheckpointFromInventory('hunyuan-video', pool);
      if (hunyuan) {
        nextCheckpointMap['hunyuan-video'] = hunyuan;
      }
    }
  } else if (checkpoint.clearInvalid && hasInventory) {
    delete nextCheckpointMap[model];
    const hunyuanMapped = nextCheckpointMap['hunyuan-video']?.trim();
    if (hunyuanMapped && !inventoryHasVideoWeight(hunyuanMapped, options?.inventory)) {
      delete nextCheckpointMap['hunyuan-video'];
    }
  }

  // Keep the user's workflow picker selection across /video reloads; only
  // assign when nothing is selected yet.
  const sharedPatch: Partial<SharedToolSettings> = {
    modelWorkflowMap: nextMap,
    modelCheckpointMap: nextCheckpointMap,
  };
  if (!shared.selectedWorkflowFileId?.trim()) {
    sharedPatch.selectedWorkflowFileId = workflow.id;
  }
  saveSharedSettings({
    ...shared,
    ...sharedPatch,
  });

  return {
    created,
    assigned: true,
    workflow,
    model,
    sharedPatch,
    checkpointFilename: nextCheckpointMap[model]?.trim() || checkpoint.filename,
    checkpointNote: checkpoint.note,
  };
}
