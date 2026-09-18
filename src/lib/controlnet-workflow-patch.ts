/**
 * ControlNet auto-insert + token helpers (IP-Adapter analogue).
 *
 * When a control image is queued but the graph has neither ControlNet nodes
 * nor {{CONTROLNET_MODEL}} / {{CONTROL_IMAGE}} tokens, splice:
 *   LoadImage → [optional preprocessor] → ControlNetLoader → ControlNetApply
 * into the primary sampler's positive/negative conditioning.
 */

import {
  DEFAULT_CONTROLNET_MODEL_TOKEN,
  DEFAULT_CONTROL_IMAGE_TOKEN,
} from './model-controlnet-map';
import { normalizeControlNetMode, type ControlNetMode } from './controlnet-prompt';

export const CONTROLNET_WORKFLOW_TOKENS = [
  DEFAULT_CONTROLNET_MODEL_TOKEN,
  DEFAULT_CONTROL_IMAGE_TOKEN,
] as const;

const CONTROLNET_LOADER_TYPES = new Set(['ControlNetLoader', 'DiffControlNetLoader']);
const CONTROLNET_APPLY_PATTERN = /controlnetapply/i;

/** Preferred preprocessor class per ControlNet mode (first installed wins). */
const PREPROCESSOR_CANDIDATES: Record<ControlNetMode, string[]> = {
  canny: ['CannyEdgePreprocessor', 'Canny', 'AIO_Preprocessor'],
  pose: ['DWPreprocessor', 'OpenposePreprocessor', 'AIO_Preprocessor'],
  depth: [
    'DepthAnythingV2Preprocessor',
    'DepthAnythingPreprocessor',
    'MiDaS-DepthMapPreprocessor',
    'AIO_Preprocessor',
  ],
  normal: ['BAE-NormalMapPreprocessor', 'NormalBaePreprocessor', 'AIO_Preprocessor'],
  lineart: ['LineArtPreprocessor', 'AnimeLineArtPreprocessor', 'AIO_Preprocessor'],
};

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

export type ControlNetChainInsertOptions = {
  controlImageFilename?: string;
  availableNodeTypes?: Iterable<string> | null;
  /** When set, insert a matching preprocessor between LoadImage and ControlNetApply. */
  controlNetMode?: ControlNetMode | string;
  /**
   * Skip OpenPose/Canny/etc. — use the control image as-is (Story/Day filled
   * mannequins already encode pose; OpenPose often fails on flat capsules).
   */
  skipPreprocessor?: boolean;
  /** ControlNetApply strength (default 1). */
  strength?: number;
};

export type ControlNetChainInsertResult = {
  workflow: Record<string, unknown>;
  inserted: boolean;
  insertedNodeIds: string[];
  preprocessorClass?: string;
};

export function findUnresolvedControlNetTokens(
  workflow: Record<string, unknown> | string
): string[] {
  const raw = typeof workflow === 'string' ? workflow : JSON.stringify(workflow);
  return CONTROLNET_WORKFLOW_TOKENS.filter(token => raw.includes(token));
}

