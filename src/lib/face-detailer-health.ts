import { findLibraryFaceDetailerWorkflow } from './workflow-library-face-detailer';
import { loadSettingsCache } from './settings-cache';
import { loadComfyWorkflowFiles } from './comfyui-workflow-files';

export type FaceDetailerHealthStatus = 'ready' | 'partial' | 'detected' | 'missing';

export type FaceDetailerHealth = {
  status: FaceDetailerHealthStatus;
  label: string;
  workflowName?: string;
  pinnedId?: string;
  /** True when the pinned/detected graph includes Impact FaceDetailer / ReActor nodes. */
  hasImpactNodes?: boolean;
};

const IMPACT_FACE_NODE_PATTERN =
  /facedetailer|reactorfaceswap|reactorbuildfacemodel|reactorrestoreface|reactorloadfacemodel|face.?detailer|impactfacedetailer/i;

/** True when workflow JSON includes a real FaceDetailer / ReActor node (not just the scaffold). */
export function workflowHasImpactFaceDetailerNodes(
  workflowJson: string | null | undefined
): boolean {
  if (!workflowJson?.trim()) {
    return false;
  }
  try {
    const nodes = Object.values(
      JSON.parse(workflowJson) as Record<string, { class_type?: string }>
    );
    return nodes.some(node => IMPACT_FACE_NODE_PATTERN.test(node.class_type ?? ''));
  } catch {
    return IMPACT_FACE_NODE_PATTERN.test(workflowJson);
  }
}

/** Settings chip: Ready (Impact pin) / Partial (scaffold pin) / Detected / Missing. */
export function getFaceDetailerHealth(): FaceDetailerHealth {
  const shared = loadSettingsCache().shared;
  const pinnedId = shared.modelWorkflowMap?.faceDetailer?.trim();
  const files = loadComfyWorkflowFiles();
  const resolved = findLibraryFaceDetailerWorkflow();

  if (pinnedId) {
    const pinned = files.find(file => file.id === pinnedId);
    if (pinned) {
      const hasImpactNodes = workflowHasImpactFaceDetailerNodes(pinned.workflowJson);
      if (hasImpactNodes) {
        return {
          status: 'ready',
          label: 'Ready',
          workflowName: pinned.name,
          pinnedId,
          hasImpactNodes: true,
        };
      }
      return {
        status: 'partial',
        label: 'Scaffold · needs Impact Pack',
        workflowName: pinned.name,
        pinnedId,
        hasImpactNodes: false,
      };
    }
    return {
      status: 'missing',
      label: 'Missing pin',
      pinnedId,
    };
  }

  if (resolved) {
    const hasImpactNodes = workflowHasImpactFaceDetailerNodes(resolved.workflowJson);
    return {
      status: 'detected',
      label: 'Detected',
      workflowName: resolved.name,
      hasImpactNodes,
    };
  }

  return {
    status: 'missing',
    label: 'Missing',
  };
}
