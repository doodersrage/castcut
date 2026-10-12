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
/**
 * Room sound under talking clips. The first version heard her lips on the talking picture and
 * spoke a second, garbled line louder than hers (the user's night clip, 2026-10-11); it now hears
 * a blurred picture and is level-matched by castcut-nodes 1.7.0 (LTX25_AMBIENCE_NODES).
 */
export const ROOM_SOUND_UNDER_TALKING = true;
/** A talking clip's room sound: a sound-only pass mixed under the voice. */
export const LTX25_AMBIENCE_NODES = ['AudioMerge', 'ImageBlur', 'CastcutAudioMatchLevel'] as const;
/** Refine detail (Video `ltxRefine`): Lightricks' IC-LoRA, from the ComfyUI-LTXVideo pack. */
export const LTX25_REFINE_LORA = 'ltx-2.5-22b-ic-lora-refine-details-1.0.safetensors';
export const LTX25_REFINE_NODES = [
  'LTXICLoRALoaderModelOnly',
  'LTXAddVideoICLoRAGuide',
  'LTXVCropGuides',
] as const;

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
/**
 * The tempo line two-person adult clips get on LTX-2.5 (with `motionFrameRate` 12): plain LTX
 * moved about half as much as WAN on the same stills and drifted off the act in 1 of 4. A strong
 * line ("fast, vigorous… never slowing down") overshot to 2–5× WAN and looked sped up; this
 * gentle one sits at ~0.9× WAN on average (four of the user's stills, 2026-10-11) and the user
 * judged the motion right.
 */
export const LTX_FAST_PACE_LINE =
  'Steady, natural rhythmic movement throughout the clip, at a relaxed, realistic pace.';
/**
 * Two-person adult clips on LTX: the anatomy said outright (LTX runs at CFG 1, so the negative
 * prompt cannot do it) — with LTX_PACED_STILL_HOLD it kept genitals one consistent shape.
 */
export const LTX_DUO_ANATOMY_LINE =
  'Both bodies stay anatomically correct in every frame — his genitals stay attached to his body, one penis of the same size and shape, never merging, duplicating or melting into hers.';
/**
 * Long side those clips render at (default 768). 1024 held genital detail clearest and most
 * consistent (768 too small to show it, 1152 no steadier); ~38 s against ~30 s per clip.
 */
export const LTX_PACED_LONG_SIDE = 1024;
/** An adult LTX clip's prompt: the calm tempo line, plus the anatomy line for two people. */
export function withAdultLtxLines(prompt: string, twoPeople: boolean): string {
  return [prompt.trim(), LTX_FAST_PACE_LINE, twoPeople ? LTX_DUO_ANATOMY_LINE : '']
    .filter(Boolean)
    .join(' ');
}
/** How strongly those clips hold the still on the first pass (default 0.7). */
export const LTX_PACED_STILL_HOLD = 0.85;
/**
 * Conditioning frame rate the A/B used to match WAN's pace (they still played at 24 fps). Not
 * used: the user preferred these clips at the same rate as every other LTX clip (2026-10-11).
 */
export const LTX_FAST_PACE_FRAME_RATE = 12;

export function clipEngineForShot(
  videoModel: string,
  shot: {
    adultDuo: boolean;
    /** The player keeps LTX-2.5 for two-person adult clips too (Video `ltxAdultDuo`). */
    keepLtxForAdultDuo?: boolean;
    clothedSolo?: boolean;
    /** False: the player sends clothed one-person clips to WAN (Video `ltxClothedSolo`). */
    keepLtxForClothedSolo?: boolean;
    /** The clip has a spoken line — only LTX-2.5 makes sound, so it runs there whatever is picked. */
    speaking?: boolean;
  }
): string {
  if (shot.speaking && !shot.adultDuo) return LTX25_MODEL_ID;
  // Plain "WAN Video" loads the same Rapid AIO file in Castcut's clip graph (the checkpoint
  // pick prefers it; the one-loader graph can't run full WAN 2.2's two models) — sample it as
  // Rapid AIO, not 40 steps at CFG 5.
  if (videoModel === 'wan-video') return WAN_CLIP_FALLBACK_MODEL;
  if (!isLtx25Model(videoModel)) return videoModel;
  if (shot.adultDuo) return shot.keepLtxForAdultDuo ? videoModel : WAN_CLIP_FALLBACK_MODEL;
  // Clothed one-person clips stay on LTX unless the player opted out: held at 0.85 and 1024, her
  // face stayed closer to the still than on WAN (8 stills, 2026-10-11: 0.55 vs 0.79).
  if (shot.clothedSolo && shot.keepLtxForClothedSolo === false) return WAN_CLIP_FALLBACK_MODEL;
  return videoModel;
}

