import {
  DEFAULT_CFG_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_FLUX_BASE_SHIFT_TOKEN,
  DEFAULT_FLUX_MAX_SHIFT_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_INIT_IMAGE_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  DEFAULT_SAMPLER_TOKEN,
  DEFAULT_SCHEDULER_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_SHIFT_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_WIDTH_TOKEN,
  type WorkflowPlaceholderTokens,
} from '../comfyui/config';
import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
} from '../model/checkpoint-map';
import { DEFAULT_UPSCALE_MODEL_TOKEN } from '../model/upscale-map';
import {
  DEFAULT_CONTROLNET_MODEL_TOKEN,
  DEFAULT_CONTROL_IMAGE_TOKEN,
} from '../model/controlnet-map';
import { AUDIO_SECONDS_TOKEN, MESH_RESOLUTION_TOKEN } from '../audio/mesh-prompt';
import {
  countLoadImageNodes,
  figureIndexForLoadImageBinding,
  inferLoadImageBinding,
  type LoadImageBindingKind,
} from './load-image-bindings';
import type { WorkflowNodeMapping } from './node-mapper';
import { isConcreteLoraFilename } from './lora-patch';
import { resolvePromptEncodeTextField } from './prompt-encode';

const INIT_IMAGE_TITLE = /\b(init|i2v|start\s*frame|first\s*frame)\b/i;

function classLooksLikeVideo(classType: string): boolean {
  const lower = classType.toLowerCase();
  return (
    lower.includes('video') ||
    lower.includes('hunyuan') ||
    lower.includes('ltx') ||
    lower.includes('wan') ||
    lower.includes('webp') ||
    lower.includes('vhs') ||
    lower.includes('animate')
  );
}

function classLooksLikeAudio(classType: string): boolean {
  const lower = classType.toLowerCase();
  return (
    lower.includes('audio') ||
    lower.includes('stableaudio') ||
    lower.includes('musicgen') ||
    lower.includes('audioldm')
  );
}

function classLooksLikeMesh(classType: string): boolean {
  const lower = classType.toLowerCase();
  return (
    lower.includes('mesh') ||
    lower.includes('3d') ||
    lower.includes('glb') ||
    lower.includes('tripo') ||
    lower.includes('hunyuan3d')
  );
}

const MULTI_INPUT_IMAGE_TOKENS = [
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
] as const;

function tokenForInputImageBinding(kind: LoadImageBindingKind): string | null {
  const figure = figureIndexForLoadImageBinding(kind);
  if (figure == null) {
    return null;
  }
  return MULTI_INPUT_IMAGE_TOKENS[figure - 1] ?? null;
}
import { MODEL_SAMPLING_FLUX_NODE_TYPE } from './model-sampling-patch';

type WorkflowNode = {
  class_type?: string;
  _meta?: { title?: string };
  inputs?: Record<string, unknown>;
};

export type WorkflowBindingChange = {
  nodeId: string;
  field: string;
  before: string;
  after: string;
};

const PARAM_INPUT_FIELDS = ['seed', 'steps', 'cfg', 'width', 'height', 'shift', 'denoise'] as const;
const STRING_SAMPLER_FIELDS = ['sampler_name', 'scheduler'] as const;
const MODEL_SAMPLING_FLOAT_FIELDS = ['max_shift', 'base_shift'] as const;
const IMAGE_INPUT_FIELDS = ['image'] as const;
const LORA_LOADER_TYPES = new Set([
  'LoraLoader',
  'LoraLoaderModelOnly',
  'Power Lora Loader (rgthree)',
]);
const CONTROLNET_LOADER_TYPES = new Set(['ControlNetLoader', 'DiffControlNetLoader']);

type ParamInputField = (typeof PARAM_INPUT_FIELDS)[number];
type StringSamplerField = (typeof STRING_SAMPLER_FIELDS)[number];
type ModelSamplingFloatField = (typeof MODEL_SAMPLING_FLOAT_FIELDS)[number];

