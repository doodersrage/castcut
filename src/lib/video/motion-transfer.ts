/**
 * "Copy moves from a video": a Cast member does what the person in a driving video does — body,
 * hands and face — on Wan Animate 2 (Comfy-Org/Wan-Animate-2, distilled int8; ComfyUI's
 * WanAnimate2ToVideo). No pose extraction: the model reads the raw driving frames. The picture
 * (who) is the still; the background comes from the prompt. Client-safe: graph and plan only.
 *
 * Long videos run as chained 81-frame segments, as the official template does by hand: each
 * segment continues from the previous one's frames (continue_motion) and seeks the driving video
 * by its video_frame_offset; segments after the first drop their first frame (it repeats).
 */

export const MOTION_TRANSFER_SAVE_NODE = '900';

export const MOTION_TRANSFER_MODELS = {
  unet: 'wan_animate_2_distill_int8_convrot.safetensors',
  clip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  clipVision: 'clip_vision_h.safetensors',
  vae: 'Wan2_1_VAE_bf16.safetensors',
} as const;

/** Frames per segment (the model's window). */
export const MOTION_SEGMENT_FRAMES = 81;
/** Longest driving video taken (frames at its own rate): about 30 s at 16 fps. */
export const MOTION_MAX_FRAMES = MOTION_SEGMENT_FRAMES + 5 * (MOTION_SEGMENT_FRAMES - 1);

/** Wan's own negative prompt (the template's). */
const NEGATIVE =
  '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';

/** How many segments a driving video of `frames` frames takes (each later one adds 80). */
export function motionSegmentCount(frames: number): number {
  const capped = Math.min(Math.max(1, Math.floor(frames)), MOTION_MAX_FRAMES);
  return Math.max(1, Math.ceil((capped - 1) / (MOTION_SEGMENT_FRAMES - 1)));
}

/**
 * Output size from the driving video's: about 480p (long side 832), both sides multiples of 16 —
 * the model's trained size; Finish clip brings it up afterwards.
 */
export function motionTransferSize(
  width: number,
  height: number
): { width: number; height: number } {
  const long = 832;
  const scale = long / Math.max(1, width, height);
  const snap = (value: number) => Math.max(16, Math.round((value * scale) / 16) * 16);
  return { width: snap(width), height: snap(height) };
}

/** The main prompt: who (from the still / Cast) and where (from the scene). */
export function motionTransferPrompt(input: { look: string; place?: string }): string {
  const look = input.look.trim() || 'the person in the reference picture';
  const place = input.place?.trim();
  return [
    `Character appearance description: ${look}`,
    `Background description: ${place || 'the same place as in the reference picture'}`,
  ].join('\n');
}

