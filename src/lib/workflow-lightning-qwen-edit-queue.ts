/**
 * Qwen Edit reference-image wiring for the queue path: aligning
 * ReferenceLatent / VAEEncode / LoadImage chains to the target latent
 * size, pruning unresolved figure loaders, and the top-level
 * prepareQwenEditReferenceImagesForQueue orchestrator that
 * prepareLightningWorkflowForQueue calls.
 *
 * Extracted from workflow-lightning-queue.ts (which re-exports these
 * names to keep its public API unchanged, and imports the ones it
 * calls internally from prepareLightningWorkflowForQueue). The reverse
 * imports below (helpers/consts/types that stayed behind) are the only
 * coupling back to that file.
 */

import {
  type WorkflowNodeRecord,
  getLinkedNodeId,
  isNodeOutputRef,
  findVaeSourceRef,
  findPrimarySampler,
  disconnectQwenEditEncodeVae,
  wireQwenEditEncodeVisionImages,
  ensureQwenEmptyLatentForReferenceEdit,
  peelQwenReferenceLatentChain,
  ensureRefImageScaleNode,
  readEmptyLatentSize,
  QWEN_EDIT_ENCODE_TYPES,
  QWEN_EDIT_IMAGE_INPUT_KEYS,
  LOAD_IMAGE_TYPES,
} from './workflow-lightning-queue';
import type { WorkflowParamValues } from './comfyui-config';
import { isEditCapableModel, isBooguEditModel } from './model-denoise-defaults';
import { normalizeInputImageFilenames } from './workflow-load-image-bindings';

