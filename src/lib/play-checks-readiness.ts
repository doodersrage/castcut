/**
 * Readiness of Play's optional checks and Cut extras, shared by server and client (pure).
 * The server fills it from ComfyUI object_info and the local ffmpeg; the UI renders it.
 */

export type PlayCheckReadiness = {
  ready: boolean;
  /** Short status for the UI ("DWPreprocessor", "missing FaceEmbedDistance"). */
  detail: string;
  /** What to install when not ready. */
  install?: { name: string; url: string };
};

export type PlayChecksReadiness = {
  /** False when ComfyUI could not be reached at all (the other fields are then unknown). */
  comfyReachable: boolean;
  pose: PlayCheckReadiness;
  face: PlayCheckReadiness;
  cutTitles: PlayCheckReadiness;
  /** Vision model for still review (Auto-review, Look tile roles); absent on older probes. */
  review?: PlayCheckReadiness;
};

export const DWPOSE_PACK = {
  name: 'comfyui_controlnet_aux',
  url: 'https://github.com/Fannovel16/comfyui_controlnet_aux',
};

export const FACE_ANALYSIS_PACK = {
  name: 'ComfyUI_FaceAnalysis',
  url: 'https://github.com/cubiq/ComfyUI_FaceAnalysis',
};

/** Build readiness from which nodes ComfyUI reported and what ffmpeg can do. */
export function buildPlayChecksReadiness(input: {
  comfyReachable: boolean;
  poseNode: string | null;
  faceNodes: { models: boolean; distance: boolean; previewAny: boolean };
  ffmpeg: { available: boolean; drawtext: boolean; font: boolean };
  /** Which vision model still review will use, and where it came from. */
  vision?: { llmEnabled: boolean; model?: string; source?: 'session' | 'env' | 'detected' };
}): PlayChecksReadiness {
  const { faceNodes, ffmpeg } = input;
  const faceMissing = [
    faceNodes.models ? null : 'FaceAnalysisModels',
    faceNodes.distance ? null : 'FaceEmbedDistance',
  ].filter((name): name is string => Boolean(name));
  const faceReady = input.comfyReachable && faceMissing.length === 0 && faceNodes.previewAny;
  const vision = input.vision;
  const review: PlayCheckReadiness | undefined = !vision
    ? undefined
    : !vision.llmEnabled
      ? { ready: false, detail: 'LLM is off (LLM_ENABLED)' }
      : vision.model
        ? {
            ready: true,
            detail:
              vision.source === 'detected'
                ? `${vision.model} (found on the LLM server)`
                : vision.source === 'session'
                  ? `${vision.model} (Settings → LLM)`
                  : `${vision.model} (LLM_VISION_MODEL)`,
          }
        : {
            ready: false,
            detail: 'no vision model on the LLM server — pull one (e.g. qwen2.5vl or gemma3)',
          };
  return {
    ...(review ? { review } : {}),
    comfyReachable: input.comfyReachable,
    pose: input.poseNode
      ? { ready: true, detail: input.poseNode }
      : {
          ready: false,
          detail: input.comfyReachable ? 'DWPose not installed' : 'ComfyUI unreachable',
          ...(input.comfyReachable ? { install: DWPOSE_PACK } : {}),
        },
    face: faceReady
      ? { ready: true, detail: 'FaceAnalysis (InsightFace)' }
      : {
          ready: false,
          detail: !input.comfyReachable
            ? 'ComfyUI unreachable'
            : faceMissing.length > 0
              ? `missing ${faceMissing.join(', ')}`
              : 'needs a newer ComfyUI (PreviewAny node)',
          ...(input.comfyReachable && faceMissing.length > 0
            ? { install: FACE_ANALYSIS_PACK }
            : {}),
        },
    cutTitles: !ffmpeg.available
      ? { ready: false, detail: 'no server ffmpeg — browser Cut draws titles instead' }
      : !ffmpeg.drawtext
        ? {
            ready: false,
            detail: 'server ffmpeg lacks drawtext — browser Cut draws titles instead',
          }
        : !ffmpeg.font
          ? { ready: false, detail: 'no font for titles — set FILM_FONT_FILE' }
          : { ready: true, detail: 'server ffmpeg + font' },
  };
}

/** One line for Day's Auto-review chip: what the review will and won't check. */
export function summarizePlayChecks(readiness: PlayChecksReadiness | null): string | null {
  if (!readiness) return null;
  if (!readiness.comfyReachable) return 'Pose / face checks: ComfyUI unreachable.';
  const on = [readiness.pose.ready ? 'pose' : null, readiness.face.ready ? 'face' : null].filter(
    Boolean
  );
  const off = [
    readiness.pose.ready ? null : `pose (${readiness.pose.install?.name ?? readiness.pose.detail})`,
    readiness.face.ready ? null : `face (${readiness.face.install?.name ?? readiness.face.detail})`,
  ].filter(Boolean);
  if (off.length === 0) return 'Pose and face checks ready.';
  return `${on.length ? `${on.join(' + ')} check ready; ` : ''}off: ${off.join(', ')} — install to enable.`;
}