/**
 * The WAN engine a clip falls back to when LTX-2.5 is picked but can't take the shot: Rapid AIO,
 * the checkpoint the app installs. Plain `wan-video` (DEFAULT_VIDEO_MODEL) loads that same Rapid
 * AIO file but samples like full WAN 2.2 — 40 steps at CFG 5 with uni_pc (seen 2026-10-11 on a
 * Day clip): ~10× slower and overcooked on a CFG-1 model.
 */
export const WAN_CLIP_FALLBACK_MODEL = 'wan-video-rapid-aio';

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
    speech?: { voiceSample?: string; idLora?: string; restoreFace?: string; ambience?: string };
    /**
     * The frame rate LTX is told the clip runs at (default 24, what it plays at). Lower = more
     * movement per frame: two-person adult clips at 12 with LTX_FAST_PACE_LINE move about as much
     * as WAN, and held the act on every still tried (14 clips, 10 of the user's stills).
     */
    motionFrameRate?: number;
    /**
     * How strongly the first pass holds the still (default 0.7). 0.85 kept two-person anatomy the
     * same shape frame to frame where 0.7 let it blob and merge, at about the same motion
     * (reverse-cowgirl and straddling stills, 2026-10-11).
     */
    stillHold?: number;
    /**
     * Refine detail: re-render the finished clip once more through Lightricks' Refine-Details
     * IC-LoRA (this file), guided by its own frames — crisper texture, ~2.3× the time, and it can
     * shift her face a little (2026-10-11). Talking clips keep their voice and lip timing.
     */
    refineLora?: string;
  } = {}
): Ltx25ConvertResult {
  const workflow = input as Workflow;
  const entries = Object.entries(workflow);
  const motionRate =
    typeof options.motionFrameRate === 'number' &&
    options.motionFrameRate >= 8 &&
    options.motionFrameRate <= 30
      ? options.motionFrameRate
      : LTX25_FPS;
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
      inputs: { positive: ['5', 0], negative: ['6', 0], frame_rate: motionRate },
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
      inputs: {
        vae: ['3', 0],
        image: ['10', 0],
        latent: ['11', 0],
        strength:
          typeof options.stillHold === 'number' && options.stillHold > 0 && options.stillHold <= 1
            ? options.stillHold
            : 0.7,
        bypass: false,
      },
    },
    // The distilled model is audio+video; the audio latent rides along (not decoded).
    '13': {
      class_type: 'LTXVEmptyLatentAudio',
      inputs: { frames_number: frames, frame_rate: motionRate, batch_size: 1, audio_vae: ['4', 0] },
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
  if (options.refineLora?.trim()) addLtx25Refine(next, options.refineLora.trim(), seed);
  return { workflow: next, converted: true };
}

/**
 * The refine stage: the decoded clip is the in-context guide for one more 8-step distilled pass
 * at the same size on the Refine-Details IC-LoRA; the guide frames are cropped off and that
 * result is what gets saved. A talking clip keeps its voice: the refine pass sees the spoken
 * audio frozen (so the lips stay on the words) and the MP4 takes the audio decoded before it.
 */
