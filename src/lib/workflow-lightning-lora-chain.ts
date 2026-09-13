/**
 * General Lightning-LoRA model-chain wiring and workflow sanitization,
 * extracted from workflow-lightning-queue.ts to keep that file from
 * growing without bound. This covers: making sure a Lightning LoRA node
 * (plus AuraFlow ModelSampling when needed) is spliced into the model
 * chain, and the various "clean up a Lightning workflow before queueing"
 * passes (strength normalization, hires/output-post-process stripping,
 * latent size forcing, UNET weight_dtype normalization). Qwen Edit
 * reference-image wiring lives in workflow-lightning-qwen-edit-queue.ts;
 * FP8/BF16 loader precision and the top-level prepare/audit entry points
 * stay in workflow-lightning-queue.ts, which still orchestrates all of
 * these.
 */
import { isQwenLightningModel, QWEN_LIGHTNING_SHIFT_DEFAULT } from './model-sampling-patch';
import type { WorkflowParamValues } from './comfyui-config';
import { isLockLatentSizeParams } from './comfyui-config';
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  ensureLightningNativeResolutionParams,
} from './model-resolution-defaults';
import { isLightningModelId, shouldNeutralizeStyleLorasAtQueue } from './model-sampler-defaults';
import { isLatentSizeNode, normalizeEmptyLatentForModel } from './workflow-direct-patch';
import { isCastcutOutputUpscaleNode } from './workflow-enrich-markers';
import {
  isLoraLoaderClassType,
  loraFilenameImpliesLightning,
  loraNameImpliesLightning,
  loraNameIsLightningSlot,
  LIGHTNING_LORA_TOKEN,
} from './workflow-lora-patch';
import {
  getLinkedNodeId,
  CHECKPOINT_LOADER_TYPES,
  AURA_FLOW_TYPE,
  type WorkflowNodeRecord,
} from './workflow-lightning-queue';

const VAE_DECODE_TYPES = new Set(['VAEDecode']);
const OUTPUT_POST_PROCESS_TYPES = new Set([
  'ImageScaleBy',
  'ImageScale',
  'ImageScaleToTotalPixels',
  'ImageResize',
  'ImageResize+',
  'ImageSharpen',
  'ImageBlur',
  'ImageUpscaleWithModel',
  'UltimateSDUpscale',
  'LatentUpscale',
  'LatentUpscaleBy',
]);

const OUTPUT_POST_PROCESS_IMAGE_KEYS = [
  'image',
  'images',
  'pixels',
  'src_image',
  'input_image',
  'source',
] as const;

function isOutputPostProcessClass(classType: string | undefined): boolean {
  const type = classType?.trim() ?? '';
  if (!type) {
    return false;
  }
  if (OUTPUT_POST_PROCESS_TYPES.has(type)) {
    return true;
  }
  const lower = type.toLowerCase();
  if (/vae|latent|loader|encode|decode|save|preview|ksampler/i.test(lower)) {
    return false;
  }
  return /upscale|sharpen|resize|scale.?by|scale.?to/i.test(lower);
}

function getImageChainLink(inputs?: Record<string, unknown>): string | null {
  if (!inputs) {
    return null;
  }
  for (const key of OUTPUT_POST_PROCESS_IMAGE_KEYS) {
    const link = getLinkedNodeId(inputs[key]);
    if (link) {
      return link;
    }
  }
  return null;
}
const UNET_LOADER_TYPES = new Set(['UNETLoader', 'UnetLoaderGGUF']);
const CLIP_LOADER_TYPES = new Set(['CLIPLoader', 'DualCLIPLoader', 'CLIPLoaderGGUF']);

function parseNodeId(id: string): number | null {
  const parsed = Number(id);
  return Number.isFinite(parsed) ? parsed : null;
}

export function nextWorkflowNodeId(workflow: Record<string, WorkflowNodeRecord>): string {
  let maxId = 0;
  for (const key of Object.keys(workflow)) {
    const parsed = parseNodeId(key);
    if (parsed != null && parsed > maxId) {
      maxId = parsed;
    }
  }
  return String(maxId + 1);
}

