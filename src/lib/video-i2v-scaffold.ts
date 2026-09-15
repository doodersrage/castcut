import { matchInventoryFilenameNearMiss } from './loader-map-inventory-sync';
import { filenameLooksLikeCheckpointOnly } from './model-checkpoint-map';
import { pickVideoCheckpointFromInventory } from './video-checkpoint-pick';

/**
 * Prefer an installed WAN/Hunyuan/LTX weight. Mapped Rapid AIO names often
 * live under diffusion_models (UNETs), or a nearby stem (nsfw ↔ sfw).
 */
export function resolveInstalledVideoWeight(
  model: string | undefined,
  preferred: string | undefined,
  inventory: string[]
): string | undefined {
  const wanted = preferred?.trim();
  if (inventory.length === 0) {
    return wanted;
  }
  if (wanted) {
    const near = matchInventoryFilenameNearMiss(wanted, inventory);
    if (near) {
      return near;
    }
  }
  return pickVideoCheckpointFromInventory(model?.trim() || 'wan-video', inventory) ?? wanted;
}

function filenameInList(filename: string, list?: string[] | null): boolean {
  const trimmed = filename.trim();
  if (!trimmed || !list?.length) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  return list.some(entry => {
    const e = entry.trim();
    return e === trimmed || e.toLowerCase() === lower;
  });
}

/** True when ComfyUI lists the weight under UNETs only — CheckpointLoaderSimple will reject it. */
export function videoWeightIsUnetOnly(
  filename: string | undefined,
  checkpoints?: string[] | null,
  unets?: string[] | null
): boolean {
  const trimmed = filename?.trim();
  if (!trimmed || filenameLooksLikeCheckpointOnly(trimmed)) {
    return false;
  }
  return filenameInList(trimmed, unets) && !filenameInList(trimmed, checkpoints);
}

export type VideoSplitClipNode =
  | { class_type: 'CLIPLoader'; inputs: { clip_name: string; type: string } }
  | {
      class_type: 'DualCLIPLoader';
      inputs: { clip_name1: string; clip_name2: string; type: string };
    };

/** Official LTX 0.9.x CLIPLoader type `ltxv` — T5 lives in text_encoders, not the checkpoint. */
export const LTX_T5_FILENAMES = [
  't5xxl_fp16.safetensors',
  't5xxl_fp8_e4m3fn.safetensors',
  't5xxl_fp8_e4m3fn_scaled.safetensors',
] as const;

export function pickLtxTextEncoderFilename(availableClips?: string[] | null): string | undefined {
  return pickListedFilename([...LTX_T5_FILENAMES], availableClips);
}

export function ltxTextEncoderMissingError(weight?: string): string {
  const named = weight?.trim() ? `“${weight.trim()}” ` : '';
  return `${named}LTX checkpoints do not include a CLIP/text encoder. Install t5xxl_fp16.safetensors (Video → Install → T5-XXL fp16) into ComfyUI/models/text_encoders/. Official graphs use CLIPLoader type ltxv.`;
}

export function isLtxVideoModel(model?: string): boolean {
  return /ltx/i.test(model ?? '');
}

function isLtxClipLoaderNode(node: {
  class_type?: string;
  inputs?: Record<string, unknown>;
}): boolean {
  return (
    node.class_type === 'CLIPLoader' &&
    String(node.inputs?.type ?? '')
      .trim()
      .toLowerCase() === 'ltxv'
  );
}

function isCheckpointLoaderClass(classType: string | undefined): boolean {
  return classType === 'CheckpointLoaderSimple' || classType === 'CheckpointLoader';
}

function workflowNodeRecord(
  workflow: Record<string, unknown>,
  id: unknown
): { class_type?: string; inputs?: Record<string, unknown> } | undefined {
  const node = workflow[String(id)];
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  return node as { class_type?: string; inputs?: Record<string, unknown> };
}

function isCheckpointClipLink(workflow: Record<string, unknown>, value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 2 || Number(value[1]) !== 1) {
    return false;
  }
  return isCheckpointLoaderClass(workflowNodeRecord(workflow, value[0])?.class_type);
}

function looksLikePromptEncodeNode(classType: string | undefined): boolean {
  const lower = (classType ?? '').toLowerCase();
  return lower.includes('cliptextencode') || lower.includes('textencode');
}

