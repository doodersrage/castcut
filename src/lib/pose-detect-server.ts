/**
 * Server-only: read the body pose out of a finished still with ComfyUI's DWPose preprocessor
 * (comfyui_controlnet_aux). Feeds the Day / Story pose-match checks and the pose library.
 *
 * Runs LoadImage → DWPreprocessor → PreviewImage and reads the preprocessor's `openpose_json`
 * UI output. Reports `available: false` (never throws) when the node pack is not installed, so
 * callers can quietly skip the check.
 */

import {
  comfyBaseUrl,
  fillComfyNodeInputs,
  parseComfyViewRef,
  resolveComfyNode,
  runComfyUtilityGraph,
  stageComfyImageAsInput,
  type ComfyNodeInfo,
} from '@/lib/comfy-utility-graph-server';
import {
  buildPersonReadGraph,
  mergePersonReadReplies,
  PERSON_READ_COUNT,
  PERSON_READ_NODES,
  personReadNodeId,
} from '@/lib/pose-person-reads';
import { parseOpenPoseJson, type PoseDetectResult } from '@/lib/pose-score';

export type { PoseDetectResult };
export { parseComfyViewRef };

/** Preferred first: DWPose is far more reliable on rendered bodies than the old OpenPose net. */
const DETECTOR_NODES = ['DWPreprocessor', 'OpenposePreprocessor'] as const;

/**
 * Fill every required widget from object_info defaults, then pin body + hands (the gesture check
 * reads the hands, `pose-gesture.ts`) and no face. The flags are optional inputs on DWPose: they
 * must be sent, or the node runs on its Python defaults.
 */
export function buildDetectorInputs(
  info: ComfyNodeInfo,
  imageLink: [string, number]
): Record<string, unknown> {
  return fillComfyNodeInputs(
    info,
    { image: imageLink },
    { detect_body: 'enable', detect_hand: 'enable', detect_face: 'disable' }
  );
}

export async function detectPoseInComfyStill(input: {
  imageUrl: string;
  comfyUrl?: string;
  timeoutMs?: number;
}): Promise<PoseDetectResult> {
  const ref = parseComfyViewRef(input.imageUrl);
  if (!ref) {
    return { available: false, reason: 'Still is not a ComfyUI image.' };
  }
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const detector = await resolveComfyNode(baseUrl, DETECTOR_NODES);
  if (!detector) {
    return {
      available: false,
      reason: 'DWPose not installed in ComfyUI (comfyui_controlnet_aux).',
    };
  }
  const imageName = await stageComfyImageAsInput(baseUrl, ref, 'pose-check');
  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'pose-check',
    timeoutMs: input.timeoutMs,
    prompt: {
      '1': { class_type: 'LoadImage', inputs: { image: imageName } },
      '2': { class_type: detector.node, inputs: buildDetectorInputs(detector.info, ['1', 0]) },
      '3': { class_type: 'PreviewImage', inputs: { images: ['2', 0] } },
    },
    read: entry => entry.outputs?.['2']?.openpose_json?.[0],
  });
  if (run.result === undefined) {
    return {
      available: false,
      reason: `${detector.node} ran but reported no keypoints (update comfyui_controlnet_aux).`,
    };
  }
  const pose = parseOpenPoseJson(run.result);
  if (!pose) {
    throw new Error('DWPose returned keypoints in an unknown format.');
  }
  return { available: true, pose };
}

/**
 * Two-person stills: each person read on their own (person masks, the body alone on grey,
 * DWPose — pose-person-reads.ts), so a couple in contact comes back as two bodies instead of
 * one merged one. `available: false` when DWPose or the Impact Pack segmentation nodes are
 * missing.
 */
export async function detectPeopleInComfyStill(input: {
  imageUrl: string;
  comfyUrl?: string;
  timeoutMs?: number;
}): Promise<PoseDetectResult> {
  const ref = parseComfyViewRef(input.imageUrl);
  if (!ref) {
    return { available: false, reason: 'Still is not a ComfyUI image.' };
  }
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const detector = await resolveComfyNode(baseUrl, DETECTOR_NODES);
  if (!detector) {
    return {
      available: false,
      reason: 'DWPose not installed in ComfyUI (comfyui_controlnet_aux).',
    };
  }
  for (const node of PERSON_READ_NODES) {
    if (!(await resolveComfyNode(baseUrl, [node]))) {
      return { available: false, reason: `${node} not installed in ComfyUI (Impact Pack).` };
    }
  }
  const imageName = await stageComfyImageAsInput(baseUrl, ref, 'pose-people');
  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'pose-people',
    timeoutMs: input.timeoutMs,
    prompt: buildPersonReadGraph({
      imageName,
      detectorNode: detector.node,
      detectorInputs: image => buildDetectorInputs(detector.info, image),
    }),
    read: entry =>
      entry.status?.completed
        ? Array.from(
            { length: PERSON_READ_COUNT },
            (_, index) => entry.outputs?.[personReadNodeId(index)]?.openpose_json?.[0]
          )
        : undefined,
  });
  const pose = run.result ? mergePersonReadReplies(run.result) : null;
  if (!pose) {
    return { available: false, reason: 'The per-person read returned no keypoints.' };
  }
  return { available: true, pose };
}