export function isSamplerNode(
  classType: string | undefined,
  inputs: Record<string, unknown>
): boolean {
  const classLower = (classType ?? '').toLowerCase();
  if (
    classLower.includes('ksampler') ||
    classLower.includes('samplercustom') ||
    classLower.includes('guider')
  ) {
    return true;
  }
  return 'seed' in inputs && ('steps' in inputs || 'cfg' in inputs);
}

export function isMainGenerateSampler(inputs: Record<string, unknown>): boolean {
  const denoise = inputs.denoise;
  if (denoise == null) {
    return true;
  }
  const value = Number(denoise);
  return !Number.isFinite(value) || value >= 0.95;
}

export function walkModelChainIds(
  workflow: Record<string, WorkflowNodeRecord>,
  startId: string | null
): string[] {
  const chain: string[] = [];
  let current = startId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    const node = workflow[current];
    if (!node?.inputs) {
      break;
    }
    current = getLinkedNodeId(node.inputs.model);
  }
  return chain;
}

function resolveLightningLoraName(loraFilenames: Record<string, string>): string | null {
  const mapped = loraFilenames[LIGHTNING_LORA_TOKEN]?.trim();
  if (mapped && !/^\{\{[A-Z0-9_]+\}\}$/.test(mapped) && mapped.length > 0) {
    return mapped;
  }
  for (const value of Object.values(loraFilenames)) {
    const trimmed = value?.trim();
    if (trimmed && !/^\{\{[A-Z0-9_]+\}\}$/.test(trimmed) && loraFilenameImpliesLightning(trimmed)) {
      return trimmed;
    }
  }
  // Never insert the unresolved placeholder into the graph — that false-fails
  // preflight as "Unresolved {{LORA_LIGHTNING}}" even when the real issue is
  // a missing token/map entry.
  return null;
}

function findClipSourceRef(workflow: Record<string, WorkflowNodeRecord>): [string, number] | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node || !CHECKPOINT_LOADER_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    return [nodeId, 1];
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node || !CLIP_LOADER_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    return [nodeId, 0];
  }
  return null;
}

export function chainHasLightningLora(
  workflow: Record<string, WorkflowNodeRecord>,
  chainIds: string[],
  loraFilenames: Record<string, string>
): boolean {
  return chainIds.some(id => {
    const node = workflow[id];
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      return false;
    }
    return loraNameIsLightningSlot(node.inputs.lora_name, loraFilenames);
  });
}

export function chainHasAuraFlow(
  workflow: Record<string, WorkflowNodeRecord>,
  chainIds: string[]
): string | null {
  for (const id of chainIds) {
    if (workflow[id]?.class_type === AURA_FLOW_TYPE) {
      return id;
    }
  }
  return null;
}

function findLightningLoraNodeId(
  workflow: Record<string, WorkflowNodeRecord>,
  loraFilenames: Record<string, string>
): string | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }
    if (loraNameIsLightningSlot(node.inputs.lora_name, loraFilenames)) {
      return nodeId;
    }
  }
  return null;
}

function findPrimaryModelLoaderId(workflow: Record<string, WorkflowNodeRecord>): string | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node && UNET_LOADER_TYPES.has(node.class_type ?? '')) {
      return nodeId;
    }
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node && CHECKPOINT_LOADER_TYPES.has(node.class_type ?? '')) {
      return nodeId;
    }
  }
  return null;
}

function listModelConsumerEntries(
  workflow: Record<string, WorkflowNodeRecord>,
  loaderId: string
): Array<{ nodeId: string; node: WorkflowNodeRecord }> {
  const consumers: Array<{ nodeId: string; node: WorkflowNodeRecord }> = [];
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.inputs || getLinkedNodeId(node.inputs.model) !== loaderId) {
      continue;
    }
    consumers.push({ nodeId, node });
  }
  return consumers;
}

function insertLightningLoraNode(
  workflow: Record<string, WorkflowNodeRecord>,
  modelSourceId: string,
  lightningLoraName: string,
  _clipRef: [string, number] | null
): string {
  // LightX2V official templates use LoraLoaderModelOnly — applying Lightning
  // LoRA to CLIP (strength_clip=1) produces swirly/worm artifacts.
  const loraId = nextWorkflowNodeId(workflow);
  workflow[loraId] = {
    class_type: 'LoraLoaderModelOnly',
    inputs: {
      model: [modelSourceId, 0],
      lora_name: lightningLoraName,
      strength_model: 1,
    },
    _meta: { title: 'Castcut — Lightning LoRA' },
  };
  return loraId;
}

