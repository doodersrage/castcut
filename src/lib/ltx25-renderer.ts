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
import { PRODUCT_OUTPUT_PREFIX } from './brand';

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

/** Nodes a talking clip (LTX's own soundtrack decoded and muxed into an MP4) needs. */
export const LTX25_SPEECH_NODES = ['LTXVAudioVAEDecode', 'CreateVideo', 'SaveVideo'] as const;

/** Speaker-identity node (core ComfyUI, PR #13111): conditions the voice on a short sample. */
export const LTX25_VOICE_NODE = 'LTXVReferenceAudio';

/**
 * ID-LoRA (LTX-2.3 22B, TalkVid) — what makes LTXVReferenceAudio carry a voice. Live on LTX-2.5
 * (2026-10-09): the clip's pitch moved most of the way to the sample (229 → 193–200 Hz vs a
 * 175 Hz sample) and speaker similarity rose ~0.05; strength 1.5–2 no better than 1.
 */
export const LTX25_ID_LORA = 'ltx-2.3-id-lora-talkvid-3k.safetensors';

/** ID-LoRA strength (first pass only, see addLtx25Speech): 1.0 warped faces on LTX-2.5. */
export const LTX25_ID_LORA_STRENGTH = 0.5;

/**
 * Face pass on talking clips (ReActor CodeFormer). LTX-2.5's fast model smears the mouth in some
 * frames while she talks; replaying the user's clip on its seed, CodeFormer at visibility 0.6 /
 * fidelity 0.7 cleaned those frames, same face, no added flicker (frame-to-frame jitter 0.893 →
 * 0.883), lip-sync unchanged. More refine steps, no start-frame compression or no voice did not.
 */
export const LTX25_FACE_RESTORE_NODE = 'ReActorRestoreFace';

export const LTX25_FPS = 24;
const LTX25_NEGATIVE = 'pc game, console game, video game, cartoon, childish, ugly';
/** Long side of the full-size (second pass) clip. */
const LTX25_LONG_SIDE = 768;
/**
 * Long side for a full-frame talking clip: at 768 a full-body still's face is ~60 px and the
 * moving mouth smeared; at 1152 it rendered clean (user's clip replayed on its seed, 2026-10-10;
 * ~63 s vs ~45 s).
 */
export const LTX25_TALKING_FULL_FRAME_LONG_SIDE = 1152;

export function isLtx25Model(model: string | null | undefined): boolean {
  return String(model ?? '').trim() === LTX25_MODEL_ID;
}

/**
 * The engine a clip actually queues on. LTX-2.5 lost the from-behind duo in the A/B (partner
 * left the act), so two-person adult clips keep WAN. Clothed one-person clips go to WAN too:
 * LTX-2.5 lost the face (mean match 0.33 vs WAN's 0.58 over 8 Day stills, clip sweep
 * 2026-10-05) — unless the player keeps LTX for them (Video `ltxClothedSolo`, for speed).
 */
export function clipEngineForShot(
  videoModel: string,
  shot: {
    adultDuo: boolean;
    clothedSolo?: boolean;
    keepLtxForClothedSolo?: boolean;
    /** The clip has a spoken line — only LTX-2.5 makes sound, so it runs there whatever is picked. */
    speaking?: boolean;
  }
): string {
  if (shot.speaking && !shot.adultDuo) return LTX25_MODEL_ID;
  if (!isLtx25Model(videoModel)) return videoModel;
  if (shot.adultDuo) return DEFAULT_VIDEO_MODEL;
  if (shot.clothedSolo && !shot.keepLtxForClothedSolo) return DEFAULT_VIDEO_MODEL;
  return videoModel;
}

/** LTX lengths are 8k+1 frames; keep the WAN clip's duration at 24 fps. */
export function ltx25FrameCount(frames: number, fps: number): number {
  const seconds = frames > 0 && fps > 0 ? frames / fps : 4;
  return Math.max(9, Math.round((seconds * LTX25_FPS) / 8) * 8 + 1);
}

