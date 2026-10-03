/**
 * Engine health: can this ComfyUI run each engine the player can pick (Day / Story / Outfit
 * stills, Animate clips — see engine-health-engines)? An engine's requirements are read from
 * the graph its builder makes — the node types it uses and the model files its loader nodes
 * name — and checked against `/object_info` (node types and loader file lists). Pure: the
 * browser half (engine-health-client) builds the graph through the same preview the workflow
 * health panel's queue test uses, and caches the result per ComfyUI URL.
 */

import type { ComfyUiModelLists } from './comfyui-object-info';
import { lookupKnownComfyNodePack } from './comfyui-custom-node-registry';
import { isFilenameInUnetLoaderList } from './loader-map-inventory-sync';
import { isComfyUiOnlyNodeType } from './workflow-node-type-audit';
import type {
  EngineHealthStatus,
  EngineModelFolder,
  EngineModelRequirement,
} from './engine-health-engines';

export {
  ENGINE_HEALTH_ENGINES,
  engineForModel,
  engineHealthChipLabel,
  type EngineHealth,
  type EngineHealthEngine,
  type EngineHealthState,
  type EngineHealthStatus,
  type EngineModelRequirement,
} from './engine-health-engines';

export type EngineRequirements = {
  nodeTypes: string[];
  models: EngineModelRequirement[];
};

/** Loader node → which `/object_info` file list its inputs name files from. */
const LOADER_INPUTS: Record<string, Array<[string, EngineModelFolder]>> = {
  CheckpointLoaderSimple: [['ckpt_name', 'checkpoints']],
  CheckpointLoader: [['ckpt_name', 'checkpoints']],
  UNETLoader: [['unet_name', 'unets']],
  UnetLoaderGGUF: [['unet_name', 'unets']],
  VAELoader: [['vae_name', 'vaes']],
  CLIPLoader: [['clip_name', 'clips']],
  DualCLIPLoader: [
    ['clip_name1', 'clips'],
    ['clip_name2', 'clips'],
  ],
  TripleCLIPLoader: [
    ['clip_name1', 'clips'],
    ['clip_name2', 'clips'],
    ['clip_name3', 'clips'],
  ],
  LoraLoader: [['lora_name', 'loras']],
  LoraLoaderModelOnly: [['lora_name', 'loras']],
  ControlNetLoader: [['control_net_name', 'controlNets']],
  DiffControlNetLoader: [['control_net_name', 'controlNets']],
  UpscaleModelLoader: [['model_name', 'upscaleModels']],
  CLIPVisionLoader: [['clip_name', 'clipVisions']],
};

const PLACEHOLDER = /^\{\{[A-Z0-9_]+\}\}$/;

/** Node types and loader files a built (API-format) graph needs. */
export function collectEngineRequirements(
  workflow: Record<string, unknown>,
  extraNodeTypes: readonly string[] = []
): EngineRequirements {
  const nodeTypes = new Set<string>(extraNodeTypes);
  const models: EngineModelRequirement[] = [];
  const seen = new Set<string>();
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') continue;
    const record = node as { class_type?: unknown; inputs?: Record<string, unknown> };
    const classType = typeof record.class_type === 'string' ? record.class_type.trim() : '';
    if (!classType || isComfyUiOnlyNodeType(classType)) continue;
    nodeTypes.add(classType);
    for (const [input, folder] of LOADER_INPUTS[classType] ?? []) {
      const value = record.inputs?.[input];
      const filename = typeof value === 'string' ? value.trim() : '';
      if (!filename || PLACEHOLDER.test(filename)) continue;
      const key = `${folder}:${filename}`;
      if (seen.has(key)) continue;
      seen.add(key);
      models.push({ classType, input, folder, filename });
    }
  }
  return { nodeTypes: [...nodeTypes].sort(), models };
}

function hasModelFile(requirement: EngineModelRequirement, models: ComfyUiModelLists): boolean {
  const list = models[requirement.folder] ?? [];
  if (requirement.folder === 'unets') {
    return isFilenameInUnetLoaderList(requirement.filename, list);
  }
  return list.includes(requirement.filename);
}

function more(count: number): string {
  return count > 0 ? ` (+${count} more)` : '';
}

/**
 * Requirements → status. Missing nodes come first (a file can't load without its loader);
 * `unknown` when ComfyUI's node list could not be read.
 */
export function engineHealthFromRequirements(input: {
  requirements: EngineRequirements;
  knownNodeTypes: ReadonlySet<string> | null | undefined;
  models: ComfyUiModelLists | null | undefined;
}): EngineHealthStatus {
  const { requirements, knownNodeTypes, models } = input;
  if (!knownNodeTypes || knownNodeTypes.size === 0) {
    return {
      state: 'unknown',
      missingNodes: [],
      missingModels: [],
      nodePacks: [],
      summary: 'ComfyUI did not answer — not checked',
    };
  }
  const missingNodes = requirements.nodeTypes.filter(type => !knownNodeTypes.has(type));
  const missingModels = models
    ? requirements.models.filter(
        requirement =>
          knownNodeTypes.has(requirement.classType) && !hasModelFile(requirement, models)
      )
    : [];
  const nodePacks = [
    ...new Set(
      missingNodes
        .map(type => lookupKnownComfyNodePack(type))
        .map(pack => pack?.title ?? pack?.name ?? '')
        .filter(Boolean)
    ),
  ];
  if (missingNodes.length > 0) {
    return {
      state: 'missing-node',
      missingNodes,
      missingModels,
      nodePacks,
      summary: `Missing node ${missingNodes[0]}${more(missingNodes.length - 1)}`,
    };
  }
  if (missingModels.length > 0) {
    return {
      state: 'missing-model',
      missingNodes,
      missingModels,
      nodePacks,
      summary: `Missing model ${missingModels[0].filename}${more(missingModels.length - 1)}`,
    };
  }
  return { state: 'ready', missingNodes, missingModels, nodePacks, summary: 'Ready' };
}