function ensureAuraAndLightningLoraOnModelLink(
  workflow: Record<string, WorkflowNodeRecord>,
  consumer: WorkflowNodeRecord,
  modelLink: string,
  lightningLoraName: string | null,
  loraFilenames: Record<string, string>,
  clipRef: [string, number] | null
): void {
  if (!consumer.inputs) {
    return;
  }

  let chainIds = walkModelChainIds(workflow, modelLink);
  let auraId = chainHasAuraFlow(workflow, chainIds);

  if (!auraId) {
    auraId = nextWorkflowNodeId(workflow);
    workflow[auraId] = {
      class_type: AURA_FLOW_TYPE,
      inputs: {
        model: [modelLink, 0],
        shift: QWEN_LIGHTNING_SHIFT_DEFAULT,
      },
      _meta: { title: 'Castcut — Lightning AuraFlow' },
    };
    consumer.inputs.model = [auraId, 0];
    chainIds = walkModelChainIds(workflow, auraId);
  } else {
    const aura = workflow[auraId];
    if (aura?.inputs) {
      const current = Number(aura.inputs.shift);
      // Keep native LightX2V shift (~3). Only repair clearly wrong defaults.
      if (!Number.isFinite(current) || current < 2.5 || current > 4) {
        aura.inputs.shift = QWEN_LIGHTNING_SHIFT_DEFAULT;
      }
    }
  }

  if (!lightningLoraName) {
    return;
  }

  if (chainHasLightningLora(workflow, chainIds, loraFilenames)) {
    return;
  }

  const aura = workflow[auraId];
  if (!aura?.inputs) {
    return;
  }

  const modelSource = getLinkedNodeId(aura.inputs.model) ?? modelLink;
  const existingLoraId = findLightningLoraNodeId(workflow, loraFilenames);
  if (existingLoraId) {
    const existing = workflow[existingLoraId];
    if (existing?.inputs) {
      existing.inputs.model = [modelSource, 0];
      if (
        typeof existing.inputs.lora_name !== 'string' ||
        !existing.inputs.lora_name.trim() ||
        /^\{\{[A-Z0-9_]+\}\}$/.test(existing.inputs.lora_name.trim())
      ) {
        existing.inputs.lora_name = lightningLoraName;
      }
      if ('strength_model' in existing.inputs) {
        existing.inputs.strength_model = 1;
      }
      if ('strength' in existing.inputs) {
        existing.inputs.strength = 1;
      }
    }
    aura.inputs.model = [existingLoraId, 0];
    return;
  }

  const loraId = insertLightningLoraNode(workflow, modelSource, lightningLoraName, clipRef);
  aura.inputs.model = [loraId, 0];
}

/**
 * Distilled Lightning needs UNET → Lightning LoRA → AuraFlow (shift ~3) → KSampler.
 * Missing LoRA or bypassed AuraFlow produces soft, malformed anatomy.
 */
