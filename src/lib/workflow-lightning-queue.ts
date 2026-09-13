import { isQwenLightningModel } from './model-sampling-patch';
import { isBooguTurboModel } from './model-denoise-defaults';
import {
  filenameLooksLikeCheckpointOnly,
  isVaeFilenameIncompatibleWithModel,
  type ModelLoaderFilenames,
} from './model-checkpoint-map';
import type { WorkflowParamValues } from './comfyui-config';
import { isLockLatentSizeParams } from './comfyui-config';
import {
  precisionHintFromFilename,
  qwen2512UnetFilename,
  qwenDualClipFilename,
  qwenEdit2509UnetFilename,
  qwenEdit2511UnetFilename,
  qwenUnetFamilyFromFilename,
} from './model-loader-precision';
import { isLatentSizeNode, patchLoaderNodesInWorkflow } from './workflow-direct-patch';
import {
  isLoraLoaderClassType,
  loraFilenameImpliesLightning,
  loraNameImpliesLightning,
  alignLightningLoraFamilyInWorkflow,
  patchLoraNodesInWorkflow,
  resolveLoraLoaderFilename,
} from './workflow-lora-patch';
import {
  prepareQwenEditReferenceImagesForQueue,
  ensureQwenReferenceLatentWiringInWorkflow,
  scaleQwenEditReferenceImagesToLatentSize,
  pruneUnresolvedQwenEditFigureLoaders,
  nextLightningWorkflowNodeId,
} from './workflow-lightning-qwen-edit-queue';
import {
  nextWorkflowNodeId,
  isSamplerNode,
  isMainGenerateSampler,
  walkModelChainIds,
  chainHasLightningLora,
  chainHasAuraFlow,
  ensureLightningModelChainInWorkflow,
  workflowHasLoraLoader,
  workflowHasLightningLora,
  bypassModelSamplingAuraFlowForLightning,
  bypassMismatchedSaveImageScaleToLatent,
  stripLightningOutputPostProcess,
  stripLightningHiresPass,
  loraStrengthIsActive,
  neutralizeNonLightningLoras,
  normalizeLightningLoraStrengths,
  forceLightningLatentSizeInWorkflow,
  normalizeLightningUnetWeightDtype,
} from './workflow-lightning-lora-chain';

// Lightning LoRA model-chain wiring and workflow sanitization live in
// workflow-lightning-lora-chain.ts; re-exported here unchanged so existing
// importers (comfyui-config.ts, comfyui-runtime-for-model.ts,
// system-workflow-runtime.ts, workflow-category-defaults.ts, tests) are
// unaffected.
export {
  nextWorkflowNodeId,
  isSamplerNode,
  isMainGenerateSampler,
  walkModelChainIds,
  chainHasLightningLora,
  chainHasAuraFlow,
  ensureLightningModelChainInWorkflow,
  workflowHasLoraLoader,
  workflowHasLightningLora,
  bypassModelSamplingAuraFlowForLightning,
  bypassMismatchedSaveImageScaleToLatent,
  stripLightningOutputPostProcess,
  stripLightningHiresPass,
  loraStrengthIsActive,
  neutralizeNonLightningLoras,
  normalizeLightningLoraStrengths,
  forceLightningLatentSizeInWorkflow,
  normalizeLightningUnetWeightDtype,
} from './workflow-lightning-lora-chain';

export const QWEN_EDIT_ENCODE_TYPES = new Set([
  'TextEncodeQwenImageEdit',
  'TextEncodeQwenImageEditPlus',
  'TextEncodeBooguEdit',
]);

export const QWEN_EDIT_IMAGE_INPUT_KEYS = [
  'image',
  'image1',
  'image2',
  'image3',
  'image4',
] as const;

const QWEN_REF_LATENT_SCALE_TITLE = 'Castcut — ref → latent size';

const VAE_LOADER_TYPES = new Set(['VAELoader']);
export const LOAD_IMAGE_TYPES = new Set(['LoadImage', 'LoadImageOutput']);
const VAE_ENCODE_TYPES = new Set(['VAEEncode']);
const EMPTY_LATENT_TYPES = new Set([
  'EmptyLatentImage',
  'EmptySD3LatentImage',
  'EmptyFlux2LatentImage',
]);

export const CHECKPOINT_LOADER_TYPES = new Set(['CheckpointLoaderSimple', 'CheckpointLoader']);
export const AURA_FLOW_TYPE = 'ModelSamplingAuraFlow';

export type WorkflowNodeRecord = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

export function getLinkedNodeId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 1) {
    return null;
  }
  const id = value[0];
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

export function isNodeOutputRef(value: unknown): value is [string, number] {
  return Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'number';
}

export function findVaeSourceRef(
  workflow: Record<string, WorkflowNodeRecord>
): [string, number] | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node?.class_type && VAE_LOADER_TYPES.has(node.class_type)) {
      return [nodeId, 0];
    }
  }
  for (const node of Object.values(workflow)) {
    if (!node?.inputs) {
      continue;
    }
    if (
      (QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? '') || node.class_type === 'VAEEncode') &&
      isNodeOutputRef(node.inputs.vae)
    ) {
      return node.inputs.vae;
    }
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node?.class_type && CHECKPOINT_LOADER_TYPES.has(node.class_type)) {
      return [nodeId, 2];
    }
  }
  return null;
}