/** Full-size canvas for the still's aspect: long side 768, both sides multiples of 64. */
export function ltx25Canvas(
  width: number,
  height: number,
  longSide = LTX25_LONG_SIDE
): { width: number; height: number } {
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  const scale = longSide / Math.max(w, h);
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
    /** Long side of the full-size pass (default 768) — larger for full-frame talking clips. */
    longSide?: number;
    /**
     * End pose: a ComfyUI input image the clip should land on, added as an LTXVAddGuide on the
     * last frame of both passes (and cropped off again before upscale / decode). Also read from
     * a WAN first+last-frame graph's `end_image`. Live (2026-10-03): smooth when the end keeps
     * the start's framing; a big framing change hard-cuts.
     */
    endImage?: string;
    /**
     * Talking clip: keep the soundtrack LTX generates with the picture (a quoted line in the
     * prompt is spoken, lip-synced) and save an MP4 with sound instead of a silent WebP.
     * `voiceSample` (a ComfyUI input audio file, ~5 s) steers the voice; `idLora` is the
     * ID-LoRA file to apply with it (without it the sample does nothing measurable).
     */
    speech?: { voiceSample?: string; idLora?: string; restoreFace?: string };
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
  const prefix = String(save.inputs.filename_prefix ?? PRODUCT_OUTPUT_PREFIX);

  const longSide =
    options.longSide && options.longSide >= 512 && options.longSide <= 1536
      ? Math.round(options.longSide / 64) * 64
      : LTX25_LONG_SIDE;
  const canvas = ltx25Canvas(width, height, longSide);
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
    next['31'] = math(`round(${longSide} * a / max(a, b) / 64) * 64`, size);
    next['32'] = math(`round(${longSide} * b / max(a, b) / 64) * 64`, size);
    next['33'] = math('a // 2', { a: ['31', 1] });
    next['34'] = math('a // 2', { a: ['32', 1] });
  }
  if (endImage) addLtx25EndGuide(next, endImage);
  if (options.speech) addLtx25Speech(next, options.speech, prefix);
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

/**
 * Decode the second pass's audio latent and save picture + sound as an MP4 (replacing the silent
 * WebP save). With a voice sample, LTXVReferenceAudio (on the ID-LoRA when given) feeds both
 * passes' guiders.
 */
function addLtx25Speech(
  next: Workflow,
  speech: { voiceSample?: string; idLora?: string; restoreFace?: string },
  prefix: string
): void {
  const voiceSample = speech.voiceSample?.trim();
  if (voiceSample) {
    const idLora = speech.idLora?.trim();
    if (idLora) {
      next['50'] = {
        class_type: 'LoraLoaderModelOnly',
        inputs: { model: ['1', 0], lora_name: idLora, strength_model: LTX25_ID_LORA_STRENGTH },
      };
    }
    next['51'] = { class_type: 'LoadAudio', inputs: { audio: voiceSample } };
    // The voice is set on the first (half-size) pass only. Replaying the user's clips on their
    // seeds (2026-10-10): the LoRA on both passes warped her face (white-mask faces at 1.0);
    // first pass only at 0.5, with the refine pass on the plain model and the first pass's audio
    // frozen, gave clean faces on both clips and kept most of the voice where it helped.
    const pass1 = next['15']?.inputs;
    if (pass1) {
      if (!next['46']) {
        // No end pose: both passes shared one guider — the refine pass gets its own, unpatched.
        next['57'] = { class_type: 'LTXVDualCFGGuider', inputs: { ...pass1 } };
        if (next['27']?.inputs) next['27'].inputs.guider = ['57', 0];
      }
      next['52'] = {
        class_type: LTX25_VOICE_NODE,
        inputs: {
          model: idLora ? ['50', 0] : ['1', 0],
          positive: pass1.positive,
          negative: pass1.negative,
          reference_audio: ['51', 0],
          audio_vae: ['4', 0],
          identity_guidance_scale: 3,
          start_percent: 0,
          end_percent: 1,
        },
      };
      pass1.model = ['52', 0];
      pass1.positive = ['52', 1];
      pass1.negative = ['52', 2];
      // The refine pass keeps the voiced audio as it is.
      next['58'] = { class_type: 'LTXVFreezeLatent', inputs: { latent: ['20', 1] } };
      if (next['24']?.inputs) next['24'].inputs.audio_latent = ['58', 0];
    }
  }
  next['54'] = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: ['28', 1], audio_vae: ['4', 0] },
  };
  const restoreFace = speech.restoreFace?.trim();
  if (restoreFace) {
    next['59'] = {
      class_type: LTX25_FACE_RESTORE_NODE,
      inputs: {
        image: ['29', 0],
        facedetection: 'retinaface_resnet50',
        model: restoreFace,
        visibility: 0.6,
        codeformer_weight: 0.7,
      },
    };
  }
  next['55'] = {
    class_type: 'CreateVideo',
    inputs: { images: restoreFace ? ['59', 0] : ['29', 0], fps: LTX25_FPS, audio: ['54', 0] },
  };
  next['56'] = {
    class_type: 'SaveVideo',
    inputs: { video: ['55', 0], filename_prefix: prefix, format: 'mp4', codec: 'h264' },
  };
  delete next['30'];
}