export function ensureLightningModelChainInWorkflow(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {}
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const lightningLoraName = resolveLightningLoraName(loraFilenames);
  const clipRef = findClipSourceRef(next);

  for (const node of Object.values(next)) {
    if (!node?.inputs) {
      continue;
    }
    // KSampler / Guider path (model on the node itself).
    if (isSamplerNode(node.class_type, node.inputs)) {
      if (!isMainGenerateSampler(node.inputs)) {
        continue;
      }
      const modelLink = getLinkedNodeId(node.inputs.model);
      if (!modelLink) {
        continue;
      }
      ensureAuraAndLightningLoraOnModelLink(
        next,
        node,
        modelLink,
        lightningLoraName,
        loraFilenames,
        clipRef
      );
      continue;
    }

    // SamplerCustom-style graphs: model often sits on BasicGuider / CFGGuider only.
    const classLower = (node.class_type ?? '').toLowerCase();
    if (!classLower.includes('guider')) {
      continue;
    }
    const modelLink = getLinkedNodeId(node.inputs.model);
    if (!modelLink) {
      continue;
    }
    ensureAuraAndLightningLoraOnModelLink(
      next,
      node,
      modelLink,
      lightningLoraName,
      loraFilenames,
      clipRef
    );
  }

  // Fallback for graphs with no sampler/guider model link (or only SamplerCustom):
  // insert LoRA + AuraFlow between the primary loader and its model consumers.
  if (lightningLoraName && !workflowHasLightningLora(next, loraFilenames)) {
    const loaderId = findPrimaryModelLoaderId(next);
    if (loaderId) {
      const consumers = listModelConsumerEntries(next, loaderId);
      if (consumers.length > 0) {
        const loraId = insertLightningLoraNode(next, loaderId, lightningLoraName, clipRef);
        const auraId = nextWorkflowNodeId(next);
        next[auraId] = {
          class_type: AURA_FLOW_TYPE,
          inputs: {
            model: [loraId, 0],
            shift: QWEN_LIGHTNING_SHIFT_DEFAULT,
          },
          _meta: { title: 'Castcut — Lightning AuraFlow' },
        };
        for (const { node } of consumers) {
          if (node.inputs) {
            node.inputs.model = [auraId, 0];
          }
        }
      } else if (!workflowHasLoraLoader(next)) {
        // No consumers found — still add a wired LoRA so preflight/queue see it.
        insertLightningLoraNode(next, loaderId, lightningLoraName, clipRef);
      }
    }
  }

  return next;
}

export function workflowHasLoraLoader(workflow: Record<string, unknown>): boolean {
  return Object.values(workflow).some(node => {
    if (!node || typeof node !== 'object') {
      return false;
    }
    return isLoraLoaderClassType((node as { class_type?: string }).class_type);
  });
}

export function workflowHasLightningLora(
  workflow: Record<string, unknown>,
  loraFilenames: Record<string, string> = {}
): boolean {
  return Object.values(workflow).some(node => {
    if (!node || typeof node !== 'object') {
      return false;
    }
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    if (!record.inputs || !isLoraLoaderClassType(record.class_type)) {
      return false;
    }
    if (loraNameImpliesLightning(record.inputs.lora_name, loraFilenames)) {
      return true;
    }
    if (record.class_type === 'Power Lora Loader (rgthree)') {
      for (const [key, value] of Object.entries(record.inputs)) {
        if (!/^lora_/i.test(key) || !value || typeof value !== 'object') {
          continue;
        }
        const slot = value as { on?: boolean; lora?: unknown };
        if (slot.on === false) {
          continue;
        }
        if (loraNameImpliesLightning(slot.lora, loraFilenames)) {
          return true;
        }
      }
    }
    return false;
  });
}

/** Keep ModelSamplingAuraFlow for Lightning (official LightX2V shift ~3). */
/**
 * Intentionally a no-op: Lightning must keep ModelSamplingAuraFlow (shift ~3).
 * Do not "bypass"/remove AuraFlow here — that softens anatomy.
 */
export function bypassModelSamplingAuraFlowForLightning(
  workflow: Record<string, unknown>,
  model?: string
): {
  workflow: Record<string, unknown>;
  bypassedNodeIds: string[];
} {
  void model;
  return { workflow, bypassedNodeIds: [] };
}

/** Drop SaveImage ImageScale that squashes AR or downscales below EmptyLatent (figure pixel lock). */
export function bypassMismatchedSaveImageScaleToLatent(
  workflow: Record<string, unknown>,
  latentSize?: { width: number; height: number } | null
): { workflow: Record<string, unknown>; bypassedNodeIds: string[] } {
  if (!latentSize || latentSize.width <= 0 || latentSize.height <= 0) {
    return { workflow, bypassedNodeIds: [] };
  }
  const latentRatio = latentSize.width / latentSize.height;
  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const bypassedNodeIds: string[] = [];

  for (const node of Object.values(next)) {
    if (
      (node?.class_type !== 'SaveImage' && node?.class_type !== 'SaveImageAdvanced') ||
      !node.inputs
    ) {
      continue;
    }
    const scaleId = getLinkedNodeId(node.inputs.images);
    if (!scaleId) {
      continue;
    }
    const scaleNode = next[scaleId];
    if (
      !scaleNode?.inputs ||
      (scaleNode.class_type !== 'ImageScale' && scaleNode.class_type !== 'ResizeImage') ||
      isCastcutOutputUpscaleNode(scaleNode)
    ) {
      continue;
    }
    const width = Number(scaleNode.inputs.width);
    const height = Number(scaleNode.inputs.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      continue;
    }
    const scaleRatio = width / height;
    const aspectMismatch = Math.abs(Math.log(scaleRatio / latentRatio)) > 0.02;
    const downscaleBelowLatent =
      width <= latentSize.width * 0.95 && height <= latentSize.height * 0.95;
    if (!aspectMismatch && !downscaleBelowLatent) {
      continue;
    }
    const upstream = getLinkedNodeId(scaleNode.inputs.image);
    if (!upstream) {
      continue;
    }
    node.inputs.images = [upstream, 0];
    bypassedNodeIds.push(scaleId);
  }

  return { workflow: next, bypassedNodeIds };
}

