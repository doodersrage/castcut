/**
 * What a library workflow makes — image, video, audio or a 3D mesh — and which kind a model
 * needs. The video scaffold finder used to match any file named "…hunyuan…", so a "Hunyuan 3D
 * scaffold" (an image graph carrying MESH_ tokens) was reused for every video model.
 */
import { COMFY_IMAGE_MODELS } from './comfy-models/registry';
import type { ComfyWorkflowFile } from './comfyui-workflow-files';

export type WorkflowKind = 'image' | 'video' | 'audio' | 'mesh';

const VIDEO_NODE_RE =
  /"class_type"\s*:\s*"(?:EmptyHunyuanLatentVideo|EmptyHunyuanVideo15Latent|EmptyLTXVLatentVideo|EmptyMochiLatentVideo|EmptyCosmosLatentVideo|WanImageToVideo|WanFirstLastFrameToVideo|HunyuanImageToVideo|HunyuanVideo15ImageToVideo|LTXVImgToVideo|SaveAnimatedWEBP|SaveAnimatedPNG|SaveWEBM|SaveVideo|VHS_VideoCombine|CreateVideo)"/;
const AUDIO_NODE_RE =
  /"class_type"\s*:\s*"(?:SaveAudio|SaveAudioMP3|SaveAudioOpus|EmptyLatentAudio|VAEDecodeAudio)"/;
const MESH_NODE_RE =
  /"class_type"\s*:\s*"(?:SaveGLB|VoxelToMesh|VoxelToMeshBasic|Hunyuan3Dv2Conditioning|Hunyuan3Dv2ConditioningMultiView|EmptyLatentHunyuan3Dv2|VAEDecodeHunyuan3D)"/;

type KindInput = Pick<ComfyWorkflowFile, 'name' | 'workflowJson'> & { filename?: string };

/** The kind a library workflow produces, from its nodes, its media tokens, then its name. */
export function workflowFileKind(file: KindInput): WorkflowKind {
  const json = file.workflowJson ?? '';
  const name = `${file.name ?? ''} ${file.filename ?? ''}`;
  if (MESH_NODE_RE.test(json) || /\{\{MESH_/.test(json)) return 'mesh';
  if (AUDIO_NODE_RE.test(json) || /\{\{AUDIO_/.test(json)) return 'audio';
  if (VIDEO_NODE_RE.test(json) || /\{\{VIDEO_/.test(json)) return 'video';
  // Name last, and 3D / audio before video: "Hunyuan 3D" is not a Hunyuan video workflow.
  if (/\b3d\b|mesh/i.test(name)) return 'mesh';
  if (/audio/i.test(name)) return 'audio';
  if (/video|\bwan\b|\bltx/i.test(name)) return 'video';
  return 'image';
}

/** The kind a model needs, or null when the key is not a model ("faceDetailer" and the like). */
export function modelWorkflowKind(model: string): WorkflowKind | null {
  const definition = COMFY_IMAGE_MODELS.find(entry => entry.id === model);
  if (!definition) return null;
  const category = definition.category;
  return category === 'video' || category === 'audio' || category === 'mesh' ? category : 'image';
}

/** The first family word of a model id ("wan-video-rapid-aio" → "wan", "ltx-video" → "ltx"). */
function modelFamily(model: string): string {
  return model.split('-')[0]!.toLowerCase();
}

/**
 * The library workflow to use for a model of this kind: one named for the model's family
 * ("WAN Video scaffold" for wan-video) first, then any workflow of the same kind.
 */
export function pickWorkflowForModelKind<T extends KindInput & { id: string }>(
  files: T[],
  model: string,
  kind: WorkflowKind = modelWorkflowKind(model) ?? 'image'
): T | undefined {
  const sameKind = files.filter(file => workflowFileKind(file) === kind);
  const family = modelFamily(model);
  return sameKind.find(file => file.name.toLowerCase().includes(family)) ?? sameKind[0];
}