/** Longest spoken line a ~4 s clip can carry (about 14 words at a natural pace). */
export const SPOKEN_LINE_MAX_CHARS = 90;

/** Tidy a typed line: one line, straight quotes stripped, capped to what a clip can say. */
export function normalizeSpokenLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  const line = value
    .replace(/[\r\n]+/g, ' ')
    .replace(/["\u201c\u201d]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= SPOKEN_LINE_MAX_CHARS) return line;
  const cut = line.slice(0, SPOKEN_LINE_MAX_CHARS);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trim();
}

/**
 * Add the line to a clip prompt the way LTX speaks it (live 2026-10-09: 13/13 clips said the
 * quoted words exactly, lip-synced): the speaker faces the camera and "says clearly".
 */
export function withSpokenLine(prompt: string, line: string, speaker = 'She'): string {
  const clean = normalizeSpokenLine(line);
  const base = prompt.trim().replace(/[.!?]?$/, '.');
  if (!clean) return prompt;
  return `${base} ${speaker} looks toward the camera and says clearly, "${clean}"`;
}

/** The SaveVideo node a talking clip's MP4 comes out of (see addLtx25Speech). */
export const LTX25_SPEECH_SAVE_NODE = '56';

/**
 * A standalone talking clip graph (voice auditions): one still, a prompt with the quoted line,
 * LTX-2.5 with its soundtrack saved as an MP4. Built from the same WAN stub the queue converts.
 */
export function buildLtx25TalkingClipGraph(input: {
  image: string;
  prompt: string;
  seed: number;
  prefix: string;
  /** WAN-graph frames at 16 fps (80 ≈ 5 s). */
  frames?: number;
  voiceSample?: string;
  idLora?: string;
}): Workflow {
  const stub: Workflow = {
    '1': { class_type: 'LoadImage', inputs: { image: input.image } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['9', 0] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['9', 0] } },
    '4': {
      class_type: 'WanImageToVideo',
      inputs: { width: 768, height: 1024, length: input.frames ?? 80, start_image: ['1', 0] },
    },
    '5': {
      class_type: 'KSampler',
      inputs: { seed: input.seed, positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 2] },
    },
    '6': { class_type: 'SaveAnimatedWEBP', inputs: { filename_prefix: input.prefix, fps: 16 } },
    '9': { class_type: 'CLIPLoader', inputs: {} },
  };
  const { workflow, converted, reason } = convertVideoWorkflowToLtx25(stub, {
    seed: input.seed,
    sizeFromStill: true,
    speech: { voiceSample: input.voiceSample, idLora: input.idLora },
  });
  if (!converted) throw new Error(reason ?? 'Could not build the talking clip.');
  return workflow;
}

/** The SaveVideo node a dubbed clip comes out of (see buildLtx25DubGraph). */
export const LTX25_DUB_SAVE_NODE = '25';

/** LTX frame counts are 8k+1: the most a clip of `frames` (at 24 fps) can give without padding. */
export function ltx25DubFrames(frames: number): number {
  return Math.max(9, 8 * Math.floor((Math.max(9, Math.floor(frames)) - 1) / 8) + 1);
}

