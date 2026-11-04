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
 * How long a chunk of the clip is finished at a time (s). The whole clip at once held a full-size
 * copy of every frame per stage — ~40 GB for a 30-second clip, and ComfyUI went down (2026-11-04).
 */
export const CLIP_FINISH_CHUNK_SEC = 5;
/** The shortest chunk worth running (s): below this there isn't the memory to finish the clip. */
const CLIP_FINISH_MIN_CHUNK_SEC = 1;
/**
 * Full-size float copies of each frame the graph holds at once (resized, preprocessed, decoded,
 * colour-fixed, …), plus RIFE's own — sized so the 30 s clip's ~40 GB reads right.
 */
const CLIP_FINISH_FRAME_COPIES = 6;
/** The share of ComfyUI's free RAM one chunk may take. */
const CLIP_FINISH_RAM_SHARE = 0.5;

/** Bytes one source frame takes in ComfyUI while finishing (an estimate; see above). */
export function clipFinishFrameBytes(plan: ClipFinishPlan): number {
  return plan.width * plan.height * 3 * 4 * (CLIP_FINISH_FRAME_COPIES + plan.multiplier);
}

/**
 * Source frames per chunk: CLIP_FINISH_CHUNK_SEC of the clip, fewer when ComfyUI's free RAM
 * (`ramFree`, bytes; unknown = not limited) holds less. Null when not even
 * CLIP_FINISH_MIN_CHUNK_SEC fits.
 */
export function clipFinishChunkFrames(
  plan: ClipFinishPlan,
  sourceFps: number,
  ramFree?: number
): number | null {
  const fps = sourceFps > 0 ? sourceFps : 24;
  const wanted = Math.max(2, Math.round(CLIP_FINISH_CHUNK_SEC * fps));
  if (!ramFree || ramFree <= 0) return wanted;
  const fits = Math.floor((ramFree * CLIP_FINISH_RAM_SHARE) / clipFinishFrameBytes(plan));
  if (fits < Math.max(2, Math.round(CLIP_FINISH_MIN_CHUNK_SEC * fps))) return null;
  return Math.min(wanted, fits);
}

/**
 * The clip's frames in chunks of about `size`, each starting on the frame the last one ended on:
 * RIFE makes (n − 1) × m + 1 frames of n, so with each later chunk's first frame dropped the
 * joined clip has the whole clip's (F − 1) × m + 1, and no pair of frames goes uninterpolated. A
 * short tail (under a quarter chunk) joins the chunk before it.
 */
export function clipFinishChunks(
  frames: number,
  size: number
): Array<{ first: number; last: number }> {
  if (frames <= 2) return [{ first: 0, last: Math.max(0, frames - 1) }];
  const step = Math.max(2, Math.floor(size));
  const chunks: Array<{ first: number; last: number }> = [];
  let first = 0;
  while (first < frames - 1) {
    let last = Math.min(frames - 1, first + step - 1);
    if (frames - 1 - last < step / 4) last = frames - 1;
    chunks.push({ first, last });
    first = last;
  }
  return chunks;
}

/**
 * ffmpeg's filter joining `count` finished chunks (inputs 0 … count − 1): each later chunk loses
 * its first frame (the frame the chunk before ended on), then all are joined in order as `[v]`.
 */
export function clipFinishJoinFilter(count: number): string {
  const parts = Array.from(
    { length: count },
    (_, index) =>
      `[${index}:v]${index > 0 ? 'trim=start_frame=1,' : ''}setpts=PTS-STARTPTS[v${index}]`
  );
  const inputs = Array.from({ length: count }, (_, index) => `[v${index}]`).join('');
  return `${parts.join(';')};${inputs}concat=n=${count}:v=1:a=0[v]`;
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
  /** Pass the clip's sound through (false: a silent chunk, the sound added when joined). */
  audio?: boolean;
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
    inputs: {
      images: frames,
      fps: plan.fps,
      ...(input.audio === false ? {} : { audio: ['2', 1] }),
    },
  };
  graph[CLIP_FINISH_SAVE_NODE] = {
    class_type: 'SaveVideo',
    inputs: { video: ['39', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
  };
  return graph;
}
