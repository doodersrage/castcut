/**
 * InstantID / PuLID auto-insert (IP-Adapter analogue).
 *
 * When a face reference image is set and ComfyUI has InstantID or PuLID nodes,
 * splice a minimal identity chain into the primary sampler model path.
 */

export const DEFAULT_IDENTITY_IMAGE_TOKEN = '{{IPADAPTER_IMAGE}}';
export const DEFAULT_IDENTITY_STRENGTH_TOKEN = '{{IPADAPTER_STRENGTH}}';

export type IdentityKind = 'instantid' | 'pulid';

export type IdentityChainInsertOptions = {
  imageFilename?: string;
  kind?: IdentityKind | 'auto';
  availableNodeTypes?: Iterable<string> | null;
};

export type IdentityChainInsertResult = {
  workflow: Record<string, unknown>;
  inserted: boolean;
  insertedNodeIds: string[];
  kind?: IdentityKind;
};

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

const INSTANTID_APPLY = 'ApplyInstantID';
const INSTANTID_LOADER = 'InstantIDModelLoader';
const INSTANTID_FACE = 'InstantIDFaceAnalysis';
const PULID_APPLY = 'ApplyPulid';
const PULID_APPLY_FLUX = 'ApplyPulidFlux';
const PULID_LOADER = 'PulidModelLoader';
const PULID_EVA = 'PulidEvaClipLoader';

const IDENTITY_CLASS_PATTERN = /instantid|pulid/i;

function toTypeSet(available?: Iterable<string> | null): Set<string> | undefined {
  if (!available) {
    return undefined;
  }
  return available instanceof Set ? available : new Set(available);
}

function nextNodeId(workflow: Record<string, unknown>): string {
  let maxId = 0;
  for (const key of Object.keys(workflow)) {
    const parsed = Number(key);
    if (Number.isFinite(parsed) && parsed > maxId) {
      maxId = parsed;
    }
  }
  return String(maxId + 1);
}

function isSamplerLike(classType: string, inputs: Record<string, unknown>): boolean {
  const lower = classType.toLowerCase();
  if (lower.includes('ksampler') || lower.includes('samplercustom') || lower.includes('guider')) {
    return true;
  }
  return 'seed' in inputs && ('steps' in inputs || 'cfg' in inputs);
}

function findPrimarySamplerModelLink(
  workflow: Record<string, WorkflowNode>
): { samplerId: string; modelLinkId: string } | null {
  for (const [samplerId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !isSamplerLike(node.class_type ?? '', node.inputs)) {
      continue;
    }
    const modelLink = node.inputs.model;
    if (Array.isArray(modelLink) && typeof modelLink[0] === 'string') {
      return { samplerId, modelLinkId: modelLink[0] };
    }
  }
  return null;
}

function hasIdentityNodes(workflow: Record<string, WorkflowNode>): boolean {
  return Object.values(workflow).some(node => IDENTITY_CLASS_PATTERN.test(node?.class_type ?? ''));
}

function resolveIdentityKind(
  kind: IdentityKind | 'auto' | undefined,
  available: Set<string> | undefined
): IdentityKind | null {
  const prefer = kind === 'pulid' ? 'pulid' : kind === 'instantid' ? 'instantid' : 'auto';
  const hasInstant =
    !available ||
    available.has(INSTANTID_APPLY) ||
    [...available].some(name => /applyinstantid/i.test(name));
  const hasPulid =
    !available ||
    available.has(PULID_APPLY) ||
    available.has(PULID_APPLY_FLUX) ||
    [...available].some(name => /applypulid/i.test(name));

  if (prefer === 'instantid') {
    return hasInstant ? 'instantid' : null;
  }
  if (prefer === 'pulid') {
    return hasPulid ? 'pulid' : null;
  }
  if (hasInstant) {
    return 'instantid';
  }
  if (hasPulid) {
    return 'pulid';
  }
  return null;
}

/**
 * Insert InstantID or PuLID when a face reference is set and the matching
 * custom nodes are installed. No-op if identity nodes already exist.
 */
export function insertIdentityChainIfMissing(
  workflow: Record<string, unknown>,
  options: IdentityChainInsertOptions
): IdentityChainInsertResult {
  const imageFilename = options.imageFilename?.trim();
  if (!imageFilename) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const typed = workflow as Record<string, WorkflowNode>;
  if (hasIdentityNodes(typed)) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const available = toTypeSet(options.availableNodeTypes);
  const kind = resolveIdentityKind(options.kind, available);
  if (!kind) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const chain = findPrimarySamplerModelLink(typed);
  if (!chain) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const insertedNodeIds: string[] = [];

  const loadImageId = nextNodeId(next);
  next[loadImageId] = {
    class_type: 'LoadImage',
    inputs: { image: DEFAULT_IDENTITY_IMAGE_TOKEN },
    _meta: { title: 'Castcut — identity reference' },
  };
  insertedNodeIds.push(loadImageId);

  if (kind === 'instantid') {
    const faceId = nextNodeId(next);
    next[faceId] = {
      class_type: INSTANTID_FACE,
      inputs: { provider: 'CPU' },
      _meta: { title: 'Castcut — InstantID face analysis' },
    };
    insertedNodeIds.push(faceId);

    const loaderId = nextNodeId(next);
    next[loaderId] = {
      class_type: INSTANTID_LOADER,
      inputs: { instantid_file: 'ip-adapter.bin' },
      _meta: { title: 'Castcut — InstantID model' },
    };
    insertedNodeIds.push(loaderId);

    const applyId = nextNodeId(next);
    next[applyId] = {
      class_type: INSTANTID_APPLY,
      inputs: {
        model: [chain.modelLinkId, 0],
        instantid: [loaderId, 0],
        insightface: [faceId, 0],
        image: [loadImageId, 0],
        weight: DEFAULT_IDENTITY_STRENGTH_TOKEN,
        start_at: 0,
        end_at: 1,
      },
      _meta: { title: 'Castcut — InstantID apply' },
    };
    insertedNodeIds.push(applyId);

    const samplerNode = next[chain.samplerId];
    if (samplerNode?.inputs) {
      samplerNode.inputs.model = [applyId, 0];
    }
  } else {
    const evaId = nextNodeId(next);
    next[evaId] = {
      class_type: PULID_EVA,
      inputs: {},
      _meta: { title: 'Castcut — PuLID EVA CLIP' },
    };
    insertedNodeIds.push(evaId);

    const loaderId = nextNodeId(next);
    next[loaderId] = {
      class_type: PULID_LOADER,
      inputs: { pulid_file: 'pulid_v1.1.safetensors' },
      _meta: { title: 'Castcut — PuLID model' },
    };
    insertedNodeIds.push(loaderId);

    const applyClass =
      available?.has(PULID_APPLY_FLUX) && !available.has(PULID_APPLY)
        ? PULID_APPLY_FLUX
        : PULID_APPLY;
    const applyId = nextNodeId(next);
    next[applyId] = {
      class_type: applyClass,
      inputs: {
        model: [chain.modelLinkId, 0],
        pulid: [loaderId, 0],
        eva_clip: [evaId, 0],
        image: [loadImageId, 0],
        weight: DEFAULT_IDENTITY_STRENGTH_TOKEN,
        start_at: 0,
        end_at: 1,
      },
      _meta: { title: 'Castcut — PuLID apply' },
    };
    insertedNodeIds.push(applyId);

    const samplerNode = next[chain.samplerId];
    if (samplerNode?.inputs) {
      samplerNode.inputs.model = [applyId, 0];
    }
  }

  return { workflow: next, inserted: true, insertedNodeIds, kind };
}
