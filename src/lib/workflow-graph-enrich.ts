import type { WorkflowPlaceholderTokens } from './comfyui-config';
import { getComfyModelDefinition, type ComfyImageModel } from './comfy-models';
import {
  normalizeQueueQualityProfile,
  profileUsesNeuralUpscalePolish,
  profileUsesNeuralUpscaleEnrich,
  profileUsesSdxlRefinerEnrich,
  profileUsesLatentDetailPass,
  profileUsesSharpenAfterNeuralUpscale,
  profileUsesUpscaleEnrich,
  profileUsesRapidAioMoirePolish,
  profileUsesLightningDecodePolish,
  lightningDecodePolishBlurRadius,
  lightningDecodePolishBlurSigma,
  profileSkipsOutputUpscaleForModel,
  neuralUpscaleTileSizeForProfile,
  sdxlRefinerDenoiseForProfile,
  sdxlRefinerLatentScaleForProfile,
  latentDetailDenoiseForProfile,
  latentDetailScaleForProfile,
  lanczosPolishScaleAfterNeural,
  neuralTargetScaleAfterUpscale,
  outputUpscaleScaleAfterLatent,
  parseNeuralUpscaleFactor,
  sharpenAlphaForProfile,
  rapidAioMoireBlurRadius,
  rapidAioMoireBlurSigma,
  rapidAioMoireDownscaleFactor,
  rapidAioMoireDownscaleMethod,
  rapidAioMoireRestoreScale,
  rapidAioMoireRestoreSharpenAlpha,
  profileUsesRapidAioMoireResample,
  upscaleMethodForProfile,
  upscaleScaleForProfile,
  type QueueQualityProfile,
} from './queue-quality-profile';
import { isFluxFineTuneCheckpointModel } from './model-checkpoint-map';
import { isQwenRapidAioModel } from './model-denoise-defaults';
import {
  isModelSamplingFluxNode,
  isModelSamplingPatchNode,
  isQwenLightningModel,
  modelUsesFluxSamplingPatch,
  modelUsesShiftSamplingPatch,
  MODEL_SAMPLING_FLUX_NODE_TYPE,
} from './model-sampling-patch';
import { IMAGE_SCALE_BY_NODE_TYPE } from './workflow-direct-patch';
import { isUpscaleModelInstalled, pickUpscaleModelFromInventory } from './model-upscale-map';
import { pickSdxlRefinerFromInventory } from './model-checkpoint-map';
import type { WorkflowQueueOptimizeChange } from './workflow-queue-optimizer';
import {
  isCastcutEnrichedNode,
  isCastcutOutputUpscaleNode,
  PROMPT_STUDIO_META_PREFIX,
} from './workflow-enrich-markers';

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

const LOADER_TYPES = new Set([
  'CheckpointLoaderSimple',
  'CheckpointLoader',
  'UNETLoader',
  'UnetLoaderGGUF',
]);

const MODEL_CHAIN_TYPES = new Set([
  'LoraLoader',
  'LoraLoaderModelOnly',
  'Power Lora Loader (rgthree)',
  'ControlNetApply',
  'ControlNetApplyAdvanced',
  'DiffControlNetApply',
]);

const UPSCALE_NODE_TYPES = new Set([
  'ImageScale',
  IMAGE_SCALE_BY_NODE_TYPE,
  'UpscaleModel',
  'ImageUpscaleWithModel',
  'UltimateSDUpscale',
  'ImageScaleToTotalPixels',
  'Upscale',
]);

const VAE_DECODE_TYPES = new Set(['VAEDecode', 'PreviewImage']);

function isWorkflowSaveImageNode(node: WorkflowNode | undefined): boolean {
  return (
    Boolean(node?.inputs) &&
    (node?.class_type === 'SaveImage' || node?.class_type === 'SaveImageAdvanced')
  );
}

function parseNodeId(id: string): number | null {
  const parsed = Number(id);
  return Number.isFinite(parsed) ? parsed : null;
}

function nextWorkflowNodeId(workflow: Record<string, WorkflowNode>): string {
  let maxId = 0;
  for (const key of Object.keys(workflow)) {
    const parsed = parseNodeId(key);
    if (parsed != null && parsed > maxId) {
      maxId = parsed;
    }
  }
  return String(maxId + 1);
}

function getLinkedNodeId(value: unknown): string | null {
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return null;
}

function isLoaderNode(classType: string | undefined): boolean {
  return LOADER_TYPES.has(classType ?? '');
}

function isSamplerNode(classType: string | undefined, inputs: Record<string, unknown>): boolean {
  const classLower = (classType ?? '').toLowerCase();
  if (
    classLower.includes('ksampler') ||
    classLower.includes('samplercustom') ||
    classLower.includes('guider') ||
    classLower.includes('basicscheduler')
  ) {
    return true;
  }
  return 'seed' in inputs && ('steps' in inputs || 'cfg' in inputs);
}

function resolveModelChainLoaderId(
  workflow: Record<string, WorkflowNode>,
  startNodeId: string
): string | null {
  let current: string | null = startNodeId;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = workflow[current];
    if (!node) {
      return null;
    }

    const classType = node.class_type ?? '';
    if (isLoaderNode(classType)) {
      return current;
    }
    if (isModelSamplingPatchNode(classType) || isModelSamplingFluxNode(classType)) {
      return null;
    }

    const classLower = classType.toLowerCase();
    const followsModelChain = MODEL_CHAIN_TYPES.has(classType) || classLower.includes('lora');
    if (!followsModelChain) {
      return null;
    }

    current = getLinkedNodeId(node.inputs?.model);
  }

  return null;
}

