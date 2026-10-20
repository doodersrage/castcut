export const QWEN_IMAGE_CLIP_TYPE = 'qwen_image';

function coerceClipFilename(inputs: Record<string, unknown>): string {
  const fromPrimary = typeof inputs.clip_name1 === 'string' ? inputs.clip_name1.trim() : '';
  if (fromPrimary) {
    return fromPrimary;
  }
  const fromSecondary = typeof inputs.clip_name2 === 'string' ? inputs.clip_name2.trim() : '';
  if (fromSecondary) {
    return fromSecondary;
  }
  return typeof inputs.clip_name === 'string' ? inputs.clip_name.trim() : '';
}

export function shouldRepairQwenDualClipLoaderNode(node: {
  class_type?: string;
  inputs?: Record<string, unknown>;
}): boolean {
  if (node.class_type !== 'DualCLIPLoader' || !node.inputs) {
    return false;
  }
  const clipType = typeof node.inputs.type === 'string' ? node.inputs.type.trim() : '';
  return clipType === QWEN_IMAGE_CLIP_TYPE;
}

/** Qwen Image uses CLIPLoader (type qwen_image), not DualCLIPLoader — repair legacy scaffolds in place. */
export function repairQwenImageClipLoaderNodes(workflow: Record<string, unknown>): {
  workflow: Record<string, unknown>;
  repairedNodeIds: string[];
} {
  const next = structuredClone(workflow);
  const repairedNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as {
      class_type?: string;
      _meta?: { title?: string };
      inputs?: Record<string, unknown>;
    };
    if (!shouldRepairQwenDualClipLoaderNode(record) || !record.inputs) {
      continue;
    }

    const clipName = coerceClipFilename(record.inputs);
    record.class_type = 'CLIPLoader';
    record.inputs = {
      clip_name: clipName,
      type: QWEN_IMAGE_CLIP_TYPE,
    };
    if (record._meta?.title?.trim()) {
      record._meta.title = record._meta.title.replace(/DualCLIP/i, 'CLIP');
    }
    repairedNodeIds.push(nodeId);
  }

  return { workflow: next, repairedNodeIds };
}
