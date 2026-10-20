/**
 * "Make more realistic": a finished clip re-rendered at low strength through WAN 2.2's low-noise
 * 14B model (the 4-step LightX2V LoRA keeps it to a few minutes). Low strength keeps the motion,
 * framing and faces; what changes is the surface — waxy skin, CGI water and over-smooth detail
 * become real texture. WAN renders 81 frames at a time, so a longer clip is cut into overlapping
 * chunks that the server crossfades back together, with the clip's own sound put back.
 * Client-safe: the plan and the graph only (realism-server.ts runs it).
 */

export const CLIP_REALISM_SAVE_NODE = '40';

export const CLIP_REALISM_MODELS = {
  unet: 'wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors',
  /** The catalog's 4-step low-noise LoRA (comfy-asset-catalog `wan-video-lightning-low-noise`). */
  lora: 'Wan2.2-Lightning-low_noise_model.safetensors',
  textEncoder: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  vae: 'Wan2_1_VAE_bf16.safetensors',
} as const;

export type ClipRealismStrength = 'light' | 'medium' | 'strong';

/** How much of the clip is re-rendered: more is more real, but drifts further from the original. */
export const CLIP_REALISM_DENOISE: Record<ClipRealismStrength, number> = {
  light: 0.2,
  medium: 0.3,
  strong: 0.4,
};

export function normalizeClipRealismStrength(value: unknown): ClipRealismStrength {
  return value === 'light' || value === 'strong' ? value : 'medium';
}

export const CLIP_REALISM_PROMPT =
  'Photorealistic live-action footage filmed on a real camera. Natural skin with visible pores, ' +
  'fine hair and subtle imperfections, real water with true reflections and refraction, natural ' +
  'light and shadow, true-to-life colour, fine film grain, sharp focus.';

export const CLIP_REALISM_NEGATIVE =
  'plastic skin, waxy skin, airbrushed, smooth skin, CGI, 3d render, video game, cartoon, ' +
  'painting, oversaturated, glowing, blurry, distorted body, extra limbs';

/** WAN's frame window (4k + 1 frames), and how many frames consecutive chunks share at least. */
export const CLIP_REALISM_WINDOW = 81;
export const CLIP_REALISM_MIN_OVERLAP = 8;

/** Largest frame area WAN 14B re-renders on a 24 GB card (720p); bigger clips are scaled down. */
const MAX_AREA = 1280 * 720;

export type ClipRealismChunk = {
  /** First source frame. */
  start: number;
  /** Source frames this chunk covers. */
  frames: number;
  /** Frames rendered: `frames` padded (last frame held) up to WAN's 4k + 1. */
  rendered: number;
};

/** Next frame count WAN takes (4k + 1, at least 5). */
export function wanFrameCount(frames: number): number {
  return Math.max(5, Math.ceil((frames - 1) / 4) * 4 + 1);
}

/**
 * The chunks a clip of `total` frames is rendered in: one when it fits the window, else
 * window-long chunks spread evenly from the first frame to the last, each sharing at least
 * CLIP_REALISM_MIN_OVERLAP frames with the next (the server crossfades over the shared frames).
 */
export function clipRealismChunks(
  total: number,
  window = CLIP_REALISM_WINDOW,
  minOverlap = CLIP_REALISM_MIN_OVERLAP
): ClipRealismChunk[] {
  if (!Number.isFinite(total) || total < 2) return [];
  if (total <= window) return [{ start: 0, frames: total, rendered: wanFrameCount(total) }];
  const count = Math.ceil((total - minOverlap) / (window - minOverlap));
  return Array.from({ length: count }, (_, index) => ({
    start: Math.round((index * (total - window)) / (count - 1)),
    frames: window,
    rendered: window,
  }));
}

/** The size a clip is re-rendered at: its own, scaled down to MAX_AREA, sides multiples of 16. */
export function clipRealismSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, Math.sqrt(MAX_AREA / Math.max(1, width * height)));
  const side = (value: number) => Math.max(16, Math.round((value * scale) / 16) * 16);
  return { width: side(width), height: side(height) };
}

