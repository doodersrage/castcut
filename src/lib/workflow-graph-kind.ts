import type { ComfyImageModel, ComfyModelCategory } from './comfy-models/client';
import { AUDIO_SECONDS_TOKEN, MESH_RESOLUTION_TOKEN } from './audio-mesh-prompt';
import {
  DEFAULT_INIT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  listWorkflowNodeIds,
  type CustomWorkflowToken,
} from './comfyui-config';

export type WorkflowGraphKind = 'image' | 'video' | 'audio' | 'mesh' | 'unknown';

const VIDEO_CLASS_HINTS =
  /EmptyHunyuanLatentVideo|EmptyHunyuanVideo15Latent|EmptyLTXVLatentVideo|EmptyMochiLatentVideo|WanImageToVideo|HunyuanImageToVideo|HunyuanVideo15ImageToVideo|LTXVImgToVideo|SaveAnimatedWEBP|VHS_VideoCombine|CreateVideo|WanVideo|HunyuanVideoTextEncode|LTXVConditioning|LTXVScheduler|ImageOnlyCheckpointLoader/i;

/** Unparseable graphs: match video nodes in the raw JSON string. */
const VIDEO_GRAPH_FALLBACK_HINTS =
  /EmptyHunyuanLatentVideo|EmptyHunyuanVideo15Latent|EmptyLTXVLatentVideo|EmptyMochiLatentVideo|WanImageToVideo|HunyuanImageToVideo|HunyuanVideo15ImageToVideo|LTXVImgToVideo|SaveAnimatedWEBP|VHS_VideoCombine|CreateVideo|HunyuanVideoTextEncode|LTXVConditioning|WanVideo|LTXVScheduler|LTXVAddGuide/i;

const AUDIO_CLASS_HINTS =
  /SaveAudio|PreviewAudio|StableAudio|EmptyLatentAudio|AudioEncoder|LoadAudio|VAEDecodeAudio|CLIPTextEncodeAudio/i;

const MESH_CLASS_HINTS =
  /Hunyuan3D|SaveGLB|SaveMesh|Mesh|ImageToMesh|LoadImageTo3D|Preview3D|TripoSR|InstantMesh/i;

/** Collect class_type strings from an API-format workflow object. */
export function collectWorkflowClassTypes(workflowJson: string): string[] {
  try {
    const parsed = JSON.parse(workflowJson) as Record<string, unknown>;
    const ids = listWorkflowNodeIds(parsed);
    const classes: string[] = [];
    for (const id of ids) {
      const node = parsed[id];
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        continue;
      }
      const classType = (node as { class_type?: unknown }).class_type;
      if (typeof classType === 'string' && classType.trim()) {
        classes.push(classType);
      }
    }
    return classes;
  } catch {
    return [];
  }
}

export function inferWorkflowGraphKind(workflowJson: string): WorkflowGraphKind {
  const classes = collectWorkflowClassTypes(workflowJson).join('\n');
  if (!classes) {
    return 'unknown';
  }
  if (VIDEO_CLASS_HINTS.test(classes)) {
    return 'video';
  }
  if (AUDIO_CLASS_HINTS.test(classes)) {
    return 'audio';
  }
  if (MESH_CLASS_HINTS.test(classes)) {
    return 'mesh';
  }
  return 'image';
}

/**
 * True when a pack/scaffold is a clip graph (T2V/I2V), not a still-image SaveImage
 * pipeline. Clip queues must not run still graphs — they finish as a single PNG.
 */
export function workflowGraphIsVideo(workflowJson?: string): boolean {
  const json = workflowJson?.trim();
  if (!json) {
    return false;
  }
  const kind = inferWorkflowGraphKind(json);
  if (kind === 'video') {
    return true;
  }
  if (kind === 'image' || kind === 'audio' || kind === 'mesh') {
    return false;
  }
  return VIDEO_GRAPH_FALLBACK_HINTS.test(json);
}

export function graphKindToCategory(kind: WorkflowGraphKind): ComfyModelCategory | null {
  if (kind === 'video') return 'video';
  if (kind === 'audio') return 'audio';
  if (kind === 'mesh') return 'mesh';
  return null;
}

/** Default models when a pack graph matches a media category. */
export function defaultModelsForGraphKind(kind: WorkflowGraphKind): ComfyImageModel[] {
  switch (kind) {
    case 'video':
      return [
        'wan-video',
        'wan-video-rapid-aio',
        'wan-video-lightning-4',
        'hunyuan-video',
        'hunyuan-video-1.5',
        'ltx-video',
        'ltx-video-2',
      ];
    case 'audio':
      return ['stable-audio'];
    case 'mesh':
      return ['hunyuan-3d'];
    default:
      return [];
  }
}

/**
 * Suggest custom token slots so queue-time {{AUDIO_SECONDS}} / video frames /
 * mesh resolution / images get wired even when the pack used plain numbers.
 */
export function suggestMediaCustomTokens(
  workflowJson: string,
  existing?: CustomWorkflowToken[]
): CustomWorkflowToken[] {
  const kind = inferWorkflowGraphKind(workflowJson);
  const byToken = new Map((existing ?? []).map(entry => [entry.token.trim(), entry] as const));

  const ensure = (token: string, value: string) => {
    if (!byToken.has(token)) {
      byToken.set(token, { token, value });
    }
  };

  if (kind === 'audio') {
    ensure(AUDIO_SECONDS_TOKEN, '10');
  }
  if (kind === 'mesh') {
    ensure(MESH_RESOLUTION_TOKEN, '512');
    ensure(DEFAULT_INPUT_IMAGE_TOKEN, '');
  }
  if (kind === 'video') {
    ensure(DEFAULT_VIDEO_FRAMES_TOKEN, '81');
    ensure(DEFAULT_VIDEO_FPS_TOKEN, '16');
    ensure(DEFAULT_INIT_IMAGE_TOKEN, '');
  }

  return [...byToken.values()];
}

/** Merge label-inferred models with graph-kind defaults (graph wins when specific). */
export function mergeInferredModels(
  labelModels: ComfyImageModel[],
  kind: WorkflowGraphKind
): ComfyImageModel[] {
  const fromGraph = defaultModelsForGraphKind(kind);
  if (fromGraph.length === 0) {
    return labelModels;
  }
  if (labelModels.length === 0) {
    return fromGraph;
  }
  // Prefer intersection when label already guessed the category; else graph defaults first.
  const labelSet = new Set(labelModels);
  const overlap = fromGraph.filter(id => labelSet.has(id));
  if (overlap.length > 0) {
    return [...overlap, ...labelModels.filter(id => !overlap.includes(id))];
  }
  return [...fromGraph, ...labelModels.filter(id => !fromGraph.includes(id))];
}