export function findPrimarySampler(
  workflow: Record<string, WorkflowNodeRecord>
): { samplerId: string; inputs: Record<string, unknown> } | null {
  for (const [samplerId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !('latent_image' in node.inputs)) {
      continue;
    }
    if (!('positive' in node.inputs)) {
      continue;
    }
    return { samplerId, inputs: node.inputs };
  }
  return null;
}

function workflowHasReferenceLatent(workflow: Record<string, WorkflowNodeRecord>): boolean {
  return Object.values(workflow).some(node => node?.class_type === 'ReferenceLatent');
}

/** Remove VAE from Qwen encode nodes — latents come from external VAEEncode + ReferenceLatent. */
export function disconnectQwenEditEncodeVae(workflow: Record<string, WorkflowNodeRecord>): void {
  for (const node of Object.values(workflow)) {
    const classType = node?.class_type ?? '';
    if (!node?.inputs || classType === 'TextEncodeBooguEdit') {
      continue;
    }
    if (!QWEN_EDIT_ENCODE_TYPES.has(classType)) {
      continue;
    }
    if ('vae' in node.inputs) {
      delete node.inputs.vae;
    }
  }
}

export function wireQwenEditEncodeVisionImages(
  workflow: Record<string, WorkflowNodeRecord>,
  loaderIds: string[]
): string[] {
  const encodeImageKeys = ['image1', 'image2', 'image3', 'image4'] as const;
  const wiredNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    let changed = false;
    if (node.class_type === 'TextEncodeQwenImageEdit') {
      if (loaderIds[0]) {
        node.inputs.image = [loaderIds[0], 0];
        changed = true;
      }
    } else {
      for (let i = 0; i < loaderIds.length && i < encodeImageKeys.length; i += 1) {
        const key = encodeImageKeys[i]!;
        node.inputs[key] = [loaderIds[i]!, 0];
        changed = true;
      }
      for (let i = loaderIds.length; i < encodeImageKeys.length; i += 1) {
        const key = encodeImageKeys[i]!;
        if (key in node.inputs) {
          delete node.inputs[key];
          changed = true;
        }
      }
    }
    if (changed) {
      wiredNodeIds.push(nodeId);
    }
  }
  return wiredNodeIds;
}

export function peelQwenReferenceLatentChain(
  workflow: Record<string, WorkflowNodeRecord>,
  positiveRef: [string, number]
): [string, number] {
  if (!workflowHasReferenceLatent(workflow)) {
    return positiveRef;
  }
  let cursor: string | null = positiveRef[0];
  const visited = new Set<string>();
  let textCond: [string, number] = positiveRef;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const node: WorkflowNodeRecord | undefined = workflow[cursor];
    if (node?.class_type !== 'ReferenceLatent') {
      textCond = [cursor, 0];
      break;
    }
    const prev: unknown = node.inputs?.conditioning;
    cursor = isNodeOutputRef(prev) ? prev[0] : null;
  }
  for (const nodeId of visited) {
    if (workflow[nodeId]?.class_type === 'ReferenceLatent') {
      delete workflow[nodeId];
    }
  }
  return textCond;
}

export function ensureRefImageScaleNode(
  workflow: Record<string, WorkflowNodeRecord>,
  loaderId: string,
  width: number,
  height: number,
  insertedNodeIds: string[]
): string {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node?.class_type !== 'ImageScale' && node?.class_type !== 'ResizeImage') {
      continue;
    }
    if (node._meta?.title !== QWEN_REF_LATENT_SCALE_TITLE) {
      continue;
    }
    const imageRef = getLinkedNodeId(node.inputs?.image);
    if (imageRef !== loaderId) {
      continue;
    }
    if (node.inputs) {
      node.inputs.width = width;
      node.inputs.height = height;
      if (node.class_type === 'ImageScale') {
        node.inputs.upscale_method = node.inputs.upscale_method ?? 'lanczos';
        node.inputs.crop = 'center';
      }
    }
    if (node._meta?.title !== QWEN_REF_LATENT_SCALE_TITLE) {
      node._meta = { ...(node._meta ?? {}), title: QWEN_REF_LATENT_SCALE_TITLE };
    }
    return nodeId;
  }

  const scaleId = nextLightningWorkflowNodeId(workflow);
  workflow[scaleId] = {
    class_type: 'ImageScale',
    inputs: {
      image: [loaderId, 0],
      upscale_method: 'lanczos',
      width,
      height,
      crop: 'center',
    },
    _meta: { title: QWEN_REF_LATENT_SCALE_TITLE },
  };
  insertedNodeIds.push(scaleId);
  return scaleId;
}

