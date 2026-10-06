/**
 * Server-only: count faces, hands, bodies and limbs on a two-person intimate still in one
 * check-priority ComfyUI graph (duo-still-check.ts). Needs DWPose (comfyui_controlnet_aux), the
 * Impact Pack's Ultralytics detector with its face and hand models, and core PreviewAny; reports
 * `available: false` (never throws) when any is missing, so the Two takes ordering switches
 * itself off for the session.
 */

import {
  comfyBaseUrl,
  parseComfyViewRef,
  resolveComfyNode,
  runComfyUtilityGraph,
  stageComfyImageAsInput,
  type ComfyNodeInfo,
} from '@/lib/comfy-utility-graph-server';
import { buildDetectorInputs } from '@/lib/pose-detect-server';
import {
  buildDuoCountGraph,
  DUO_COUNT_NODES,
  DUO_FACE_MODEL,
  DUO_HAND_MODEL,
  DUO_PENIS_MODEL,
  DUO_VAGINA_MODEL,
  readDuoCountReplies,
  type DuoStillCheckResult,
} from '@/lib/duo-still-check';

export type { DuoStillCheckResult };

const DETECTOR_NODES = ['DWPreprocessor', 'OpenposePreprocessor'] as const;

/** The model files UltralyticsDetectorProvider offers (its `model_name` combo). */
export function ultralyticsModels(info: ComfyNodeInfo): string[] {
  const spec = info.input?.required?.model_name;
  const [type, config] = spec ?? [];
  const options = Array.isArray(type)
    ? type
    : (config as { options?: unknown } | undefined)?.options;
  return Array.isArray(options) ? options.map(String) : [];
}

export async function countDuoStillInComfy(input: {
  imageUrl: string;
  comfyUrl?: string;
  timeoutMs?: number;
}): Promise<DuoStillCheckResult> {
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
  if (!(await resolveComfyNode(baseUrl, ['PreviewAny']))) {
    return { available: false, reason: 'PreviewAny not in this ComfyUI (update ComfyUI).' };
  }
  let ultralytics: ComfyNodeInfo | null = null;
  for (const node of DUO_COUNT_NODES) {
    const found = await resolveComfyNode(baseUrl, [node]);
    if (!found) {
      return { available: false, reason: `${node} not installed in ComfyUI (Impact Pack).` };
    }
    if (node === 'UltralyticsDetectorProvider') ultralytics = found.info;
  }
  const models = ultralytics ? ultralyticsModels(ultralytics) : [];
  for (const model of [DUO_FACE_MODEL, DUO_HAND_MODEL]) {
    if (models.length > 0 && !models.includes(model)) {
      return { available: false, reason: `${model} missing from ComfyUI's models/ultralytics.` };
    }
  }
  const parts = {
    penis: models.includes(DUO_PENIS_MODEL),
    vagina: models.includes(DUO_VAGINA_MODEL),
  };
  const imageName = await stageComfyImageAsInput(baseUrl, ref, 'duo-count');
  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'duo-count',
    priority: 'check',
    timeoutMs: input.timeoutMs,
    prompt: buildDuoCountGraph({
      imageName,
      detectorNode: detector.node,
      // Body only: hands come from the hand model, the face from the face model.
      detectorInputs: image => ({
        ...buildDetectorInputs(detector.info, image),
        detect_hand: 'disable',
      }),
      parts,
    }),
    read: entry => (entry.status?.completed ? entry.outputs : undefined),
  });
  // ComfyUI re-runs nothing it has cached: a second identical graph (the same staged still,
  // the same DWPose inputs) comes back without the DWPose `openpose_json`, so the body counts
  // read null and only the face / hand counts tell (seen live 2026-10-05). Each pair is counted
  // once, so this only touches a replay.
  const counts = run.result ? readDuoCountReplies(run.result) : null;
  if (!counts) {
    return {
      available: false,
      reason: 'The count graph ran but reported nothing (update the Impact Pack).',
    };
  }
  return { available: true, counts };
}