export function buildMotionTransferGraph(input: {
  /** ComfyUI input names. */
  reference: string;
  video: string;
  prompt: string;
  /** What the driving video shows ("a woman dancing", "a man waving and talking"). */
  motion: string;
  width: number;
  height: number;
  /** Driving video frames to cover. */
  frames: number;
  seed: number;
  prefix: string;
  /** Keep the driving video's sound (talking, music). */
  keepSound?: boolean;
}): Record<string, unknown> {
  const graph: Record<string, unknown> = {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: MOTION_TRANSFER_MODELS.unet, weight_dtype: 'default' },
    },
    '2': {
      class_type: 'WanAnimate2Cache',
      inputs: { model: ['1', 0], device: 'gpu', dtype: 'int8' },
    },
    '3': { class_type: 'ModelSamplingSD3', inputs: { model: ['2', 0], shift: 5 } },
    '4': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: MOTION_TRANSFER_MODELS.clip, type: 'wan', device: 'default' },
    },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 0], text: input.prompt } },
    '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 0], text: NEGATIVE } },
    '7': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 0], text: input.motion } },
    '8': {
      class_type: 'CLIPVisionLoader',
      inputs: { clip_name: MOTION_TRANSFER_MODELS.clipVision },
    },
    '9': { class_type: 'VAELoader', inputs: { vae_name: MOTION_TRANSFER_MODELS.vae } },
    '10': { class_type: 'LoadImage', inputs: { image: input.reference } },
    '11': { class_type: 'LoadVideo', inputs: { file: input.video } },
    '12': { class_type: 'GetVideoComponents', inputs: { video: ['11', 0] } },
    '13': {
      class_type: 'ResizeImageMaskNode',
      inputs: {
        input: ['10', 0],
        resize_type: 'scale dimensions',
        'resize_type.width': input.width,
        'resize_type.height': input.height,
        'resize_type.crop': 'center',
        scale_method: 'area',
      },
    },
    '14': {
      class_type: 'ResizeImageMaskNode',
      inputs: {
        input: ['12', 0],
        resize_type: 'scale dimensions',
        'resize_type.width': input.width,
        'resize_type.height': input.height,
        'resize_type.crop': 'center',
        scale_method: 'area',
      },
    },
    '15': {
      class_type: 'CLIPVisionEncode',
      inputs: { clip_vision: ['8', 0], image: ['13', 0], crop: 'none' },
    },
    '16': { class_type: 'ImageFromBatch', inputs: { image: ['14', 0], batch_index: 0, length: 1 } },
    '17': {
      class_type: 'CLIPVisionEncode',
      inputs: { clip_vision: ['8', 0], image: ['16', 0], crop: 'none' },
    },
    '18': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'lcm' } },
    '19': {
      class_type: 'BasicScheduler',
      inputs: { model: ['3', 0], scheduler: 'simple', steps: 10, denoise: 1 },
    },
  };
  const segments = motionSegmentCount(input.frames);
  const total = Math.min(Math.max(1, Math.floor(input.frames)), MOTION_MAX_FRAMES);
  // One segment renders only what the video covers (4n + 1 frames, the model's step).
  const firstLength =
    segments === 1
      ? Math.min(MOTION_SEGMENT_FRAMES, 4 * Math.ceil((total - 1) / 4) + 1)
      : MOTION_SEGMENT_FRAMES;
  const kept: [string, number][] = [];
  let previous: { images: [string, number]; offset: [string, number] } | null = null;
  for (let index = 0; index < segments; index += 1) {
    const base = 100 + index * 10;
    const id = (step: number) => String(base + step);
    graph[id(0)] = {
      class_type: 'WanAnimate2ToVideo',
      inputs: {
        positive: ['5', 0],
        negative: ['6', 0],
        vae: ['9', 0],
        reference_image: ['13', 0],
        pose_video: ['14', 0],
        clip_vision_output: ['15', 0],
        positive_pose: ['7', 0],
        clip_vision_output_pose: ['17', 0],
        width: input.width,
        height: input.height,
        length: index === 0 ? firstLength : MOTION_SEGMENT_FRAMES,
        batch_size: 1,
        video_frame_offset: previous ? previous.offset : 0,
        pose_strength: 1,
        pose_start_percent: 0,
        pose_end_percent: 1,
        reference_image_strength: 1,
        ...(previous ? { continue_motion: previous.images } : {}),
      },
    };
    graph[id(1)] = {
      class_type: 'SamplerCustom',
      inputs: {
        model: ['3', 0],
        add_noise: true,
        noise_seed: input.seed + index,
        cfg: 1,
        positive: [id(0), 0],
        negative: [id(0), 1],
        sampler: ['18', 0],
        sigmas: ['19', 0],
        latent_image: [id(0), 2],
      },
    };
    graph[id(2)] = {
      class_type: 'TrimVideoLatent',
      inputs: { samples: [id(1), 0], trim_amount: [id(0), 3] },
    };
    graph[id(3)] = { class_type: 'VAEDecode', inputs: { samples: [id(2), 0], vae: ['9', 0] } };
    if (index === 0) {
      kept.push([id(3), 0]);
    } else {
      // Its first frame repeats the previous segment's last.
      graph[id(4)] = {
        class_type: 'ImageFromBatch',
        inputs: { image: [id(3), 0], batch_index: 1, length: 4096 },
      };
      kept.push([id(4), 0]);
    }
    previous = { images: [id(3), 0], offset: [id(0), 5] };
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
  // Cut to the driving video's length (a short video ran on, its last pose held).
  graph['802'] = {
    class_type: 'ImageFromBatch',
    inputs: { image: frames, batch_index: 0, length: total },
  };
  graph['801'] = {
    class_type: 'CreateVideo',
    inputs: {
      images: ['802', 0],
      fps: ['12', 2],
      ...(input.keepSound ? { audio: ['12', 1] } : {}),
    },
  };
  graph[MOTION_TRANSFER_SAVE_NODE] = {
    class_type: 'SaveVideo',
    inputs: { video: ['801', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
  };
  return graph;
}