function shouldSkipUpscaleEnrich(
  workflow: Record<string, WorkflowNode>,
  qualityProfile?: QueueQualityProfile,
  model?: string,
  hasInputImage?: boolean
): boolean {
  if (!profileUsesUpscaleEnrich(qualityProfile)) {
    return true;
  }

  const targetScale = upscaleScaleForProfile(qualityProfile, {
    model,
    hasInputImage,
  });
  for (const node of Object.values(workflow)) {
    const classType = node.class_type ?? '';
    if (!UPSCALE_NODE_TYPES.has(classType)) {
      continue;
    }
    if (isCastcutOutputUpscaleNode(node)) {
      return true;
    }
    // Community neural upscalers have no scale_by — still skip stacking another pass.
    if (
      classType === 'ImageUpscaleWithModel' ||
      classType === 'UpscaleModel' ||
      classType === 'UltimateSDUpscale'
    ) {
      return true;
    }
    const scaleBy = Number(node.inputs?.scale_by);
    if (Number.isFinite(scaleBy) && scaleBy >= targetScale * 0.85) {
      return true;
    }
  }
  return false;
}

function resolveSamplingPatchClassType(model: string | undefined): string | null {
  if (!model) {
    return null;
  }
  if (modelUsesFluxSamplingPatch(model)) {
    return MODEL_SAMPLING_FLUX_NODE_TYPE;
  }
  if (modelUsesShiftSamplingPatch(model)) {
    const category = getComfyModelDefinition(model as ComfyImageModel).category;
    if (category === 'sd3') {
      return 'ModelSamplingSD3';
    }
    return 'ModelSamplingAuraFlow';
  }
  return null;
}

function enrichSamplingPatchNodes(input: {
  workflow: Record<string, WorkflowNode>;
  tokens: WorkflowPlaceholderTokens;
  model?: string;
}): WorkflowQueueOptimizeChange[] {
  const patchClassType = resolveSamplingPatchClassType(input.model);
  if (!patchClassType) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];

  for (const [samplerId, samplerNode] of Object.entries(input.workflow)) {
    if (!samplerNode?.inputs || !isSamplerNode(samplerNode.class_type, samplerNode.inputs)) {
      continue;
    }

    const modelLink = getLinkedNodeId(samplerNode.inputs.model);
    if (!modelLink) {
      continue;
    }

    const loaderId = resolveModelChainLoaderId(input.workflow, modelLink);
    if (!loaderId) {
      continue;
    }

    const upstream = input.workflow[modelLink];
    if (
      upstream &&
      (isModelSamplingPatchNode(upstream.class_type ?? '') ||
        isModelSamplingFluxNode(upstream.class_type ?? ''))
    ) {
      continue;
    }

    const patchNodeId = nextWorkflowNodeId(input.workflow);
    const patchInputs: Record<string, unknown> = {
      model: [modelLink, 0],
    };

    if (patchClassType === MODEL_SAMPLING_FLUX_NODE_TYPE) {
      patchInputs.max_shift = input.tokens.fluxMaxShift;
      patchInputs.base_shift = input.tokens.fluxBaseShift;
    } else {
      patchInputs.shift = input.tokens.shift;
    }

    input.workflow[patchNodeId] = {
      class_type: patchClassType,
      inputs: patchInputs,
      _meta: { title: `${PROMPT_STUDIO_META_PREFIX} model sampling patch` },
    };
    samplerNode.inputs.model = [patchNodeId, 0];

    changes.push({
      kind: 'binding',
      severity: 'info',
      message: `Inserted ${patchClassType} before KSampler node ${samplerId} for ${input.model ?? 'model'} quality tuning.`,
    });
  }

  return changes;
}

const CHECKPOINT_LOADER_TYPES = new Set(['CheckpointLoaderSimple', 'CheckpointLoader']);

function countSamplerNodes(workflow: Record<string, WorkflowNode>): number {
  return Object.values(workflow).filter(
    node => node?.inputs && isSamplerNode(node.class_type ?? '', node.inputs)
  ).length;
}

/** Largest Castcut LatentUpscale(By) factor already inserted (refiner / detail). */
function promptStudioPriorLatentScale(workflow: Record<string, WorkflowNode>): number {
  let maxScale = 1;
  for (const node of Object.values(workflow)) {
    if (node.class_type !== 'LatentUpscale' && node.class_type !== 'LatentUpscaleBy') {
      continue;
    }
    const title = node._meta?.title?.toLowerCase() ?? '';
    if (!title.includes('prompt studio') && !title.includes('castcut')) {
      continue;
    }
    if (!/latent detail|sdxl latent|refiner/i.test(title)) {
      continue;
    }
    const scale = Number(node.inputs?.scale_by);
    if (Number.isFinite(scale) && scale > maxScale) {
      maxScale = scale;
    }
  }
  return maxScale;
}

function workflowHasRefinerPass(workflow: Record<string, WorkflowNode>): boolean {
  for (const node of Object.values(workflow)) {
    const classType = node.class_type ?? '';
    const title = node._meta?.title?.toLowerCase() ?? '';
    if (/refiner/i.test(title) || /latent detail/i.test(title)) {
      return true;
    }
    if (CHECKPOINT_LOADER_TYPES.has(classType)) {
      const ckpt = String(node.inputs?.ckpt_name ?? '');
      if (/refiner/i.test(ckpt)) {
        return true;
      }
    }
  }

  let checkpointLoaders = 0;
  for (const node of Object.values(workflow)) {
    if (CHECKPOINT_LOADER_TYPES.has(node.class_type ?? '')) {
      checkpointLoaders += 1;
    }
  }
  return checkpointLoaders >= 2;
}

type SamplerDecodeChain = {
  vaeDecodeId: string;
  samplerId: string;
};