/** ReferenceLatent edits start from EmptySD3Latent, not classic img2img VAEEncode. */
export function ensureQwenEmptyLatentForReferenceEdit(
  workflow: Record<string, WorkflowNodeRecord>,
  width: number,
  height: number,
  insertedNodeIds: string[]
): void {
  const sampler = findPrimarySampler(workflow);
  if (!sampler) {
    return;
  }
  const samplerNode = workflow[sampler.samplerId];
  if (!samplerNode?.inputs) {
    return;
  }

  const latentRef = samplerNode.inputs.latent_image;
  const latentId = isNodeOutputRef(latentRef) ? latentRef[0] : null;
  const latentNode = latentId ? workflow[latentId] : null;

  const patchEmptyLatentNode = (nodeId: string, node: WorkflowNodeRecord): void => {
    if (node.class_type !== 'EmptySD3LatentImage') {
      node.class_type = 'EmptySD3LatentImage';
    }
    if (node.inputs) {
      node.inputs.width = width;
      node.inputs.height = height;
      node.inputs.batch_size = node.inputs.batch_size ?? 1;
    }
    samplerNode.inputs!.latent_image = [nodeId, 0];
  };

  if (latentNode?.class_type && EMPTY_LATENT_TYPES.has(latentNode.class_type) && latentId) {
    patchEmptyLatentNode(latentId, latentNode);
    return;
  }

  const existingEmpty = Object.entries(workflow).find(
    ([, node]) => node?.class_type && EMPTY_LATENT_TYPES.has(node.class_type)
  );
  if (existingEmpty) {
    const [nodeId, node] = existingEmpty;
    patchEmptyLatentNode(nodeId, node!);
    return;
  }

  const emptyId = nextLightningWorkflowNodeId(workflow);
  workflow[emptyId] = {
    class_type: 'EmptySD3LatentImage',
    inputs: { width, height, batch_size: 1 },
    _meta: { title: 'Empty Latent' },
  };
  insertedNodeIds.push(emptyId);
  samplerNode.inputs.latent_image = [emptyId, 0];

  // Drop stale img2img VAEEncode when it only fed the sampler (not ReferenceLatent).
  if (latentId && latentNode?.class_type && VAE_ENCODE_TYPES.has(latentNode.class_type)) {
    const stillReferenced = Object.values(workflow).some(other => {
      if (!other?.inputs || other === latentNode) {
        return false;
      }
      return Object.values(other.inputs).some(value => getLinkedNodeId(value) === latentId);
    });
    if (!stillReferenced) {
      delete workflow[latentId];
    }
  }
}

const LOADER_FILENAME_FIELDS = [
  'unet_name',
  'ckpt_name',
  // Do not rewrite CLIP here — official LightX2V keeps fp8_scaled CLIP with bf16 UNET.
] as const;

function rewriteFp8FilenameToBf16(filename: string, model?: string): string | undefined {
  if (precisionHintFromFilename(filename) !== 'fp8') {
    return undefined;
  }
  const lower = filename.toLowerCase();
  if (/clip|qwen_2\.5_vl|text_encoder/.test(lower)) {
    return undefined;
  }
  // Prefer the concrete filename's family — never swap 2512↔edit from model id alone.
  const family = qwenUnetFamilyFromFilename(filename);
  if (family === 'edit-2511') {
    return qwenEdit2511UnetFilename('bf16');
  }
  if (family === 'edit-2509') {
    return qwenEdit2509UnetFilename('bf16');
  }
  if (family === 't2i') {
    return qwen2512UnetFilename('bf16');
  }
  if (model?.includes('edit-2511')) {
    return qwenEdit2511UnetFilename('bf16');
  }
  if (model?.includes('edit-2509')) {
    return qwenEdit2509UnetFilename('bf16');
  }
  return qwen2512UnetFilename('bf16');
}

/** Rewrite concrete fp8 UNET/CLIP filenames to bf16 — Lightning must not run mixed fp8. */
export function forceLightningBf16FilenamesInWorkflow(
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
    const inputs = node?.inputs;
    if (!inputs) {
      continue;
    }
    for (const field of LOADER_FILENAME_FIELDS) {
      const value = inputs[field];
      if (typeof value !== 'string' || !value.trim()) {
        continue;
      }
      const rewritten = rewriteFp8FilenameToBf16(value, model);
      if (rewritten) {
        inputs[field] = rewritten;
      }
    }
  }

  return next;
}

export function resolveLightningBf16Loaders(
  model?: string,
  loaders?: ModelLoaderFilenames
): ModelLoaderFilenames {
  const next: ModelLoaderFilenames = { ...(loaders ?? {}) };
  const preferredUnet = model?.includes('edit-2511')
    ? qwenEdit2511UnetFilename('bf16')
    : model?.includes('edit-2509')
      ? qwenEdit2509UnetFilename('bf16')
      : qwen2512UnetFilename('bf16');
  const existingUnet =
    typeof next.unet === 'string' && next.unet.trim() && !filenameLooksLikeCheckpointOnly(next.unet)
      ? next.unet.trim()
      : undefined;
  if (existingUnet) {
    const rewritten = rewriteFp8FilenameToBf16(existingUnet, model);
    // Keep the workflow/map UNET family — only lift fp8→bf16 within that family.
    next.unet = rewritten ?? existingUnet;
  } else {
    next.unet = preferredUnet;
  }
  if (
    !next.checkpoint ||
    precisionHintFromFilename(next.checkpoint) === 'fp8' ||
    filenameLooksLikeCheckpointOnly(next.checkpoint)
  ) {
    next.checkpoint = next.unet;
  }
  // Keep caller CLIP when set — LightX2V official uses fp8_scaled CLIP with bf16 UNET.
  if (!next.dualClip?.trim()) {
    next.dualClip = qwenDualClipFilename('bf16');
  }
  // Sticky Flux ae.safetensors / wrong Settings VAE maps mosaic Qwen Edit Lightning.
  if (!next.vae?.trim() || (model && isVaeFilenameIncompatibleWithModel(model, next.vae))) {
    next.vae = 'qwen_image_vae.safetensors';
  }
  return next;
}

