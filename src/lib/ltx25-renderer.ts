/**
 * "LTX-2.5 (fast)" clip engine — the queue builds the usual WAN image-to-video graph (prompt,
 * start still, seed, frames), then this pass swaps it for the official LTX-2.5 distilled
 * two-pass graph (core ComfyUI nodes only; template video_ltx2_5_i2v).
 *
 * Live A/B (2026-10-01, 3 Day heat stills, same seed and fixed clip template vs WAN 2.2 Rapid AIO
 * NSFW): 45–51 s for 97 frames vs 164–190 s for 61 frames. Solo held the pose where WAN dropped
 * the leg; a lap duo held on both; a from-behind duo broke on LTX (the partner left the act and
 * laughed). LTX-2.5 isn't NSFW-tuned — two-person adult clips stay on WAN (`clipEngineForShot`).
 */

import { DEFAULT_VIDEO_MODEL } from './comfy-models/registry';

export const LTX25_MODEL_ID = 'ltx-video-2.5';

export const LTX25_FILES = {
  transformer: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
  textEncoder: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
  videoVae: 'ltx-2.5-video-vae-bf16.safetensors',
  audioVae: 'ltx-2.5-audio-vae-bf16.safetensors',
  upscaler: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors',
} as const;

/** Node only LTX-2 era ComfyUI has — the graph can't load without it. */
export const LTX25_REQUIRED_NODE = 'LTXVImgToVideoInplace';

/** WAN's end-pose node (start + end frame), spliced in place of WanImageToVideo. */
export const WAN_FIRST_LAST_FRAME_NODE = 'WanFirstLastFrameToVideo';

/** Nodes an LTX-2.5 end pose (last-frame guide) needs on top of the base graph. */
export const LTX25_END_GUIDE_NODES = ['LTXVAddGuide', 'LTXVCropGuides'] as const;

export const LTX25_FPS = 24;
const LTX25_NEGATIVE = 'pc game, console game, video game, cartoon, childish, ugly';
/** Long side of the full-size (second pass) clip. */
const LTX25_LONG_SIDE = 768;

export function isLtx25Model(model: string | null | undefined): boolean {
  return String(model ?? '').trim() === LTX25_MODEL_ID;
}

/**
 * The engine a clip actually queues on. LTX-2.5 lost the from-behind duo in the A/B (partner
 * left the act), so two-person adult clips keep WAN; everything else rides the picked engine.
 */
export function clipEngineForShot(videoModel: string, shot: { adultDuo: boolean }): string {
  return isLtx25Model(videoModel) && shot.adultDuo ? DEFAULT_VIDEO_MODEL : videoModel;
}

/** LTX lengths are 8k+1 frames; keep the WAN clip's duration at 24 fps. */
export function ltx25FrameCount(frames: number, fps: number): number {
  const seconds = frames > 0 && fps > 0 ? frames / fps : 4;
  return Math.max(9, Math.round((seconds * LTX25_FPS) / 8) * 8 + 1);
}

/** Full-size canvas for the still's aspect: long side 768, both sides multiples of 64. */
export function ltx25Canvas(width: number, height: number): { width: number; height: number } {
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  const scale = LTX25_LONG_SIDE / Math.max(w, h);
  const snap = (value: number) => Math.max(256, Math.round((value * scale) / 64) * 64);
  return { width: snap(w), height: snap(h) };
}

type WorkflowNode = { class_type?: string; inputs?: Record<string, unknown>; _meta?: unknown };
type Workflow = Record<string, WorkflowNode>;

const isRef = (value: unknown): value is [string, number] =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';

const SAMPLERS = new Set(['KSampler', 'KSamplerAdvanced']);
const SAVES = new Set(['SaveAnimatedWEBP', 'VHS_VideoCombine', 'SaveVideo', 'SaveWEBM']);
const I2V = /ImageToVideo|ImgToVideo|FrameToVideo/;