/**
 * Add a soundtrack to a finished clip without touching its picture ("Add voice"): the clip is
 * VAE-encoded and frozen (LTXVFreezeLatent), and LTX-2.5 denoises only the audio latent, from the
 * prompt (scene + the quoted line) and what it sees. The output muxes the clip's own frames with
 * the new sound. For two-person adult clips, which stay on WAN (LTX drifts off the act) and are
 * silent. Live (2026-10-09): a WAN straddle clip, 39 s, the line heard word for word.
 */
export function buildLtx25DubGraph(input: {
  /** ComfyUI input video (24 fps, `frames` long). */
  video: string;
  prompt: string;
  frames: number;
  /** Encode size (multiples of 32); the output keeps the clip's own frames. */
  width: number;
  height: number;
  seed: number;
  prefix: string;
}): Workflow {
  const F = LTX25_FILES;
  return {
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
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: input.prompt } },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['2', 0],
        text: 'speech, talking, words, music, background music, distorted audio, robotic voice, silence',
      },
    },
    '7': {
      class_type: 'LTXVConditioning',
      inputs: { positive: ['5', 0], negative: ['6', 0], frame_rate: LTX25_FPS },
    },
    '10': { class_type: 'LoadVideo', inputs: { file: input.video } },
    '11': { class_type: 'GetVideoComponents', inputs: { video: ['10', 0] } },
    '12': {
      class_type: 'ImageScale',
      inputs: {
        image: ['11', 0],
        upscale_method: 'lanczos',
        width: input.width,
        height: input.height,
        crop: 'center',
      },
    },
    '13': { class_type: 'VAEEncode', inputs: { pixels: ['12', 0], vae: ['3', 0] } },
    '14': { class_type: 'LTXVFreezeLatent', inputs: { latent: ['13', 0] } },
    '15': {
      class_type: 'LTXVEmptyLatentAudio',
      inputs: {
        frames_number: input.frames,
        frame_rate: LTX25_FPS,
        batch_size: 1,
        audio_vae: ['4', 0],
      },
    },
    '16': {
      class_type: 'LTXVConcatAVLatent',
      inputs: { video_latent: ['14', 0], audio_latent: ['15', 0] },
    },
    '17': {
      class_type: 'LTXVDualCFGGuider',
      inputs: {
        model: ['1', 0],
        positive: ['7', 0],
        negative: ['7', 1],
        video_cfg: 1,
        audio_cfg: 1,
      },
    },
    '18': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral' } },
    '19': {
      class_type: 'ManualSigmas',
      inputs: { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' },
    },
    '20': { class_type: 'RandomNoise', inputs: { noise_seed: input.seed } },
    '21': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['20', 0],
        guider: ['17', 0],
        sampler: ['18', 0],
        sigmas: ['19', 0],
        latent_image: ['16', 0],
      },
    },
    '22': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['21', 0] } },
    '23': { class_type: 'LTXVAudioVAEDecode', inputs: { samples: ['22', 1], audio_vae: ['4', 0] } },
    '24': {
      class_type: 'CreateVideo',
      inputs: { images: ['11', 0], fps: LTX25_FPS, audio: ['23', 0] },
    },
    [LTX25_DUB_SAVE_NODE]: {
      class_type: 'SaveVideo',
      inputs: { video: ['24', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
    },
  };
}

/**
 * The dub prompt: the scene and its sounds — never words. A dub keeps the clip's picture, so a
 * spoken line could not move the lips: two-person clips voiced with their line looked out of sync
 * (live 2026-10-09, mouth-motion vs loudness correlation 0.34–0.52 against 0.55–0.75 for LTX's own
 * talking clips, and re-rendering the face lightly to follow the audio did not raise it). The
 * slot's line is spoken on clips LTX renders itself.
 */
export function dubPrompt(input: {
  scene: string;
  heat?: 'clean' | 'flirty' | 'sensual' | 'explicit';
  lead?: 'woman' | 'man';
}): string {
  const who = input.lead === 'man' ? 'He' : 'She';
  const scene = input.scene.trim().replace(/[.\s]+$/, '');
  const hot = input.heat === 'sensual' || input.heat === 'explicit';
  return [
    `${scene}.`,
    hot
      ? `${who} breathes heavily and moans softly, with no words.`
      : 'Soft natural sounds of the moment, no talking.',
    hot ? 'Close, intimate sounds, a quiet room.' : 'Natural room sound.',
  ].join(' ');
}