/**
 * Strip post-decode upscale/sharpen (community UltraSharp, UltimateSD, leftover
 * Castcut Lanczos). 2512 Lightning CFG-1 already looks hard; enlarging it
 * makes wet streets and skin crunch. Optimizer may re-insert a blur-only polish.
 */
export function stripLightningOutputPostProcess(
  workflow: Record<string, unknown>,
  model?: string
): {
  workflow: Record<string, unknown>;
  strippedNodeIds: string[];
} {
  if (!isQwenLightningModel(model)) {
    return { workflow, strippedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const strippedNodeIds = new Set<string>();

  for (const node of Object.values(next)) {
    if (
      (node?.class_type !== 'SaveImage' && node?.class_type !== 'SaveImageAdvanced') ||
      !node.inputs
    ) {
      continue;
    }

    let link = getLinkedNodeId(node.inputs.images);
    const seenImageLinks = new Set<string>();
    while (link && !seenImageLinks.has(link)) {
      seenImageLinks.add(link);
      const upstream = next[link];
      if (!upstream) {
        break;
      }
      if (VAE_DECODE_TYPES.has(upstream.class_type ?? '')) {
        node.inputs.images = [link, 0];
        break;
      }
      if (!isOutputPostProcessClass(upstream.class_type)) {
        break;
      }
      strippedNodeIds.add(link);
      link = getImageChainLink(upstream.inputs);
    }
  }

  return {
    workflow: next,
    strippedNodeIds: [...strippedNodeIds],
  };
}

/** Drop stale latent hires second pass (soft denoise) left from older Final/Max enrich. */
export function stripLightningHiresPass(
  workflow: Record<string, unknown>,
  model?: string
): {
  workflow: Record<string, unknown>;
  strippedNodeIds: string[];
} {
  if (!isQwenLightningModel(model)) {
    return { workflow, strippedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const strippedNodeIds = new Set<string>();

  for (const decodeNode of Object.values(next)) {
    if (!decodeNode?.inputs || !VAE_DECODE_TYPES.has(decodeNode.class_type ?? '')) {
      continue;
    }

    const samplerId = getLinkedNodeId(decodeNode.inputs.samples);
    if (!samplerId) {
      continue;
    }

    const sampler = next[samplerId];
    if (!sampler?.inputs || !isSamplerNode(sampler.class_type, sampler.inputs)) {
      continue;
    }

    if (isMainGenerateSampler(sampler.inputs)) {
      continue;
    }

    const latentId = getLinkedNodeId(sampler.inputs.latent_image);
    if (!latentId) {
      continue;
    }

    const latent = next[latentId];
    const latentType = latent?.class_type ?? '';
    if (latentType !== 'LatentUpscale' && latentType !== 'LatentUpscaleBy') {
      continue;
    }

    const baseSamples = getLinkedNodeId(latent?.inputs?.samples);
    if (!baseSamples) {
      continue;
    }

    decodeNode.inputs.samples = [baseSamples, 0];
    strippedNodeIds.add(samplerId);
    strippedNodeIds.add(latentId);
  }

  return {
    workflow: next,
    strippedNodeIds: [...strippedNodeIds],
  };
}

export function loraStrengthIsActive(value: unknown): boolean {
  const strength = Number(value);
  return !Number.isFinite(strength) || strength > 0;
}

/** Disable style/NSFW LoRAs stacked on CFG-1 distilled workflows — they cause banding and melt. */
export function neutralizeNonLightningLoras(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {}
): {
  workflow: Record<string, unknown>;
  neutralizedNodeIds: string[];
} {
  if (!shouldNeutralizeStyleLorasAtQueue(model)) {
    return { workflow, neutralizedNodeIds: [] };
  }

  if (isQwenLightningModel(model) && !workflowHasLightningLora(workflow, loraFilenames)) {
    return { workflow, neutralizedNodeIds: [] };
  }

  if (
    isLightningModelId(String(model ?? '')) &&
    !isQwenLightningModel(model) &&
    !workflowHasLoraLoader(workflow)
  ) {
    return { workflow, neutralizedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;
  const neutralizedNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(next)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }

    if (node.class_type === 'Power Lora Loader (rgthree)') {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (!/^lora_/i.test(key) || !value || typeof value !== 'object') {
          continue;
        }
        const slot = value as {
          on?: boolean;
          lora?: unknown;
          strength?: number;
          strengthTwo?: number | null;
        };
        if (slot.on === false) {
          continue;
        }
        if (loraNameImpliesLightning(slot.lora, loraFilenames)) {
          continue;
        }
        const hasLora = typeof slot.lora === 'string' && slot.lora.trim().length > 0;
        if (!hasLora && slot.on !== true) {
          continue;
        }
        slot.on = false;
        if ('strength' in slot) {
          slot.strength = 0;
        }
        if ('strengthTwo' in slot && slot.strengthTwo != null) {
          slot.strengthTwo = 0;
        }
        neutralizedNodeIds.push(`${nodeId}:${key}`);
      }
      continue;
    }

    if (loraNameImpliesLightning(node.inputs.lora_name, loraFilenames)) {
      continue;
    }

    const active =
      loraStrengthIsActive(node.inputs.strength_model) ||
      loraStrengthIsActive(node.inputs.strength_clip) ||
      loraStrengthIsActive(node.inputs.strength);
    if (!active) {
      continue;
    }

    if ('strength_model' in node.inputs) {
      node.inputs.strength_model = 0;
    }
    if ('strength_clip' in node.inputs) {
      node.inputs.strength_clip = 0;
    }
    if ('strength' in node.inputs) {
      node.inputs.strength = 0;
    }
    neutralizedNodeIds.push(nodeId);
  }

  // Pack graphs often bake Lightning once in a LoraLoader|pysssss chain and again as
  // LoraLoaderModelOnly — keep only the sampler-nearest Lightning loader at strength.
  const samplerModelLink = (() => {
    for (const node of Object.values(next)) {
      const classType = node?.class_type ?? '';
      if (
        classType !== 'KSampler' &&
        classType !== 'KSamplerAdvanced' &&
        classType !== 'SamplerCustom' &&
        classType !== 'SamplerCustomAdvanced' &&
        classType !== 'ModelSamplingAuraFlow'
      ) {
        continue;
      }
      const link = getLinkedNodeId(node?.inputs?.model);
      if (link) {
        return link;
      }
    }
    return null;
  })();
  if (samplerModelLink) {
    const lightningOnChain: string[] = [];
    const seen = new Set<string>();
    let cursor: string | null = samplerModelLink;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const node = next[cursor];
      if (!node?.inputs) {
        break;
      }
      if (
        isLoraLoaderClassType(node.class_type) &&
        node.class_type !== 'Power Lora Loader (rgthree)' &&
        loraNameImpliesLightning(node.inputs.lora_name, loraFilenames)
      ) {
        lightningOnChain.push(cursor);
      }
      cursor = getLinkedNodeId(node.inputs.model);
    }
    for (const nodeId of lightningOnChain.slice(1)) {
      const node = next[nodeId];
      if (!node?.inputs) {
        continue;
      }
      if ('strength_model' in node.inputs) {
        node.inputs.strength_model = 0;
      }
      if ('strength_clip' in node.inputs) {
        node.inputs.strength_clip = 0;
      }
      if ('strength' in node.inputs) {
        node.inputs.strength = 0;
      }
      if (!neutralizedNodeIds.includes(nodeId)) {
        neutralizedNodeIds.push(nodeId);
      }
    }
  }

  return { workflow: next, neutralizedNodeIds };
}

/** Ensure Lightning LoRA runs at full model strength. */
export function normalizeLightningLoraStrengths(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {}
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;

  for (const node of Object.values(next)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }
    if (node.class_type === 'Power Lora Loader (rgthree)') {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (!/^lora_/i.test(key) || !value || typeof value !== 'object') {
          continue;
        }
        const slot = value as {
          on?: boolean;
          lora?: unknown;
          strength?: number;
        };
        if (!loraNameImpliesLightning(slot.lora, loraFilenames)) {
          continue;
        }
        slot.on = true;
        if ('strength' in slot) {
          slot.strength = 1;
        }
      }
      continue;
    }
    if (!loraNameImpliesLightning(node.inputs.lora_name, loraFilenames)) {
      continue;
    }

    if ('strength_model' in node.inputs) {
      node.inputs.strength_model = 1;
    }
    // Official LightX2V recipes keep CLIP at 0 (model-only adaptation).
    if ('strength_clip' in node.inputs) {
      node.inputs.strength_clip = 0;
    }
    if ('strength' in node.inputs) {
      node.inputs.strength = 1;
    }
  }

  return next;
}