export function resolveBindingTokens(
  tokens: Partial<WorkflowPlaceholderTokens> &
    Pick<WorkflowPlaceholderTokens, 'positive' | 'negative'>
): WorkflowPlaceholderTokens {
  return {
    positive: tokens.positive,
    negative: tokens.negative,
    seed: tokens.seed?.trim() || DEFAULT_SEED_TOKEN,
    width: tokens.width?.trim() || DEFAULT_WIDTH_TOKEN,
    height: tokens.height?.trim() || DEFAULT_HEIGHT_TOKEN,
    cfg: tokens.cfg?.trim() || DEFAULT_CFG_TOKEN,
    steps: tokens.steps?.trim() || DEFAULT_STEPS_TOKEN,
    sampler: tokens.sampler?.trim() || DEFAULT_SAMPLER_TOKEN,
    scheduler: tokens.scheduler?.trim() || DEFAULT_SCHEDULER_TOKEN,
    shift: tokens.shift?.trim() || DEFAULT_SHIFT_TOKEN,
    fluxMaxShift: tokens.fluxMaxShift?.trim() || DEFAULT_FLUX_MAX_SHIFT_TOKEN,
    fluxBaseShift: tokens.fluxBaseShift?.trim() || DEFAULT_FLUX_BASE_SHIFT_TOKEN,
    denoise: tokens.denoise?.trim() || DEFAULT_DENOISE_TOKEN,
    inputImage: tokens.inputImage?.trim() || DEFAULT_INPUT_IMAGE_TOKEN,
    maskImage: tokens.maskImage?.trim() || DEFAULT_MASK_IMAGE_TOKEN,
    initImage: tokens.initImage?.trim() || DEFAULT_INIT_IMAGE_TOKEN,
    videoFrames: tokens.videoFrames?.trim() || DEFAULT_VIDEO_FRAMES_TOKEN,
    videoFps: tokens.videoFps?.trim() || DEFAULT_VIDEO_FPS_TOKEN,
  };
}