export function disconnectQwenEditReferenceImagesForTxt2Img(
  workflow: Record<string, unknown>,
  options?: { hasInputImage?: boolean; model?: string }
): {
  workflow: Record<string, unknown>;
  disconnectedNodeIds: string[];
} {
  if (options?.hasInputImage) {
    return { workflow, disconnectedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const disconnectedNodeIds: string[] = [];
  const removedLoadImageIds = new Set<string>();

  for (const [nodeId, node] of Object.entries(next)) {
    if (!node?.inputs || !QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    let changed = false;
    for (const key of QWEN_EDIT_IMAGE_INPUT_KEYS) {
      if (key in node.inputs) {
        const linked = getLinkedNodeId(node.inputs[key]);
        if (linked && next[linked]?.class_type === 'LoadImage') {
          removedLoadImageIds.add(linked);
        }
        delete node.inputs[key];
        changed = true;
      }
    }
    if (changed) {
      disconnectedNodeIds.push(nodeId);
    }
    if ('vae' in (node.inputs ?? {})) {
      delete node.inputs!.vae;
      if (!changed) {
        disconnectedNodeIds.push(nodeId);
      }
    }
  }

  // Drop LoadImage nodes that only existed for edit refs (still validated by ComfyUI).
  for (const [nodeId, node] of Object.entries(next)) {
    if (node?.class_type !== 'LoadImage') {
      continue;
    }
    const stillReferenced = Object.values(next).some(other => {
      if (!other?.inputs || other === node) {
        return false;
      }
      return Object.values(other.inputs).some(value => getLinkedNodeId(value) === nodeId);
    });
    if (!stillReferenced || removedLoadImageIds.has(nodeId)) {
      if (!stillReferenced) {
        delete next[nodeId];
        disconnectedNodeIds.push(nodeId);
      }
    }
  }
  for (const nodeId of removedLoadImageIds) {
    const node = next[nodeId];
    if (!node) {
      continue;
    }
    // A LoadImage feeding the edit-encode node can also be shared by another node (e.g. a
    // ControlNet/FaceDetailer reusing the same reference image) — the loop above already
    // checks this and correctly keeps it. Re-check here too: deleting it unconditionally
    // would leave that other node pointing at a node ID that no longer exists, which fails
    // ComfyUI's prompt validation.
    const stillReferenced = Object.values(next).some(other => {
      if (!other?.inputs || other === node) {
        return false;
      }
      return Object.values(other.inputs).some(value => getLinkedNodeId(value) === nodeId);
    });
    if (stillReferenced) {
      continue;
    }
    delete next[nodeId];
    if (!disconnectedNodeIds.includes(nodeId)) {
      disconnectedNodeIds.push(nodeId);
    }
  }

  return { workflow: next, disconnectedNodeIds };
}

/** When a reference image is queued, ensure EditPlus encode nodes receive it. */
export function ensureQwenEditReferenceImagesForImg2Img(
  workflow: Record<string, unknown>,
  options?: {
    hasInputImage?: boolean;
    inputImageFilename?: string;
    inputImageFilenames?: string[];
    /**
     * When true (default), overwrite existing encode→LoadImage links so stale
     * pack refs adopt Figure 1–N from the queue.
     */
    forceRewire?: boolean;
    /** When false, only create/update Figure LoadImages (ReferenceLatent path). */
    wireEncodeSlots?: boolean;
  }
): {
  workflow: Record<string, unknown>;
  wiredNodeIds: string[];
} {
  if (!options?.hasInputImage) {
    return { workflow, wiredNodeIds: [] };
  }

  const filenames = normalizeInputImageFilenames(
    options.inputImageFilename,
    options.inputImageFilenames
  );

  if (filenames.length === 0) {
    return { workflow, wiredNodeIds: [] };
  }

  const forceRewire = options.forceRewire !== false;
  const wireEncodeSlots = options.wireEncodeSlots !== false;
  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const encodeImageKeys = ['image1', 'image2', 'image3', 'image4'] as const;
  const booguEncodeImageKeys = [
    'images.image_1',
    'images.image_2',
    'images.image_3',
    'images.image_4',
  ] as const;
  const legacyBooguEncodeImageKeys = ['image_1', 'image_2', 'image_3', 'image_4'] as const;

  const findOrCreateFigureLoader = (figureIndex: number, filename: string): string => {
    const title = `Figure ${figureIndex}`;
    const existing = Object.entries(next).find(([, node]) => {
      if (node?.class_type !== 'LoadImage' && node?.class_type !== 'LoadImageOutput') {
        return false;
      }
      const nodeTitle = node._meta?.title?.trim() ?? '';
      return (
        nodeTitle === title ||
        new RegExp(
          `\\b(?:figure|image|ref|reference|photo|picture)\\s*${figureIndex}\\b`,
          'i'
        ).test(nodeTitle)
      );
    });
    if (existing) {
      const [id, node] = existing;
      if (node?.inputs) {
        node.inputs.image = filename;
      }
      if (node && !node._meta?.title) {
        node._meta = { ...(node._meta ?? {}), title };
      }
      return id;
    }

    // Prefer reusing the first untitled LoadImage for Figure 1 only.
    if (figureIndex === 1) {
      const first = Object.entries(next).find(
        ([, node]) => node?.class_type === 'LoadImage' || node?.class_type === 'LoadImageOutput'
      );
      if (first) {
        const [id, node] = first;
        if (node?.inputs) {
          node.inputs.image = filename;
        }
        if (node) {
          node._meta = { ...(node._meta ?? {}), title };
        }
        return id;
      }
    }

    const loadImageId = String(Math.max(0, ...Object.keys(next).map(id => Number(id) || 0)) + 1);
    next[loadImageId] = {
      class_type: 'LoadImage',
      inputs: { image: filename },
      _meta: { title },
    };
    return loadImageId;
  };

  const loaderIds: Array<string | undefined> = [];
  for (let index = 0; index < filenames.length; index += 1) {
    const filename = filenames[index]?.trim();
    if (!filename) {
      loaderIds[index] = undefined;
      continue;
    }
    loaderIds[index] = findOrCreateFigureLoader(index + 1, filename);
  }

  if (!wireEncodeSlots) {
    return { workflow: next, wiredNodeIds: loaderIds.filter(Boolean) as string[] };
  }

  const shouldWireSlot = (current: unknown): boolean => {
    if (forceRewire) {
      return true;
    }
    return current == null || typeof current === 'string';
  };

  const wiredNodeIds: string[] = [];
  for (const [nodeId, node] of Object.entries(next)) {
    if (!node?.inputs || !QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    if (node.class_type === 'TextEncodeQwenImageEdit') {
      const current = node.inputs.image;
      if (loaderIds[0] && shouldWireSlot(current)) {
        node.inputs.image = [loaderIds[0], 0];
        wiredNodeIds.push(nodeId);
      }
      continue;
    }

    if (node.class_type === 'TextEncodeBooguEdit') {
      let changed = false;
      for (const legacyKey of legacyBooguEncodeImageKeys) {
        if (legacyKey in node.inputs) {
          delete node.inputs[legacyKey];
          changed = true;
        }
      }
      for (let i = 0; i < booguEncodeImageKeys.length; i += 1) {
        const key = booguEncodeImageKeys[i]!;
        const loaderId = loaderIds[i];
        if (loaderId && shouldWireSlot(node.inputs[key])) {
          node.inputs[key] = [loaderId, 0];
          changed = true;
        } else if (forceRewire && !loaderId && key in node.inputs) {
          delete node.inputs[key];
          changed = true;
        }
      }
      if (changed) {
        wiredNodeIds.push(nodeId);
      }
      continue;
    }

    let changed = false;
    for (let i = 0; i < encodeImageKeys.length; i += 1) {
      const key = encodeImageKeys[i]!;
      const loaderId = loaderIds[i];
      if (loaderId && shouldWireSlot(node.inputs[key])) {
        node.inputs[key] = [loaderId, 0];
        changed = true;
      } else if (forceRewire && !loaderId && key in node.inputs) {
        delete node.inputs[key];
        changed = true;
      }
    }
    if (changed) {
      wiredNodeIds.push(nodeId);
    }
  }

  return { workflow: next, wiredNodeIds };
}

export function nextLightningWorkflowNodeId(workflow: Record<string, WorkflowNodeRecord>): string {
  return String(Math.max(0, ...Object.keys(workflow).map(id => Number(id) || 0)) + 1);
}

/**
 * Match reference pixels to EmptyLatent W×H before TextEncodeQwenImageEditPlus.
 * Uploads stay ≤2048 while Lightning EmptyLatent snaps to ~1328 — wiring full-res
 * refs straight into encode mosaics CFG-1 Edit Lightning.
 */
export function scaleQwenEditReferenceImagesToLatentSize(
  workflow: Record<string, unknown>,
  params?: Pick<WorkflowParamValues, 'width' | 'height'>
): {
  workflow: Record<string, unknown>;
  scaledSlotCount: number;
} {
  const width = Number(params?.width);
  const height = Number(params?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { workflow, scaledSlotCount: 0 };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const encodeImageKeys = [
    'image',
    'image1',
    'image2',
    'image3',
    'image4',
    'image_1',
    'image_2',
    'image_3',
    'image_4',
    'images.image_1',
    'images.image_2',
    'images.image_3',
    'images.image_4',
  ] as const;
  const scaledLoaderIds = new Map<string, string>();
  let scaledSlotCount = 0;

  const ensureScaledLoader = (loaderId: string): string => {
    const existing = scaledLoaderIds.get(loaderId);
    if (existing) {
      return existing;
    }
    const scaleId = nextLightningWorkflowNodeId(next);
    next[scaleId] = {
      class_type: 'ImageScale',
      inputs: {
        image: [loaderId, 0],
        upscale_method: 'lanczos',
        width,
        height,
        // Never stretch — cover + center crop keeps anatomy when figure AR
        // and EmptyLatent differ slightly (ladder snap).
        crop: 'center',
      },
      _meta: { title: 'Castcut — ref → latent size' },
    };
    scaledLoaderIds.set(loaderId, scaleId);
    return scaleId;
  };

  for (const node of Object.values(next)) {
    if (!node?.inputs || !QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    for (const key of encodeImageKeys) {
      if (!(key in node.inputs)) {
        continue;
      }
      const linked = getLinkedNodeId(node.inputs[key]);
      if (!linked) {
        continue;
      }
      const linkedNode = next[linked];
      if (!linkedNode) {
        continue;
      }
      // Pack resize may already match latent W×H but omit crop — still enforce center-crop.
      if (
        linkedNode.class_type === 'ImageScale' &&
        Number(linkedNode.inputs?.width) === width &&
        Number(linkedNode.inputs?.height) === height
      ) {
        if (linkedNode.inputs) {
          linkedNode.inputs.upscale_method = linkedNode.inputs.upscale_method ?? 'lanczos';
          if (linkedNode.inputs.crop !== 'center') {
            linkedNode.inputs.crop = 'center';
            scaledSlotCount += 1;
          }
        }
        continue;
      }
      // Walk through an existing absolute resize to the LoadImage when present.
      let loaderId = linked;
      if (linkedNode.class_type === 'ImageScale' || linkedNode.class_type === 'ResizeImage') {
        const upstream = getLinkedNodeId(linkedNode.inputs?.image);
        if (upstream) {
          // Patch existing resize node to queue latent size.
          if (linkedNode.inputs) {
            linkedNode.inputs.width = width;
            linkedNode.inputs.height = height;
            if (linkedNode.class_type === 'ImageScale') {
              linkedNode.inputs.upscale_method = linkedNode.inputs.upscale_method ?? 'lanczos';
              linkedNode.inputs.crop = 'center';
            }
          }
          scaledSlotCount += 1;
          continue;
        }
      }
      // Pack ImageScaleBy only has a factor — replace with absolute W×H scale.
      if (linkedNode.class_type === 'ImageScaleBy') {
        const upstream = getLinkedNodeId(linkedNode.inputs?.image);
        if (upstream) {
          loaderId = upstream;
          const upstreamNode = next[upstream];
          if (
            upstreamNode?.class_type === 'LoadImage' ||
            upstreamNode?.class_type === 'LoadImageOutput'
          ) {
            const scaleId = ensureScaledLoader(loaderId);
            node.inputs[key] = [scaleId, 0];
            scaledSlotCount += 1;
            continue;
          }
        }
      }
      if (linkedNode.class_type !== 'LoadImage' && linkedNode.class_type !== 'LoadImageOutput') {
        continue;
      }
      const scaleId = ensureScaledLoader(loaderId);
      node.inputs[key] = [scaleId, 0];
      scaledSlotCount += 1;
    }
  }

  return { workflow: next, scaledSlotCount };
}

function findLoadImageForFigure(
  workflow: Record<string, WorkflowNodeRecord>,
  figureIndex: number
): string | null {
  const patterns = [
    new RegExp(`\\bfigure\\s*${figureIndex}\\b`, 'i'),
    new RegExp(`\\b(?:image|ref|reference|photo|picture)\\s*${figureIndex}\\b`, 'i'),
  ];
  if (figureIndex === 1) {
    patterns.push(/\b(?:input image|init|canvas)\b/i);
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.class_type || !LOAD_IMAGE_TYPES.has(node.class_type)) {
      continue;
    }
    const title = node._meta?.title ?? '';
    if (patterns.some(re => re.test(title))) {
      return nodeId;
    }
  }
  return null;
}

/**
 * Qwen Edit Compose: disconnect VAE from TextEncodeQwenImageEditPlus (keep image1–4
 * for VL prompt referencing), attach appearance refs via chained ReferenceLatent
 * nodes (LoadImage → ImageScale → VAEEncode). Avoids encode-node auto downscaling.
 */
export function ensureQwenReferenceLatentWiringInWorkflow(
  workflow: Record<string, unknown>,
  options?: {
    inputImageFilename?: string;
    inputImageFilenames?: string[];
    width?: number | string;
    height?: number | string;
  }
): {
  workflow: Record<string, unknown>;
  wired: boolean;
  insertedNodeIds: string[];
} {
  const filenames = normalizeInputImageFilenames(
    options?.inputImageFilename,
    options?.inputImageFilenames
  );
  if (filenames.length === 0) {
    return { workflow, wired: false, insertedNodeIds: [] };
  }

  const width = Number(options?.width);
  const height = Number(options?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { workflow, wired: false, insertedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const sampler = findPrimarySampler(next);
  if (!sampler) {
    return { workflow, wired: false, insertedNodeIds: [] };
  }

  const vaeRef = findVaeSourceRef(next);
  if (!vaeRef) {
    return { workflow, wired: false, insertedNodeIds: [] };
  }

  const samplerNode = next[sampler.samplerId];
  if (!samplerNode?.inputs) {
    return { workflow, wired: false, insertedNodeIds: [] };
  }

  disconnectQwenEditEncodeVae(next);
  const insertedNodeIds: string[] = [];
  ensureQwenEmptyLatentForReferenceEdit(next, width, height, insertedNodeIds);

  const conditioningRef: [string, number] | null = isNodeOutputRef(samplerNode.inputs.positive)
    ? samplerNode.inputs.positive
    : null;
  if (!conditioningRef) {
    return { workflow: next, wired: false, insertedNodeIds };
  }

  let currentCond = peelQwenReferenceLatentChain(next, conditioningRef);
  const loaderIds: string[] = [];

  for (let index = 0; index < filenames.length; index += 1) {
    const filename = filenames[index]!;
    const figureIndex = index + 1;
    let loadId = findLoadImageForFigure(next, figureIndex);
    if (!loadId) {
      loadId = nextLightningWorkflowNodeId(next);
      next[loadId] = {
        class_type: 'LoadImage',
        inputs: { image: filename },
        _meta: { title: figureIndex === 1 ? 'Figure 1' : `Figure ${figureIndex}` },
      };
      insertedNodeIds.push(loadId);
    } else if (next[loadId]?.inputs) {
      next[loadId]!.inputs!.image = filename;
    }
    loaderIds.push(loadId);

    const scaleId = ensureRefImageScaleNode(next, loadId, width, height, insertedNodeIds);
    const encodeId = nextLightningWorkflowNodeId(next);
    next[encodeId] = {
      class_type: 'VAEEncode',
      inputs: {
        pixels: [scaleId, 0],
        vae: vaeRef,
      },
      _meta: { title: `VAE Encode Figure ${figureIndex}` },
    };
    insertedNodeIds.push(encodeId);

    const refId = nextLightningWorkflowNodeId(next);
    next[refId] = {
      class_type: 'ReferenceLatent',
      inputs: {
        conditioning: currentCond,
        latent: [encodeId, 0],
      },
      _meta: { title: `Reference Latent ${figureIndex}` },
    };
    insertedNodeIds.push(refId);
    currentCond = [refId, 0];
  }

  samplerNode.inputs.positive = currentCond;
  // VL path: figures stay on encode image slots (384×384 internal) for "Figure N" prompts.
  wireQwenEditEncodeVisionImages(next, loaderIds);
  return { workflow: next, wired: true, insertedNodeIds };
}

/** Drop unused Figure LoadImages that still hold unresolved {{INPUT_IMAGE*}} tokens. */
export function pruneUnresolvedQwenEditFigureLoaders(workflow: Record<string, unknown>): {
  workflow: Record<string, unknown>;
  removedNodeIds: string[];
} {
  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const removedNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(next)) {
    if (node?.class_type !== 'LoadImage' && node?.class_type !== 'LoadImageOutput') {
      continue;
    }
    const image = node.inputs?.image;
    if (typeof image !== 'string' || !/\{\{\s*INPUT_IMAGE/i.test(image)) {
      continue;
    }
    const stillReferenced = Object.values(next).some(other => {
      if (!other?.inputs || other === node) {
        return false;
      }
      return Object.values(other.inputs).some(value => getLinkedNodeId(value) === nodeId);
    });
    if (!stillReferenced) {
      delete next[nodeId];
      removedNodeIds.push(nodeId);
    }
  }

  return { workflow: next, removedNodeIds };
}

/**
 * Ensure / disconnect Qwen edit encode refs for any edit-capable model
 * (Lightning and non-Lightning packs/scaffolds).
 */
export function prepareQwenEditReferenceImagesForQueue(
  workflow: Record<string, unknown>,
  model?: string,
  params?: Pick<
    WorkflowParamValues,
    'inputImageFilename' | 'inputImageFilenames' | 'width' | 'height'
  >,
  options?: { forceRewire?: boolean }
): Record<string, unknown> {
  const modelId = model?.trim() ?? '';
  const hasInputImage = Boolean(
    params?.inputImageFilename?.toString().trim() ||
    params?.inputImageFilenames?.some((name: string) => Boolean(name?.toString().trim()))
  );

  if (!hasInputImage) {
    return disconnectQwenEditReferenceImagesForTxt2Img(workflow, {
      hasInputImage: false,
    }).workflow;
  }

  if (!modelId) {
    return workflow;
  }
  if (!isEditCapableModel(modelId) && !/edit/i.test(modelId)) {
    return workflow;
  }

  let next = ensureQwenEditReferenceImagesForImg2Img(workflow, {
    hasInputImage: true,
    inputImageFilename: params?.inputImageFilename?.toString(),
    inputImageFilenames: params?.inputImageFilenames,
    forceRewire: options?.forceRewire,
  }).workflow;

  // Boogu builds reference latents inside TextEncodeBooguEdit (needs vae on that node).
  if (!isBooguEditModel(modelId)) {
    next = ensureQwenReferenceLatentWiringInWorkflow(next, {
      inputImageFilename: params?.inputImageFilename?.toString(),
      inputImageFilenames: params?.inputImageFilenames,
      width: params?.width,
      height: params?.height,
    }).workflow;
    const latentSize = readEmptyLatentSize(next);
    if (latentSize) {
      next = ensureQwenReferenceLatentWiringInWorkflow(next, {
        inputImageFilename: params?.inputImageFilename?.toString(),
        inputImageFilenames: params?.inputImageFilenames,
        width: latentSize.width,
        height: latentSize.height,
      }).workflow;
    }
  }

  next = pruneUnresolvedQwenEditFigureLoaders(next).workflow;
  return next;
}