/** Rewrite Flux/SD VAEs on Lightning graphs to qwen_image_vae (decode mismatch → gray mosaic). */
export function forceQwenVaeInLightningWorkflow(
  workflow: Record<string, unknown>,
  model?: string
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }
  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  for (const node of Object.values(next)) {
    if (node?.class_type !== 'VAELoader' || !node.inputs) {
      continue;
    }
    const current = node.inputs.vae_name;
    if (typeof current !== 'string' || !current.trim()) {
      node.inputs.vae_name = 'qwen_image_vae.safetensors';
      continue;
    }
    if (isVaeFilenameIncompatibleWithModel(model ?? '', current)) {
      node.inputs.vae_name = 'qwen_image_vae.safetensors';
    }
  }
  return next;
}

export function alignLightningBf16LoadersInWorkflow(
  workflow: Record<string, unknown>,
  loaders: ModelLoaderFilenames | undefined,
  model?: string,
  options?: { syncLoadersToModel?: boolean }
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }
  const bf16 = resolveLightningBf16Loaders(model, loaders);
  // LightX2V official pairs bf16 UNET with fp8_scaled CLIP. Never precision-align
  // CLIP unless the user explicitly syncs loaders to the selected model.
  const patchLoaders: ModelLoaderFilenames = {
    unet: bf16.unet,
    checkpoint: bf16.checkpoint,
    vae: bf16.vae,
  };
  if (options?.syncLoadersToModel === true) {
    patchLoaders.dualClip = bf16.dualClip;
  }
  return patchLoaderNodesInWorkflow(workflow, patchLoaders, {
    syncLoadersToModel: options?.syncLoadersToModel === true,
  }).workflow;
}

/** Detect imported Lightning graphs that already match the native LightX2V recipe. */
export function isNativeLightningWorkflowReady(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {}
): boolean {
  if (!isQwenLightningModel(model)) {
    return false;
  }

  const graph = workflow as Record<string, WorkflowNodeRecord>;

  for (const node of Object.values(graph)) {
    if (!node?.inputs || !isSamplerNode(node.class_type, node.inputs)) {
      continue;
    }
    if (!isMainGenerateSampler(node.inputs)) {
      continue;
    }

    const modelLink = getLinkedNodeId(node.inputs.model);
    // SamplerCustom graphs often put the model on the guider instead.
    if (!modelLink) {
      continue;
    }

    // Also accept guider-held model links (SamplerCustom).
    const classLower = (node.class_type ?? '').toLowerCase();
    if (classLower.includes('samplercustom')) {
      // Walk guiders separately below.
    }

    const chainIds = walkModelChainIds(graph, modelLink);
    if (
      chainHasLightningLora(graph, chainIds, loraFilenames) &&
      chainHasAuraFlow(graph, chainIds)
    ) {
      const auraId = chainHasAuraFlow(graph, chainIds);
      if (!auraId) {
        continue;
      }
      const shift = Number(graph[auraId]?.inputs?.shift);
      if (Number.isFinite(shift) && shift >= 2.5 && shift <= 4) {
        return true;
      }
    }
  }

  // Guider-based graphs: model sits on BasicGuider / CFGGuider.
  for (const node of Object.values(graph)) {
    if (!node?.inputs) {
      continue;
    }
    const classLower = (node.class_type ?? '').toLowerCase();
    if (!classLower.includes('guider')) {
      continue;
    }
    const modelLink = getLinkedNodeId(node.inputs.model);
    if (!modelLink) {
      continue;
    }
    const chainIds = walkModelChainIds(graph, modelLink);
    if (
      !chainHasLightningLora(graph, chainIds, loraFilenames) ||
      !chainHasAuraFlow(graph, chainIds)
    ) {
      continue;
    }
    const auraId = chainHasAuraFlow(graph, chainIds);
    if (!auraId) {
      continue;
    }
    const shift = Number(graph[auraId]?.inputs?.shift);
    if (Number.isFinite(shift) && shift >= 2.5 && shift <= 4) {
      return true;
    }
  }

  return false;
}

/**
 * Pure T2I with TextEncodeQwenImageEditPlus requires image1/2/3 disconnected.
 * A baked-in or placeholder LoadImage wired into encode produces mosaic/shard
 * artifacts on Generate when no reference was uploaded.
 * Also drops LoadImage nodes from the submitted graph — ComfyUI still executes
 * unused LoadImage nodes and fails on missing {{INPUT_IMAGE}} / stale files.
 */