export function applyWorkflowNodeBindings(
  workflowJson: string,
  mappings: WorkflowNodeMapping[],
  tokens: Partial<WorkflowPlaceholderTokens> &
    Pick<WorkflowPlaceholderTokens, 'positive' | 'negative'>,
  options?: {
    loraBindTokens?: string[];
  }
): { json: string; changes: WorkflowBindingChange[] } {
  let parsed: Record<string, WorkflowNode>;
  try {
    parsed = JSON.parse(workflowJson) as Record<string, WorkflowNode>;
  } catch {
    return { json: workflowJson, changes: [] };
  }

  const resolvedTokens = resolveBindingTokens(tokens);
  const changes: WorkflowBindingChange[] = [];
  const loraBindTokens = options?.loraBindTokens ?? [];
  let loraBindIndex = 0;

  for (const mapping of mappings) {
    const node = parsed[mapping.nodeId];
    if (!node?.inputs) {
      continue;
    }

    const binding = mapping.suggestedBinding;
    const promptField = resolvePromptEncodeTextField(node.inputs ?? {});
    if (binding === 'positive' && promptField) {
      applyTextInput(node, mapping.nodeId, promptField, resolvedTokens.positive, changes);
      continue;
    }
    if (binding === 'negative' && promptField) {
      applyTextInput(node, mapping.nodeId, promptField, resolvedTokens.negative, changes);
      continue;
    }
    if (binding === 'positive' && 'text' in node.inputs) {
      applyTextInput(node, mapping.nodeId, 'text', resolvedTokens.positive, changes);
      continue;
    }
    if (binding === 'negative' && 'text' in node.inputs) {
      applyTextInput(node, mapping.nodeId, 'text', resolvedTokens.negative, changes);
      continue;
    }
    if (binding === 'seed' || binding === 'sampler') {
      applyParamField(node, mapping.nodeId, 'seed', resolvedTokens.seed, changes);
      applyParamField(node, mapping.nodeId, 'steps', resolvedTokens.steps, changes);
      applyParamField(node, mapping.nodeId, 'cfg', resolvedTokens.cfg, changes);
      applyStringSamplerField(
        node,
        mapping.nodeId,
        'sampler_name',
        resolvedTokens.sampler,
        changes
      );
      applyStringSamplerField(node, mapping.nodeId, 'scheduler', resolvedTokens.scheduler, changes);
      continue;
    }
    if (binding === 'latent') {
      applyParamField(node, mapping.nodeId, 'width', resolvedTokens.width, changes);
      applyParamField(node, mapping.nodeId, 'height', resolvedTokens.height, changes);
      if ('length' in node.inputs && classLooksLikeVideo(node.class_type ?? '')) {
        applyBindingField(node, mapping.nodeId, 'length', resolvedTokens.videoFrames, changes);
      }
      continue;
    }
    if (binding === 'initImage' && 'image' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'image', resolvedTokens.initImage, changes);
      continue;
    }
    if (binding === 'modelSampling') {
      applyParamField(node, mapping.nodeId, 'shift', resolvedTokens.shift, changes);
      if ((node.class_type ?? '') === MODEL_SAMPLING_FLUX_NODE_TYPE) {
        applyModelSamplingFloatField(
          node,
          mapping.nodeId,
          'max_shift',
          resolvedTokens.fluxMaxShift,
          changes
        );
        applyModelSamplingFloatField(
          node,
          mapping.nodeId,
          'base_shift',
          resolvedTokens.fluxBaseShift,
          changes
        );
        applyParamField(node, mapping.nodeId, 'width', resolvedTokens.width, changes);
        applyParamField(node, mapping.nodeId, 'height', resolvedTokens.height, changes);
      }
      continue;
    }
    if (binding === 'inputImage' && 'image' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'image', resolvedTokens.inputImage, changes);
      continue;
    }
    if (binding === 'inputImage2' && 'image' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'image', DEFAULT_INPUT_IMAGE_2_TOKEN, changes);
      continue;
    }
    if (binding === 'inputImage3' && 'image' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'image', DEFAULT_INPUT_IMAGE_3_TOKEN, changes);
      continue;
    }
    if (binding === 'inputImage4' && 'image' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'image', DEFAULT_INPUT_IMAGE_4_TOKEN, changes);
      continue;
    }
    if (binding === 'controlImage' && 'image' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'image', DEFAULT_CONTROL_IMAGE_TOKEN, changes);
      continue;
    }
    if (binding === 'maskImage' && 'image' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'image', resolvedTokens.maskImage, changes);
      continue;
    }
    if (binding === 'checkpointLoader' && 'ckpt_name' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'ckpt_name', DEFAULT_CHECKPOINT_TOKEN, changes);
      continue;
    }
    if (binding === 'unetLoader' && 'unet_name' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'unet_name', DEFAULT_UNET_TOKEN, changes);
      continue;
    }
    if (binding === 'vaeLoader' && 'vae_name' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'vae_name', DEFAULT_VAE_TOKEN, changes);
      continue;
    }
    if (binding === 'upscaleModelLoader' && 'model_name' in node.inputs) {
      applyBindingField(node, mapping.nodeId, 'model_name', DEFAULT_UPSCALE_MODEL_TOKEN, changes);
      continue;
    }
    if (binding === 'controlNetLoader' && 'control_net_name' in node.inputs) {
      applyBindingField(
        node,
        mapping.nodeId,
        'control_net_name',
        DEFAULT_CONTROLNET_MODEL_TOKEN,
        changes
      );
      continue;
    }
    if (binding === 'loraLoader' && 'lora_name' in node.inputs) {
      if (isConcreteLoraFilename(node.inputs.lora_name)) {
        continue;
      }
      const token = loraBindTokens[loraBindIndex] ?? loraBindTokens[0];
      if (token) {
        applyBindingField(node, mapping.nodeId, 'lora_name', token, changes);
        loraBindIndex += 1;
      }
    }
  }

  applyParamBindingsToAllNodes(parsed, resolvedTokens, changes, loraBindTokens);

  return { json: JSON.stringify(parsed, null, 2), changes };
}

