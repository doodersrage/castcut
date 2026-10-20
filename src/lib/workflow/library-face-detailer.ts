import { loadComfyWorkflowFiles, type ComfyWorkflowFile } from '../comfyui/workflow-files';
import { loadSettingsCache } from '../settings-cache';
import { FACE_DETAIL_IMAGE_TOKEN } from '../gallery/output-face-detail';

const FACE_DETAILER_NODE_PATTERN =
  /facedetailer|reactorfaceswap|reactorbuildfacemodel|reactorrestoreface|reactorloadfacemodel|face.?detailer|impactfacedetailer/i;
const FACE_DETAILER_NAME_PATTERN = /face.?detail|reactor|face.?swap|face.?fix|face.?restore/i;

function workflowLooksLikeFaceDetailerPipeline(workflowJson: string): boolean {
  try {
    const nodes = Object.values(
      JSON.parse(workflowJson) as Record<string, { class_type?: string }>
    );
    const classTypes = nodes.map(node => node.class_type ?? '');
    if (classTypes.some(type => FACE_DETAILER_NODE_PATTERN.test(type))) {
      return true;
    }
    const classTypeSet = new Set(classTypes);
    return (
      classTypeSet.has('LoadImage') &&
      classTypeSet.has('SaveImage') &&
      workflowJson.includes(FACE_DETAIL_IMAGE_TOKEN)
    );
  } catch {
    return false;
  }
}

/**
 * Resolves a dedicated face-detailer library workflow, preferring an explicit
 * pin (Settings → modelWorkflowMap["faceDetailer"], same map used for
 * per-model workflow assignment) before falling back to a name/node-type
 * heuristic search — mirrors findLibraryUpscaleWorkflowForModel.
 */
export function findLibraryFaceDetailerWorkflow(): ComfyWorkflowFile | undefined {
  const files = loadComfyWorkflowFiles();
  const shared = loadSettingsCache().shared;

  const pinnedId = shared.modelWorkflowMap?.faceDetailer?.trim();
  if (pinnedId) {
    const pinned = files.find(file => file.id === pinnedId);
    if (pinned) {
      return pinned;
    }
  }

  const nameMatch = files.find(
    file =>
      FACE_DETAILER_NAME_PATTERN.test(`${file.name} ${file.filename ?? ''}`) &&
      workflowLooksLikeFaceDetailerPipeline(file.workflowJson)
  );
  if (nameMatch) {
    return nameMatch;
  }

  return files.find(file => workflowLooksLikeFaceDetailerPipeline(file.workflowJson));
}
