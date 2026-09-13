/**
 * Portable IP-Adapter tokens + optional auto-insert.
 *
 * Queue-time patching updates existing tokens/nodes, or inserts a minimal
 * LoadImage → IPAdapterModelLoader → IPAdapterAdvanced chain when a reference
 * image is set and the graph has neither IPAdapter nodes nor tokens
 * (requires ComfyUI-IPAdapter-Plus-class nodes).
 *
 *   {{IPADAPTER_IMAGE}}    — LoadImage node's `image` filename field
 *   {{IPADAPTER_STRENGTH}} — IPAdapter-family node's weight/strength field (0–1)
 *   {{IPADAPTER_MODEL}}    — IPAdapter loader node's ipadapter_file field (optional)
 */

export const DEFAULT_IPADAPTER_IMAGE_TOKEN = '{{IPADAPTER_IMAGE}}';
export const DEFAULT_IPADAPTER_STRENGTH_TOKEN = '{{IPADAPTER_STRENGTH}}';
export const DEFAULT_IPADAPTER_MODEL_TOKEN = '{{IPADAPTER_MODEL}}';

export const IPADAPTER_WORKFLOW_TOKENS = [
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
] as const;

const IMAGE_LOADER_TYPES = new Set(['LoadImage', 'LoadImageOutput']);
const IPADAPTER_CLASS_PATTERN = /ipadapter/i;
const IPADAPTER_STRENGTH_FIELDS = ['weight', 'strength', 'ip_weight'] as const;
const IPADAPTER_MODEL_FIELDS = ['ipadapter_file'] as const;

const MIN_IPADAPTER_STRENGTH = 0;
const MAX_IPADAPTER_STRENGTH = 1;

export type IpAdapterPatchInput = {
  imageFilename?: string;
  /** 0–1; values outside range are clamped. */
  strength?: number | string;
  modelFilename?: string;
};

export type IpAdapterPatchCounts = {
  image?: number;
  strength?: number;
  model?: number;
};

export type IpAdapterPatchResult = {
  workflow: Record<string, unknown>;
  patched: IpAdapterPatchCounts;
};

export function clampIpAdapterStrength(value: number | string | undefined): number | undefined {
  if (value == null || value.toString().trim() === '') {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.min(MAX_IPADAPTER_STRENGTH, Math.max(MIN_IPADAPTER_STRENGTH, numeric));
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function containsToken(value: unknown, token: string): boolean {
  return isString(value) && value.includes(token);
}

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

/**
 * Node-aware pass: patches known LoadImage / IPAdapter-family node fields when
 * they currently hold the matching `{{IPADAPTER_*}}` token.
 */
export function patchIpAdapterNodesInWorkflow(
  workflow: Record<string, unknown>,
  input: IpAdapterPatchInput
): IpAdapterPatchResult {
  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const patched: IpAdapterPatchCounts = {};

  const imageFilename = input.imageFilename?.trim();
  const strength = clampIpAdapterStrength(input.strength);
  const modelFilename = input.modelFilename?.trim();

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const classType = node.class_type ?? '';
    const inputs = node.inputs;
    if (!inputs) {
      continue;
    }

    if (
      imageFilename &&
      IMAGE_LOADER_TYPES.has(classType) &&
      'image' in inputs &&
      containsToken(inputs.image, DEFAULT_IPADAPTER_IMAGE_TOKEN)
    ) {
      inputs.image = imageFilename;
      patched.image = (patched.image ?? 0) + 1;
    }

    if (!IPADAPTER_CLASS_PATTERN.test(classType)) {
      continue;
    }

    if (strength != null) {
      for (const field of IPADAPTER_STRENGTH_FIELDS) {
        if (field in inputs && containsToken(inputs[field], DEFAULT_IPADAPTER_STRENGTH_TOKEN)) {
          inputs[field] = strength;
          patched.strength = (patched.strength ?? 0) + 1;
        }
      }
    }

    if (modelFilename) {
      for (const field of IPADAPTER_MODEL_FIELDS) {
        if (field in inputs && containsToken(inputs[field], DEFAULT_IPADAPTER_MODEL_TOKEN)) {
          inputs[field] = modelFilename;
          patched.model = (patched.model ?? 0) + 1;
        }
      }
    }
  }

  return { workflow: next, patched };
}

/**
 * Fallback: raw JSON string replace for tokens on fields/nodes the node-aware
 * pass above doesn't recognize (custom/community IPAdapter node variants).
 * Runs after the node-aware pass, so already-resolved tokens are no-ops.
 */
export function replaceIpAdapterTokensInWorkflowJson(
  workflow: Record<string, unknown>,
  input: IpAdapterPatchInput
): Record<string, unknown> {
  const imageFilename = input.imageFilename?.trim();
  const strength = clampIpAdapterStrength(input.strength);
  const modelFilename = input.modelFilename?.trim();

  if (!imageFilename && strength == null && !modelFilename) {
    return workflow;
  }

  let json = JSON.stringify(workflow);
  if (!json.includes('{{IPADAPTER_')) {
    return workflow;
  }

  if (imageFilename) {
    json = json.split(DEFAULT_IPADAPTER_IMAGE_TOKEN).join(imageFilename);
  }
  if (strength != null) {
    json = json.split(DEFAULT_IPADAPTER_STRENGTH_TOKEN).join(String(strength));
  }
  if (modelFilename) {
    json = json.split(DEFAULT_IPADAPTER_MODEL_TOKEN).join(modelFilename);
  }

  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return workflow;
  }
}

