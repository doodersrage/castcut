/**
 * Motion brush (2026-11-04, parity with Runway / Kling motion brush): strokes drawn on a still
 * say what moves where — each stroke a path its start point follows through the clip, a single
 * click a point that stays put — and WAN-Move (WAN 2.1 I2V with trajectory conditioning, core
 * `WanMoveTrackToVideo`) animates the still along them. 4 LightX2V steps, 81 frames at 16 fps.
 * Client-safe: the strokes, the tracks and the graph.
 */

export const MOTION_BRUSH_SAVE_NODE = '40';
export const MOTION_BRUSH_FRAMES = 81;
export const MOTION_BRUSH_FPS = 16;
export const MOTION_BRUSH_MAX_STROKES = 12;
export const MOTION_BRUSH_MAX_POINTS = 400;

export const MOTION_BRUSH_MODELS = {
  unet: 'Wan21-WanMove_fp8_scaled_e4m3fn_KJ.safetensors',
  lora: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
  clipVision: 'clip_vision_h.safetensors',
  textEncoder: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  vae: 'Wan2_1_VAE_bf16.safetensors',
} as const;

/** A stroke: points as fractions of the picture (0–1), in the order drawn. One point = a pin. */
export type MotionStroke = Array<{ x: number; y: number }>;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Strokes from a request: at most MOTION_BRUSH_MAX_STROKES, points clamped to the picture. */
export function cleanMotionStrokes(value: unknown): MotionStroke[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MOTION_BRUSH_MAX_STROKES)
    .map(stroke =>
      Array.isArray(stroke)
        ? stroke
            .slice(0, MOTION_BRUSH_MAX_POINTS)
            .filter(
              (point): point is { x: number; y: number } =>
                Boolean(point) &&
                Number.isFinite((point as { x: number }).x) &&
                Number.isFinite((point as { y: number }).y)
            )
            .map(point => ({ x: clamp01(point.x), y: clamp01(point.y) }))
        : []
    )
    .filter(stroke => stroke.length > 0);
}

/**
 * Each stroke as a track of `frames` pixel positions: the path walked at an even pace from its
 * first point to its last (by length along it), a pin held in place.
 */
export function motionTracks(
  strokes: readonly MotionStroke[],
  frames: number,
  width: number,
  height: number
): Array<Array<{ x: number; y: number }>> {
  return strokes.map(stroke => {
    const points = stroke.map(point => ({ x: point.x * width, y: point.y * height }));
    const lengths = [0];
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1]!;
      const b = points[index]!;
      lengths.push(lengths[index - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = lengths[lengths.length - 1]!;
    return Array.from({ length: frames }, (_, frame) => {
      if (total === 0 || points.length === 1) {
        return { x: Math.round(points[0]!.x), y: Math.round(points[0]!.y) };
      }
      const at = (total * frame) / Math.max(1, frames - 1);
      let segment = 1;
      while (segment < lengths.length - 1 && lengths[segment]! < at) segment += 1;
      const start = lengths[segment - 1]!;
      const span = lengths[segment]! - start || 1;
      const t = (at - start) / span;
      const a = points[segment - 1]!;
      const b = points[segment]!;
      return { x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) };
    });
  });
}

/** WAN 2.1 480p's frame area, the still's shape kept, sides multiples of 16. */
export function motionBrushSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.sqrt((832 * 480) / Math.max(1, width * height));
  const side = (value: number) => Math.max(16, Math.round((value * scale) / 16) * 16);
  return { width: side(width), height: side(height) };
}

export const MOTION_BRUSH_PROMPT =
  'Natural, smooth motion following the drawn paths; everything else stays steady. Photorealistic, natural light.';

export function buildMotionBrushGraph(input: {
  image: string;
  width: number;
  height: number;
  tracks: Array<Array<{ x: number; y: number }>>;
  prompt?: string;
  seed: number;
  prefix: string;
}): Record<string, unknown> {
  const said = input.prompt?.trim().replace(/[.\s]+$/, '');
  const positive = said ? `${said}. ${MOTION_BRUSH_PROMPT}` : MOTION_BRUSH_PROMPT;
  return {
    '1': { class_type: 'LoadImage', inputs: { image: input.image } },
    '10': {
      class_type: 'UNETLoader',
      inputs: { unet_name: MOTION_BRUSH_MODELS.unet, weight_dtype: 'default' },
    },
    '11': {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['10', 0], lora_name: MOTION_BRUSH_MODELS.lora, strength_model: 1 },
    },
    '12': { class_type: 'ModelSamplingSD3', inputs: { model: ['11', 0], shift: 5 } },
    '13': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: MOTION_BRUSH_MODELS.textEncoder, type: 'wan', device: 'default' },
    },
    '14': { class_type: 'CLIPTextEncode', inputs: { clip: ['13', 0], text: positive } },
    '15': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['13', 0],
        text: 'static, frozen, blurry, distorted, morphing, extra limbs, flicker, watermark',
      },
    },
    '16': { class_type: 'VAELoader', inputs: { vae_name: MOTION_BRUSH_MODELS.vae } },
    '17': { class_type: 'CLIPVisionLoader', inputs: { clip_name: MOTION_BRUSH_MODELS.clipVision } },
    '18': {
      class_type: 'CLIPVisionEncode',
      inputs: { clip_vision: ['17', 0], image: ['1', 0], crop: 'none' },
    },
    '19': {
      class_type: 'WanMoveTracksFromCoords',
      inputs: { track_coords: JSON.stringify(input.tracks) },
    },
    '20': {
      class_type: 'WanMoveTrackToVideo',
      inputs: {
        positive: ['14', 0],
        negative: ['15', 0],
        vae: ['16', 0],
        strength: 1,
        width: input.width,
        height: input.height,
        length: MOTION_BRUSH_FRAMES,
        batch_size: 1,
        start_image: ['1', 0],
        tracks: ['19', 0],
        clip_vision_output: ['18', 0],
      },
    },
    '21': {
      class_type: 'KSampler',
      inputs: {
        model: ['12', 0],
        positive: ['20', 0],
        negative: ['20', 1],
        latent_image: ['20', 2],
        seed: input.seed,
        steps: 4,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    '22': { class_type: 'VAEDecode', inputs: { samples: ['21', 0], vae: ['16', 0] } },
    '39': { class_type: 'CreateVideo', inputs: { images: ['22', 0], fps: MOTION_BRUSH_FPS } },
    [MOTION_BRUSH_SAVE_NODE]: {
      class_type: 'SaveVideo',
      inputs: { video: ['39', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
    },
  };
}
