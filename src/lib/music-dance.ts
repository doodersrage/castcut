/**
 * "Dance to this music": a still's person dances to a song on Wan-Dancer (Comfy-Org/Wan-Dancer,
 * Apache-2.0; ComfyUI's WanDancerVideo), the official template's two stages — the global model
 * plans 149 keyframes from the whole song, the local model renders each ~5 s segment between
 * them at 30 fps (the nodes' own rate). The style and how big the moves are go in as the Wan
 * team's own (Chinese) prompt words. Client-safe: graph and choices only.
 */

export const MUSIC_DANCE_SAVE_NODE = '900';
/** The Wan-Dancer nodes time audio and keyframes at 30 fps; written slower, the dance lags the beat. */
export const MUSIC_DANCE_FPS = 30;
/** Frames per segment (the model's window). */
export const MUSIC_DANCE_SEGMENT = 149;
/** Longest song taken, in seconds (the template's top choice). */
export const MUSIC_DANCE_MAX_SECONDS = 30;

export const MUSIC_DANCE_MODELS = {
  global: 'wan2.2_dancer_14b_global_fp8_scaled.safetensors',
  local: 'wan2.2_dancer_14b_local_fp8_scaled.safetensors',
  lora: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
  clip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  clipVision: 'clip_vision_h.safetensors',
  vae: 'Wan2_1_VAE_bf16.safetensors',
} as const;

/** The Wan team's style options (the template's), with the words the model was trained on. */
export const MUSIC_DANCE_STYLES = [
  { id: 'street', label: 'Street', words: '街舞' },
  { id: 'kpop', label: 'K-pop', words: '韩舞' },
  { id: 'latin', label: 'Latin', words: '拉丁舞' },
  { id: 'classic', label: 'Chinese classical', words: '古典舞' },
  { id: 'tap', label: 'Tap', words: '踢踏舞' },
] as const;

export const MUSIC_DANCE_AMPLITUDES = [
  { id: 'low', label: 'Small moves', words: '低' },
  { id: 'medium', label: 'Medium', words: '中等' },
  { id: 'high', label: 'Big moves', words: '高' },
  { id: 'max', label: 'All out', words: '最大' },
] as const;

export type MusicDanceStyle = (typeof MUSIC_DANCE_STYLES)[number]['id'];
export type MusicDanceAmplitude = (typeof MUSIC_DANCE_AMPLITUDES)[number]['id'];

/** Segments for a song of `seconds` (the template: 5 s → 1, 10 s → 2 … 30 s → 6). */
export function musicDanceSegments(seconds: number): number {
  const capped = Math.min(Math.max(seconds, 1), MUSIC_DANCE_MAX_SECONDS);
  return Math.max(1, Math.min(6, Math.round(capped / 5)));
}

/**
 * Near 480p from the still's shape: long side 832, short side a multiple of 32. The music
 * injector splits each frame's patches (w/16 × h/16) into eight — 624×832 (39 × 52) failed in
 * ComfyUI with "can't divide axis … in chunks of 304"; 640×832 (40 × 52) divides.
 */
export function musicDanceSize(width: number, height: number): { width: number; height: number } {
  const long = 832;
  const short = Math.max(
    256,
    Math.round(((Math.min(width, height) / Math.max(1, width, height)) * long) / 32) * 32
  );
  return width >= height ? { width: long, height: short } : { width: short, height: long };
}

const NEGATIVE =
  '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';

export function musicDancePrompts(
  style: MusicDanceStyle | string,
  amplitude: MusicDanceAmplitude | string
): { global: string; local: string } {
  const styleWords = MUSIC_DANCE_STYLES.find(entry => entry.id === style)?.words ?? '街舞';
  const amp = MUSIC_DANCE_AMPLITUDES.find(entry => entry.id === amplitude)?.words ?? '中等';
  const global = `一个人正在跳舞，舞蹈种类是${styleWords}`;
  return { global, local: `${global},图像清晰程度高,人物动作幅度${amp}` };
}

