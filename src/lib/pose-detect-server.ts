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
import { parseOpenPoseJson, type PoseDetectResult } from '@/lib/pose-score';

export type { PoseDetectResult };
export { parseComfyViewRef };

/** Preferred first: DWPose is far more reliable on rendered bodies than the old OpenPose net. */
const DETECTOR_NODES = ['DWPreprocessor', 'OpenposePreprocessor'] as const;

/** Fill every required widget from object_info defaults, then pin body-only detection. */
export function buildDetectorInputs(
  info: ComfyNodeInfo,
  imageLink: [string, number]
): Record<string, unknown> {
  return fillComfyNodeInputs(
    info,
    { image: imageLink },
    { detect_body: 'enable', detect_hand: 'disable', detect_face: 'disable' }
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