/** Follow a conditioning link back to its prompt text (through WanImageToVideo and the like). */
function traceText(workflow: Workflow, ref: unknown, depth = 0): string | undefined {
  if (!isRef(ref) || depth > 8) return undefined;
  const node = workflow[ref[0]];
  if (!node?.inputs) return undefined;
  const text = node.inputs.text;
  if (typeof text === 'string' && /TextEncode/i.test(node.class_type ?? '')) return text;
  // I2V nodes output (positive, negative, latent) — follow the matching input.
  const key = ref[1] === 1 ? 'negative' : 'positive';
  for (const name of [key, 'conditioning', 'positive']) {
    const found = traceText(workflow, node.inputs[name], depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The LoadImage behind an I2V node's `end_image` (WAN first+last frame), through resizes. */
function findEndImageLoader(workflow: Workflow): string | undefined {
  for (const node of Object.values(workflow)) {
    if (!I2V.test(node?.class_type ?? '')) continue;
    let ref = node.inputs?.end_image;
    for (let depth = 0; isRef(ref) && depth < 4; depth += 1) {
      const source = workflow[ref[0]];
      if (source?.class_type === 'LoadImage') return ref[0];
      ref = source?.inputs?.image;
    }
  }
  return undefined;
}

function findStartImage(workflow: Workflow, skipLoader?: string): string | undefined {
  const loads = Object.entries(workflow).filter(
    ([id, node]) => node?.class_type === 'LoadImage' && id !== skipLoader
  );
  const fed = new Set<string>();
  for (const node of Object.values(workflow)) {
    if (!I2V.test(node?.class_type ?? '')) continue;
    for (const value of Object.values(node.inputs ?? {})) {
      if (isRef(value)) fed.add(value[0]);
    }
  }
  const named = (entry: [string, WorkflowNode]) => {
    const image = entry[1].inputs?.image;
    return typeof image === 'string' && image.trim() && !image.includes('{{') ? image : undefined;
  };
  const preferred = loads.find(entry => fed.has(entry[0]) && named(entry));
  const any = preferred ?? loads.find(named);
  return any ? named(any) : undefined;
}

export type Ltx25ConvertResult = { workflow: Workflow; converted: boolean; reason?: string };

/**
 * WAN (or any KSampler + LoadImage + video save) clip graph → LTX-2.5 distilled two-pass graph.
 * Returns the input unchanged when it isn't an image-to-video clip graph.
 */
export function convertVideoWorkflowToLtx25(
  input: Record<string, unknown>,
  options: {
    seed?: number;
    /**
     * Size the clip from the still itself (GetImageSize + ComfyMathExpression, core since 0.3x):
     * the WAN graph's canvas is the Video tool's square, which center-cropped portrait stills
     * and cut off heads. Off → the WAN graph's width / height.
     */
    sizeFromStill?: boolean;
    /**
     * End pose: a ComfyUI input image the clip should land on, added as an LTXVAddGuide on the
     * last frame of both passes (and cropped off again before upscale / decode). Also read from
     * a WAN first+last-frame graph's `end_image`. Live (2026-10-03): smooth when the end keeps
     * the start's framing; a big framing change hard-cuts.
     */
    endImage?: string;
  } = {}
): Ltx25ConvertResult {
  const workflow = input as Workflow;
  const entries = Object.entries(workflow);
  const sampler = entries.find(([, node]) => SAMPLERS.has(node?.class_type ?? ''))?.[1];
  const save = entries.find(([, node]) => SAVES.has(node?.class_type ?? ''))?.[1];
  const endLoader = findEndImageLoader(workflow);
  const image = findStartImage(workflow, endLoader);
  const endFromGraph = endLoader ? workflow[endLoader]?.inputs?.image : undefined;
  const endImage = [options.endImage, endFromGraph]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .find(value => value && !value.includes('{{'));
  if (!sampler?.inputs || !save?.inputs || !image) {
    return { workflow, converted: false, reason: 'not an image-to-video clip graph' };
  }
  const positive = traceText(workflow, sampler.inputs.positive) ?? '';
  if (!positive.trim()) {
    return { workflow, converted: false, reason: 'no prompt text' };
  }
  const negative = traceText(workflow, sampler.inputs.negative);

  const i2v = entries.find(([, node]) => I2V.test(node?.class_type ?? ''))?.[1];
  const latentRef = sampler.inputs.latent_image;
  const latent = isRef(latentRef) ? workflow[latentRef[0]] : undefined;
  const sized = i2v?.inputs?.width !== undefined ? i2v : latent;
  const width = Number(sized?.inputs?.width) || 768;
  const height = Number(sized?.inputs?.height) || 768;
  const length = Number(sized?.inputs?.length) || 64;
  const fps = Number(save.inputs.fps ?? save.inputs.frame_rate) || 16;
  const seed = Number(options.seed ?? sampler.inputs.seed ?? sampler.inputs.noise_seed) || 0;
  const prefix = String(save.inputs.filename_prefix ?? 'Castcut');

  const canvas = ltx25Canvas(width, height);
  const fromStill = options.sizeFromStill === true;
  const frames = ltx25FrameCount(length, fps);
  const F = LTX25_FILES;
  const next: Workflow = {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: F.transformer, weight_dtype: 'default' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: F.textEncoder, type: 'ltxv', device: 'default' },
    },
    '3': { class_type: 'VAELoader', inputs: { vae_name: F.videoVae } },
    '4': { class_type: 'VAELoader', inputs: { vae_name: F.audioVae } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: positive } },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['2', 0],
        text: [LTX25_NEGATIVE, negative?.trim()].filter(Boolean).join(', '),
      },
    },
    '7': {
      class_type: 'LTXVConditioning',
      inputs: { positive: ['5', 0], negative: ['6', 0], frame_rate: LTX25_FPS },
    },
    '8': { class_type: 'LoadImage', inputs: { image } },
    '9': {
      class_type: 'ImageScale',
      inputs: {
        image: ['8', 0],
        upscale_method: 'lanczos',
        width: fromStill ? ['31', 1] : canvas.width,
        height: fromStill ? ['32', 1] : canvas.height,
        crop: 'center',
      },
    },
    '10': { class_type: 'LTXVPreprocess', inputs: { image: ['9', 0], img_compression: 18 } },
    // First pass at half size; the latent upscaler doubles it for the refine pass.
    '11': {
      class_type: 'EmptyLTXVLatentVideo',
      inputs: {
        width: fromStill ? ['33', 1] : canvas.width / 2,
        height: fromStill ? ['34', 1] : canvas.height / 2,
        length: frames,
        batch_size: 1,
      },
    },
    '12': {
      class_type: 'LTXVImgToVideoInplace',
      inputs: { vae: ['3', 0], image: ['10', 0], latent: ['11', 0], strength: 0.7, bypass: false },
    },
    // The distilled model is audio+video; the audio latent rides along (not decoded).
    '13': {
      class_type: 'LTXVEmptyLatentAudio',
      inputs: { frames_number: frames, frame_rate: LTX25_FPS, batch_size: 1, audio_vae: ['4', 0] },
    },
    '14': {
      class_type: 'LTXVConcatAVLatent',
      inputs: { video_latent: ['12', 0], audio_latent: ['13', 0] },
    },
    '15': {
      class_type: 'LTXVDualCFGGuider',
      inputs: {
        model: ['1', 0],
        positive: ['7', 0],
        negative: ['7', 1],
        video_cfg: 1,
        audio_cfg: 1,
      },
    },
    '16': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral' } },
    '17': {
      class_type: 'ManualSigmas',
      inputs: { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' },
    },
    '18': { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    '19': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['18', 0],
        guider: ['15', 0],
        sampler: ['16', 0],
        sigmas: ['17', 0],
        latent_image: ['14', 0],
      },
    },
    '20': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['19', 0] } },
    '21': { class_type: 'LatentUpscaleModelLoader', inputs: { model_name: F.upscaler } },
    '22': {
      class_type: 'LTXVLatentUpsampler',
      inputs: { samples: ['20', 0], upscale_model: ['21', 0], vae: ['3', 0] },
    },
    '23': {
      class_type: 'LTXVImgToVideoInplace',
      inputs: { vae: ['3', 0], image: ['10', 0], latent: ['22', 0], strength: 1, bypass: false },
    },
    '24': {
      class_type: 'LTXVConcatAVLatent',
      inputs: { video_latent: ['23', 0], audio_latent: ['20', 1] },
    },
    '25': { class_type: 'RandomNoise', inputs: { noise_seed: seed + 1 } },
    '26': { class_type: 'ManualSigmas', inputs: { sigmas: '0.85, 0.7250, 0.4219, 0.0' } },
    '27': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['25', 0],
        guider: ['15', 0],
        sampler: ['16', 0],
        sigmas: ['26', 0],
        latent_image: ['24', 0],
      },
    },
    '28': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['27', 0] } },
    '29': {
      class_type: 'VAEDecodeTiled',
      inputs: {
        samples: ['28', 0],
        vae: ['3', 0],
        tile_size: 512,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 16,
      },
    },
    '30': {
      class_type: 'SaveAnimatedWEBP',
      inputs: {
        images: ['29', 0],
        filename_prefix: prefix,
        fps: LTX25_FPS,
        lossless: false,
        quality: 95,
        method: 'default',
      },
    },
  };
  if (fromStill) {
    // Long side 768, both sides multiples of 64 (the halves stay on LTX's 32 grid).
    const math = (expression: string, values: Record<string, [string, number]>): WorkflowNode => ({
      class_type: 'ComfyMathExpression',
      inputs: {
        expression,
        ...Object.fromEntries(Object.entries(values).map(([name, ref]) => [`values.${name}`, ref])),
      },
    });
    const size = { a: ['35', 0], b: ['35', 1] } as Record<string, [string, number]>;
    next['35'] = { class_type: 'GetImageSize', inputs: { image: ['8', 0] } };
    next['31'] = math(`round(${LTX25_LONG_SIDE} * a / max(a, b) / 64) * 64`, size);
    next['32'] = math(`round(${LTX25_LONG_SIDE} * b / max(a, b) / 64) * 64`, size);
    next['33'] = math('a // 2', { a: ['31', 1] });
    next['34'] = math('a // 2', { a: ['32', 1] });
  }
  if (endImage) addLtx25EndGuide(next, endImage);
  return { workflow: next, converted: true };
}

