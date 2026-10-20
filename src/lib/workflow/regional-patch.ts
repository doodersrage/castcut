/**
 * Queue-time regional / attention-mask patching.
 *
 * When ComfyUI has AttentionCouple / RegionalPromptSimple / ConditioningSetMask,
 * bind slot prompts (+ optional mask LoadImage filenames). Otherwise fall back
 * to {{REGION_*}} string tokens (see regional-prompt-builder).
 */

import {
  patchRegionalTokensInWorkflow,
  type RegionalPromptSegment,
} from '../regional-prompt-builder';
import {
  regionalSlotsHaveContent,
  regionalSlotsHaveMasks,
  regionalSlotsToSegments,
  type RegionalPromptSlot,
} from '../regional-prompt-slots';

export const REGIONAL_NODE_CLASSES = [
  'AttentionCouple',
  'AttentionCoupleRegion',
  'RegionalPromptSimple',
  'RegionalPrompt',
  'ConditioningSetMask',
  'ConditioningSetMaskAndCombine',
] as const;

export type RegionalEditMode = 'nodes' | 'fallback-text' | 'none';

export type RegionalEditHealthStatus = 'ready' | 'fallback-text' | 'missing';

export type RegionalEditHealth = {
  status: RegionalEditHealthStatus;
  label: string;
  detail: string;
  mode: RegionalEditMode;
};

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

function toTypeSet(available?: Iterable<string> | null): Set<string> | undefined {
  if (!available) {
    return undefined;
  }
  return available instanceof Set ? available : new Set(available);
}

function workflowHasRegionalNodes(workflow: Record<string, WorkflowNode>): boolean {
  return Object.values(workflow).some(node =>
    REGIONAL_NODE_CLASSES.some(cls =>
      (node?.class_type ?? '').toLowerCase().includes(cls.toLowerCase())
    )
  );
}

function inventoryHasRegionalNodes(available?: Set<string>): boolean | null {
  if (!available) {
    return null;
  }
  return REGIONAL_NODE_CLASSES.some(cls => available.has(cls));
}

export function resolveRegionalEditHealth(input: {
  slots?: RegionalPromptSlot[];
  availableNodeTypes?: Iterable<string> | null;
  workflowHasRegional?: boolean;
}): RegionalEditHealth {
  const slots = input.slots ?? [];
  const hasContent = regionalSlotsHaveContent(slots);
  const available = toTypeSet(input.availableNodeTypes);
  const inventory = inventoryHasRegionalNodes(available);
  const inGraph = input.workflowHasRegional === true;

  if (inGraph || inventory === true) {
    return {
      status: 'ready',
      label: 'Ready',
      detail: inGraph
        ? 'Regional/attention nodes in workflow — slot prompts and masks will bind.'
        : 'Regional nodes installed — BYO packs or auto-bind when present in graph.',
      mode: 'nodes',
    };
  }

  if (hasContent) {
    return {
      status: 'fallback-text',
      label: 'Text fallback',
      detail: 'No regional nodes detected — prompts inject as {{REGION_*}} labels only.',
      mode: 'fallback-text',
    };
  }

  return {
    status: 'missing',
    label: 'Idle',
    detail: 'Add region prompts (and optional masks) to enable regional edit.',
    mode: 'none',
  };
}

export function formatRegionalEditHealthChip(health: RegionalEditHealth): string {
  return `Regional · ${health.label}`;
}

function isPromptLikeField(key: string): boolean {
  return /prompt|text|cond|positive|negative|region/i.test(key);
}

function isMaskLikeField(key: string): boolean {
  return /mask|image/i.test(key);
}

/**
 * Patch prompt/mask fields on known regional nodes by slot index order.
 */