function addLtx25Refine(next: Workflow, lora: string, seed: number): void {
  const talking = Boolean(next['55']);
  const length = next['11']?.inputs?.length;
  if ((!next['30'] && !talking) || !next['29'] || !next['7'] || !next['13']) return;
  if (talking) {
    next['93'] = { class_type: 'LTXVFreezeLatent', inputs: { latent: ['28', 1] } };
  }
  next['80'] = {
    class_type: 'LTXICLoRALoaderModelOnly',
    inputs: { model: ['1', 0], lora_name: lora, strength_model: 1 },
  };
  next['81'] = { class_type: 'GetImageSize', inputs: { image: ['29', 0] } };
  next['82'] = {
    class_type: 'EmptyLTXVLatentVideo',
    inputs: { width: ['81', 0], height: ['81', 1], length, batch_size: 1 },
  };
  next['83'] = {
    class_type: 'LTXAddVideoICLoRAGuide',
    inputs: {
      positive: ['7', 0],
      negative: ['7', 1],
      vae: ['3', 0],
      latent: ['82', 0],
      image: ['29', 0],
      frame_idx: 0,
      strength: 1,
      latent_downscale_factor: 1,
      crop: 'disabled',
      use_tiled_encode: false,
      tile_size: 256,
      tile_overlap: 64,
    },
  };
  next['84'] = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['83', 2], audio_latent: talking ? ['93', 0] : ['13', 0] },
  };
  next['85'] = {
    class_type: 'CFGGuider',
    inputs: { model: ['80', 0], positive: ['83', 0], negative: ['83', 1], cfg: 1 },
  };
  next['86'] = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } };
  next['87'] = {
    class_type: 'ManualSigmas',
    inputs: { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' },
  };
  next['88'] = { class_type: 'RandomNoise', inputs: { noise_seed: seed + 2 } };
  next['89'] = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['88', 0],
      guider: ['85', 0],
      sampler: ['86', 0],
      sigmas: ['87', 0],
      latent_image: ['84', 0],
    },
  };
  next['90'] = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['89', 0] } };
  next['91'] = {
    class_type: 'LTXVCropGuides',
    inputs: { positive: ['83', 0], negative: ['83', 1], latent: ['90', 0] },
  };
  next['92'] = {
    class_type: 'VAEDecodeTiled',
    inputs: { ...next['29'].inputs, samples: ['91', 2] },
  };
  // Whatever showed the decoded clip (the WebP save; a talking clip's face pass and MP4) now
  // shows the refined one.
  for (const id of ['30', '55', '59']) {
    const inputs = next[id]?.inputs;
    if (!inputs) continue;
    for (const key of ['images', 'image']) {
      const value = inputs[key];
      if (Array.isArray(value) && value[0] === '29') inputs[key] = ['92', 0];
    }
  }
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
  speech: { voiceSample?: string; idLora?: string; restoreFace?: string; ambience?: string },
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
  const place = speech.ambience?.trim();
  if (place && !next['46']) addLtx25TalkingAmbience(next, place);
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

/** How a line is said (the "How" choice beside a line). */
export type SpokenLineTone =
  | 'natural'
  | 'whisper'
  | 'laughing'
  | 'excited'
  | 'tender'
  | 'teasing'
  | 'angry'
  | 'nervous'
  | 'scared'
  | 'shouting'
  | 'singsong';

export const SPOKEN_LINE_TONES: { id: SpokenLineTone; label: string }[] = [
  { id: 'natural', label: 'Natural' },
  { id: 'whisper', label: 'Whisper' },
  { id: 'laughing', label: 'Laughing' },
  { id: 'excited', label: 'Excited' },
  { id: 'tender', label: 'Tender' },
  { id: 'teasing', label: 'Teasing' },
  { id: 'angry', label: 'Angry' },
  { id: 'nervous', label: 'Nervous' },
  { id: 'scared', label: 'Scared' },
  { id: 'shouting', label: 'Shouting' },
  { id: 'singsong', label: 'Sing-song' },
];

/** A stored tone, or undefined for natural / unknown values. */
export function normalizeSpokenLineTone(value: unknown): SpokenLineTone | undefined {
  return typeof value === 'string' &&
    value !== 'natural' &&
    SPOKEN_LINE_TONES.some(tone => tone.id === value)
    ? (value as SpokenLineTone)
    : undefined;
}

/**
 * The speech verb for a tone ("says clearly" when natural). Live (2026-10-10, same line, two
 * stills, same seed): every tone kept the words exact (14/14); whisper −6 to −7 LU and breathy
 * (voiced 34–43% vs 73–75%, flat pitch), excited / angry pitch ~254 → 360–410 Hz, tender ~190 Hz
 * steady, laughing ~320 Hz, teasing a little quieter and lower.
 */