export function buildMusicDanceGraph(input: {
  /** ComfyUI input names. */
  image: string;
  audio: string;
  style: MusicDanceStyle | string;
  amplitude: MusicDanceAmplitude | string;
  width: number;
  height: number;
  seconds: number;
  seed: number;
  prefix: string;
}): Record<string, unknown> {
  const prompts = musicDancePrompts(input.style, input.amplitude);
  const segments = musicDanceSegments(input.seconds);
  const duration = Math.min(input.seconds, MUSIC_DANCE_MAX_SECONDS);
  return {
    // Shared
    '1': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: MUSIC_DANCE_MODELS.clip, type: 'wan', device: 'default' },
    },
    '2': { class_type: 'CLIPVisionLoader', inputs: { clip_name: MUSIC_DANCE_MODELS.clipVision } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MUSIC_DANCE_MODELS.vae } },
    '4': { class_type: 'LoadImage', inputs: { image: input.image } },
    '5': {
      class_type: 'ResizeImageMaskNode',
      inputs: {
        input: ['4', 0],
        resize_type: 'scale dimensions',
        'resize_type.width': input.width,
        'resize_type.height': input.height,
        'resize_type.crop': 'center',
        scale_method: 'lanczos',
      },
    },
    '6': {
      class_type: 'CLIPVisionEncode',
      inputs: { clip_vision: ['2', 0], image: ['5', 0], crop: 'none' },
    },
    '7': { class_type: 'LoadAudio', inputs: { audio: input.audio } },
    '8': { class_type: 'TrimAudioDuration', inputs: { audio: ['7', 0], start_index: 0, duration } },
    '9': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 0], text: NEGATIVE } },
    // Stage 1: the global model plans the keyframes from the whole song (6 distilled steps).
    '10': {
      class_type: 'UNETLoader',
      inputs: { unet_name: MUSIC_DANCE_MODELS.global, weight_dtype: 'default' },
    },
    '11': {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['10', 0], lora_name: MUSIC_DANCE_MODELS.lora, strength_model: 3 },
    },
    '12': { class_type: 'ModelSamplingSD3', inputs: { model: ['11', 0], shift: 5 } },
    '13': {
      class_type: 'SkipLayerGuidanceDiTSimple',
      inputs: {
        model: ['12', 0],
        double_layers: '9',
        single_layers: '',
        start_percent: 0,
        end_percent: 1,
      },
    },
    '14': {
      class_type: 'WanDancerEncodeAudio',
      inputs: { audio: ['8', 0], video_frames: MUSIC_DANCE_SEGMENT, audio_inject_scale: 1 },
    },
    '15': {
      class_type: 'StringConcatenate',
      inputs: { string_a: prompts.global, string_b: ['14', 1], delimiter: ' ' },
    },
    '16': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 0], text: ['15', 0] } },
    '17': {
      class_type: 'WanDancerVideo',
      inputs: {
        positive: ['16', 0],
        negative: ['9', 0],
        vae: ['3', 0],
        width: input.width,
        height: input.height,
        length: MUSIC_DANCE_SEGMENT,
        clip_vision_output: ['6', 0],
        clip_vision_output_ref: ['6', 0],
        start_image: ['5', 0],
        audio_encoder_output: ['14', 0],
      },
    },
    '18': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '19': {
      class_type: 'BasicScheduler',
      inputs: { model: ['13', 0], scheduler: 'simple', steps: 6, denoise: 1 },
    },
    '20': { class_type: 'RandomNoise', inputs: { noise_seed: input.seed } },
    '21': {
      class_type: 'CFGGuider',
      inputs: { model: ['13', 0], positive: ['17', 0], negative: ['17', 1], cfg: 1 },
    },
    '22': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['20', 0],
        guider: ['21', 0],
        sampler: ['18', 0],
        sigmas: ['19', 0],
        latent_image: ['17', 2],
      },
    },
    '23': {
      class_type: 'LatentCutToBatch',
      inputs: { samples: ['22', 0], dim: 't', slice_size: 1 },
    },
    '24': { class_type: 'VAEDecode', inputs: { samples: ['23', 0], vae: ['3', 0] } },
    // Stage 2: the local model renders each segment between the keyframes at 30 fps.
    '30': {
      class_type: 'UNETLoader',
      inputs: { unet_name: MUSIC_DANCE_MODELS.local, weight_dtype: 'default' },
    },
    '31': {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['30', 0], lora_name: MUSIC_DANCE_MODELS.lora, strength_model: 1.03 },
    },
    '32': {
      class_type: 'WanDancerPadKeyframesList',
      inputs: {
        images: ['24', 0],
        segment_length: MUSIC_DANCE_SEGMENT,
        num_segments: segments,
        audio: ['8', 0],
      },
    },
    '33': {
      class_type: 'WanDancerEncodeAudio',
      inputs: { audio: ['32', 2], video_frames: MUSIC_DANCE_SEGMENT, audio_inject_scale: 1 },
    },
    '34': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 0], text: prompts.local } },
    '35': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['34', 0] } },
    '36': { class_type: 'ImageFromBatch', inputs: { image: ['32', 0], batch_index: 0, length: 1 } },
    '37': {
      class_type: 'CLIPVisionEncode',
      inputs: { clip_vision: ['2', 0], image: ['36', 0], crop: 'none' },
    },
    '38': {
      class_type: 'WanDancerVideo',
      inputs: {
        positive: ['34', 0],
        negative: ['35', 0],
        vae: ['3', 0],
        width: input.width,
        height: input.height,
        length: MUSIC_DANCE_SEGMENT,
        clip_vision_output: ['37', 0],
        clip_vision_output_ref: ['6', 0],
        start_image: ['32', 0],
        mask: ['32', 1],
        audio_encoder_output: ['33', 0],
      },
    },
    '39': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '40': {
      class_type: 'BasicScheduler',
      inputs: { model: ['31', 0], scheduler: 'simple', steps: 6, denoise: 1 },
    },
    '41': {
      class_type: 'SamplerCustom',
      inputs: {
        model: ['31', 0],
        add_noise: true,
        noise_seed: input.seed + 1,
        cfg: 1,
        positive: ['38', 0],
        negative: ['38', 1],
        sampler: ['39', 0],
        sigmas: ['40', 0],
        latent_image: ['38', 2],
      },
    },
    '42': { class_type: 'VAEDecode', inputs: { samples: ['41', 0], vae: ['3', 0] } },
    '43': { class_type: 'RebatchImages', inputs: { images: ['42', 0], batch_size: 4096 } },
    '44': {
      class_type: 'CreateVideo',
      inputs: { images: ['43', 0], fps: MUSIC_DANCE_FPS, audio: ['8', 0] },
    },
    [MUSIC_DANCE_SAVE_NODE]: {
      class_type: 'SaveVideo',
      inputs: { video: ['44', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
    },
  };
}