function findPrimarySamplerDecodeChains(
  workflow: Record<string, WorkflowNode>
): SamplerDecodeChain[] {
  const chains: SamplerDecodeChain[] = [];

  for (const [vaeDecodeId, decodeNode] of Object.entries(workflow)) {
    if (decodeNode.class_type !== 'VAEDecode' || !decodeNode.inputs) {
      continue;
    }

    const samplerId = getLinkedNodeId(decodeNode.inputs.samples);
    if (!samplerId) {
      continue;
    }

    const sampler = workflow[samplerId];
    if (!sampler?.inputs || !isSamplerNode(sampler.class_type ?? '', sampler.inputs)) {
      continue;
    }

    const denoise = sampler.inputs.denoise;
    if (denoise != null && Number(denoise) < 0.95) {
      continue;
    }

    // Prefer KSampler-style nodes with denoise (skip SamplerCustom graphs).
    if (!('denoise' in sampler.inputs)) {
      continue;
    }

    chains.push({ vaeDecodeId, samplerId });
  }

  return chains;
}

function enrichLatentDetailPassNodes(input: {
  workflow: Record<string, WorkflowNode>;
  tokens: WorkflowPlaceholderTokens;
  model?: string;
  qualityProfile?: QueueQualityProfile;
}): WorkflowQueueOptimizeChange[] {
  if (!profileUsesLatentDetailPass(input.qualityProfile, { model: input.model })) {
    return [];
  }

  if (workflowHasRefinerPass(input.workflow) || countSamplerNodes(input.workflow) > 1) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];
  const scaleBy = latentDetailScaleForProfile(input.qualityProfile);
  const denoise = latentDetailDenoiseForProfile(input.qualityProfile, {
    model: input.model,
  });

  for (const chain of findPrimarySamplerDecodeChains(input.workflow)) {
    const baseSampler = input.workflow[chain.samplerId];
    if (!baseSampler?.inputs) {
      continue;
    }

    const latentUpscaleId = nextWorkflowNodeId(input.workflow);
    input.workflow[latentUpscaleId] = {
      class_type: 'LatentUpscaleBy',
      inputs: {
        samples: [chain.samplerId, 0],
        upscale_method: 'bislerp',
        scale_by: scaleBy,
      },
      _meta: { title: 'Castcut — latent detail upscale' },
    };

    const detailSamplerId = nextWorkflowNodeId(input.workflow);
    input.workflow[detailSamplerId] = {
      class_type: baseSampler.class_type ?? 'KSampler',
      inputs: {
        ...baseSampler.inputs,
        seed: baseSampler.inputs.seed ?? input.tokens.seed,
        steps: baseSampler.inputs.steps ?? input.tokens.steps,
        cfg: baseSampler.inputs.cfg ?? input.tokens.cfg,
        sampler_name: baseSampler.inputs.sampler_name ?? input.tokens.sampler,
        scheduler: baseSampler.inputs.scheduler ?? input.tokens.scheduler,
        denoise,
        latent_image: [latentUpscaleId, 0],
      },
      _meta: { title: 'Castcut — latent detail pass' },
    };

    const decodeNode = input.workflow[chain.vaeDecodeId];
    if (decodeNode?.inputs) {
      decodeNode.inputs.samples = [detailSamplerId, 0];
    }

    changes.push({
      kind: 'binding',
      severity: 'info',
      message: `Inserted latent detail pass (${scaleBy}× bislerp → denoise ${denoise}) before VAEDecode node ${chain.vaeDecodeId} for ${input.qualityProfile} quality.`,
    });
  }

  return changes;
}

type SdxlVaeDecodeChain = {
  vaeDecodeId: string;
  samplerId: string;
  loaderId: string;
};

function resolveCheckpointLoaderIdThroughModelChain(
  workflow: Record<string, WorkflowNode>,
  startNodeId: string
): string | null {
  let current: string | null = startNodeId;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = workflow[current];
    if (!node) {
      return null;
    }

    const classType = node.class_type ?? '';
    if (CHECKPOINT_LOADER_TYPES.has(classType)) {
      return current;
    }

    const classLower = classType.toLowerCase();
    const followsModelChain =
      MODEL_CHAIN_TYPES.has(classType) ||
      classLower.includes('lora') ||
      isModelSamplingPatchNode(classType) ||
      isModelSamplingFluxNode(classType);
    if (!followsModelChain) {
      return null;
    }

    current = getLinkedNodeId(node.inputs?.model);
  }

  return null;
}

function findSdxlVaeDecodeChains(workflow: Record<string, WorkflowNode>): SdxlVaeDecodeChain[] {
  const chains: SdxlVaeDecodeChain[] = [];

  for (const [vaeDecodeId, decodeNode] of Object.entries(workflow)) {
    if (decodeNode.class_type !== 'VAEDecode' || !decodeNode.inputs) {
      continue;
    }

    const samplerId = getLinkedNodeId(decodeNode.inputs.samples);
    if (!samplerId) {
      continue;
    }

    const sampler = workflow[samplerId];
    if (!sampler?.inputs || !isSamplerNode(sampler.class_type ?? '', sampler.inputs)) {
      continue;
    }

    const denoise = sampler.inputs.denoise;
    if (denoise != null && Number(denoise) < 0.95) {
      continue;
    }

    const modelLink = getLinkedNodeId(sampler.inputs.model);
    if (!modelLink) {
      continue;
    }

    const loaderId = resolveCheckpointLoaderIdThroughModelChain(workflow, modelLink);
    if (!loaderId) {
      continue;
    }

    chains.push({ vaeDecodeId, samplerId, loaderId });
  }

  return chains;
}