export function spokenLineVerb(
  tone: SpokenLineTone | undefined,
  speaker: 'She' | 'He' = 'She'
): string {
  const her = speaker === 'He' ? 'his' : 'her';
  switch (tone) {
    case 'whisper':
      return 'leans in and whispers, in a soft breathy whisper,';
    case 'laughing':
      return `laughs and says through ${her} laughter,`;
    case 'excited':
      return `says excitedly, ${her} voice bright, loud and fast,`;
    case 'tender':
      return `says softly and tenderly, ${her} voice warm and gentle,`;
    case 'teasing':
      return 'says in a playful, teasing tone with a little smirk,';
    case 'angry':
      return `snaps angrily, ${her} voice sharp and raised,`;
    // Live 2026-10-11 (same still, line and seed; words exact in every clip, vs natural ~195 Hz,
    // −15.7 LUFS, 60% voiced): nervous 252 Hz with a wide wobble, 35% voiced (breaks);
    // scared louder (−12.9) and faster; shouting +3.5 LU at 380 Hz, flat, ending on "!";
    // sing-song 278 Hz, 80% voiced, slower.
    case 'nervous':
      return `says nervously, hesitating, ${her} voice shaky and quick,`;
    case 'scared':
      return `gasps and says fearfully, ${her} voice small, breathless and frightened,`;
    case 'shouting':
      return `shouts at the top of ${her} voice, calling out loudly,`;
    case 'singsong':
      return 'sings the words in a light, lilting sing-song melody,';
    default:
      return 'says clearly,';
  }
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
  /** Where it happens (the Setting) — names the ambience the clip gets. */
  place?: string;
}): string {
  const who = input.lead === 'man' ? 'He' : 'She';
  const scene = input.scene.trim().replace(/[.\s]+$/, '');
  const hot = input.heat === 'sensual' || input.heat === 'explicit';
  const place = input.place?.trim().replace(/[.\s]+$/, '');
  const ambience = place ? ambienceSounds(place) : '';
  return [
    `${scene}.`,
    hot
      ? `${who} breathes heavily and moans softly, with no words.`
      : 'Soft natural sounds of the moment, no talking.',
    place
      ? `The natural background sound of ${place}${ambience ? `: ${ambience}` : ''}, clearly audible.`
      : hot
        ? 'Close, intimate sounds, a quiet room.'
        : 'Natural room sound.',
  ].join(' ');
}

const AMBIENCE: Array<[RegExp, string]> = [
  [/\b(beach|shore|shoreline|bay|ocean|sea|surf|coast)\b/i, 'waves breaking, wind, distant gulls'],
  [/\b(pool|poolside)\b/i, 'water lapping, distant splashes'],
  [/\b(rain|storm)\b/i, 'steady rain, drops on glass'],
  [
    /\b(caf[eé]|coffee shop|bistro|brunch|restaurant|diner|terrace)\b/i,
    'low murmur of other guests, cups and cutlery clinking',
  ],
  [/\b(bar|pub|club|lounge)\b/i, 'a busy room murmuring, glasses clinking'],
  [/\b(fountain|plaza|piazza)\b/i, 'a fountain splashing, footsteps and voices across the square'],
  [
    /\b(shop|store|boutique|bookstore|bookshop|record|vinyl|mall|pharmacy|bakery|florist)\b/i,
    'soft footsteps, people browsing, a door chime, a quiet hum',
  ],
  [
    /\b(street|city|downtown|crosswalk|sidewalk|market|square)\b/i,
    'city traffic, footsteps, a distant siren',
  ],
  [
    /\b(park|garden|bench|meadow|lawn)\b/i,
    'birdsong, a light breeze in the trees, distant traffic',
  ],
  [/\b(forest|woods|trail|hike|mountain)\b/i, 'birds, wind in leaves, twigs underfoot'],
  [/\b(kitchen)\b/i, 'a kettle, dishes, a fridge humming'],
  [
    /\b(office|desk|meeting|coworking)\b/i,
    'keyboards tapping, air conditioning hum, a phone in the distance',
  ],
  [/\b(gym|studio|court|track)\b/i, 'weights clanking, footsteps, a ventilation hum'],
  [/\b(car|train|bus|subway|plane)\b/i, 'the engine hum and road noise'],
  [/\b(bath|bathroom|shower)\b/i, 'running water, a tiled-room echo'],
  [
    /\b(bedroom|bed|living room|sofa|couch|apartment|home)\b/i,
    'quiet room tone, a clock, faint traffic outside',
  ],
];

