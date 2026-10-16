/**
 * "Finish clip": a finished clip made sharper (SeedVR2 one-step video restore/upscale) and
 * smoother (RIFE frame interpolation), with its sound kept. Both run on ComfyUI's own nodes
 * (comfy_extras nodes_seedvr / nodes_frame_interpolation); the models come from Comfy-Org's
 * SeedVR2 and frame_interpolation repos. Client-safe: the graph and the plan only.
 */

export const CLIP_FINISH_SAVE_NODE = '40';

export const CLIP_FINISH_MODELS = {
  seedvr: 'seedvr2_3b_int8_convrot.safetensors',
  seedvrVae: 'seedvr2_ema_vae_fp16.safetensors',
  interpolation: 'rife_v4.26.safetensors',
} as const;

/** Long side a finished clip is brought up to; clips already this big are not upscaled. */
export const CLIP_FINISH_LONG_SIDE = 1280;

/** Below this frame rate (WAN's 16 fps) a clip gets twice the frames. */
const SMOOTH_BELOW_FPS = 20;

export type ClipFinishPlan = {
  /** Upscale factor (1 = keep the size). */
  scale: number;
  /** Frames per source frame (1 = keep the frame rate). */
  multiplier: number;
  width: number;
  height: number;
  fps: number;
};

/**
 * What finishing does to a clip of this size and frame rate: up to CLIP_FINISH_LONG_SIDE on the
 * long side (sides even), and twice the frames below SMOOTH_BELOW_FPS. null when there is nothing
 * to do.
 */
export function clipFinishPlan(input: {
  width: number;
  height: number;
  fps: number;
}): ClipFinishPlan | null {
  const long = Math.max(input.width, input.height);
  const scale = long > 0 && long < CLIP_FINISH_LONG_SIDE ? CLIP_FINISH_LONG_SIDE / long : 1;
  const multiplier = input.fps > 0 && input.fps < SMOOTH_BELOW_FPS ? 2 : 1;
  if (scale === 1 && multiplier === 1) return null;
  const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);
  // WAN's WebP reads as 16.13 fps (frame delays in whole milliseconds): it is 16.
  const whole = Math.round(input.fps);
  const fps = Math.abs(input.fps - whole) < 0.25 ? whole : input.fps;
  return {
    scale: Math.round(scale * 1000) / 1000,
    multiplier,
    width: even(input.width),
    height: even(input.height),
    fps: fps * multiplier,
  };
}

/**
 * LoadVideo → (SeedVR2 restore at `plan.scale`) → (RIFE × `plan.multiplier`) → SaveVideo MP4,
 * the clip's own sound passed through. SeedVR2 works on latent chunks (SeedVR2TemporalChunk) so a
 * 30-second clip fits on one GPU.
 */
export function buildClipFinishGraph(input: {
  video: string;
  plan: ClipFinishPlan;
  seed: number;
  prefix: string;
}): Record<string, unknown> {
  const { plan } = input;
  const graph: Record<string, unknown> = {
    '1': { class_type: 'LoadVideo', inputs: { file: input.video } },
    '2': { class_type: 'GetVideoComponents', inputs: { video: ['1', 0] } },
  };
  let frames: [string, number] = ['2', 0];
  if (plan.scale > 1) {
    Object.assign(graph, {
      '10': {
        class_type: 'UNETLoader',
        inputs: { unet_name: CLIP_FINISH_MODELS.seedvr, weight_dtype: 'default' },
      },
      '11': { class_type: 'VAELoader', inputs: { vae_name: CLIP_FINISH_MODELS.seedvrVae } },
      '12': {
        class_type: 'ResizeImageMaskNode',
        inputs: {
          input: ['2', 0],
          resize_type: 'scale dimensions',
          'resize_type.width': plan.width,
          'resize_type.height': plan.height,
          'resize_type.crop': 'disabled',
          scale_method: 'lanczos',
        },
      },
      '13': { class_type: 'SeedVR2Preprocess', inputs: { resized_images: ['12', 0] } },
      '14': {
        class_type: 'VAEEncodeTiled',
        inputs: {
          pixels: ['13', 0],
          vae: ['11', 0],
          tile_size: 512,
          overlap: 128,
          temporal_size: 64,
          temporal_overlap: 8,
        },
      },
      '15': {
        class_type: 'SeedVR2TemporalChunk',
        inputs: { latent: ['14', 0], temporal_overlap: 0, chunking_mode: 'auto' },
      },
      '16': {
        class_type: 'SeedVR2Conditioning',
        inputs: { model: ['10', 0], vae_conditioning: ['15', 0] },
      },
      '17': {
        class_type: 'KSampler',
        inputs: {
          model: ['10', 0],
          positive: ['16', 0],
          negative: ['16', 1],
          latent_image: ['15', 0],
          seed: input.seed,
          steps: 1,
          cfg: 1,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1,
        },
      },
      '18': {
        class_type: 'SeedVR2TemporalMerge',
        inputs: { latents: ['17', 0], temporal_overlap: ['15', 1] },
      },
      '19': {
        class_type: 'VAEDecodeTiled',
        inputs: {
          samples: ['18', 0],
          vae: ['11', 0],
          tile_size: 512,
          overlap: 128,
          temporal_size: 64,
          temporal_overlap: 8,
        },
      },
      '20': {
        class_type: 'SeedVR2PostProcessing',
        inputs: {
          images: ['19', 0],
          original_resized_images: ['12', 0],
          color_correction_method: 'lab',
        },
      },
    });
    frames = ['20', 0];
  }
  if (plan.multiplier > 1) {
    Object.assign(graph, {
      '30': {
        class_type: 'FrameInterpolationModelLoader',
        inputs: { model_name: CLIP_FINISH_MODELS.interpolation },
      },
      '31': {
        class_type: 'FrameInterpolate',
        inputs: { interp_model: ['30', 0], images: frames, multiplier: plan.multiplier },
      },
    });
    frames = ['31', 0];
  }
  graph['39'] = {
    class_type: 'CreateVideo',
    inputs: { images: frames, fps: plan.fps, audio: ['2', 1] },
  };
  graph[CLIP_FINISH_SAVE_NODE] = {
    class_type: 'SaveVideo',
    inputs: { video: ['39', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
  };
  return graph;
}