function enrichSdxlRefinerNodes(input: {
  workflow: Record<string, WorkflowNode>;
  tokens: WorkflowPlaceholderTokens;
  model?: string;
  qualityProfile?: QueueQualityProfile;
  refinerCheckpointFilename?: string;
  availableCheckpoints?: string[] | null;
}): WorkflowQueueOptimizeChange[] {
  if (!profileUsesSdxlRefinerEnrich(input.qualityProfile)) {
    return [];
  }

  if (!input.model) {
    return [];
  }

  const def = getComfyModelDefinition(input.model as ComfyImageModel);
  if (def.category !== 'sdxl' || input.model.toLowerCase().includes('refiner')) {
    return [];
  }

  const refinerCkptMapped = input.refinerCheckpointFilename?.trim();
  let refinerCkpt = refinerCkptMapped;
  if (
    !refinerCkpt ||
    (input.availableCheckpoints &&
      input.availableCheckpoints.length > 0 &&
      !input.availableCheckpoints.includes(refinerCkpt))
  ) {
    const picked = pickSdxlRefinerFromInventory(input.availableCheckpoints);
    if (picked) {
      refinerCkpt = picked;
    }
  }

  if (!refinerCkpt) {
    return [
      {
        kind: 'audit',
        severity: 'warn',
        message:
          'SDXL Final/Max refiner skipped — map a refiner checkpoint in Settings (e.g. sd_xl_refiner_1.0.safetensors).',
      },
    ];
  }

  if (
    input.availableCheckpoints &&
    input.availableCheckpoints.length > 0 &&
    !input.availableCheckpoints.includes(refinerCkpt)
  ) {
    return [
      {
        kind: 'audit',
        severity: 'warn',
        message: `SDXL Final/Max refiner skipped — “${refinerCkpt}” not found in ComfyUI checkpoints.`,
      },
    ];
  }

  if (workflowHasRefinerPass(input.workflow) || countSamplerNodes(input.workflow) > 1) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];

  for (const chain of findSdxlVaeDecodeChains(input.workflow)) {
    const baseSampler = input.workflow[chain.samplerId];
    if (!baseSampler?.inputs) {
      continue;
    }

    const refinerLoaderId = nextWorkflowNodeId(input.workflow);
    input.workflow[refinerLoaderId] = {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: refinerCkpt },
      _meta: { title: 'Castcut — SDXL refiner' },
    };

    const refinerPositiveId = nextWorkflowNodeId(input.workflow);
    input.workflow[refinerPositiveId] = {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: input.tokens.positive,
        clip: [refinerLoaderId, 1],
      },
      _meta: { title: 'Castcut — refiner positive' },
    };

    const refinerNegativeId = nextWorkflowNodeId(input.workflow);
    input.workflow[refinerNegativeId] = {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: input.tokens.negative,
        clip: [refinerLoaderId, 1],
      },
      _meta: { title: 'Castcut — refiner negative' },
    };

    const latentUpscaleId = nextWorkflowNodeId(input.workflow);
    input.workflow[latentUpscaleId] = {
      class_type: 'LatentUpscaleBy',
      inputs: {
        samples: [chain.samplerId, 0],
        upscale_method: 'bislerp',
        scale_by: sdxlRefinerLatentScaleForProfile(input.qualityProfile),
      },
      _meta: { title: 'Castcut — SDXL latent upscale' },
    };

    const refinerSamplerId = nextWorkflowNodeId(input.workflow);
    input.workflow[refinerSamplerId] = {
      class_type: 'KSampler',
      inputs: {
        seed: baseSampler.inputs.seed ?? input.tokens.seed,
        steps: input.tokens.steps,
        cfg: '5.5',
        sampler_name: input.tokens.sampler,
        scheduler: input.tokens.scheduler,
        denoise: sdxlRefinerDenoiseForProfile(input.qualityProfile),
        model: [refinerLoaderId, 0],
        positive: [refinerPositiveId, 0],
        negative: [refinerNegativeId, 0],
        latent_image: [latentUpscaleId, 0],
      },
      _meta: { title: 'Castcut — SDXL refiner pass' },
    };

    const decodeNode = input.workflow[chain.vaeDecodeId];
    if (decodeNode?.inputs) {
      decodeNode.inputs.samples = [refinerSamplerId, 0];
    }

    changes.push({
      kind: 'binding',
      severity: 'info',
      message: `Inserted SDXL latent upscale (${sdxlRefinerLatentScaleForProfile(input.qualityProfile)}×) + refiner KSampler (${refinerCkpt}) before VAEDecode node ${chain.vaeDecodeId}.`,
    });
  }

  return changes;
}

function insertLanczosPolishAfterNode(input: {
  workflow: Record<string, WorkflowNode>;
  saveNode: WorkflowNode;
  sourceNodeId: string;
  scaleBy: number;
  title: string;
  method?: 'lanczos' | 'area' | 'bilinear' | 'bicubic' | 'nearest-exact';
}): string {
  const polishNodeId = nextWorkflowNodeId(input.workflow);
  input.workflow[polishNodeId] = {
    class_type: IMAGE_SCALE_BY_NODE_TYPE,
    inputs: {
      image: [input.sourceNodeId, 0],
      upscale_method: input.method ?? 'lanczos',
      scale_by: input.scaleBy,
    },
    _meta: { title: input.title },
  };
  input.saveNode.inputs!.images = [polishNodeId, 0];
  return polishNodeId;
}

function maybeInsertSharpenAfterUpscale(input: {
  workflow: Record<string, WorkflowNode>;
  saveNode: WorkflowNode;
  sourceNodeId: string;
  qualityProfile?: QueueQualityProfile;
  enrichSharpen?: boolean;
  saveId: string;
  model?: string;
  /** Only true when chained after neural UpscaleModel (not Lanczos-only). */
  afterNeural?: boolean;
}): WorkflowQueueOptimizeChange | null {
  const forceUltraRealMildSharpen =
    isFluxFineTuneCheckpointModel(input.model) &&
    normalizeQueueQualityProfile(input.qualityProfile) === 'max' &&
    input.afterNeural === true;
  if (input.enrichSharpen !== true && !forceUltraRealMildSharpen) {
    return null;
  }
  if (
    !profileUsesSharpenAfterNeuralUpscale(input.qualityProfile, {
      model: input.model,
      afterNeural: input.afterNeural === true,
    })
  ) {
    return null;
  }

  const alpha = sharpenAlphaForProfile(input.qualityProfile, {
    model: input.model,
  });
  const sharpenNodeId = nextWorkflowNodeId(input.workflow);
  input.workflow[sharpenNodeId] = {
    class_type: 'ImageSharpen',
    inputs: {
      image: [input.sourceNodeId, 0],
      sharpen_radius: 1,
      sigma: 0.45,
      alpha,
    },
    _meta: { title: 'Castcut — output sharpen' },
  };
  input.saveNode.inputs!.images = [sharpenNodeId, 0];

  return {
    kind: 'binding',
    severity: 'info',
    message: `Inserted subtle ImageSharpen (α${alpha}) after neural upscale before SaveImage node ${input.saveId} for ${input.qualityProfile} quality.`,
  };
}