/** Combined node-aware + fallback string-replace pass — the single entry point for queue injection. */
export function patchIpAdapterTokensInWorkflow(
  workflow: Record<string, unknown>,
  input: IpAdapterPatchInput
): IpAdapterPatchResult {
  if (!input.imageFilename?.trim() && input.strength == null && !input.modelFilename?.trim()) {
    return { workflow, patched: {} };
  }

  const nodePatch = patchIpAdapterNodesInWorkflow(workflow, input);
  const withFallback = replaceIpAdapterTokensInWorkflowJson(nodePatch.workflow, input);
  return { workflow: withFallback, patched: nodePatch.patched };
}

/** Detects unresolved `{{IPADAPTER_*}}` placeholders — useful for preflight / health checks. */
export function findUnresolvedIpAdapterTokens(
  workflow: Record<string, unknown> | string
): string[] {
  const raw = typeof workflow === 'string' ? workflow : JSON.stringify(workflow);
  return IPADAPTER_WORKFLOW_TOKENS.filter(token => raw.includes(token));
}

/**
 * Graph-insert enrichment (the IP-Adapter analogue of workflow-graph-enrich.ts's
 * ModelSamplingFlux insert): when a session has a reference image configured but
 * the workflow has neither IPAdapter-family nodes nor `{{IPADAPTER_*}}` tokens,
 * splice a minimal portable chain — LoadImage → IPAdapterModelLoader (+ optional
 * CLIPVisionLoader when confirmed installed) → IPAdapterAdvanced — into the
 * primary sampler's model chain, using the same token placeholders so the
 * existing patch/fallback passes above resolve the actual values.
 */
const IPADAPTER_MODEL_LOADER_NODE_TYPE = 'IPAdapterModelLoader';
const IPADAPTER_ADVANCED_NODE_TYPE = 'IPAdapterAdvanced';
const CLIP_VISION_LOADER_NODE_TYPE = 'CLIPVisionLoader';
const DEFAULT_IPADAPTER_CLIP_VISION_FILENAME = 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors';

export type IpAdapterChainInsertOptions = {
  /** Session-level reference image filename; presence gates whether an insert happens. */
  imageFilename?: string;
  /** ComfyUI object_info node class names, when known — gates the optional CLIPVisionLoader node. */
  availableNodeTypes?: Iterable<string> | null;
};

export type IpAdapterChainInsertResult = {
  workflow: Record<string, unknown>;
  inserted: boolean;
  insertedNodeIds: string[];
};

function hasIpAdapterNodes(workflow: Record<string, WorkflowNode>): boolean {
  return Object.values(workflow).some(node => IPADAPTER_CLASS_PATTERN.test(node?.class_type ?? ''));
}

function isSamplerLikeNode(classType: string, inputs: Record<string, unknown>): boolean {
  const lower = classType.toLowerCase();
  if (
    lower.includes('ksampler') ||
    lower.includes('samplercustom') ||
    lower.includes('guider') ||
    lower.includes('basicscheduler')
  ) {
    return true;
  }
  return 'seed' in inputs && ('steps' in inputs || 'cfg' in inputs);
}

function nextIpAdapterWorkflowNodeId(workflow: Record<string, unknown>): string {
  let maxId = 0;
  for (const key of Object.keys(workflow)) {
    const parsed = Number(key);
    if (Number.isFinite(parsed) && parsed > maxId) {
      maxId = parsed;
    }
  }
  return String(maxId + 1);
}

type PrimarySamplerModelLink = { samplerId: string; modelLinkId: string };