export function patchRegionalNodesInWorkflow(
  workflow: Record<string, unknown>,
  slots: RegionalPromptSlot[]
): { workflow: Record<string, unknown>; patched: number } {
  const filled = slots.filter(slot => slot.prompt.trim());
  if (filled.length === 0) {
    return { workflow, patched: 0 };
  }

  const next: Record<string, WorkflowNode> = {
    ...(workflow as Record<string, WorkflowNode>),
  };
  let patched = 0;
  let slotIndex = 0;

  const regionalEntries = Object.entries(next).filter(([, node]) =>
    REGIONAL_NODE_CLASSES.some(cls =>
      (node?.class_type ?? '').toLowerCase().includes(cls.toLowerCase())
    )
  );

  for (const [, node] of regionalEntries) {
    if (!node.inputs || slotIndex >= filled.length) {
      continue;
    }
    const slot = filled[slotIndex];
    let touched = false;
    for (const [key, value] of Object.entries(node.inputs)) {
      if (isPromptLikeField(key) && typeof value === 'string') {
        node.inputs[key] = slot.prompt.trim();
        touched = true;
      }
      if (
        isMaskLikeField(key) &&
        typeof value === 'string' &&
        slot.maskFilename?.trim() &&
        !Array.isArray(value)
      ) {
        // Only overwrite filename-like string fields (not links).
        if (!value.includes('{{') && !value.startsWith('[')) {
          node.inputs[key] = slot.maskFilename.trim();
          touched = true;
        }
      }
      if (
        /strength|weight/i.test(key) &&
        (typeof value === 'number' || typeof value === 'string')
      ) {
        node.inputs[key] = slot.strength;
        touched = true;
      }
    }
    if (touched) {
      patched += 1;
      slotIndex += 1;
    }
  }

  // Also bind LoadImage nodes titled Region N / mask N to slot masks.
  for (const [id, node] of Object.entries(next)) {
    if (node?.class_type !== 'LoadImage' && node?.class_type !== 'LoadImageMask') {
      continue;
    }
    const title = (node._meta?.title ?? '').toLowerCase();
    const match = title.match(/region\s*(\d+)|mask\s*(\d+)/i);
    if (!match) {
      continue;
    }
    // Index by the node's own "Region N" title against the ORIGINAL slot order, not `filled` —
    // `filled` drops empty-prompt slots and re-indexes, so once any earlier slot is blank every
    // later "Region N" title would resolve to the wrong (shifted) slot's mask, or silently miss
    // one entirely.
    const index = Number(match[1] ?? match[2]) - 1;
    const slot = slots[index];
    if (!slot?.maskFilename?.trim() || !node.inputs) {
      continue;
    }
    if (typeof node.inputs.image === 'string') {
      node.inputs.image = slot.maskFilename.trim();
      patched += 1;
      next[id] = node;
    }
  }

  return { workflow: next as Record<string, unknown>, patched };
}

export type ApplyRegionalEditResult = {
  workflow: Record<string, unknown>;
  mode: RegionalEditMode;
  patchedNodes: number;
  patchedTokens: number;
  health: RegionalEditHealth;
  statusNote: string | null;
};

/**
 * Apply regional slots: prefer node binding, always try {{REGION_*}} tokens.
 */
export function applyRegionalEditToWorkflow(
  workflow: Record<string, unknown>,
  slots: RegionalPromptSlot[],
  options?: { availableNodeTypes?: Iterable<string> | null }
): ApplyRegionalEditResult {
  const graph = workflow as Record<string, WorkflowNode>;
  const hasNodes = workflowHasRegionalNodes(graph);
  const segments: RegionalPromptSegment[] = regionalSlotsToSegments(slots);
  const tokenPatch = patchRegionalTokensInWorkflow(workflow, segments);
  const nodePatch = hasNodes
    ? patchRegionalNodesInWorkflow(tokenPatch.workflow, slots)
    : { workflow: tokenPatch.workflow, patched: 0 };

  const health = resolveRegionalEditHealth({
    slots,
    availableNodeTypes: options?.availableNodeTypes,
    workflowHasRegional: hasNodes || nodePatch.patched > 0,
  });

  let mode: RegionalEditMode = 'none';
  let statusNote: string | null = null;
  if (!regionalSlotsHaveContent(slots)) {
    mode = 'none';
  } else if (nodePatch.patched > 0 || hasNodes) {
    mode = 'nodes';
    statusNote = `Regional nodes · ${nodePatch.patched} bound${
      regionalSlotsHaveMasks(slots) ? ' · masks' : ''
    }`;
  } else if (tokenPatch.patched > 0 || segments.length > 0) {
    mode = 'fallback-text';
    statusNote = 'Regional text fallback · {{REGION_*}} (no AttentionCouple/RegionalPrompt nodes)';
  }

  return {
    workflow: nodePatch.workflow,
    mode,
    patchedNodes: nodePatch.patched,
    patchedTokens: tokenPatch.patched,
    health,
    statusNote,
  };
}