function enrichLanczosUpscaleNodes(input: {
  workflow: Record<string, WorkflowNode>;
  qualityProfile?: QueueQualityProfile;
  enrichSharpen?: boolean;
  model?: string;
  hasInputImage?: boolean;
}): WorkflowQueueOptimizeChange[] {
  // Lightning Final/Max: soft Lanczos only (ImageSharpen polish stays off).
  if (!profileUsesUpscaleEnrich(input.qualityProfile)) {
    return [];
  }
  if (
    shouldSkipUpscaleEnrich(input.workflow, input.qualityProfile, input.model, input.hasInputImage)
  ) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];
  const priorLatentScale = promptStudioPriorLatentScale(input.workflow);
  const scaleBy = outputUpscaleScaleAfterLatent(input.qualityProfile, {
    model: input.model,
    priorLatentScale,
    hasInputImage: input.hasInputImage,
  });
  if (scaleBy <= 1) {
    return [];
  }
  const method = upscaleMethodForProfile(input.qualityProfile, { model: input.model });

  for (const [saveId, saveNode] of Object.entries(input.workflow)) {
    if (!isWorkflowSaveImageNode(saveNode) || !saveNode.inputs) {
      continue;
    }

    const imageLink = getLinkedNodeId(saveNode.inputs.images);
    if (!imageLink) {
      continue;
    }

    const upstream = input.workflow[imageLink];
    if (!upstream || !VAE_DECODE_TYPES.has(upstream.class_type ?? '')) {
      continue;
    }

    const scaleNodeId = nextWorkflowNodeId(input.workflow);
    input.workflow[scaleNodeId] = {
      class_type: IMAGE_SCALE_BY_NODE_TYPE,
      inputs: {
        image: [imageLink, 0],
        upscale_method: method,
        scale_by: scaleBy,
      },
      _meta: { title: 'Castcut — output upscale' },
    };
    saveNode.inputs.images = [scaleNodeId, 0];

    changes.push({
      kind: 'binding',
      severity: 'info',
      message: `Inserted ImageScaleBy (${scaleBy}× ${method}) before SaveImage node ${saveId} for ${input.qualityProfile} quality.`,
    });

    // Lanczos-only Final/Max: skip ImageSharpen (skin/wax risk) — neural path only.
  }

  return changes;
}

function enrichNeuralUpscaleNodes(input: {
  workflow: Record<string, WorkflowNode>;
  qualityProfile?: QueueQualityProfile;
  upscaleModelFilename: string;
  enrichNeuralPolish?: boolean;
  enrichSharpen?: boolean;
  model?: string;
  supportsNeuralUpscaleTileSize?: boolean;
}): WorkflowQueueOptimizeChange[] {
  if (isQwenLightningModel(input.model)) {
    return [];
  }
  if (!profileUsesUpscaleEnrich(input.qualityProfile)) {
    return [];
  }
  if (shouldSkipUpscaleEnrich(input.workflow, input.qualityProfile, input.model)) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];
  const modelName = input.upscaleModelFilename.trim();

  for (const [saveId, saveNode] of Object.entries(input.workflow)) {
    if (!isWorkflowSaveImageNode(saveNode) || !saveNode.inputs) {
      continue;
    }

    const imageLink = getLinkedNodeId(saveNode.inputs.images);
    if (!imageLink) {
      continue;
    }

    const upstream = input.workflow[imageLink];
    if (!upstream || !VAE_DECODE_TYPES.has(upstream.class_type ?? '')) {
      continue;
    }

    const loaderNodeId = nextWorkflowNodeId(input.workflow);
    input.workflow[loaderNodeId] = {
      class_type: 'UpscaleModelLoader',
      inputs: {
        model_name: modelName,
      },
      _meta: { title: 'Castcut — upscale model' },
    };

    const upscaleNodeId = nextWorkflowNodeId(input.workflow);
    const tileSize =
      input.supportsNeuralUpscaleTileSize === true
        ? neuralUpscaleTileSizeForProfile(input.qualityProfile)
        : 0;
    const upscaleInputs: Record<string, unknown> = {
      upscale_model: [loaderNodeId, 0],
      image: [imageLink, 0],
    };
    if (tileSize > 0) {
      upscaleInputs.tile_size = tileSize;
    }
    input.workflow[upscaleNodeId] = {
      class_type: 'ImageUpscaleWithModel',
      inputs: upscaleInputs,
      _meta: { title: 'Castcut — neural upscale' },
    };

    let outputNodeId = upscaleNodeId;
    saveNode.inputs.images = [outputNodeId, 0];

    const usePolish =
      input.enrichNeuralPolish !== false &&
      profileUsesNeuralUpscalePolish(input.qualityProfile, { model: input.model });
    const polishScale = usePolish ? lanczosPolishScaleAfterNeural({ model: input.model }) : 1;
    const priorLatentScale = promptStudioPriorLatentScale(input.workflow);

    // Cap neural output to Final/Max net target; account for latent refiner/detail + polish.
    const targetScale = neuralTargetScaleAfterUpscale(input.qualityProfile, {
      model: input.model,
      neuralFactor: parseNeuralUpscaleFactor(modelName),
      polishScale: polishScale > 1 ? polishScale : undefined,
      priorLatentScale,
    });
    if (targetScale > 0 && targetScale !== 1) {
      outputNodeId = insertLanczosPolishAfterNode({
        workflow: input.workflow,
        saveNode,
        sourceNodeId: outputNodeId,
        scaleBy: targetScale,
        method: 'area',
        title: 'Castcut — neural target upscale',
      });
      changes.push({
        kind: 'binding',
        severity: 'info',
        message: `Scaled neural upscale to ${targetScale}× (target Final/Max size) before SaveImage node ${saveId}.`,
      });
    }

    if (usePolish && polishScale > 1) {
      outputNodeId = insertLanczosPolishAfterNode({
        workflow: input.workflow,
        saveNode,
        sourceNodeId: outputNodeId,
        scaleBy: polishScale,
        title: 'Castcut — Lanczos polish',
      });
      changes.push({
        kind: 'binding',
        severity: 'info',
        message: `Chained ${polishScale}× Lanczos polish after neural upscale before SaveImage node ${saveId}.`,
      });
    }

    const tileNote = tileSize > 0 ? ` (tile_size ${tileSize})` : '';
    changes.push({
      kind: 'binding',
      severity: 'info',
      message: `Inserted UpscaleModelLoader + ImageUpscaleWithModel (${modelName})${tileNote} before SaveImage node ${saveId} for ${input.qualityProfile} quality.`,
    });

    const sharpenChange = maybeInsertSharpenAfterUpscale({
      workflow: input.workflow,
      saveNode,
      sourceNodeId: outputNodeId,
      qualityProfile: input.qualityProfile,
      enrichSharpen: input.enrichSharpen,
      saveId,
      model: input.model,
      afterNeural: true,
    });
    if (sharpenChange) {
      changes.push(sharpenChange);
    }
  }

  return changes;
}