/**
 * Things in a scene that keep moving while she stands still, by the words that name them. A
 * talking clip only describes her, so LTX froze the rest — the user's coffee clip: "That coffee
 * steam's doing a little dance in the sun", and the steam never moved (2026-10-11).
 */
const SCENE_MOTION: Array<[RegExp, string]> = [
  [
    /\b(coffee|tea|latte|cappuccino|espresso|cocoa|hot chocolate|steam(?:ing)?|soup|ramen)\b/i,
    'wisps of steam keep rising and curling from the hot drink',
  ],
  [/\b(candle|candles|candlelight|candlelit)\b/i, 'the candle flames flicker'],
  [/\b(fireplace|campfire|bonfire|fire pit)\b/i, 'the flames of the fire dance'],
  [/\b(fountain)\b/i, 'the fountain keeps splashing'],
  [
    /\b(sea|ocean|waves?|beach|bay|harbou?r|marina|lake|river|canal|pool|boats?)\b/i,
    'the water keeps moving',
  ],
  [/\b(rain|raining|drizzle)\b/i, 'rain keeps falling'],
  [/\b(snow|snowing|snowfall)\b/i, 'snow keeps falling'],
  [
    /\b(trees?|leaves|park|garden|forest|woods|meadow|grass|palm)\b/i,
    'leaves sway in a light breeze',
  ],
  [
    /\b(market|street|plaza|square|caf[eé]|terrace|station|crowd|festival|mall|bar)\b/i,
    'people in the background keep moving',
  ],
  [/\b(curtains?|drapes|flags?|banners?|umbrellas?)\b/i, 'fabric stirs in the breeze'],
];

/** "Around her, …" — up to two things in the scene that keep moving ("" when none named). */
export function sceneMotionCues(text: string, speaker: 'She' | 'He' = 'She'): string {
  const cues = SCENE_MOTION.filter(([pattern]) => pattern.test(text)).map(([, cue]) => cue);
  if (!cues.length) return '';
  const list = cues.slice(0, 2).join(', and ');
  return `Around ${speaker === 'He' ? 'him' : 'her'} the scene stays alive: ${list}.`;
}

/** Where a talking clip's room sound sits under her spoken level (dB). */
export const LTX25_TALK_AMBIENCE_DB = -20;

/**
 * A talking clip's room sound. Asking for it in the talking prompt did nothing measurable — the
 * background stayed at the same level with or without it (6 pairs, 2026-10-11) — so it gets its
 * own sound-only pass, as Add sound does, on a blurred copy of the first pass's picture, matched
 * LTX25_TALK_AMBIENCE_DB under her spoken level and added under her voice. Not with an end pose
 * (that draft carries extra guide frames).
 */