/**
 * A talking clip's whole prompt. The motion template animates the beat ("walking out of the office
 * building … mid-stride") and asks for "no wide-open mouth" — live, she turned and walked out of
 * frame while the line played (2026-10-10). Talking: she stays put, facing the camera, and speaks.
 */
export function talkingClipPrompt(input: {
  /** Where she is (the Setting) — kept as the first frame shows it. */
  setting?: string;
  line: string;
  speaker?: 'She' | 'He';
}): string {
  const who = input.speaker ?? 'She';
  const line = normalizeSpokenLine(input.line);
  const place = input.setting?.trim().replace(/[.\s]+$/, '');
  return [
    'One continuous shot that starts on the first frame.',
    `${who} stops where ${who === 'He' ? 'he' : 'she'} is, looks into the camera and says clearly, "${line}"`,
    `${who === 'He' ? 'His' : 'Her'} lips move with every word; only small natural head and hand movements — ${who === 'He' ? 'he' : 'she'} stays in place, facing the camera, and does not walk away or turn around.`,
    place
      ? `The place stays as in the first frame (${place}); the light and clothes stay the same.`
      : 'The place, light and clothes stay exactly as in the first frame.',
    'Camera: locked-off, framing stays as the first frame.',
  ].join(' ');
}

/**
 * A two-person conversation in one shot: the lead says the line, the other person answers. Live
 * (2026-10-10, a clothed couple in a kitchen, 2 seeds): both lines spoken in order word for word,
 * two voices (her line 225–235 Hz, his reply 154–178 Hz), and the speaker's face moved during
 * their own line.
 */
export function conversationClipPrompt(input: {
  setting?: string;
  line: string;
  reply: string;
  /** Who says the first line, and who answers ('woman' / 'man'). */
  lead?: 'woman' | 'man';
  partner?: 'woman' | 'man';
}): string {
  const lead = input.lead ?? 'woman';
  const partner = input.partner ?? (lead === 'woman' ? 'man' : 'woman');
  const same = lead === partner;
  const first = same ? `One ${lead}` : `The ${lead}`;
  const other = same ? `the other ${partner}` : `the ${partner}`;
  const place = input.setting?.trim().replace(/[.\s]+$/, '');
  return [
    'One continuous shot that starts on the first frame.',
    `${first} turns to ${other} and says, "${normalizeSpokenLine(input.line)}"`,
    `${other.charAt(0).toUpperCase()}${other.slice(1)} answers, "${normalizeSpokenLine(input.reply)}"`,
    'Each speaker’s lips move with their own words; small natural movements only — they stay in place.',
    place
      ? `The place stays as in the first frame (${place}); the light and clothes stay the same.`
      : 'The place, light and clothes stay exactly as in the first frame.',
    'Camera: locked-off, framing stays as the first frame.',
  ].join(' ');
}

/** The other person in a two-person still, read from its prompt (default: the opposite of the lead). */
export function conversationPartnerNoun(
  stillPrompt: string | null | undefined,
  lead: 'woman' | 'man'
): 'woman' | 'man' {
  const text = stillPrompt ?? '';
  if (lead === 'woman') {
    return /\b(her girlfriend|two women|another woman|her female friend)\b/i.test(text)
      ? 'woman'
      : 'man';
  }
  return /\b(his boyfriend|two men|another man|his male friend)\b/i.test(text) ? 'man' : 'woman';
}

/**
 * Extend a clip ("Make it 30 s"): each new segment is guided by the previous one's last
 * {@link LTX25_EXTEND_OVERLAP} frames (LTXVAddGuide at frame 0 on both passes, guides cropped
 * before the upscaler and the decode), so the motion carries over; the stitch then crossfades
 * the overlap. Spike (2026-10-10, 6 × 5 s from a Day still): against starting each segment from
 * the last frame only, the guide held the framing and the clothes (the last-frame chain zoomed in
 * and turned her poncho into a buttoned dress by 15 s); crossfading the overlap took the seam
 * jumps from 2.2–3.4× to 1.0–2.2× normal motion.
 */