/** First sampler-like node with a resolvable (node-linked) `model` input — kept to one insert for a minimal, conservative chain. */
function findPrimarySamplerModelLink(
  workflow: Record<string, WorkflowNode>
): PrimarySamplerModelLink | null {
  for (const [samplerId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !isSamplerLikeNode(node.class_type ?? '', node.inputs)) {
      continue;
    }
    const modelLink = node.inputs.model;
    if (Array.isArray(modelLink) && typeof modelLink[0] === 'string') {
      return { samplerId, modelLinkId: modelLink[0] };
    }
  }
  return null;
}

/**
 * Inserts a minimal IP-Adapter chain when the session has a reference image
 * configured but the workflow lacks any IPAdapter nodes/tokens. No-op when the
 * image filename is unset, the workflow already has IPAdapter nodes/tokens, or
 * no sampler with a resolvable model chain can be found to splice into.
 */
export function insertIpAdapterChainIfMissing(
  workflow: Record<string, unknown>,
  options: IpAdapterChainInsertOptions
): IpAdapterChainInsertResult {
  const imageFilename = options.imageFilename?.trim();
  if (!imageFilename) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const typed = workflow as Record<string, WorkflowNode>;
  if (hasIpAdapterNodes(typed) || findUnresolvedIpAdapterTokens(workflow).length > 0) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const chain = findPrimarySamplerModelLink(typed);
  if (!chain) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const insertedNodeIds: string[] = [];
  const availableTypes = options.availableNodeTypes
    ? options.availableNodeTypes instanceof Set
      ? options.availableNodeTypes
      : new Set(options.availableNodeTypes)
    : undefined;

  const loadImageId = nextIpAdapterWorkflowNodeId(next);
  next[loadImageId] = {
    class_type: 'LoadImage',
    inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN },
    _meta: { title: 'Castcut — IP-Adapter reference' },
  };
  insertedNodeIds.push(loadImageId);

  let clipVisionId: string | undefined;
  if (!availableTypes || availableTypes.has(CLIP_VISION_LOADER_NODE_TYPE)) {
    clipVisionId = nextIpAdapterWorkflowNodeId(next);
    next[clipVisionId] = {
      class_type: CLIP_VISION_LOADER_NODE_TYPE,
      inputs: { clip_name: DEFAULT_IPADAPTER_CLIP_VISION_FILENAME },
      _meta: { title: 'Castcut — IP-Adapter CLIP vision' },
    };
    insertedNodeIds.push(clipVisionId);
  }

  const loaderId = nextIpAdapterWorkflowNodeId(next);
  next[loaderId] = {
    class_type: IPADAPTER_MODEL_LOADER_NODE_TYPE,
    inputs: { ipadapter_file: DEFAULT_IPADAPTER_MODEL_TOKEN },
    _meta: { title: 'Castcut — IP-Adapter model' },
  };
  insertedNodeIds.push(loaderId);

  const applyId = nextIpAdapterWorkflowNodeId(next);
  const applyInputs: Record<string, unknown> = {
    model: [chain.modelLinkId, 0],
    ipadapter: [loaderId, 0],
    image: [loadImageId, 0],
    weight: DEFAULT_IPADAPTER_STRENGTH_TOKEN,
    weight_type: 'linear',
    combine_embeds: 'concat',
    start_at: 0,
    end_at: 1,
    embeds_scaling: 'V only',
  };
  if (clipVisionId) {
    applyInputs.clip_vision = [clipVisionId, 0];
  }
  next[applyId] = {
    class_type: IPADAPTER_ADVANCED_NODE_TYPE,
    inputs: applyInputs,
    _meta: { title: 'Castcut — IP-Adapter apply' },
  };
  insertedNodeIds.push(applyId);

  const samplerNode = next[chain.samplerId];
  if (samplerNode?.inputs) {
    samplerNode.inputs.model = [applyId, 0];
  }

  return { workflow: next, inserted: true, insertedNodeIds };
}

export type IpAdapterStackEntry = {
  imageFilename?: string;
  strength?: number;
  modelFilename?: string;
};

/**
 * Stack additional IP-Adapter apply nodes for multi-ref identity/style.
 * First entry uses insertIpAdapterChainIfMissing; further entries append
 * LoadImage → IPAdapterAdvanced onto the latest sampler model link.
 */