function addLtx25TalkingAmbience(next: Workflow, place: string): void {
  const audio = next['13']?.inputs;
  if (!next['20'] || !audio || !next['55']?.inputs) return;
  const sounds = ambienceSounds(place);
  next['100'] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      clip: ['2', 0],
      text: `The natural background sound of ${place}${sounds ? `: ${sounds}` : ''}, clearly audible. No talking close by, no music.`,
    },
  };
  next['101'] = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: ['2', 0], text: 'speech, talking, words, music, background music, silence' },
  };
  next['102'] = {
    class_type: 'LTXVConditioning',
    inputs: { positive: ['100', 0], negative: ['101', 0], frame_rate: LTX25_FPS },
  };
  // The sound pass hears a blurred picture: on the sharp one it read her lips and spoke a second,
  // garbled line (the user's night clip); on a frozen still it made silence. Blurred (radius 31),
  // the room tracks of 3 of the user's clips held no words (2026-10-11).
  next['113'] = { class_type: 'VAEDecode', inputs: { samples: ['20', 0], vae: ['3', 0] } };
  next['114'] = {
    class_type: 'ImageBlur',
    inputs: { image: ['113', 0], blur_radius: 31, sigma: 10 },
  };
  next['115'] = { class_type: 'VAEEncode', inputs: { pixels: ['114', 0], vae: ['3', 0] } };
  next['103'] = { class_type: 'LTXVFreezeLatent', inputs: { latent: ['115', 0] } };
  next['104'] = {
    class_type: 'LTXVEmptyLatentAudio',
    inputs: {
      frames_number: audio.frames_number,
      frame_rate: audio.frame_rate,
      batch_size: 1,
      audio_vae: ['4', 0],
    },
  };
  next['105'] = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['103', 0], audio_latent: ['104', 0] },
  };
  next['106'] = {
    class_type: 'LTXVDualCFGGuider',
    inputs: {
      model: ['1', 0],
      positive: ['102', 0],
      negative: ['102', 1],
      video_cfg: 1,
      audio_cfg: 1,
    },
  };
  const seed = Number(next['18']?.inputs?.noise_seed) || 0;
  next['107'] = { class_type: 'RandomNoise', inputs: { noise_seed: seed + 3 } };
  next['108'] = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['107', 0],
      guider: ['106', 0],
      sampler: ['16', 0],
      sigmas: ['17', 0],
      latent_image: ['105', 0],
    },
  };
  next['109'] = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['108', 0] } };
  next['110'] = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: ['109', 1], audio_vae: ['4', 0] },
  };
  // The pass's level varies by ~30 dB from clip to clip (−32 to −64 dB on the same three), so it
  // is matched to her spoken level rather than boosted by a fixed amount (castcut-nodes 1.7.0).
  next['111'] = {
    class_type: 'CastcutAudioMatchLevel',
    inputs: {
      audio: ['110', 0],
      reference: next['55'].inputs.audio,
      offset_db: LTX25_TALK_AMBIENCE_DB,
    },
  };
  next['112'] = {
    class_type: 'AudioMerge',
    inputs: { audio1: next['55'].inputs.audio, audio2: ['111', 0], merge_method: 'add' },
  };
  next['55'].inputs.audio = ['112', 0];
}

/**
 * The still holds an arm or hand up — waving, raised overhead, pointing, a hand to the hair or
 * ear, elbow up. Kept as is, the wave (and a hair-tuck) stayed frozen for the whole line;
 * "finish the movement and settle" lowered it but walked her off. The strict hold with one
 * exception — she lowers the raised hand — lowered it on 4 of 4 (wave, hair-tuck; 2026-10-11).
 */
export function stillHeldGesture(stillPrompt: string | null | undefined): boolean {
  return /\b(waving|waves|(?:arms?|hands?) raised|raised (?:high )?overhead|one (?:arm|hand) raised|pointing|reaching up|high-fiv\w*|cheering|blowing a kiss|elbows? (?:up|out|raised)|hands? (?:to|on|in|behind) (?:her |his )?(?:hair|head|ear|neck|face)|touching (?:her |his )?(?:hair|ear|face|neck)|tucking (?:her |his )?hair|adjusting (?:her |his )?(?:hair|earring|strap))\b/i.test(
    String(stillPrompt ?? '')
  );
}

/**
 * The still caught her mid-movement — walking, a stride, a spin, a dance, a jump — by the words
 * the still was made from (Day's "She walks mid-step…", "Moment: … mid-spin"). Climbing is not
 * counted: settling on stairs turned her round and up them.
 */
export function stillInMotion(stillPrompt: string | null | undefined): boolean {
  return /\b(walks|walking|mid-step|mid-stride|strid(?:e|ing)|strolling|mid-spin|spinning|twirl(?:s|ing)?|mid-twirl|dancing|dances|jumping|mid-jump|mid-air|leaping|knee lifted|running|jogging)\b/i.test(
    String(stillPrompt ?? '')
  );
}

