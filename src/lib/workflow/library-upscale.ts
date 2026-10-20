import { loadComfyWorkflowFiles, type ComfyWorkflowFile } from '../comfyui/workflow-files';
import { resolveWorkflowForModelSelection } from '../model-workflow-map';
import { loadSettingsCache } from '../settings-cache';

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

const IMAGE_LINK_KEYS = new Set(['image', 'images', 'pixels', 'source', 'destination', 'samples']);

function asWorkflowGraph(workflowJson: string): Record<string, WorkflowNode> | null {
  try {
    const parsed = JSON.parse(workflowJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, WorkflowNode>;
  } catch {
    return null;
  }
}

function linkNodeId(value: unknown): string | undefined {
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0];
  }
  return undefined;
}

function numericScaleBy(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim() && !/^\{\{/.test(value.trim())) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

/**
 * True when a SaveImage image chain includes neural UpscaleModel apply
 * and/or ImageScaleBy factors whose product is meaningfully > 1.
 * Rejects LoadImage→SaveImage and identity scale_by:1 “upscale” graphs.
 */
export function libraryUpscaleWorkflowEnlarges(
  workflow: Record<string, unknown> | string
): boolean {
  const graph =
    typeof workflow === 'string'
      ? asWorkflowGraph(workflow)
      : (workflow as Record<string, WorkflowNode>);
  if (!graph) {
    return false;
  }

  const nodes = Object.entries(graph);
  const hasLoad = nodes.some(([, node]) => node?.class_type === 'LoadImage');
  const saveIds = nodes.filter(([, node]) => node?.class_type === 'SaveImage').map(([id]) => id);
  if (!hasLoad || saveIds.length === 0) {
    return false;
  }

  for (const saveId of saveIds) {
    let hasNeural = false;
    let scaleProduct = 1;
    const visited = new Set<string>();
    const queue: string[] = [saveId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      const node = graph[id];
      if (!node?.class_type) {
        continue;
      }

      if (node.class_type === 'ImageUpscaleWithModel') {
        hasNeural = true;
      }
      if (node.class_type === 'ImageScaleBy') {
        const factor = numericScaleBy(node.inputs?.scale_by);
        if (factor != null) {
          scaleProduct *= factor;
        }
      }

      const inputs = node.inputs ?? {};
      for (const [key, value] of Object.entries(inputs)) {
        const keyLower = key.toLowerCase();
        if (!IMAGE_LINK_KEYS.has(keyLower) && !/image|pixel|latent|sample/i.test(keyLower)) {
          continue;
        }
        const upstream = linkNodeId(value);
        if (upstream && graph[upstream] && !visited.has(upstream)) {
          queue.push(upstream);
        }
      }
    }

    if (hasNeural || scaleProduct > 1.001) {
      return true;
    }
  }

  return false;
}

export function findLibraryUpscaleWorkflowForModel(model: string): ComfyWorkflowFile | undefined {
  const files = loadComfyWorkflowFiles();
  const shared = loadSettingsCache().shared;
  const mappedId = resolveWorkflowForModelSelection(model, {
    map: shared.modelWorkflowMap,
    workflowFiles: files,
  });
  if (mappedId) {
    const mapped = files.find(file => file.id === mappedId);
    if (mapped && libraryUpscaleWorkflowEnlarges(mapped.workflowJson)) {
      return mapped;
    }
  }

  const haystackMatch = files.find(
    file =>
      /upscale/i.test(`${file.name} ${file.filename ?? ''}`) &&
      libraryUpscaleWorkflowEnlarges(file.workflowJson)
  );
  if (haystackMatch) {
    return haystackMatch;
  }

  return files.find(file => libraryUpscaleWorkflowEnlarges(file.workflowJson));
}