/**
 * LoadVideo (one chunk) → resize → WAN VAE encode → low-noise WAN + LightX2V, 4 steps at
 * `denoise` → decode → SaveVideo MP4 (silent: the server puts the clip's sound back after the join).
 */
export function buildClipRealismGraph(input: {
  video: string;
  width: number;
  height: number;
  fps: number;
  denoise: number;
  seed: number;
  prefix: string;
  prompt?: string;
}): Record<string, unknown> {
  const positive = [CLIP_REALISM_PROMPT, input.prompt?.trim()].filter(Boolean).join(' ');
  return {
    '1': { class_type: 'LoadVideo', inputs: { file: input.video } },
    '2': { class_type: 'GetVideoComponents', inputs: { video: ['1', 0] } },
    '3': {
      class_type: 'ImageScale',
      inputs: {
        image: ['2', 0],
        upscale_method: 'lanczos',
        width: input.width,
        height: input.height,
        crop: 'disabled',
      },
    },
    '10': {
      class_type: 'UNETLoader',
      inputs: { unet_name: CLIP_REALISM_MODELS.unet, weight_dtype: 'default' },
    },
    '11': {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['10', 0], lora_name: CLIP_REALISM_MODELS.lora, strength_model: 1 },
    },
    '12': { class_type: 'ModelSamplingSD3', inputs: { model: ['11', 0], shift: 8 } },
    '13': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: CLIP_REALISM_MODELS.textEncoder, type: 'wan', device: 'default' },
    },
    '14': { class_type: 'CLIPTextEncode', inputs: { clip: ['13', 0], text: positive } },
    '15': {
      class_type: 'CLIPTextEncode',
      inputs: { clip: ['13', 0], text: CLIP_REALISM_NEGATIVE },
    },
    '16': { class_type: 'VAELoader', inputs: { vae_name: CLIP_REALISM_MODELS.vae } },
    '17': {
      class_type: 'VAEEncodeTiled',
      inputs: {
        pixels: ['3', 0],
        vae: ['16', 0],
        tile_size: 512,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 8,
      },
    },
    '18': {
      class_type: 'KSampler',
      inputs: {
        model: ['12', 0],
        positive: ['14', 0],
        negative: ['15', 0],
        latent_image: ['17', 0],
        seed: input.seed,
        steps: 4,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: input.denoise,
      },
    },
    '19': {
      class_type: 'VAEDecodeTiled',
      inputs: {
        samples: ['18', 0],
        vae: ['16', 0],
        tile_size: 512,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 8,
      },
    },
    '39': { class_type: 'CreateVideo', inputs: { images: ['19', 0], fps: input.fps } },
    [CLIP_REALISM_SAVE_NODE]: {
      class_type: 'SaveVideo',
      inputs: { video: ['39', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
    },
  };
}

/**
 * The ffmpeg filter that joins the rendered chunks back into one clip: each chunk trimmed to the
 * source frames it covers, then crossfaded into the next over the frames they share. Inputs
 * 0…n-1 are the chunks; the result is `[out]`.
 */
export function clipRealismJoinFilter(chunks: ClipRealismChunk[], fps: number): string {
  const parts = chunks.map(
    (chunk, index) =>
      `[${index}:v]trim=end_frame=${chunk.frames},setpts=PTS-STARTPTS,fps=${fps},format=yuv420p,settb=AVTB[v${index}]`
  );
  if (chunks.length === 1) return [...parts, '[v0]null[out]'].join(';');
  let last = 'v0';
  chunks.slice(1).forEach((chunk, offset) => {
    const previous = chunks[offset]!;
    const shared = previous.start + previous.frames - chunk.start;
    const label = offset === chunks.length - 2 ? 'out' : `x${offset + 1}`;
    parts.push(
      `[${last}][v${offset + 1}]xfade=transition=fade:duration=${(shared / fps).toFixed(4)}:offset=${(chunk.start / fps).toFixed(4)}[${label}]`
    );
    last = label;
  });
  return parts.join(';');
}