export function workflowNeedsLtxTextEncoder(
  workflow: Record<string, unknown>,
  model?: string,
  checkpointFilename?: string
): boolean {
  if (isLtxVideoModel(model) || /ltx/i.test(checkpointFilename ?? '')) {
    return true;
  }
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const classType = (node as { class_type?: string }).class_type ?? '';
    if (
      classType === 'EmptyLTXVLatentVideo' ||
      classType === 'EmptyHunyuanVideo15Latent' ||
      classType === 'LTXVImgToVideo' ||
      classType === 'HunyuanVideo15ImageToVideo' ||
      classType === 'LTXVConditioning'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * LTX 0.9.x CheckpointLoaderSimple yields CLIP=None. Rewire CLIPTextEncode / LoraLoader
 * clip inputs onto CLIPLoader type ltxv (ComfyUI_examples/ltxv). Always rewires even
 * when a T5 loader is already present — leftover checkpoint CLIP links still error.
 */
export function attachLtxClipLoader(
  workflow: Record<string, unknown>,
  clipName: string
): { workflow: Record<string, unknown>; attached: number; rewired: number } {
  const next = structuredClone(workflow);
  const trimmed = clipName.trim();
  if (!trimmed) {
    return { workflow: next, attached: 0, rewired: 0 };
  }

  let clipId: string | undefined;
  for (const [nodeId, node] of Object.entries(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    if (!isLtxClipLoaderNode(record) || !record.inputs) {
      continue;
    }
    record.inputs.clip_name = trimmed;
    record.inputs.type = 'ltxv';
    clipId = nodeId;
    break;
  }

  let attached = 0;
  if (!clipId) {
    clipId = nextAvailableNodeId(next);
    next[clipId] = {
      class_type: 'CLIPLoader',
      inputs: { clip_name: trimmed, type: 'ltxv' },
      _meta: { title: 'LTX CLIP (T5-XXL)' },
    };
    attached = 1;
  }

  let rewired = 0;
  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }
    const clipValue = inputs.clip;
    if (isCheckpointClipLink(next, clipValue)) {
      inputs.clip = [clipId, 0];
      rewired += 1;
      continue;
    }
    if (
      looksLikePromptEncodeNode(record.class_type) &&
      (clipValue == null || clipValue === '' || clipValue === 'None')
    ) {
      inputs.clip = [clipId, 0];
      rewired += 1;
    }
  }

  return { workflow: next, attached, rewired };
}

export function ensureLtxClipLoaderForQueue(
  workflow: Record<string, unknown>,
  input: {
    model?: string;
    checkpointFilename?: string;
    availableClips?: string[] | null;
  }
): { workflow: Record<string, unknown>; attached: number; rewired: number; error?: string } {
  if (!workflowNeedsLtxTextEncoder(workflow, input.model, input.checkpointFilename)) {
    return { workflow, attached: 0, rewired: 0 };
  }
  const clipName = pickLtxTextEncoderFilename(input.availableClips);
  if (!clipName) {
    return {
      workflow,
      attached: 0,
      rewired: 0,
      error: ltxTextEncoderMissingError(input.checkpointFilename),
    };
  }
  const result = attachLtxClipLoader(workflow, clipName);
  return { workflow: result.workflow, attached: result.attached, rewired: result.rewired };
}

export type VideoSplitCompanions = {
  unet: string;
  vae: string;
  clip: VideoSplitClipNode;
};

function pickListedFilename(preferred: string[], inventory?: string[] | null): string | undefined {
  if (!inventory?.length) {
    return preferred[0];
  }
  for (const name of preferred) {
    const near = matchInventoryFilenameNearMiss(name, inventory);
    if (near) {
      return near;
    }
  }
  return undefined;
}

function inferVideoSplitFamily(
  model: string | undefined,
  filename: string
): 'hunyuan' | 'wan' | 'ltx' {
  if (/hunyuan|hy[-_]?video/i.test(filename) || /hunyuan/i.test(model ?? '')) {
    return 'hunyuan';
  }
  if (/ltx/i.test(filename) || /ltx/i.test(model ?? '')) {
    return 'ltx';
  }
  return 'wan';
}

/**
 * CLIP + VAE companions for official Hunyuan / WAN split UNETs (Comfy-Org
 * HunyuanVideo_repackaged / Wan_2.2_ComfyUI_repackaged). Rapid AIO stays on
 * CheckpointLoaderSimple and never reaches this path.
 */
export function resolveVideoSplitCompanions(input: {
  model?: string;
  unet: string;
  availableClips?: string[] | null;
  availableVaes?: string[] | null;
}): { companions?: VideoSplitCompanions; error?: string } {
  const unet = input.unet.trim();
  const family = inferVideoSplitFamily(input.model, unet);

  if (family === 'ltx') {
    return {
      error: `“${unet}” is in diffusion_models. LTX 0.9.x distilled files are checkpoints with a baked-in VAE — move the file to ComfyUI/models/checkpoints/ and install t5xxl_fp16.safetensors (CLIPLoader type ltxv).`,
    };
  }

  if (family === 'hunyuan') {
    const vae = pickListedFilename(
      ['hunyuan_video_vae_bf16.safetensors', 'hunyuan_video_vae.safetensors'],
      input.availableVaes
    );
    const clipL = pickListedFilename(['clip_l.safetensors'], input.availableClips);
    const llava = pickListedFilename(
      ['llava_llama3_fp8_scaled.safetensors', 'llava_llama3_fp16.safetensors'],
      input.availableClips
    );
    if (!vae || !clipL || !llava) {
      return {
        error: `“${unet}” is a Hunyuan diffusion_models UNET — CheckpointLoaderSimple cannot load it. Install hunyuan_video_vae_bf16.safetensors plus DualCLIP clip_l.safetensors and llava_llama3_fp8_scaled.safetensors, or queue a WAN Rapid AIO file from checkpoints/.`,
      };
    }
    return {
      companions: {
        unet,
        vae,
        clip: {
          class_type: 'DualCLIPLoader',
          inputs: {
            clip_name1: clipL,
            clip_name2: llava,
            type: 'hunyuan_video',
          },
        },
      },
    };
  }

  const vae = pickListedFilename(
    ['wan2.2_vae.safetensors', 'wan_2.2_vae.safetensors', 'wan_2.1_vae.safetensors'],
    input.availableVaes
  );
  const clip = pickListedFilename(
    ['umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'umt5_xxl_fp16.safetensors'],
    input.availableClips
  );
  if (!vae || !clip) {
    return {
      error: `“${unet}” is a WAN diffusion_models UNET — CheckpointLoaderSimple cannot load it. Install wan2.2_vae.safetensors and umt5_xxl_fp8_e4m3fn_scaled.safetensors, or put a Rapid AIO merge in checkpoints/.`,
    };
  }
  return {
    companions: {
      unet,
      vae,
      clip: {
        class_type: 'CLIPLoader',
        inputs: { clip_name: clip, type: 'wan' },
      },
    },
  };
}

function nextAvailableNodeId(workflow: Record<string, unknown>): string {
  let max = 0;
  for (const key of Object.keys(workflow)) {
    if (/^\d+$/.test(key)) {
      max = Math.max(max, Number(key));
    }
  }
  return String(max + 1);
}

function rewriteCheckpointOutputRefs(
  inputs: Record<string, unknown>,
  checkpointId: string,
  clipId: string,
  vaeId: string
): number {
  let rewritten = 0;
  for (const [key, value] of Object.entries(inputs)) {
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      value[0] !== checkpointId ||
      typeof value[1] !== 'number'
    ) {
      continue;
    }
    if (value[1] === 1) {
      inputs[key] = [clipId, 0];
      rewritten += 1;
    } else if (value[1] === 2) {
      inputs[key] = [vaeId, 0];
      rewritten += 1;
    }
  }
  return rewritten;
}

/**
 * CheckpointLoaderSimple only reads models/checkpoints/. Official Hunyuan / WAN
 * I2V weights live in diffusion_models — convert those loaders to UNET + CLIP + VAE
 * and retarget CLIP/VAE links (output 1 / 2).
 */
export function rewriteCheckpointLoadersToVideoSplit(
  workflow: Record<string, unknown>,
  companions: VideoSplitCompanions
): { workflow: Record<string, unknown>; converted: number } {
  const next = structuredClone(workflow);
  const checkpointIds: string[] = [];
  for (const [nodeId, node] of Object.entries(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as { class_type?: string };
    if (
      record.class_type === 'CheckpointLoaderSimple' ||
      record.class_type === 'CheckpointLoader'
    ) {
      checkpointIds.push(nodeId);
    }
  }
  if (checkpointIds.length === 0) {
    return { workflow: next, converted: 0 };
  }

  const clipId = nextAvailableNodeId(next);
  next[clipId] = {
    class_type: companions.clip.class_type,
    inputs: { ...companions.clip.inputs },
    _meta: {
      title:
        companions.clip.class_type === 'DualCLIPLoader'
          ? 'Hunyuan DualCLIP'
          : companions.clip.inputs.type === 'ltxv'
            ? 'LTX CLIP (T5-XXL)'
            : 'WAN CLIP (UMT5)',
    },
  };
  const vaeId = nextAvailableNodeId(next);
  next[vaeId] = {
    class_type: 'VAELoader',
    inputs: { vae_name: companions.vae },
    _meta: { title: 'Load Video VAE' },
  };

  for (const checkpointId of checkpointIds) {
    const node = next[checkpointId] as {
      class_type?: string;
      inputs?: Record<string, unknown>;
      _meta?: { title?: string };
    };
    node.class_type = 'UNETLoader';
    node.inputs = { unet_name: companions.unet, weight_dtype: 'default' };
    node._meta = { title: 'Load Video UNET' };
  }

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    if (!inputs) {
      continue;
    }
    for (const checkpointId of checkpointIds) {
      rewriteCheckpointOutputRefs(inputs, checkpointId, clipId, vaeId);
    }
  }

  return { workflow: next, converted: checkpointIds.length };
}

/**
 * Minimal T2V/I2V graph used when the selected workflow cannot accept an init
 * frame (typical: a still-image graph queued as WAN / Hunyuan / LTX I2V).
 * Queue-time patching fills placeholders and splices WanImageToVideo /
 * HunyuanImageToVideo / LTXVImgToVideo.
 */
export function buildBuiltInVideoI2vWorkflow(model: string): Record<string, unknown> {
  const id = String(model ?? '');
  const isLtx = /ltx/i.test(id);
  const isHunyuan15 = /hunyuan-video-1\.5|hunyuanvideo1\.5/i.test(id);
  const latentClass = isLtx
    ? 'EmptyLTXVLatentVideo'
    : isHunyuan15
      ? 'EmptyHunyuanVideo15Latent'
      : 'EmptyHunyuanLatentVideo';
  const i2vHint = isLtx
    ? 'Init Image (optional — auto-wired into LTXVImgToVideo at queue time)'
    : isHunyuan15
      ? 'Init Image (optional — auto-wired into HunyuanVideo15ImageToVideo at queue time)'
      : 'Init Image (optional — auto-wired into WanImageToVideo/HunyuanImageToVideo at queue time)';
  const clipRef: [string, number] = isLtx ? ['10', 0] : ['1', 1];

  const graph: Record<string, unknown> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Load Checkpoint' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '{{POSITIVE}}', clip: clipRef },
      _meta: { title: 'Positive Prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '{{NEGATIVE}}', clip: clipRef },
      _meta: { title: 'Negative Prompt' },
    },
    '900': {
      class_type: 'LoadImage',
      inputs: { image: '{{INIT_IMAGE}}' },
      _meta: { title: i2vHint },
    },
    '4': {
      class_type: latentClass,
      inputs: {
        width: '{{WIDTH}}',
        height: '{{HEIGHT}}',
        length: '{{VIDEO_FRAMES}}',
        batch_size: 1,
      },
      _meta: { title: 'Empty Video Latent' },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: '{{SEED}}',
        steps: '{{STEPS}}',
        cfg: '{{CFG}}',
        sampler_name: '{{SAMPLER}}',
        scheduler: '{{SCHEDULER}}',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '7': {
      class_type: 'SaveAnimatedWEBP',
      inputs: {
        images: ['6', 0],
        filename_prefix: 'Castcut',
        fps: '{{VIDEO_FPS}}',
        lossless: false,
        quality: 90,
        method: 'default',
      },
      _meta: { title: 'Save Video (WEBP)' },
    },
  };

  if (isLtx) {
    graph['10'] = {
      class_type: 'CLIPLoader',
      inputs: { clip_name: 't5xxl_fp16.safetensors', type: 'ltxv' },
      _meta: { title: 'LTX CLIP (T5-XXL)' },
    };
  }

  return graph;
}