// Qwen Edit reference-image wiring for the queue path lives in
// workflow-lightning-qwen-edit-queue.ts; re-exported here unchanged so
// existing external imports from './workflow-lightning-queue' keep working.
export {
  disconnectQwenEditReferenceImagesForTxt2Img,
  ensureQwenEditReferenceImagesForImg2Img,
  scaleQwenEditReferenceImagesToLatentSize,
  ensureQwenReferenceLatentWiringInWorkflow,
  pruneUnresolvedQwenEditFigureLoaders,
  prepareQwenEditReferenceImagesForQueue,
} from './workflow-lightning-qwen-edit-queue';

export function prepareLightningWorkflowForQueue(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {},
  options?: {
    params?: WorkflowParamValues;
    loaders?: ModelLoaderFilenames;
    syncLoadersToModel?: boolean;
  }
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  let working = workflow;
  if (isLockLatentSizeParams(options?.params)) {
    working = forceLightningLatentSizeInWorkflow(working, options?.params, model);
  }

  const refsPrepared = prepareQwenEditReferenceImagesForQueue(working, model, options?.params);

  const loraPatch = patchLoraNodesInWorkflow(refsPrepared, loraFilenames);
  const familyAligned = alignLightningLoraFamilyInWorkflow(
    loraPatch.workflow,
    model,
    loraFilenames
  );

  const finishLightningGraph = (
    workflowAfterLatent: Record<string, unknown>
  ): Record<string, unknown> => {
    // Sticky Flux ae.safetensors on Qwen Edit Lightning → gray mosaic decode.
    const vaeFixed = forceQwenVaeInLightningWorkflow(workflowAfterLatent, model);
    const latentSize = readEmptyLatentSize(vaeFixed) ?? options?.params;
    const hasInputImage = Boolean(
      options?.params?.inputImageFilename?.toString().trim() ||
      options?.params?.inputImageFilenames?.some(name => Boolean(name?.toString().trim()))
    );
    const sized = hasInputImage
      ? ensureQwenReferenceLatentWiringInWorkflow(vaeFixed, {
          inputImageFilename: options?.params?.inputImageFilename?.toString(),
          inputImageFilenames: options?.params?.inputImageFilenames,
          width: latentSize?.width,
          height: latentSize?.height,
        }).workflow
      : scaleQwenEditReferenceImagesToLatentSize(vaeFixed, latentSize ?? options?.params).workflow;
    const resolvedLatentSize = readEmptyLatentSize(sized);
    const saveBypass = bypassMismatchedSaveImageScaleToLatent(sized, resolvedLatentSize).workflow;
    return pruneUnresolvedQwenEditFigureLoaders(saveBypass).workflow;
  };

  // If a Lightning LoRA is already present, repair LoRA wiring/strengths and
  // still force queue latent size — extreme leftover sizes cause mosaic melt.
  if (workflowHasLightningLora(familyAligned.workflow, loraFilenames)) {
    const chainEnsured = isNativeLightningWorkflowReady(
      familyAligned.workflow,
      model,
      loraFilenames
    )
      ? familyAligned.workflow
      : ensureLightningModelChainInWorkflow(familyAligned.workflow, model, loraFilenames);
    const normalizedLoras = normalizeLightningLoraStrengths(chainEnsured, model, loraFilenames);
    const latentSized = forceLightningLatentSizeInWorkflow(normalizedLoras, options?.params, model);
    const fp8Rewritten = forceLightningBf16FilenamesInWorkflow(latentSized, model);
    const weightDtype = normalizeLightningUnetWeightDtype(fp8Rewritten, model);
    const hiresStripped = stripLightningHiresPass(weightDtype, model);
    const stripped = stripLightningOutputPostProcess(hiresStripped.workflow, model);
    const neutralized = neutralizeNonLightningLoras(
      stripped.workflow,
      model,
      loraFilenames
    ).workflow;
    return finishLightningGraph(neutralized);
  }

  const chainEnsured = ensureLightningModelChainInWorkflow(
    familyAligned.workflow,
    model,
    loraFilenames
  );
  const normalizedLoras = normalizeLightningLoraStrengths(chainEnsured, model, loraFilenames);
  const latentSized = forceLightningLatentSizeInWorkflow(normalizedLoras, options?.params, model);
  const fp8Rewritten = forceLightningBf16FilenamesInWorkflow(latentSized, model);
  const loadersAligned = alignLightningBf16LoadersInWorkflow(
    fp8Rewritten,
    options?.loaders,
    model,
    { syncLoadersToModel: options?.syncLoadersToModel }
  );
  const weightDtype = normalizeLightningUnetWeightDtype(loadersAligned, model);
  const samplingKept = bypassModelSamplingAuraFlowForLightning(weightDtype, model);
  const hiresStripped = stripLightningHiresPass(samplingKept.workflow, model);
  const stripped = stripLightningOutputPostProcess(hiresStripped.workflow, model);
  const neutralized = neutralizeNonLightningLoras(stripped.workflow, model, loraFilenames).workflow;
  return finishLightningGraph(neutralized);
}

