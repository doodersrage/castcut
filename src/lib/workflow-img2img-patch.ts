import { isFluxKleinModel } from './model-denoise-defaults';
import { normalizeInputImageFilenames } from './workflow-load-image-bindings';

type WorkflowNode = {
  class_type?: string;
  _meta?: { title?: string };
  inputs?: Record<string, unknown>;
};

const EMPTY_LATENT_TYPES = new Set([
  'EmptyLatentImage',
  'EmptySD3LatentImage',
  'EmptyFlux2LatentImage',
]);
const VAE_ENCODE_TYPES = new Set(['VAEEncode']);
const VAE_LOADER_TYPES = new Set(['VAELoader']);
const CHECKPOINT_LOADER_TYPES = new Set(['CheckpointLoaderSimple', 'CheckpointLoader']);
const LOAD_IMAGE_TYPES = new Set(['LoadImage', 'LoadImageOutput']);
const RESIZE_TYPES = new Set(['ImageScale', 'ResizeImage']);

const KLEIN_REF_LATENT_SCALE_TITLE = 'Castcut — ref → latent size';

function getLinkedNodeId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 1) {
    return null;
  }
  const id = value[0];
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

function readEmptyFlux2LatentSize(
  workflow: Record<string, WorkflowNode>
): { width: number; height: number } | null {
  for (const node of Object.values(workflow)) {
    if (node?.class_type !== 'EmptyFlux2LatentImage' || !node.inputs) {
      continue;
    }
    const width = Number(node.inputs.width);
    const height = Number(node.inputs.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }
  return null;
}

function resolveKleinReferenceLatentDimensions(
  workflow: Record<string, WorkflowNode>,
  width?: number | string,
  height?: number | string
): { width: number; height: number } | null {
  const explicitWidth = Number(width);
  const explicitHeight = Number(height);
  if (
    Number.isFinite(explicitWidth) &&
    Number.isFinite(explicitHeight) &&
    explicitWidth > 0 &&
    explicitHeight > 0
  ) {
    return { width: explicitWidth, height: explicitHeight };
  }
  return readEmptyFlux2LatentSize(workflow);
}

function ensureKleinRefImageScaleNode(
  workflow: Record<string, WorkflowNode>,
  loaderId: string,
  width: number,
  height: number,
  insertedNodeIds: string[]
): string {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.class_type || !RESIZE_TYPES.has(node.class_type)) {
      continue;
    }
    if (node._meta?.title !== KLEIN_REF_LATENT_SCALE_TITLE) {
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
    return nodeId;
  }

  const scaleId = nextWorkflowNodeId(workflow);
  workflow[scaleId] = {
    class_type: 'ImageScale',
    inputs: {
      image: [loaderId, 0],
      upscale_method: 'lanczos',
      width,
      height,
      crop: 'center',
    },
    _meta: { title: KLEIN_REF_LATENT_SCALE_TITLE },
  };
  insertedNodeIds.push(scaleId);
  return scaleId;
}

function isNodeOutputRef(value: unknown): value is [string, number] {
  return Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'number';
}

function nextWorkflowNodeId(workflow: Record<string, unknown>): string {
  let maxId = 0;
  for (const key of Object.keys(workflow)) {
    const parsed = Number(key);
    if (Number.isFinite(parsed) && parsed > maxId) {
      maxId = parsed;
    }
  }
  return String(maxId + 1);
}

function findVaeSourceRef(workflow: Record<string, WorkflowNode>): [string, number] | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node?.class_type && VAE_LOADER_TYPES.has(node.class_type)) {
      return [nodeId, 0];
    }
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node?.class_type && CHECKPOINT_LOADER_TYPES.has(node.class_type)) {
      return [nodeId, 2];
    }
  }
  return null;
}

function findPrimarySampler(
  workflow: Record<string, WorkflowNode>
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

function findOrCreateEmptyFlux2Latent(
  workflow: Record<string, WorkflowNode>,
  insertedNodeIds: string[],
  width?: number,
  height?: number
): string {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node?.class_type && EMPTY_LATENT_TYPES.has(node.class_type)) {
      if (node.class_type !== 'EmptyFlux2LatentImage') {
        node.class_type = 'EmptyFlux2LatentImage';
      }
      if (node.inputs && width != null && height != null) {
        node.inputs.width = width;
        node.inputs.height = height;
        node.inputs.batch_size = node.inputs.batch_size ?? 1;
      }
      return nodeId;
    }
  }
  const id = nextWorkflowNodeId(workflow);
  workflow[id] = {
    class_type: 'EmptyFlux2LatentImage',
    inputs: {
      width: width ?? '{{WIDTH}}',
      height: height ?? '{{HEIGHT}}',
      batch_size: 1,
    },
    _meta: { title: 'Empty Flux 2 Latent' },
  };
  insertedNodeIds.push(id);
  return id;
}