function enrichUpscaleNodes(input: {
  workflow: Record<string, WorkflowNode>;
  qualityProfile?: QueueQualityProfile;
  upscaleModelFilename?: string;
  enrichNeuralPolish?: boolean;
  enrichSharpen?: boolean;
  model?: string;
  availableUpscaleModels?: string[] | null;
  supportsNeuralUpscaleTileSize?: boolean;
  hasInputImage?: boolean;
}): WorkflowQueueOptimizeChange[] {
  // Rapid AIO / Edit Lightning T2I: skip Final/Max output upscale (moiré or mush).
  if (
    profileSkipsOutputUpscaleForModel(input.qualityProfile, {
      model: input.model,
      hasInputImage: input.hasInputImage,
    })
  ) {
    if (isQwenRapidAioModel(input.model)) {
      return [
        {
          kind: 'audit',
          severity: 'info',
          message:
            'Skipped Final/Max output upscale for Rapid AIO (re-amplifies moiré) — moiré polish runs instead.',
        },
      ];
    }
    if (/qwen-image-edit-2511-lightning/i.test(String(input.model ?? ''))) {
      return [
        {
          kind: 'audit',
          severity: 'info',
          message:
            'Skipped Final/Max Lanczos for Edit-2511 Lightning T2I (enlarges soft artifacts) — Compose I2I still gets light Lanczos.',
        },
      ];
    }
    if (isFluxFineTuneCheckpointModel(input.model)) {
      return [
        {
          kind: 'audit',
          severity: 'info',
          message:
            'Skipped Final output upscale for UltraReal (Lanczos plastics skin) — use Max for mild neural recovery.',
        },
      ];
    }
    if (/qwen-image-2512-lightning/i.test(String(input.model ?? ''))) {
      return [
        {
          kind: 'audit',
          severity: 'info',
          message:
            'Skipped Final/Max upscale for Qwen 2512 Lightning (Lanczos/UltraSharp hardens CFG-1 decode) — soft blur polish runs instead.',
        },
      ];
    }
    return [];
  }

  if (!profileUsesNeuralUpscaleEnrich(input.qualityProfile, { model: input.model })) {
    return enrichLanczosUpscaleNodes({
      workflow: input.workflow,
      qualityProfile: input.qualityProfile,
      enrichSharpen: input.enrichSharpen,
      model: input.model,
      hasInputImage: input.hasInputImage,
    });
  }

  const mapped = input.upscaleModelFilename?.trim();
  const picked = pickUpscaleModelFromInventory(input.availableUpscaleModels, mapped, input.model);
  const neuralAvailable =
    Boolean(picked) && isUpscaleModelInstalled(picked, input.availableUpscaleModels);

  if (neuralAvailable && picked) {
    const changes: WorkflowQueueOptimizeChange[] = [];
    if (mapped && picked !== mapped) {
      changes.push({
        kind: 'audit',
        severity: 'info',
        message: `Neural upscaler “${mapped}” missing — using installed “${picked}” from ComfyUI inventory.`,
      });
    }
    return [
      ...changes,
      ...enrichNeuralUpscaleNodes({
        workflow: input.workflow,
        qualityProfile: input.qualityProfile,
        upscaleModelFilename: picked,
        enrichNeuralPolish: input.enrichNeuralPolish,
        enrichSharpen: input.enrichSharpen,
        model: input.model,
        supportsNeuralUpscaleTileSize: input.supportsNeuralUpscaleTileSize,
      }),
    ];
  }

  const lanczosChanges = enrichLanczosUpscaleNodes({
    workflow: input.workflow,
    qualityProfile: input.qualityProfile,
    enrichSharpen: input.enrichSharpen,
    model: input.model,
  });

  if (isFluxFineTuneCheckpointModel(input.model)) {
    return [
      {
        kind: 'audit',
        severity: 'warn',
        message: mapped
          ? `UltraReal Max neural “${mapped}” missing — using mild Lanczos (~1.35×). Install/map 4x-UltraSharp in Settings → Upscale for sharper recovery.`
          : 'UltraReal Max — no neural upscaler mapped; using mild Lanczos (~1.35×). Map 4x-UltraSharp in Settings → Upscale when available.',
      },
      ...lanczosChanges,
    ];
  }

  if (mapped) {
    return [
      {
        kind: 'audit',
        severity: 'warn',
        message: `Neural upscaler “${mapped}” not installed in ComfyUI — using Lanczos Final/Max upscale instead. Map an installed 4× model in Settings → Upscale, or install 4x-UltraSharp.`,
      },
      ...lanczosChanges,
    ];
  }

  return [
    {
      kind: 'audit',
      severity: 'warn',
      message:
        'No neural upscaler mapped or installed — using Lanczos Final/Max upscale. Install 4x-UltraSharp (or similar) and map it in Settings → Upscale for sharper keepers.',
    },
    ...lanczosChanges,
  ];
}