export function insertIpAdapterStack(
  workflow: Record<string, unknown>,
  entries: IpAdapterStackEntry[],
  options?: { availableNodeTypes?: Iterable<string> | null }
): {
  workflow: Record<string, unknown>;
  insertedCount: number;
  insertedNodeIds: string[];
} {
  const usable = entries
    .map(entry => ({
      ...entry,
      imageFilename: entry.imageFilename?.trim(),
    }))
    .filter(entry => Boolean(entry.imageFilename));
  if (usable.length === 0) {
    return { workflow, insertedCount: 0, insertedNodeIds: [] };
  }

  let current = workflow;
  const insertedNodeIds: string[] = [];
  let insertedCount = 0;

  const first = insertIpAdapterChainIfMissing(current, {
    imageFilename: usable[0]!.imageFilename,
    availableNodeTypes: options?.availableNodeTypes,
  });
  current = first.workflow;
  if (first.inserted) {
    insertedCount += 1;
    insertedNodeIds.push(...first.insertedNodeIds);
  }

  for (let index = 1; index < usable.length; index += 1) {
    const entry = usable[index]!;
    const typed = current as Record<string, WorkflowNode>;
    const availableTypes = options?.availableNodeTypes
      ? options.availableNodeTypes instanceof Set
        ? options.availableNodeTypes
        : new Set(options.availableNodeTypes)
      : undefined;
    if (
      availableTypes &&
      !availableTypes.has(IPADAPTER_ADVANCED_NODE_TYPE) &&
      !availableTypes.has(IPADAPTER_MODEL_LOADER_NODE_TYPE)
    ) {
      break;
    }
    const chain = findPrimarySamplerModelLink(typed);
    if (!chain) {
      break;
    }

    const next = structuredClone(current) as Record<string, WorkflowNode>;
    const tokenSuffix = index + 1;
    const imageToken =
      tokenSuffix === 2 ? '{{IPADAPTER_IMAGE_2}}' : `{{IPADAPTER_IMAGE_${tokenSuffix}}}`;

    const loadImageId = nextIpAdapterWorkflowNodeId(next);
    next[loadImageId] = {
      class_type: 'LoadImage',
      inputs: {
        image: entry.imageFilename ?? imageToken,
      },
      _meta: { title: `Castcut — IP-Adapter reference ${tokenSuffix}` },
    };
    insertedNodeIds.push(loadImageId);

    let clipVisionId: string | undefined;
    if (!availableTypes || availableTypes.has(CLIP_VISION_LOADER_NODE_TYPE)) {
      clipVisionId = nextIpAdapterWorkflowNodeId(next);
      next[clipVisionId] = {
        class_type: CLIP_VISION_LOADER_NODE_TYPE,
        inputs: { clip_name: DEFAULT_IPADAPTER_CLIP_VISION_FILENAME },
        _meta: { title: `Castcut — IP-Adapter CLIP vision ${tokenSuffix}` },
      };
      insertedNodeIds.push(clipVisionId);
    }

    const loaderId = nextIpAdapterWorkflowNodeId(next);
    next[loaderId] = {
      class_type: IPADAPTER_MODEL_LOADER_NODE_TYPE,
      inputs: {
        ipadapter_file: entry.modelFilename?.trim() || DEFAULT_IPADAPTER_MODEL_TOKEN,
      },
      _meta: { title: `Castcut — IP-Adapter model ${tokenSuffix}` },
    };
    insertedNodeIds.push(loaderId);

    const strength =
      typeof entry.strength === 'number' && Number.isFinite(entry.strength)
        ? Math.min(1, Math.max(0, entry.strength))
        : undefined;
    const applyId = nextIpAdapterWorkflowNodeId(next);
    const applyInputs: Record<string, unknown> = {
      model: [chain.modelLinkId, 0],
      ipadapter: [loaderId, 0],
      image: [loadImageId, 0],
      weight: strength ?? DEFAULT_IPADAPTER_STRENGTH_TOKEN,
      weight_type: 'linear',
      combine_embeds: 'concat',
      start_at: 0,
      end_at: 1,
      embeds_scaling: 'V only',
    };
    if (clipVisionId) {
      applyInputs.clip_vision = [clipVisionId, 0];
    }
    next[applyId] = {
      class_type: IPADAPTER_ADVANCED_NODE_TYPE,
      inputs: applyInputs,
      _meta: { title: `Castcut — IP-Adapter apply ${tokenSuffix}` },
    };
    insertedNodeIds.push(applyId);

    const samplerNode = next[chain.samplerId];
    if (samplerNode?.inputs) {
      samplerNode.inputs.model = [applyId, 0];
    }

    current = next;
    insertedCount += 1;
  }

  return { workflow: current, insertedCount, insertedNodeIds };
}