/** Always apply queue width/height on latent nodes — imported workflows often keep 1024.
 * Also convert EmptyFlux2LatentImage → EmptySD3LatentImage: Edit packs sometimes ship
 * Flux2 empty latents; with Qwen VAE those decode at ~½ spatial size (1328→664→996 with Lanczos). */
export function forceLightningLatentSizeInWorkflow(
  workflow: Record<string, unknown>,
  params: Pick<WorkflowParamValues, 'width' | 'height' | 'lockLatentSize'> | undefined,
  model?: string
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const width = Number(params?.width);
  const height = Number(params?.height);
  const lockExact = isLockLatentSizeParams(params);
  // Prefer queue params when present, but always snap oversized / extreme leftovers
  // (raw Compose uploads, stale gallery dims) to Lightning-safe presets.
  let resolvedWidth = Number.isFinite(width) && width > 0 ? width : undefined;
  let resolvedHeight = Number.isFinite(height) && height > 0 ? height : undefined;
  if (resolvedWidth != null && resolvedHeight != null && !lockExact) {
    const clamped = ensureLightningNativeResolutionParams(
      { width: resolvedWidth, height: resolvedHeight },
      model ?? 'qwen-image-2512-lightning-8',
      DEFAULT_RESOLUTION_ORIENTATION,
      DEFAULT_RESOLUTION_SIZE_TIER,
      { preserveInputAspect: true }
    );
    resolvedWidth = Number(clamped.width);
    resolvedHeight = Number(clamped.height);
  }
  if (resolvedWidth == null || resolvedHeight == null) {
    const resolved = ensureLightningNativeResolutionParams(
      {},
      model ?? 'qwen-image-2512-lightning-8',
      DEFAULT_RESOLUTION_ORIENTATION,
      DEFAULT_RESOLUTION_SIZE_TIER
    );
    resolvedWidth = Number(resolved.width);
    resolvedHeight = Number(resolved.height);
  }
  if (
    resolvedWidth == null ||
    resolvedHeight == null ||
    !Number.isFinite(resolvedWidth) ||
    !Number.isFinite(resolvedHeight)
  ) {
    return workflow;
  }

  const normalized = normalizeEmptyLatentForModel(workflow, model).workflow;
  const next = structuredClone(normalized) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;

  for (const node of Object.values(next)) {
    const inputs = node?.inputs;
    if (!inputs || !isLatentSizeNode(node.class_type ?? '', inputs)) {
      continue;
    }
    inputs.width = resolvedWidth;
    inputs.height = resolvedHeight;
  }

  return next;
}

/** fp8 weight_dtype on bf16 UNET causes grid/grain artifacts on Lightning. */
export function normalizeLightningUnetWeightDtype(
  workflow: Record<string, unknown>,
  model?: string
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;

  for (const node of Object.values(next)) {
    if (!node?.inputs || !UNET_LOADER_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    const dtype = node.inputs.weight_dtype;
    if (typeof dtype !== 'string') {
      continue;
    }
    if (/fp8|e4m3fn|fp16|float16/i.test(dtype)) {
      node.inputs.weight_dtype = 'default';
    }
  }

  return next;
}
