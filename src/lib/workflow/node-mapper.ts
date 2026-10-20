import { isModelSamplingFluxNode, isModelSamplingPatchNode } from './model-sampling-patch';
import {
  classifyPromptEncodeBinding,
  isPromptEncodeNode,
  resolvePromptEncodeTextField,
} from './prompt-encode';
import {
  countLoadImageNodes,
  inferLoadImageBinding,
  type LoadImageBindingKind,
} from './load-image-bindings';

export type WorkflowNodeMapping = {
  nodeId: string;
  classType: string;
  title?: string;
  suggestedBinding?:
    | 'positive'
    | 'negative'
    | 'seed'
    | 'sampler'
    | 'modelSampling'
    | 'latent'
    | 'inputImage'
    | 'inputImage2'
    | 'inputImage3'
    | 'inputImage4'
    | 'initImage'
    | 'controlImage'
    | 'maskImage'
    | 'checkpointLoader'
    | 'unetLoader'
    | 'vaeLoader'
    | 'upscaleModelLoader'
    | 'controlNetLoader'
    | 'loraLoader'
    | 'steps'
    | 'cfg'
    | 'custom';
  reason: string;
};

type WorkflowNode = {
  class_type?: string;
  _meta?: { title?: string };
  inputs?: Record<string, unknown>;
};

const LORA_LOADER_TYPES = new Set([
  'LoraLoader',
  'LoraLoaderModelOnly',
  'Power Lora Loader (rgthree)',
]);

const CONTROLNET_LOADER_TYPES = new Set(['ControlNetLoader', 'DiffControlNetLoader']);

function isLatentSizeNode(classLower: string, inputs: Record<string, unknown>): boolean {
  if (!('width' in inputs) || !('height' in inputs)) {
    return false;
  }
  return (
    classLower.includes('emptylatent') ||
    classLower.includes('latentimage') ||
    (classLower.includes('empty') && classLower.includes('latent'))
  );
}

function isSamplerNode(classType: string, inputs: Record<string, unknown>): boolean {
  if (isModelSamplingPatchNode(classType)) {
    return false;
  }
  const classLower = classType.toLowerCase();
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

function loadImageBindingToSuggested(
  kind: LoadImageBindingKind
): WorkflowNodeMapping['suggestedBinding'] {
  if (kind === 'skip') {
    return 'custom';
  }
  return kind;
}

export function suggestWorkflowNodeMappings(workflowJson: string): WorkflowNodeMapping[] {
  let parsed: Record<string, WorkflowNode>;
  try {
    parsed = JSON.parse(workflowJson) as Record<string, WorkflowNode>;
  } catch {
    return [];
  }

  const mappings: WorkflowNodeMapping[] = [];
  const loadImageCount = countLoadImageNodes(parsed);
  let loadImageIndex = 0;

  for (const [nodeId, node] of Object.entries(parsed)) {
    const classType = node.class_type ?? '';
    const title = node._meta?.title ?? '';
    const classLower = classType.toLowerCase();
    const inputs = node.inputs ?? {};

    if (isPromptEncodeNode(classType)) {
      const binding = classifyPromptEncodeBinding(classType, title);
      const textField = resolvePromptEncodeTextField(inputs);
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: binding === 'unknown' ? 'custom' : binding,
        reason:
          textField === 'prompt'
            ? 'Qwen/text encode node — map prompt field placeholders here'
            : binding === 'negative'
              ? 'Title suggests negative prompt encode'
              : 'Text encode node — map positive prompt placeholder here',
      });
      continue;
    }

    if (isLatentSizeNode(classLower, inputs)) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: 'latent',
        reason:
          'length' in inputs && classLower.includes('video')
            ? 'Video latent — map width/height/{{VIDEO_FRAMES}} here'
            : 'Latent size node — map width/height placeholders here',
      });
      continue;
    }

    if (isModelSamplingPatchNode(classType)) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: 'modelSampling',
        reason: isModelSamplingFluxNode(classType)
          ? 'Flux model sampling — map shift curve and resolution placeholders here'
          : 'Model sampling patch — map shift placeholder here',
      });
      continue;
    }

    if (isSamplerNode(classType, inputs)) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: 'sampler',
        reason: 'Sampler node — map seed/steps/cfg/denoise placeholders here',
      });
      continue;
    }

    if ((classType === 'LoadImage' || classType === 'LoadImageOutput') && 'image' in inputs) {
      if (/\b(init|i2v|start\s*frame|first\s*frame)\b/i.test(title)) {
        mappings.push({
          nodeId,
          classType,
          title: node._meta?.title,
          suggestedBinding: 'initImage',
          reason: 'Init / I2V load image — map {{INIT_IMAGE}} here',
        });
        loadImageIndex += 1;
        continue;
      }
      const kind = inferLoadImageBinding(classType, title, {
        loadImageIndex,
        loadImageCount,
      });
      loadImageIndex += 1;
      if (kind !== 'skip') {
        mappings.push({
          nodeId,
          classType,
          title: node._meta?.title,
          suggestedBinding: loadImageBindingToSuggested(kind),
          reason:
            kind === 'controlImage'
              ? 'Load image node — map control/reference image placeholder here'
              : kind === 'maskImage'
                ? 'Load image node — map mask placeholder here'
                : kind === 'inputImage2'
                  ? 'Load image node — map {{INPUT_IMAGE_2}} (Figure 2)'
                  : kind === 'inputImage3'
                    ? 'Load image node — map {{INPUT_IMAGE_3}} (Figure 3)'
                    : kind === 'inputImage4'
                      ? 'Load image node — map {{INPUT_IMAGE_4}} (Figure 4)'
                      : 'Load image node — map input image placeholder here',
        });
      }
      continue;
    }

    if (classType === 'LoadImageMask' && 'image' in inputs) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: 'maskImage',
        reason: 'Load mask node — map inpaint mask placeholder here',
      });
      continue;
    }

    if (
      (classType === 'CheckpointLoaderSimple' || classType === 'CheckpointLoader') &&
      'ckpt_name' in inputs
    ) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: 'checkpointLoader',
        reason: 'Checkpoint loader — map {{CHECKPOINT}} placeholder here',
      });
      continue;
    }

    if ((classType === 'UNETLoader' || classType === 'UnetLoaderGGUF') && 'unet_name' in inputs) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: 'unetLoader',
        reason: 'UNET loader — map {{UNET}} placeholder here',
      });
      continue;
    }

    if (classType === 'VAELoader' && 'vae_name' in inputs) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: 'vaeLoader',
        reason: 'VAE loader — map {{VAE}} placeholder here',
      });
      continue;
    }

    if (
      (classType === 'UpscaleModelLoader' || classType === 'UpscaleModel') &&
      'model_name' in inputs
    ) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: 'upscaleModelLoader',
        reason: 'Upscale model loader — map {{UPSCALE_MODEL}} placeholder here',
      });
      continue;
    }

    if (CONTROLNET_LOADER_TYPES.has(classType) && 'control_net_name' in inputs) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: 'controlNetLoader',
        reason: 'ControlNet loader — map {{CONTROLNET_MODEL}} placeholder here',
      });
      continue;
    }

    if (LORA_LOADER_TYPES.has(classType) && 'lora_name' in inputs) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: 'loraLoader',
        reason: 'LoRA loader — map {{LORA_*}} placeholder here',
      });
    }
  }

  return mappings;
}