/** Soft blur (+ optional mild resample on Max) before SaveImage — Rapid AIO moiré cleanup. */
function enrichRapidAioMoirePolish(input: {
  workflow: Record<string, WorkflowNode>;
  qualityProfile?: QueueQualityProfile;
  model?: string;
}): WorkflowQueueOptimizeChange[] {
  if (!profileUsesRapidAioMoirePolish(input.qualityProfile, { model: input.model })) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];
  const blurRadius = rapidAioMoireBlurRadius(input.qualityProfile);
  const blurSigma = rapidAioMoireBlurSigma(input.qualityProfile);
  const resample = profileUsesRapidAioMoireResample(input.qualityProfile);
  const downscale = rapidAioMoireDownscaleFactor(input.qualityProfile);
  const downMethod = rapidAioMoireDownscaleMethod(input.qualityProfile);
  const restore = rapidAioMoireRestoreScale(input.qualityProfile);
  const sharpenAlpha = rapidAioMoireRestoreSharpenAlpha(input.qualityProfile);

  for (const [saveId, saveNode] of Object.entries(input.workflow)) {
    if (!isWorkflowSaveImageNode(saveNode) || !saveNode.inputs) {
      continue;
    }
    const imageLink = getLinkedNodeId(saveNode.inputs.images);
    if (!imageLink) {
      continue;
    }
    const upstream = input.workflow[imageLink];
    const upstreamTitle = upstream?._meta?.title ?? '';
    if (
      (upstream?.class_type === 'ImageScaleBy' ||
        upstream?.class_type === 'ImageBlur' ||
        upstream?.class_type === 'ImageSharpen') &&
      (upstreamTitle.includes('Rapid AIO') ||
        upstreamTitle.includes('moiré') ||
        upstreamTitle.includes('moire'))
    ) {
      continue;
    }

    // Soft blur knocks down screen-door without destroying acuity.
    // Max only: mild bicubic↓ → Lanczos↑ (+ tiny sharpen) for stubborn moiré.
    // Final skips resample — area↓/lanczos↑ looked pixelated when gallery-scaled.
    const blurNodeId = nextWorkflowNodeId(input.workflow);
    input.workflow[blurNodeId] = {
      class_type: 'ImageBlur',
      inputs: {
        image: [imageLink, 0],
        blur_radius: blurRadius,
        sigma: blurSigma,
      },
      _meta: { title: 'Castcut — Rapid AIO moiré polish' },
    };
    let outputNodeId = blurNodeId;

    if (resample && downscale < 0.999) {
      const downNodeId = nextWorkflowNodeId(input.workflow);
      input.workflow[downNodeId] = {
        class_type: IMAGE_SCALE_BY_NODE_TYPE,
        inputs: {
          image: [outputNodeId, 0],
          upscale_method: downMethod,
          scale_by: downscale,
        },
        _meta: { title: 'Castcut — Rapid AIO moiré downscale' },
      };

      const restoreNodeId = nextWorkflowNodeId(input.workflow);
      input.workflow[restoreNodeId] = {
        class_type: IMAGE_SCALE_BY_NODE_TYPE,
        inputs: {
          image: [downNodeId, 0],
          upscale_method: 'lanczos',
          scale_by: restore,
        },
        _meta: { title: 'Castcut — Rapid AIO size restore' },
      };
      outputNodeId = restoreNodeId;

      if (sharpenAlpha > 0) {
        const sharpenNodeId = nextWorkflowNodeId(input.workflow);
        input.workflow[sharpenNodeId] = {
          class_type: 'ImageSharpen',
          inputs: {
            image: [outputNodeId, 0],
            sharpen_radius: 1,
            sigma: 0.6,
            alpha: sharpenAlpha,
          },
          _meta: { title: 'Castcut — Rapid AIO edge recovery' },
        };
        outputNodeId = sharpenNodeId;
      }
    }

    saveNode.inputs.images = [outputNodeId, 0];

    changes.push({
      kind: 'binding',
      severity: 'info',
      message: resample
        ? `Inserted Rapid AIO moiré polish (blur → ${downMethod} ${downscale}× → lanczos ${restore}×) before SaveImage node ${saveId}.`
        : `Inserted Rapid AIO moiré polish (soft blur only, no resample) before SaveImage node ${saveId}.`,
    });
  }

  return changes;
}

/**
 * Qwen 2512 Lightning: soft ImageBlur after VAEDecode. No resample and no
 * Lanczos — those are what make wet streets and skin look metallic.
 */