function applyParamBindingsToAllNodes(
  parsed: Record<string, WorkflowNode>,
  tokens: WorkflowPlaceholderTokens,
  changes: WorkflowBindingChange[],
  loraBindTokens: string[] = []
): void {
  const loadImageCount = countLoadImageNodes(parsed);
  let loadImageIndex = 0;
  let loraBindIndex = 0;

  for (const [nodeId, node] of Object.entries(parsed)) {
    if (!node?.inputs) {
      continue;
    }

    for (const field of PARAM_INPUT_FIELDS) {
      if (!(field in node.inputs)) {
        continue;
      }
      applyParamField(node, nodeId, field, tokens[field], changes);
    }

    for (const field of STRING_SAMPLER_FIELDS) {
      if (!(field in node.inputs)) {
        continue;
      }
      const token = field === 'sampler_name' ? tokens.sampler : tokens.scheduler;
      applyStringSamplerField(node, nodeId, field, token, changes);
    }

    for (const field of MODEL_SAMPLING_FLOAT_FIELDS) {
      if (!(field in node.inputs)) {
        continue;
      }
      if ((node.class_type ?? '') !== MODEL_SAMPLING_FLUX_NODE_TYPE) {
        continue;
      }
      const token = field === 'max_shift' ? tokens.fluxMaxShift : tokens.fluxBaseShift;
      applyModelSamplingFloatField(node, nodeId, field, token, changes);
    }

    const classType = node.class_type ?? '';
    if (classType === 'LoadImage' || classType === 'LoadImageOutput') {
      const title = node._meta?.title ?? '';
      loadImageIndex += 1;
      if (INIT_IMAGE_TITLE.test(title)) {
        for (const field of IMAGE_INPUT_FIELDS) {
          if (!(field in node.inputs!)) {
            continue;
          }
          applyBindingField(node, nodeId, field, tokens.initImage, changes);
        }
        continue;
      }
      const kind = inferLoadImageBinding(classType, title, {
        loadImageIndex: loadImageIndex - 1,
        loadImageCount,
      });
      const imageToken =
        kind === 'controlImage'
          ? DEFAULT_CONTROL_IMAGE_TOKEN
          : kind === 'maskImage'
            ? tokens.maskImage
            : tokenForInputImageBinding(kind);
      if (imageToken) {
        for (const field of IMAGE_INPUT_FIELDS) {
          if (!(field in node.inputs!)) {
            continue;
          }
          applyBindingField(node, nodeId, field, imageToken, changes);
        }
      }
      continue;
    }

    // Soft-bind media pack fields when the node already exposes them.
    if ('length' in node.inputs && classLooksLikeVideo(classType)) {
      applyBindingField(node, nodeId, 'length', tokens.videoFrames, changes);
    }
    if ('fps' in node.inputs && classLooksLikeVideo(classType)) {
      applyBindingField(node, nodeId, 'fps', tokens.videoFps, changes);
    }
    if ('frame_rate' in node.inputs && classLooksLikeVideo(classType)) {
      applyBindingField(node, nodeId, 'frame_rate', tokens.videoFps, changes);
    }
    if (classLooksLikeAudio(classType)) {
      for (const field of ['seconds', 'duration', 'length'] as const) {
        if (field in node.inputs && !(field === 'length' && classLooksLikeVideo(classType))) {
          applyBindingField(node, nodeId, field, AUDIO_SECONDS_TOKEN, changes);
        }
      }
    }
    if (classLooksLikeMesh(classType) && 'resolution' in node.inputs) {
      applyBindingField(node, nodeId, 'resolution', MESH_RESOLUTION_TOKEN, changes);
    }
    if (classType === 'LoadImageMask') {
      for (const field of IMAGE_INPUT_FIELDS) {
        if (!(field in node.inputs)) {
          continue;
        }
        applyBindingField(node, nodeId, field, tokens.maskImage, changes);
      }
      continue;
    }

    if (
      (classType === 'CheckpointLoaderSimple' || classType === 'CheckpointLoader') &&
      'ckpt_name' in node.inputs
    ) {
      applyBindingField(node, nodeId, 'ckpt_name', DEFAULT_CHECKPOINT_TOKEN, changes);
      continue;
    }

    if (
      (classType === 'UNETLoader' || classType === 'UnetLoaderGGUF') &&
      'unet_name' in node.inputs
    ) {
      applyBindingField(node, nodeId, 'unet_name', DEFAULT_UNET_TOKEN, changes);
      continue;
    }

    if (classType === 'VAELoader' && 'vae_name' in node.inputs) {
      applyBindingField(node, nodeId, 'vae_name', DEFAULT_VAE_TOKEN, changes);
      continue;
    }

    if (
      (classType === 'UpscaleModelLoader' || classType === 'UpscaleModel') &&
      'model_name' in node.inputs
    ) {
      applyBindingField(node, nodeId, 'model_name', DEFAULT_UPSCALE_MODEL_TOKEN, changes);
    }

    if (CONTROLNET_LOADER_TYPES.has(classType) && 'control_net_name' in node.inputs!) {
      applyBindingField(node, nodeId, 'control_net_name', DEFAULT_CONTROLNET_MODEL_TOKEN, changes);
    }

    if (LORA_LOADER_TYPES.has(classType) && 'lora_name' in node.inputs!) {
      if (isConcreteLoraFilename(node.inputs.lora_name)) {
        continue;
      }
      const token = loraBindTokens[loraBindIndex] ?? loraBindTokens[0];
      if (token) {
        applyBindingField(node, nodeId, 'lora_name', token, changes);
        loraBindIndex += 1;
      }
    }
  }
}