export const LTX25_EXTEND_OVERLAP = 17;

/** The SaveVideo node an extension segment comes out of. */
export const LTX25_EXTEND_SAVE_NODE = LTX25_SPEECH_SAVE_NODE;

/** What an extension segment is told: the beat, then hold the people, place and camera. */
export function extendSegmentPrompt(beat: string): string {
  return [
    beat.trim().replace(/\s+/g, ' '),
    'Same people, same clothes, same place and light as the first frames; one continuous shot.',
    'Camera: locked-off, framing stays the same. Natural, smooth, continuous motion.',
    'Only the sound of the room; nobody speaks.',
  ].join(' ');
}

export function buildLtx25ExtendGraph(input: {
  /** The previous segment's last frame (sizes the canvas). */
  lastFrame: string;
  /** Its last {@link LTX25_EXTEND_OVERLAP} frames as an MP4 (a ComfyUI input). */
  tailVideo: string;
  prompt: string;
  seed: number;
  prefix: string;
  /** Long side of the render (the clip's own size), 512–1536. */
  longSide?: number;
  /** ReActor restore model for the face pass, when installed. */
  restoreFace?: string;
}): Workflow {
  const stub: Workflow = {
    '1': { class_type: 'LoadImage', inputs: { image: input.lastFrame } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['9', 0] } },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: 'talking, speech, words, singing, cut, scene change', clip: ['9', 0] },
    },
    '4': {
      class_type: 'WanImageToVideo',
      inputs: { width: 768, height: 1024, length: 121, start_image: ['1', 0] },
    },
    '5': {
      class_type: 'KSampler',
      inputs: { seed: input.seed, positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 2] },
    },
    '6': { class_type: 'SaveAnimatedWEBP', inputs: { filename_prefix: input.prefix, fps: 24 } },
    '9': { class_type: 'CLIPLoader', inputs: {} },
  };
  const { workflow, converted, reason } = convertVideoWorkflowToLtx25(stub, {
    seed: input.seed,
    sizeFromStill: true,
    longSide: input.longSide,
    speech: { restoreFace: input.restoreFace },
  });
  if (!converted) throw new Error(reason ?? 'Could not build the extension.');
  const g = workflow;
  const node = (id: string) => g[id]!.inputs!;
  g['60'] = { class_type: 'LoadVideo', inputs: { file: input.tailVideo } };
  g['61'] = { class_type: 'GetVideoComponents', inputs: { video: ['60', 0] } };
  g['62'] = { class_type: 'ImageScale', inputs: { ...node('9'), image: ['61', 0] } };
  g['63'] = { class_type: 'LTXVPreprocess', inputs: { image: ['62', 0], img_compression: 18 } };
  const guide = (positive: unknown, negative: unknown, latent: unknown): WorkflowNode => ({
    class_type: 'LTXVAddGuide',
    inputs: {
      positive,
      negative,
      vae: ['3', 0],
      latent,
      image: ['63', 0],
      frame_idx: 0,
      strength: 1,
    },
  });
  // Pass 1: the tail replaces the in-place start frame.
  g['64'] = guide(['7', 0], ['7', 1], ['11', 0]);
  node('14').video_latent = ['64', 2];
  node('15').positive = ['64', 0];
  node('15').negative = ['64', 1];
  g['65'] = {
    class_type: 'LTXVCropGuides',
    inputs: { positive: ['64', 0], negative: ['64', 1], latent: ['20', 0] },
  };
  node('22').samples = ['65', 2];
  // Pass 2, on the upscaled latent with its own guider.
  g['66'] = guide(['65', 0], ['65', 1], ['22', 0]);
  node('24').video_latent = ['66', 2];
  g['67'] = {
    class_type: 'LTXVDualCFGGuider',
    inputs: { ...node('15'), positive: ['66', 0], negative: ['66', 1] },
  };
  node('27').guider = ['67', 0];
  g['68'] = {
    class_type: 'LTXVCropGuides',
    inputs: { positive: ['66', 0], negative: ['66', 1], latent: ['28', 0] },
  };
  node('29').samples = ['68', 2];
  return g;
}