const AURA_FLOW_CLASS = 'ModelSamplingAuraFlow';
const CONDITIONING_ZERO_OUT = 'ConditioningZeroOut';

/**
 * Official Boogu Turbo: CFG 1, empty negative via ConditioningZeroOut, no AuraFlow shift.
 * Pack/scaffold graphs that CLIP-encode negatives or insert ModelSamplingAuraFlow over-cook.
 */
export function prepareBooguTurboWorkflowForQueue(
  workflow: Record<string, unknown>,
  model?: string
): Record<string, unknown> {
  if (!isBooguTurboModel(model)) {
    return workflow;
  }

  const next = JSON.parse(JSON.stringify(workflow)) as Record<string, WorkflowNodeRecord>;

  for (const node of Object.values(next)) {
    if (node?.class_type === 'TextEncodeBooguEdit' && node.inputs) {
      node.inputs.negative_prompt = '';
    }
  }

  for (const node of Object.values(next)) {
    if (!node?.inputs || !isSamplerNode(node.class_type, node.inputs)) {
      continue;
    }
    if (!isMainGenerateSampler(node.inputs)) {
      continue;
    }

    const positiveRef = node.inputs.positive;
    if (Array.isArray(positiveRef) && positiveRef.length >= 2) {
      const zeroId = nextWorkflowNodeId(next);
      next[zeroId] = {
        class_type: CONDITIONING_ZERO_OUT,
        inputs: { conditioning: [String(positiveRef[0]), Number(positiveRef[1])] },
        _meta: { title: 'Boogu Turbo — zero negative' },
      };
      node.inputs.negative = [zeroId, 0];
    }

    const modelNodeId = getLinkedNodeId(node.inputs.model);
    if (!modelNodeId) {
      continue;
    }
    const modelNode = next[modelNodeId];
    if (modelNode?.class_type !== AURA_FLOW_CLASS) {
      continue;
    }
    const bypassRef = modelNode.inputs?.model;
    if (Array.isArray(bypassRef) && bypassRef.length >= 2) {
      node.inputs.model = [String(bypassRef[0]), Number(bypassRef[1])];
    }
  }

  return next;
}

export function readEmptyLatentSize(
  workflow: Record<string, unknown>
): { width: number; height: number } | null {
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs || !isLatentSizeNode(record.class_type ?? '', inputs)) {
      continue;
    }
    const width = Number(inputs.width);
    const height = Number(inputs.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }
  return null;
}

export type LightningWorkflowAuditIssue = {
  severity: 'error' | 'warn';
  message: string;
};

/** Native turbo stacks (Boogu / Z-Image) — warn on harmful Lightning LoRA stacking, validate UNET. */
export function auditDistilledTurboWorkflowIssues(input: {
  workflowJson?: string;
  workflow?: Record<string, unknown> | null;
  model?: string;
  loraFilenames?: Record<string, string>;
}): LightningWorkflowAuditIssue[] {
  const modelId = String(input.model ?? '').trim();
  if (!/^boogu-image(?:-edit)?-turbo$|^z-image-turbo$/i.test(modelId)) {
    return [];
  }

  type TurboNode = {
    class_type?: string;
    inputs?: Record<string, unknown>;
  };
  let parsed: Record<string, TurboNode> | null = null;
  if (input.workflow && typeof input.workflow === 'object') {
    parsed = input.workflow as Record<string, TurboNode>;
  } else if (input.workflowJson?.trim()) {
    try {
      parsed = JSON.parse(input.workflowJson) as Record<string, TurboNode>;
    } catch {
      return [];
    }
  }
  if (!parsed) {
    return [];
  }

  const issues: LightningWorkflowAuditIssue[] = [];
  const loraFilenames = input.loraFilenames ?? {};

  for (const node of Object.values(parsed)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }
    const loraName = node.inputs.lora_name;
    const filename = resolveLoraLoaderFilename(loraName, loraFilenames)?.trim();
    if (!filename) {
      if (
        typeof loraName === 'string' &&
        /^\{\{LORA_.*(LIGHTNING|LIGHTX2V).*\}\}$/i.test(loraName.trim())
      ) {
        issues.push({
          severity: 'warn',
          message:
            'Native turbo model with unresolved {{LORA_LIGHTNING}} — turbo UNETs are already distilled; bypass or remove the LoRA loader instead of mapping a Lightning LoRA.',
        });
      }
      continue;
    }
    const lower = filename.toLowerCase();
    if (
      /lightx2v|qwen[-_.\s]*image[-_.\s]*lightning|lightning[-_.\s]*8\s*step|lightning[-_.\s]*4\s*step/.test(
        lower
      )
    ) {
      issues.push({
        severity: 'error',
        message: `Lightning acceleration LoRA (${filename}) stacked on ${modelId} — turbo models are natively distilled; remove this LoRA to avoid over-processing and anatomy melt.`,
      });
    }
  }

  for (const node of Object.values(parsed)) {
    if (node?.class_type !== 'UNETLoader' || typeof node.inputs?.unet_name !== 'string') {
      continue;
    }
    const unet = node.inputs.unet_name.trim().toLowerCase();
    if (!/boogu_image/.test(unet)) {
      continue;
    }
    const wantsTurbo = /turbo/i.test(modelId);
    const wantsEdit = /edit/i.test(modelId);
    if (wantsTurbo && !/turbo/.test(unet)) {
      issues.push({
        severity: 'error',
        message: `Boogu Turbo is loading non-turbo UNET “${node.inputs.unet_name}” — use boogu_image_turbo_bf16.safetensors (T2I) or boogu_image_edit_turbo_bf16.safetensors (Edit).`,
      });
    }
    if (wantsEdit && !/edit/.test(unet)) {
      issues.push({
        severity: 'error',
        message: `Boogu Edit Turbo is loading T2I UNET “${node.inputs.unet_name}” — use boogu_image_edit_turbo_bf16.safetensors.`,
      });
    }
    if (!wantsEdit && /edit/.test(unet) && wantsTurbo) {
      issues.push({
        severity: 'error',
        message: `Boogu Image Turbo is loading Edit UNET “${node.inputs.unet_name}” — use boogu_image_turbo_bf16.safetensors.`,
      });
    }
  }

  return issues;
}