/** Typical background sounds of a place, as a hint for the soundtrack ("" when unknown). */
export function ambienceSounds(place: string): string {
  const night = /\b(night|midnight|3 a\.m\.|late|after dark|blue hour)\b/i.test(place);
  const hit = AMBIENCE.find(([pattern]) => pattern.test(place))?.[1] ?? '';
  return hit && night ? `${hit}, hushed for the late hour` : hit;
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
  /** How the line is said (default: clearly). */
  tone?: SpokenLineTone;
  /**
   * A full-body still kept whole: LTX punched in to a face close-up within ~1.5 s on 7 of 8
   * same-seed replays of the user's florist clip (2026-10-11), whatever the camera words said;
   * an end-frame guide only dissolved back out. Calling it a wide shot and not having her
   * address the camera held the wide framing 8 of 8 (an Excited line still stood her up and
   * tightened to a mid shot in 2 of 4).
   */
  wide?: boolean;
  /**
   * How a still kept whole is framed (talking-clip-framing.ts): `wide` and `mid` both get the
   * wide-shot wording (no "looks into the camera", which drew LTX in to her face).
   */
  framing?: 'wide' | 'mid' | 'close';
  /**
   * The still caught her mid-movement (stillInMotion): a wide clip has her finish it and settle,
   * instead of holding a frozen stride or spin while she talks.
   */
  inMotion?: boolean;
  /**
   * The still shows her seated or lying (stillPostureFromBody, else the still's words): she gets
   * the seated hold. Only then — the face-size band said "mid" for a standing, waving still,
   * and the seated words sat her down.
   */
  seated?: boolean;
  /** The still holds an arm up (stillHeldGesture): she lowers it, keeping her spot. */
  heldGesture?: boolean;
}): string {
  const who = input.speaker ?? 'She';
  const line = normalizeSpokenLine(input.line);
  const place = input.setting?.trim().replace(/[.\s]+$/, '');
  const she = who === 'He' ? 'he' : 'she';
  // What keeps moving around her (steam, water, leaves …), from the place and the line itself.
  // Without it the scene froze; with it the coffee steam rose and curled on 2 of 2 seeds
  // (2026-10-11). "The place stays as in the first frame" read as "freeze it", so with cues the
  // place is only named.
  const cues = sceneMotionCues(`${input.line} ${place ?? ''}`, who);
  const placeLine = place
    ? cues
      ? `The place is the one in the first frame (${place}); the light and clothes stay the same. ${cues}`
      : `The place stays as in the first frame (${place}); the light and clothes stay the same.`
    : ['The place, light and clothes stay exactly as in the first frame.', cues]
        .filter(Boolean)
        .join(' ');
  // Mid (seated / knees-up) stills take the wide wording too: replaying the user's park-bench
  // still (angry line, 4 seeds, 2026-10-11) the wide wording held the frame in 2 of 4 — 4 of 4
  // once it keeps her pose — and a "medium-wide, same distance" wording in 0 of 4.
  if (input.wide || input.framing === 'wide' || input.framing === 'mid') {
    return [
      'Wide shot, full body, seen from a few metres away — one continuous shot that starts on the first frame.',
      // Seated (the still's pose says so): keeping the first frame's pose stopped strong lines
      // standing her up — the park-bench replays (angry line, 4 seeds) held seated and
      // full-frame 4 of 4, against 2 of 4 without. Not seated: those words sat her down on the
      // pavement on 6 of 6 standing replays (coffee, fountain, harbor) and on a standing, waving
      // still whose face size read "mid"; a hold without posture words kept her standing 8 of 8.
      // Mid-movement (a stride, a spin, a dance with a knee up): holding the first frame froze her
      // mid-stride or arms-up for the whole line, or she walked into a close-up; finishing the
      // movement and settling held wide and standing on 8 of 8 (walking, spinning, dancing
      // stills, 2026-10-11). Climbing stairs is left out — she turned and walked on up.
      input.seated
        ? `${who} stays where ${she} is, in the same pose as the first frame — sitting or lying, ${she} stays that way — and ${spokenLineVerb(input.tone, who)} "${line}"`
        : input.inMotion
          ? `${who} finishes the movement ${she} is in and settles into a natural, balanced pose where ${she} is, both feet on the ground, and ${spokenLineVerb(input.tone, who)} "${line}"`
          : input.heldGesture
            ? `${who} keeps exactly the pose and position of the first frame, except that ${she} lowers ${who === 'He' ? 'his' : 'her'} raised hand naturally, and ${spokenLineVerb(input.tone, who)} "${line}"`
            : `${who} keeps exactly the pose and position of the first frame and ${spokenLineVerb(input.tone, who)} "${line}"`,
      input.seated
        ? `${who === 'He' ? 'His' : 'Her'} lips move with every word; only small natural head and hand movements — ${she} stays in place, and does not stand up, walk away or turn around.`
        : input.inMotion
          ? `${who === 'He' ? 'His' : 'Her'} lips move with every word; then ${who === 'He' ? 'his' : 'her'} body stays still — ${she} does not start another movement, walk away or turn around.`
          : `${who === 'He' ? 'His' : 'Her'} lips move with every word; only small natural head and hand movements — ${who === 'He' ? 'his' : 'her'} body stays still, and ${she} does not walk away or turn around.`,
      placeLine,
      `Camera: locked-off wide shot — the framing stays exactly as the first frame, ${who === 'He' ? 'his' : 'her'} whole body in view from head to feet; the camera does not move, zoom or push in, and there is no close-up.`,
    ].join(' ');
  }
  return [
    'One continuous shot that starts on the first frame.',
    `${who} stops where ${who === 'He' ? 'he' : 'she'} is, looks into the camera and ${spokenLineVerb(input.tone, who)} "${line}"`,
    `${who === 'He' ? 'His' : 'Her'} lips move with every word; only small natural head and hand movements — ${who === 'He' ? 'he' : 'she'} stays in place, facing the camera, and does not walk away or turn around.`,
    placeLine,
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
  /** How the first line is said (default: plainly). */
  tone?: SpokenLineTone;
}): string {
  const lead = input.lead ?? 'woman';
  const partner = input.partner ?? (lead === 'woman' ? 'man' : 'woman');
  const same = lead === partner;
  const first = same ? `One ${lead}` : `The ${lead}`;
  const other = same ? `the other ${partner}` : `the ${partner}`;
  const place = input.setting?.trim().replace(/[.\s]+$/, '');
  return [
    'One continuous shot that starts on the first frame.',
    `${first} turns to ${other} and ${input.tone && input.tone !== 'natural' ? spokenLineVerb(input.tone, lead === 'man' ? 'He' : 'She') : 'says,'} "${normalizeSpokenLine(input.line)}"`,
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

/**
 * What an extension segment is told: the beat, then hold the people, place and camera. Live
 * (2026-10-10, a directed "kiss goodbye and head out" in a kitchen): the kiss went to an extreme
 * close-up and the next part rebuilt the room as a café full of strangers — the place is named in
 * every part, and close-ups and other people are ruled out.
 */
export function extendSegmentPrompt(
  beat: string,
  place?: string,
  speech?: { line?: string; speaker?: 'She' | 'He'; tone?: SpokenLineTone }
): string {
  const setting = place?.trim().replace(/[.\s]+$/, '');
  const line = normalizeSpokenLine(speech?.line);
  const who = speech?.speaker ?? 'She';
  return [
    beat.trim().replace(/\s+/g, ' '),
    // A part with a line talks like a talking clip, while doing its beat.
    line
      ? `As ${who === 'He' ? 'he' : 'she'} does, ${who === 'He' ? 'he' : 'she'} ${spokenLineVerb(speech?.tone, who)} "${line}" — ${who === 'He' ? 'his' : 'her'} lips move with every word.`
      : '',
    setting
      ? `The place stays the same (${setting}), with the same light; one continuous shot.`
      : 'Same place and light as the first frames; one continuous shot.',
    'Same people and clothes; no one else appears.',
    'Camera: locked-off, the framing stays as wide as the first frames — no close-ups. Natural, smooth, continuous motion.',
    // "Nobody speaks" made LTX write digital silence (−91 dB, live 2026-10-10); describing the
    // place's sound gives room tone and movement (peaks about −32 dB) and no speech — speech
    // stays in the negative.
    line
      ? ''
      : `Sound: the natural sound of ${setting ? `the ${setting.replace(/^(a|an|the)\s+/i, '')}` : 'the place'} — soft room tone, the small sounds of what is happening, footsteps and clothes moving.`,
  ]
    .filter(Boolean)
    .join(' ');
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
  /** The part says a line: speech is no longer in the negative. */
  speaks?: boolean;
}): Workflow {
  const stub: Workflow = {
    '1': { class_type: 'LoadImage', inputs: { image: input.lastFrame } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['9', 0] } },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: input.speaks
          ? 'cut, scene change'
          : 'talking, speech, words, singing, cut, scene change',
        clip: ['9', 0],
      },
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