function enrichLightningDecodePolish(input: {
  workflow: Record<string, WorkflowNode>;
  qualityProfile?: QueueQualityProfile;
  model?: string;
}): WorkflowQueueOptimizeChange[] {
  if (!profileUsesLightningDecodePolish(input.qualityProfile, { model: input.model })) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];
  const blurRadius = lightningDecodePolishBlurRadius(input.qualityProfile);
  const blurSigma = lightningDecodePolishBlurSigma(input.qualityProfile);

  for (const [saveId, saveNode] of Object.entries(input.workflow)) {
    if (!isWorkflowSaveImageNode(saveNode) || !saveNode.inputs) {
      continue;
    }
    const imageLink = getLinkedNodeId(saveNode.inputs.images);
    if (!imageLink) {
      continue;
    }
    const upstream = input.workflow[imageLink];
    const upstreamTitle = upstream?._meta?.title ?? '';
    if (
      upstream?.class_type === 'ImageBlur' &&
      (upstreamTitle.includes('Lightning decode') ||
        upstreamTitle.includes('2512 Lightning') ||
        upstreamTitle.toLowerCase().includes('decode polish'))
    ) {
      continue;
    }

    const blurNodeId = nextWorkflowNodeId(input.workflow);
    input.workflow[blurNodeId] = {
      class_type: 'ImageBlur',
      inputs: {
        image: [imageLink, 0],
        blur_radius: blurRadius,
        sigma: blurSigma,
      },
      _meta: { title: 'Castcut — Lightning decode polish' },
    };
    saveNode.inputs.images = [blurNodeId, 0];

    changes.push({
      kind: 'binding',
      severity: 'info',
      message: `Inserted Lightning decode polish (soft blur σ${blurSigma}, no upscale) before SaveImage node ${saveId}.`,
    });
  }

  return changes;
}

/**
 * Final/Max video scaffold polish — Raise SaveAnimatedWEBP quality (Draft keeps
 * scaffold defaults). Does not touch temporal sampling; VRAM-safe.
 */
export function enrichVideoSavePolish(input: {
  workflow: Record<string, WorkflowNode>;
  qualityProfile?: QueueQualityProfile;
}): WorkflowQueueOptimizeChange[] {
  if (!profileUsesUpscaleEnrich(input.qualityProfile)) {
    return [];
  }
  const mode = input.qualityProfile === 'max' ? 'max' : 'final';
  const targetQuality = mode === 'max' ? 98 : 95;
  const changes: WorkflowQueueOptimizeChange[] = [];

  for (const [, node] of Object.entries(input.workflow)) {
    if (node.class_type !== 'SaveAnimatedWEBP' || !node.inputs) {
      continue;
    }
    const prevQuality = Number(node.inputs.quality);
    let touched = false;
    if (!Number.isFinite(prevQuality) || prevQuality < targetQuality) {
      node.inputs.quality = targetQuality;
      touched = true;
    }
    if (touched) {
      if (!isCastcutEnrichedNode(node._meta)) {
        node._meta = {
          ...(node._meta ?? {}),
          title: `${PROMPT_STUDIO_META_PREFIX} video WEBP ${mode}`,
        };
      }
      changes.push({
        kind: 'audit',
        severity: 'info',
        message: `Raised SaveAnimatedWEBP quality to ${targetQuality} for ${mode} video queue.`,
      });
    }
  }

  return changes;
}

export function enrichWorkflowGraph(input: {
  workflow: Record<string, unknown>;
  tokens: WorkflowPlaceholderTokens;
  model?: string;
  qualityProfile?: QueueQualityProfile;
  upscaleModelFilename?: string;
  refinerCheckpointFilename?: string;
  enrichSampling?: boolean;
  enrichUpscale?: boolean;
  enrichSdxlRefiner?: boolean;
  enrichNeuralPolish?: boolean;
  enrichSharpen?: boolean;
  availableUpscaleModels?: string[] | null;
  availableCheckpoints?: string[] | null;
  supportsNeuralUpscaleTileSize?: boolean;
  hasInputImage?: boolean;
}): {
  workflow: Record<string, unknown>;
  changes: WorkflowQueueOptimizeChange[];
} {
  const workflow = structuredClone(input.workflow) as Record<string, WorkflowNode>;
  const changes: WorkflowQueueOptimizeChange[] = [];

  if (input.enrichSampling !== false) {
    changes.push(
      ...enrichSamplingPatchNodes({
        workflow,
        tokens: input.tokens,
        model: input.model,
      })
    );
  }

  if (input.enrichSdxlRefiner !== false) {
    changes.push(
      ...enrichSdxlRefinerNodes({
        workflow,
        tokens: input.tokens,
        model: input.model,
        qualityProfile: input.qualityProfile,
        refinerCheckpointFilename: input.refinerCheckpointFilename,
        availableCheckpoints: input.availableCheckpoints,
      })
    );
  }

  // Flux Final/Max — soft second pass (self-gated; skips Qwen 2512/2.0, SDXL, Lightning, Rapid).
  changes.push(
    ...enrichLatentDetailPassNodes({
      workflow,
      tokens: input.tokens,
      model: input.model,
      qualityProfile: input.qualityProfile,
    })
  );

  if (input.enrichUpscale !== false) {
    changes.push(
      ...enrichUpscaleNodes({
        workflow,
        qualityProfile: input.qualityProfile,
        upscaleModelFilename: input.upscaleModelFilename,
        enrichNeuralPolish: input.enrichNeuralPolish,
        enrichSharpen: input.enrichSharpen,
        model: input.model,
        availableUpscaleModels: input.availableUpscaleModels,
        supportsNeuralUpscaleTileSize: input.supportsNeuralUpscaleTileSize,
        hasInputImage: input.hasInputImage,
      })
    );
  }

  changes.push(
    ...enrichRapidAioMoirePolish({
      workflow,
      qualityProfile: input.qualityProfile,
      model: input.model,
    })
  );

  changes.push(
    ...enrichLightningDecodePolish({
      workflow,
      qualityProfile: input.qualityProfile,
      model: input.model,
    })
  );

  changes.push(
    ...enrichVideoSavePolish({
      workflow,
      qualityProfile: input.qualityProfile,
    })
  );

  return { workflow, changes };
}