/**
 * Pin the clip's last frame to `endImage` on both passes: LTXVAddGuide (frame -1, strength 1)
 * after each in-place start frame, the guiders on the guide's conditioning, and LTXVCropGuides
 * after each separate so the guide frames never reach the upscaler or the decode.
 */
function addLtx25EndGuide(next: Workflow, endImage: string): void {
  const scale = next['9']!.inputs!;
  next['40'] = { class_type: 'LoadImage', inputs: { image: endImage } };
  next['41'] = {
    class_type: 'ImageScale',
    inputs: { ...scale, image: ['40', 0] },
  };
  next['42'] = { class_type: 'LTXVPreprocess', inputs: { image: ['41', 0], img_compression: 18 } };
  const guide = (positive: [string, number], negative: [string, number], latent: string) => ({
    class_type: 'LTXVAddGuide',
    inputs: {
      positive,
      negative,
      vae: ['3', 0],
      latent: [latent, 0],
      image: ['42', 0],
      frame_idx: -1,
      strength: 1,
    },
  });
  const crop = (guideId: string, latent: string): WorkflowNode => ({
    class_type: 'LTXVCropGuides',
    inputs: { positive: [guideId, 0], negative: [guideId, 1], latent: [latent, 0] },
  });
  // Pass 1.
  next['43'] = guide(['7', 0], ['7', 1], '12');
  next['14']!.inputs!.video_latent = ['43', 2];
  next['15']!.inputs!.positive = ['43', 0];
  next['15']!.inputs!.negative = ['43', 1];
  next['44'] = crop('43', '20');
  next['22']!.inputs!.samples = ['44', 2];
  // Pass 2 — on the cropped conditioning, with its own guider.
  next['45'] = guide(['44', 0], ['44', 1], '23');
  next['24']!.inputs!.video_latent = ['45', 2];
  next['46'] = {
    class_type: 'LTXVDualCFGGuider',
    inputs: { ...next['15']!.inputs, positive: ['45', 0], negative: ['45', 1] },
  };
  next['27']!.inputs!.guider = ['46', 0];
  next['47'] = crop('45', '28');
  next['29']!.inputs!.samples = ['47', 2];
}