function findLoadImageForFigure(
  workflow: Record<string, WorkflowNode>,
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

function workflowHasReferenceLatent(workflow: Record<string, WorkflowNode>): boolean {
  return Object.values(workflow).some(node => node?.class_type === 'ReferenceLatent');
}

/**
 * Klein instruction edit (official path): EmptyFlux2Latent + denoise 1, with
 * Figure images attached via ReferenceLatent on positive conditioning — not
 * classic soft-denoise img2img (which either passthroughs or mush-rewrites).
 */
export function ensureKleinReferenceLatentWiringInWorkflow(
  workflow: Record<string, unknown>,
  input: {
    model?: string;
    inputImageFilename?: string | null;
    inputImageFilenames?: Array<string | undefined | null> | null;
    width?: number | string;
    height?: number | string;
  }
): {
  workflow: Record<string, unknown>;
  wired: boolean;
  insertedNodeIds: string[];
} {
  if (!isFluxKleinModel(input.model)) {
    return { workflow, wired: false, insertedNodeIds: [] };
  }
  const figures = normalizeInputImageFilenames(input.inputImageFilename, input.inputImageFilenames);
  if (figures.length === 0) {
    return { workflow, wired: false, insertedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const latentSize = resolveKleinReferenceLatentDimensions(next, input.width, input.height);

  const typed = next;
  const sampler = findPrimarySampler(typed);
  if (!sampler) {
    return { workflow, wired: false, insertedNodeIds: [] };
  }

  const vaeRef = findVaeSourceRef(typed);
  if (!vaeRef) {
    return { workflow, wired: false, insertedNodeIds: [] };
  }

  const insertedNodeIds: string[] = [];
  const samplerNode = next[sampler.samplerId];
  if (!samplerNode?.inputs) {
    return { workflow, wired: false, insertedNodeIds: [] };
  }

  // Sampler must start from empty Flux2 latent (full denoise), not VAEEncode.
  const latentRef = samplerNode.inputs.latent_image;
  const latentId = isNodeOutputRef(latentRef) ? latentRef[0] : null;
  const latentNode = latentId ? next[latentId] : null;
  if (
    !latentNode?.class_type ||
    VAE_ENCODE_TYPES.has(latentNode.class_type) ||
    !EMPTY_LATENT_TYPES.has(latentNode.class_type)
  ) {
    const emptyId = findOrCreateEmptyFlux2Latent(
      next,
      insertedNodeIds,
      latentSize?.width,
      latentSize?.height
    );
    samplerNode.inputs.latent_image = [emptyId, 0];
  } else {
    if (latentNode.class_type !== 'EmptyFlux2LatentImage') {
      latentNode.class_type = 'EmptyFlux2LatentImage';
    }
    if (latentSize && latentNode.inputs) {
      latentNode.inputs.width = latentSize.width;
      latentNode.inputs.height = latentSize.height;
    }
  }

  // Walk existing ReferenceLatent chain or start from sampler positive source.
  let conditioningRef: [string, number] | null = isNodeOutputRef(samplerNode.inputs.positive)
    ? samplerNode.inputs.positive
    : null;
  if (!conditioningRef) {
    return { workflow: next, wired: false, insertedNodeIds };
  }

  // If positive already ends in ReferenceLatent, peel back to the text encode
  // and rebuild the chain for the queued figures (avoids stale pack refs).
  if (workflowHasReferenceLatent(next)) {
    let cursor: string | null = conditioningRef[0];
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const node: WorkflowNode | undefined = next[cursor];
      if (node?.class_type !== 'ReferenceLatent') {
        conditioningRef = [cursor, 0];
        break;
      }
      const prev: unknown = node.inputs?.conditioning;
      cursor = isNodeOutputRef(prev) ? prev[0] : null;
    }
    // Drop old ReferenceLatent / orphan encode nodes that only fed the chain.
    for (const nodeId of visited) {
      if (next[nodeId]?.class_type === 'ReferenceLatent') {
        delete next[nodeId];
      }
    }
  }

  let currentCond: [string, number] = conditioningRef;
  for (let index = 0; index < figures.length; index += 1) {
    const filename = figures[index]?.trim();
    if (!filename) {
      continue;
    }
    const figureIndex = index + 1;
    let loadId = findLoadImageForFigure(next, figureIndex);
    if (!loadId) {
      loadId = nextWorkflowNodeId(next);
      next[loadId] = {
        class_type: 'LoadImage',
        inputs: { image: filename },
        _meta: { title: figureIndex === 1 ? 'Input Image' : `Figure ${figureIndex}` },
      };
      insertedNodeIds.push(loadId);
    } else if (next[loadId]?.inputs) {
      next[loadId]!.inputs!.image = filename;
    }

    const pixelsSourceId =
      latentSize != null
        ? ensureKleinRefImageScaleNode(
            next,
            loadId,
            latentSize.width,
            latentSize.height,
            insertedNodeIds
          )
        : loadId;

    const encodeId = nextWorkflowNodeId(next);
    next[encodeId] = {
      class_type: 'VAEEncode',
      inputs: {
        pixels: [pixelsSourceId, 0],
        vae: vaeRef,
      },
      _meta: { title: `VAE Encode Figure ${figureIndex}` },
    };
    insertedNodeIds.push(encodeId);

    const refId = nextWorkflowNodeId(next);
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

  return { workflow: next, wired: true, insertedNodeIds };
}

/** @deprecated Use ensureKleinReferenceLatentWiringInWorkflow */
export function ensureKleinImg2imgLatentWiringInWorkflow(
  workflow: Record<string, unknown>,
  input: {
    model?: string;
    inputImageFilename?: string | null;
    inputImageFilenames?: Array<string | undefined | null> | null;
  }
): {
  workflow: Record<string, unknown>;
  wired: boolean;
  insertedNodeIds: string[];
} {
  return ensureKleinReferenceLatentWiringInWorkflow(workflow, input);
}
