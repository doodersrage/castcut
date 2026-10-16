/**
 * "Lip-sync to a recording": a still speaks audio the player brings (their own voice, a TTS file,
 * a song) on InfiniteTalk (Wan 2.1 I2V 480p + the InfiniteTalk patch, ComfyUI's
 * WanInfiniteTalkToVideo). Talking clips (LTX-2.5) make their own voice; this one keeps yours.
 * Client-safe: graph and plan only.
 *
 * The clip runs at 25 fps (InfiniteTalk's rate) in chained 81-frame segments: each later segment
 * continues from the previous one's frames (previous_frames) and drops the motion frames it repeats
 * (trim_image).
 */

export const LIP_SYNC_SAVE_NODE = '900';
export const LIP_SYNC_FPS = 25;
export const LIP_SYNC_SEGMENT_FRAMES = 81;
/** Longest recording taken, in seconds. */
export const LIP_SYNC_MAX_SECONDS = 30;

export const LIP_SYNC_MODELS = {
  unet: 'wan2.1_i2v_480p_14B_fp8_scaled.safetensors',
  patch: 'wan2.1_infiniteTalk_single_fp16.safetensors',
  lora: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
  audioEncoder: 'wav2vec2-chinese-base_fp16.safetensors',
  clip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  vae: 'Wan2_1_VAE_bf16.safetensors',
} as const;

/** Frames a recording of `seconds` needs at LIP_SYNC_FPS (capped at LIP_SYNC_MAX_SECONDS). */
export function lipSyncFrames(seconds: number): number {
  return Math.ceil(Math.min(Math.max(seconds, 0.5), LIP_SYNC_MAX_SECONDS) * LIP_SYNC_FPS);
}

/** Segments for a recording of `seconds` (each later one adds 81 − 9 motion frames). */
export function lipSyncSegmentCount(seconds: number): number {
  const frames = lipSyncFrames(seconds);
  if (frames <= LIP_SYNC_SEGMENT_FRAMES) return 1;
  return 1 + Math.ceil((frames - LIP_SYNC_SEGMENT_FRAMES) / (LIP_SYNC_SEGMENT_FRAMES - 9));
}

/** About 480p from the still's shape (long side 832), sides multiples of 16. */
export function lipSyncSize(width: number, height: number): { width: number; height: number } {
  const scale = 832 / Math.max(1, width, height);
  const snap = (value: number) => Math.max(16, Math.round((value * scale) / 16) * 16);
  return { width: snap(width), height: snap(height) };
}

export function buildLipSyncGraph(input: {
  /** ComfyUI input names. */
  image: string;
  audio: string;
  prompt: string;
  width: number;
  height: number;
  seconds: number;
  seed: number;
  prefix: string;
}): Record<string, unknown> {
  const graph: Record<string, unknown> = {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: LIP_SYNC_MODELS.unet, weight_dtype: 'default' },
    },
    '2': {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['1', 0], lora_name: LIP_SYNC_MODELS.lora, strength_model: 1 },
    },
    '3': { class_type: 'ModelPatchLoader', inputs: { name: LIP_SYNC_MODELS.patch } },
    '4': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: LIP_SYNC_MODELS.clip, type: 'wan', device: 'default' },
    },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 0], text: input.prompt } },
    '6': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
    '7': { class_type: 'VAELoader', inputs: { vae_name: LIP_SYNC_MODELS.vae } },
    '8': {
      class_type: 'AudioEncoderLoader',
      inputs: { audio_encoder_name: LIP_SYNC_MODELS.audioEncoder },
    },
    '9': { class_type: 'LoadAudio', inputs: { audio: input.audio } },
    '10': {
      class_type: 'AudioEncoderEncode',
      inputs: { audio_encoder: ['8', 0], audio: ['9', 0] },
    },
    '11': { class_type: 'LoadImage', inputs: { image: input.image } },
    '12': {
      class_type: 'ResizeImageMaskNode',
      inputs: {
        input: ['11', 0],
        resize_type: 'scale dimensions',
        'resize_type.width': input.width,
        'resize_type.height': input.height,
        'resize_type.crop': 'center',
        scale_method: 'lanczos',
      },
    },
    '13': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
  };
  const segments = lipSyncSegmentCount(input.seconds);
  const kept: [string, number][] = [];
  let previous: [string, number] | null = null;
  for (let index = 0; index < segments; index += 1) {
    const base = 100 + index * 10;
    const id = (step: number) => String(base + step);
    graph[id(0)] = {
      class_type: 'WanInfiniteTalkToVideo',
      inputs: {
        mode: 'single_speaker',
        model: ['2', 0],
        model_patch: ['3', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        vae: ['7', 0],
        width: input.width,
        height: input.height,
        length: LIP_SYNC_SEGMENT_FRAMES,
        audio_encoder_output_1: ['10', 0],
        motion_frame_count: 9,
        audio_scale: 1,
        start_image: ['12', 0],
        ...(previous ? { previous_frames: previous } : {}),
      },
    };
    graph[id(1)] = {
      class_type: 'CFGGuider',
      inputs: { model: [id(0), 0], positive: [id(0), 1], negative: [id(0), 2], cfg: 1 },
    };
    graph[id(2)] = {
      class_type: 'BasicScheduler',
      inputs: { model: [id(0), 0], scheduler: 'normal', steps: 6, denoise: 1 },
    };
    graph[id(3)] = { class_type: 'RandomNoise', inputs: { noise_seed: input.seed + index } };
    graph[id(4)] = {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: [id(3), 0],
        guider: [id(1), 0],
        sampler: ['13', 0],
        sigmas: [id(2), 0],
        latent_image: [id(0), 3],
      },
    };
    graph[id(5)] = { class_type: 'VAEDecode', inputs: { samples: [id(4), 0], vae: ['7', 0] } };
    if (index === 0) {
      kept.push([id(5), 0]);
    } else {
      graph[id(6)] = {
        class_type: 'ImageFromBatch',
        inputs: { image: [id(5), 0], batch_index: [id(0), 4], length: 4096 },
      };
      kept.push([id(6), 0]);
    }
    previous = [id(5), 0];
  }
  let frames: [string, number] = kept[0]!;
  if (kept.length > 1) {
    const batch: Record<string, unknown> = {};
    kept.forEach((ref, index) => {
      batch[`images.image${index}`] = ref;
    });
    graph['800'] = { class_type: 'BatchImagesNode', inputs: batch };
    frames = ['800', 0];
  }
  // The last segment renders its full 81 frames: cut the picture to the recording's length.
  graph['802'] = {
    class_type: 'ImageFromBatch',
    inputs: { image: frames, batch_index: 0, length: lipSyncFrames(input.seconds) },
  };
  graph['801'] = {
    class_type: 'CreateVideo',
    inputs: { images: ['802', 0], fps: LIP_SYNC_FPS, audio: ['9', 0] },
  };
  graph[LIP_SYNC_SAVE_NODE] = {
    class_type: 'SaveVideo',
    inputs: { video: ['801', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
  };
  return graph;
}