function hasControlNetNodes(workflow: Record<string, WorkflowNode>): boolean {
  return Object.values(workflow).some(node => {
    const classType = node?.class_type ?? '';
    return CONTROLNET_LOADER_TYPES.has(classType) || CONTROLNET_APPLY_PATTERN.test(classType);
  });
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

type PrimarySamplerCondLinks = {
  samplerId: string;
  positiveLinkId: string;
  negativeLinkId: string;
};

function findPrimarySamplerCondLinks(
  workflow: Record<string, WorkflowNode>
): PrimarySamplerCondLinks | null {
  for (const [samplerId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !isSamplerLikeNode(node.class_type ?? '', node.inputs)) {
      continue;
    }
    const positive = node.inputs.positive;
    const negative = node.inputs.negative;
    if (
      Array.isArray(positive) &&
      typeof positive[0] === 'string' &&
      Array.isArray(negative) &&
      typeof negative[0] === 'string'
    ) {
      return {
        samplerId,
        positiveLinkId: positive[0],
        negativeLinkId: negative[0],
      };
    }
  }
  return null;
}

export function resolveControlNetPreprocessorClass(
  mode: ControlNetMode | string | undefined,
  availableNodeTypes?: Iterable<string> | null
): string | undefined {
  if (!availableNodeTypes) {
    return undefined;
  }
  const available =
    availableNodeTypes instanceof Set ? availableNodeTypes : new Set(availableNodeTypes);
  const normalized = normalizeControlNetMode(mode);
  for (const candidate of PREPROCESSOR_CANDIDATES[normalized]) {
    if (available.has(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Inserts a minimal ControlNetApply chain when a control image is set but the
 * workflow lacks ControlNet nodes/tokens. Optionally inserts a preprocessor when
 * that class exists in availableNodeTypes.
 */
export function insertControlNetChainIfMissing(
  workflow: Record<string, unknown>,
  options: ControlNetChainInsertOptions
): ControlNetChainInsertResult {
  const controlImage = options.controlImageFilename?.trim();
  if (!controlImage) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const typed = workflow as Record<string, WorkflowNode>;
  if (hasControlNetNodes(typed) || findUnresolvedControlNetTokens(workflow).length > 0) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const availableTypes = options.availableNodeTypes
    ? options.availableNodeTypes instanceof Set
      ? options.availableNodeTypes
      : new Set(options.availableNodeTypes)
    : undefined;
  if (availableTypes && !availableTypes.has('ControlNetApply')) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const chain = findPrimarySamplerCondLinks(typed);
  if (!chain) {
    return { workflow, inserted: false, insertedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const insertedNodeIds: string[] = [];

  const loadImageId = nextWorkflowNodeId(next);
  next[loadImageId] = {
    class_type: 'LoadImage',
    inputs: { image: DEFAULT_CONTROL_IMAGE_TOKEN },
    _meta: { title: 'Castcut — Control image' },
  };
  insertedNodeIds.push(loadImageId);

  const preprocessorClass = options.skipPreprocessor
    ? undefined
    : resolveControlNetPreprocessorClass(options.controlNetMode, availableTypes);
  let imageSourceId = loadImageId;
  if (preprocessorClass) {
    const preprocessorId = nextWorkflowNodeId(next);
    next[preprocessorId] = {
      class_type: preprocessorClass,
      inputs: {
        image: [loadImageId, 0],
        // Common optional fields — unused keys are ignored by Comfy when absent on the node.
        resolution: 512,
      },
      _meta: { title: `Castcut — ${preprocessorClass}` },
    };
    insertedNodeIds.push(preprocessorId);
    imageSourceId = preprocessorId;
  }

  const loaderId = nextWorkflowNodeId(next);
  next[loaderId] = {
    class_type: 'ControlNetLoader',
    inputs: { control_net_name: DEFAULT_CONTROLNET_MODEL_TOKEN },
    _meta: { title: 'Castcut — ControlNet loader' },
  };
  insertedNodeIds.push(loaderId);

  const strength =
    typeof options.strength === 'number' && Number.isFinite(options.strength)
      ? Math.min(2, Math.max(0, options.strength))
      : 1;
  const applyId = nextWorkflowNodeId(next);
  next[applyId] = {
    class_type: 'ControlNetApply',
    inputs: {
      strength,
      start_percent: 0,
      end_percent: 1,
      positive: [chain.positiveLinkId, 0],
      negative: [chain.negativeLinkId, 0],
      control_net: [loaderId, 0],
      image: [imageSourceId, 0],
    },
    _meta: { title: 'Castcut — ControlNet apply' },
  };
  insertedNodeIds.push(applyId);

  const samplerNode = next[chain.samplerId];
  if (samplerNode?.inputs) {
    samplerNode.inputs.positive = [applyId, 0];
    samplerNode.inputs.negative = [applyId, 1];
  }

  return {
    workflow: next,
    inserted: true,
    insertedNodeIds,
    preprocessorClass,
  };
}

export type ControlNetStackEntry = {
  controlImageFilename?: string;
  controlNetModelFilename?: string;
  controlNetMode?: ControlNetMode | string;
  strength?: number;
  skipPreprocessor?: boolean;
};

/**
 * Append additional ControlNetApply chains onto the current sampler
 * positive/negative links. First missing chain still uses insertControlNetChainIfMissing;
 * further entries stack Apply nodes.
 */
export function insertControlNetStack(
  workflow: Record<string, unknown>,
  entries: ControlNetStackEntry[],
  options?: { availableNodeTypes?: Iterable<string> | null }
): {
  workflow: Record<string, unknown>;
  insertedCount: number;
  insertedNodeIds: string[];
} {
  const usable = entries
    .map(entry => ({
      ...entry,
      controlImageFilename: entry.controlImageFilename?.trim(),
    }))
    .filter(entry => Boolean(entry.controlImageFilename));
  if (usable.length === 0) {
    return { workflow, insertedCount: 0, insertedNodeIds: [] };
  }

  let current = workflow;
  const insertedNodeIds: string[] = [];
  let insertedCount = 0;

  // First entry: classic insert-if-missing (no-op when graph already has ControlNet).
  const first = insertControlNetChainIfMissing(current, {
    controlImageFilename: usable[0]!.controlImageFilename,
    controlNetMode: usable[0]!.controlNetMode,
    availableNodeTypes: options?.availableNodeTypes,
    skipPreprocessor: usable[0]!.skipPreprocessor,
    strength: usable[0]!.strength,
  });
  current = first.workflow;
  if (first.inserted) {
    insertedCount += 1;
    insertedNodeIds.push(...first.insertedNodeIds);
  }

  // Additional entries always append a new Apply on the latest sampler cond links.
  for (let index = 1; index < usable.length; index += 1) {
    const entry = usable[index]!;
    const typed = current as Record<string, WorkflowNode>;
    const availableTypes = options?.availableNodeTypes
      ? options.availableNodeTypes instanceof Set
        ? options.availableNodeTypes
        : new Set(options.availableNodeTypes)
      : undefined;
    if (availableTypes && !availableTypes.has('ControlNetApply')) {
      break;
    }
    const chain = findPrimarySamplerCondLinks(typed);
    if (!chain) {
      break;
    }

    const next = structuredClone(current) as Record<string, WorkflowNode>;
    const tokenSuffix = index + 1;
    const imageToken =
      tokenSuffix === 2 ? '{{CONTROL_IMAGE_2}}' : `{{CONTROL_IMAGE_${tokenSuffix}}}`;
    const modelToken =
      tokenSuffix === 2 ? '{{CONTROLNET_MODEL_2}}' : `{{CONTROLNET_MODEL_${tokenSuffix}}}`;

    const loadImageId = nextWorkflowNodeId(next);
    next[loadImageId] = {
      class_type: 'LoadImage',
      inputs: {
        image: entry.controlImageFilename ? entry.controlImageFilename : imageToken,
      },
      _meta: { title: `Castcut — Control image ${tokenSuffix}` },
    };
    insertedNodeIds.push(loadImageId);

    const preprocessorClass = entry.skipPreprocessor
      ? undefined
      : resolveControlNetPreprocessorClass(entry.controlNetMode, availableTypes);
    let imageSourceId = loadImageId;
    if (preprocessorClass) {
      const preprocessorId = nextWorkflowNodeId(next);
      next[preprocessorId] = {
        class_type: preprocessorClass,
        inputs: {
          image: [loadImageId, 0],
          resolution: 512,
        },
        _meta: { title: `Castcut — ${preprocessorClass}` },
      };
      insertedNodeIds.push(preprocessorId);
      imageSourceId = preprocessorId;
    }

    const loaderId = nextWorkflowNodeId(next);
    next[loaderId] = {
      class_type: 'ControlNetLoader',
      inputs: {
        control_net_name: entry.controlNetModelFilename?.trim() || modelToken,
      },
      _meta: { title: `Castcut — ControlNet loader ${tokenSuffix}` },
    };
    insertedNodeIds.push(loaderId);

    const strength =
      typeof entry.strength === 'number' && Number.isFinite(entry.strength)
        ? Math.min(2, Math.max(0, entry.strength))
        : 1;
    const applyId = nextWorkflowNodeId(next);
    next[applyId] = {
      class_type: 'ControlNetApply',
      inputs: {
        strength,
        start_percent: 0,
        end_percent: 1,
        positive: [chain.positiveLinkId, 0],
        negative: [chain.negativeLinkId, 0],
        control_net: [loaderId, 0],
        image: [imageSourceId, 0],
      },
      _meta: { title: `Castcut — ControlNet apply ${tokenSuffix}` },
    };
    insertedNodeIds.push(applyId);

    const samplerNode = next[chain.samplerId];
    if (samplerNode?.inputs) {
      samplerNode.inputs.positive = [applyId, 0];
      samplerNode.inputs.negative = [applyId, 1];
    }

    current = next;
    insertedCount += 1;
  }

  return { workflow: current, insertedCount, insertedNodeIds };
}