function applyTextInput(
  node: WorkflowNode,
  nodeId: string,
  field: string,
  token: string,
  changes: WorkflowBindingChange[]
): void {
  const before = String(node.inputs?.[field] ?? '');
  if (before.includes(token)) {
    return;
  }
  node.inputs![field] = token;
  changes.push({ nodeId, field, before, after: token });
}

function applyStringSamplerField(
  node: WorkflowNode,
  nodeId: string,
  field: StringSamplerField,
  token: string,
  changes: WorkflowBindingChange[]
): void {
  applyBindingField(node, nodeId, field, token, changes);
}

function applyModelSamplingFloatField(
  node: WorkflowNode,
  nodeId: string,
  field: ModelSamplingFloatField,
  token: string,
  changes: WorkflowBindingChange[]
): void {
  applyBindingField(node, nodeId, field, token, changes);
}

function applyParamField(
  node: WorkflowNode,
  nodeId: string,
  field: ParamInputField,
  token: string,
  changes: WorkflowBindingChange[]
): void {
  applyBindingField(node, nodeId, field, token, changes);
}

function applyBindingField(
  node: WorkflowNode,
  nodeId: string,
  field: string,
  token: string,
  changes: WorkflowBindingChange[]
): void {
  const current = node.inputs?.[field];
  if (typeof current === 'string') {
    if (current.includes(token)) {
      return;
    }
    node.inputs![field] = token;
    changes.push({ nodeId, field, before: current, after: token });
    return;
  }
  if (typeof current === 'number' || typeof current === 'boolean') {
    const before = String(current);
    node.inputs![field] = token;
    changes.push({ nodeId, field, before, after: token });
    return;
  }
  if (current == null || current === '') {
    node.inputs![field] = token;
    changes.push({ nodeId, field, before: String(current ?? ''), after: token });
  }
}

export function summarizeBindingChanges(changes: WorkflowBindingChange[]): string {
  if (changes.length === 0) {
    return 'No binding changes (placeholders already present).';
  }
  return changes
    .map(change => `${change.nodeId}.${change.field}: ${change.before || '∅'} → ${change.after}`)
    .join('\n');
}