export function auditLightningWorkflowIssues(input: {
  workflowJson?: string;
  workflow?: Record<string, unknown> | null;
  model?: string;
  loraFilenames?: Record<string, string>;
  /** When true, graph was already run through prepareLightningWorkflowForQueue. */
  alreadyPrepared?: boolean;
}): LightningWorkflowAuditIssue[] {
  if (!isQwenLightningModel(input.model)) {
    return [];
  }

  type LightningNode = {
    class_type?: string;
    inputs?: Record<string, unknown>;
  };
  let parsed: Record<string, LightningNode> | null = null;
  if (input.workflow && typeof input.workflow === 'object') {
    parsed = input.workflow as Record<string, LightningNode>;
  } else if (input.workflowJson?.trim()) {
    try {
      parsed = JSON.parse(input.workflowJson) as Record<string, LightningNode>;
    } catch {
      return [];
    }
  }
  if (!parsed) {
    return [];
  }

  // Audit the post-prep graph so missing LoRA nodes that queue injection would add
  // are not false errors when {{LORA_LIGHTNING}} is already mapped in Settings.
  // Queue path passes alreadyPrepared after inject — skip a second full prep.
  const prepared = (
    input.alreadyPrepared
      ? parsed
      : prepareLightningWorkflowForQueue(parsed, input.model, input.loraFilenames ?? {})
  ) as typeof parsed;

  const issues: LightningWorkflowAuditIssue[] = [];

  if (!workflowHasLoraLoader(prepared)) {
    issues.push({
      severity: 'error',
      message:
        'Lightning model queued without a LoraLoader — set {{LORA_LIGHTNING}} on this workflow’s token overrides (or in Settings → LoRA library as ID “LIGHTNING”). Missing LoRA causes soft, malformed hands/faces.',
    });
  } else if (!workflowHasLightningLora(prepared, input.loraFilenames ?? {})) {
    issues.push({
      severity: 'error',
      message:
        'Lightning workflow has no Lightning LoRA mapped — set {{LORA_LIGHTNING}} on this workflow’s token overrides (or LoRA library) to your 8-step LightX2V .safetensors.',
    });
  } else {
    const modelId = String(input.model ?? '');
    const wantsEdit = /edit/i.test(modelId);
    for (const node of Object.values(prepared)) {
      if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
        continue;
      }
      const filename = resolveLoraLoaderFilename(node.inputs.lora_name, input.loraFilenames ?? {});
      if (!filename || !loraFilenameImpliesLightning(filename)) {
        continue;
      }
      const loraIsEdit = /edit/i.test(filename);
      if (wantsEdit !== loraIsEdit) {
        issues.push({
          severity: 'error',
          message: wantsEdit
            ? `Edit-2511 Lightning is paired with a T2I Lightning LoRA (${filename}). Set this workflow’s {{LORA_LIGHTNING}} to an Edit-2511 LightX2V file (name contains “Edit”) — T2I LoRA on Edit UNET causes worm/melt artifacts.`
            : `T2I Lightning is paired with an Edit Lightning LoRA (${filename}). Set this workflow’s {{LORA_LIGHTNING}} to a Qwen-Image Lightning file (not Edit) — Edit LoRA on 2512 UNET causes worm/melt artifacts.`,
        });
        break;
      }
    }
  }

  let hasAuraFlow = false;
  let hasMainSampler = false;
  let samplerUsesAuraFlow = false;
  for (const node of Object.values(prepared)) {
    if (!node) {
      continue;
    }
    if (node.class_type === AURA_FLOW_TYPE) {
      hasAuraFlow = true;
    }
    if (
      node.inputs &&
      isSamplerNode(node.class_type, node.inputs) &&
      isMainGenerateSampler(node.inputs)
    ) {
      hasMainSampler = true;
      const chain = walkModelChainIds(prepared, getLinkedNodeId(node.inputs.model));
      if (chainHasAuraFlow(prepared, chain)) {
        samplerUsesAuraFlow = true;
      }
    }
  }
  if (hasMainSampler && (!hasAuraFlow || !samplerUsesAuraFlow)) {
    issues.push({
      severity: 'error',
      message:
        'Lightning KSampler is missing ModelSamplingAuraFlow (shift ~3) on the model chain — without it, output is soft and anatomy drifts. Queue prep normally inserts this; check the workflow graph.',
    });
  }

  for (const node of Object.values(prepared)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }
    if (loraNameImpliesLightning(node.inputs.lora_name, input.loraFilenames ?? {})) {
      continue;
    }
    const filename = resolveLoraLoaderFilename(node.inputs.lora_name, input.loraFilenames ?? {});
    if (
      filename &&
      !loraFilenameImpliesLightning(filename) &&
      (loraStrengthIsActive(node.inputs.strength_model) ||
        loraStrengthIsActive(node.inputs.strength_clip) ||
        loraStrengthIsActive(node.inputs.strength))
    ) {
      issues.push({
        severity: 'warn',
        message:
          'Workflow stacks non-Lightning LoRAs (style/NSFW) on a Lightning model — Castcut disables them at queue time. Remove them in ComfyUI or use a Lightning-only workflow for clean output.',
      });
      break;
    }
  }

  for (const node of Object.values(prepared)) {
    if (!node?.inputs) {
      continue;
    }
    if (
      isLatentSizeNode(node.class_type ?? '', node.inputs) &&
      Number(node.inputs.width) === 1024 &&
      Number(node.inputs.height) === 1024
    ) {
      issues.push({
        severity: 'warn',
        message:
          'Lightning workflow latent is still 1024×1024 — queue should patch to 1328×1328 native. Restart the dev server and check Advanced queue params are not pinned to 1024.',
      });
      break;
    }
  }

  for (const node of Object.values(prepared)) {
    if (node?.class_type !== 'VAELoader' || !node.inputs) {
      continue;
    }
    const vaeName = node.inputs.vae_name;
    if (
      typeof vaeName === 'string' &&
      isVaeFilenameIncompatibleWithModel(String(input.model ?? ''), vaeName)
    ) {
      issues.push({
        severity: 'error',
        message: `Lightning graph VAE is “${vaeName}” — Qwen Image/Edit needs qwen_image_vae.safetensors. Flux ae.safetensors here decodes to gray mosaic. Queue prep should rewrite it; restart the app if this persists.`,
      });
      break;
    }
  }

  const latentSize = readEmptyLatentSize(prepared);
  if (latentSize && /edit/i.test(String(input.model ?? ''))) {
    let refSizeMismatch = false;
    const hasReferenceLatentChain = Object.values(prepared).some(
      node => node?.class_type === 'ReferenceLatent'
    );
    for (const node of Object.values(prepared)) {
      if (node?.class_type !== 'ReferenceLatent' || !node.inputs) {
        continue;
      }
      const latentRef = getLinkedNodeId(node.inputs.latent);
      if (!latentRef) {
        continue;
      }
      const encodeNode = prepared[latentRef];
      if (encodeNode?.class_type !== 'VAEEncode') {
        continue;
      }
      const pixelsRef = getLinkedNodeId(encodeNode.inputs?.pixels);
      if (!pixelsRef) {
        continue;
      }
      const scaleNode = prepared[pixelsRef];
      if (
        scaleNode?.class_type === 'ImageScale' &&
        (Number(scaleNode.inputs?.width) !== latentSize.width ||
          Number(scaleNode.inputs?.height) !== latentSize.height)
      ) {
        issues.push({
          severity: 'warn',
          message: `Edit Lightning ReferenceLatent ref scale is ${Number(scaleNode.inputs?.width)}×${Number(scaleNode.inputs?.height)} but EmptyLatent is ${latentSize.width}×${latentSize.height} — size mismatch mosaics CFG-1 Compose.`,
        });
        refSizeMismatch = true;
        break;
      }
    }
    if (!refSizeMismatch && !hasReferenceLatentChain) {
      for (const node of Object.values(prepared)) {
        if (!node?.inputs || !QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? '')) {
          continue;
        }
        if ('vae' in node.inputs) {
          issues.push({
            severity: 'warn',
            message:
              'Edit encode still has VAE wired — disconnect VAE and use VAEEncode + ReferenceLatent for appearance refs. Restart the app if queue prep did not apply.',
          });
          refSizeMismatch = true;
          break;
        }
      }
    }
  }

  for (const node of Object.values(prepared)) {
    if (!node?.inputs) {
      continue;
    }
    for (const value of Object.values(node.inputs)) {
      if (typeof value !== 'string') {
        continue;
      }
      if (/fp8|e4m3fn|fp8_scaled/i.test(value)) {
        issues.push({
          severity: 'warn',
          message:
            'Workflow still references fp8 weights — Castcut will prefer bf16 for Lightning at queue time to reduce banding.',
        });
        return issues;
      }
    }
  }

  return issues;
}
