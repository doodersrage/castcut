/**
 * Restyle and Remove on WAN 2.2 Fun VACE (2026-11-04, parity with Runway / Kling restyle and
 * object removal). VACE paints a clip guided by a control video:
 *
 * - Restyle: the clip's depth (Depth Anything V2) carries its structure and motion; a look's words
 *   set the surface. Re-rendering on WAN's low-noise model alone could not do it: at 0.8 the clip
 *   was still a photograph, at 0.9 another video entirely (a different person).
 * - Remove: the clip with the painted area greyed out, and that area as the mask — VACE fills it
 *   from the scene around it. The mask is the same on every frame (a still subject or set piece;
 *   nothing tracks a moving one).
 *
 * Two experts, 4 Lightning steps (2 high-noise, 2 low-noise). Chunks of 81 frames, as Make more
 * realistic (realism-server.ts rerenderClipInChunks). Client-safe: the looks and the graph.
 */

export const CLIP_VACE_SAVE_NODE = '40';

export const CLIP_VACE_MODELS = {
  high: 'wan2.2_fun_vace_high_noise_14B_fp8_scaled.safetensors',
  low: 'wan2.2_fun_vace_low_noise_14B_fp8_scaled.safetensors',
  loraHigh: 'Wan2.2-Lightning-high_noise_model.safetensors',
  loraLow: 'Wan2.2-Lightning-low_noise_model.safetensors',
  textEncoder: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  vae: 'Wan2_1_VAE_bf16.safetensors',
} as const;

export type ClipStyleId =
  'anime' | 'noir' | 'claymation' | 'watercolour' | 'vintage' | 'animated3d';

/** The looks Restyle offers: each one's words (the depth keeps the scene; these paint it). */
/**
 * `whole`: the look named once more for the whole frame, after the scene's words (the scene's
 * colours otherwise won: on one expert watercolour stayed a photograph). `monochrome`: no colour
 * words for it — "a red dress" kept noir in colour.
 */
export const CLIP_STYLES: Record<
  ClipStyleId,
  {
    label: string;
    prompt: string;
    negative: string;
    whole: string;
    monochrome?: boolean;
    /**
     * Not reached on this model (live, 2026-11-05, one and both experts, long and short colour
     * words): it comes out as a painted illustration rather than its name. Anime and film noir
     * come through; the picker says so for the rest.
     */
    approximate?: boolean;
  }
> = {
  anime: {
    whole: 'a hand-drawn 2D anime frame',
    label: 'Anime',
    prompt:
      '2D anime film, hand-drawn cel animation, clean line art, flat cel shading, painted backgrounds, vibrant colours.',
    negative: 'photorealistic, photograph, live action, 3d render, realistic skin, film grain',
  },
  noir: {
    whole: 'a black-and-white film still',
    monochrome: true,
    label: 'Film noir',
    prompt:
      'Black-and-white film noir, high-contrast hard light, deep shadows, 1940s cinema, silver film grain, monochrome.',
    negative: 'colour, color, saturated, vibrant, cartoon, painting, 3d render',
  },
  claymation: {
    approximate: true,
    whole: 'a stop-motion claymation frame — every person and thing made of plasticine',
    label: 'Claymation',
    prompt:
      'Stop-motion claymation, handmade plasticine figures and miniature set, visible fingerprints in the clay, soft studio light.',
    negative: 'photorealistic, photograph, live action, realistic skin, anime, drawing',
  },
  watercolour: {
    approximate: true,
    whole: 'a watercolour painting on paper, washes and brushstrokes everywhere',
    label: 'Watercolour',
    prompt:
      'Animated watercolour painting, soft colour washes, visible paper texture, loose brushstrokes, gentle bleeding edges.',
    negative: 'photorealistic, photograph, live action, 3d render, sharp digital, film grain',
  },
  vintage: {
    approximate: true,
    whole: 'grainy, faded 1970s 16mm film',
    label: 'Vintage film',
    prompt:
      '1970s 16mm film footage, warm faded colours, heavy film grain, soft halation around lights, slight gate weave.',
    negative: 'digital, clean, sharp, oversaturated, cartoon, painting, 3d render',
  },
  animated3d: {
    approximate: true,
    whole: 'a stylised 3D animated film frame, everything a smooth CG model',
    label: '3D animated',
    prompt:
      'Stylised 3D animated feature film, soft rounded features, smooth stylised skin, big expressive eyes, warm cinematic lighting.',
    negative: 'photorealistic, photograph, live action, film grain, anime, drawing, painting',
  },
};

export function normalizeClipStyle(value: unknown): ClipStyleId | null {
  return typeof value === 'string' && Object.hasOwn(CLIP_STYLES, value)
    ? (value as ClipStyleId)
    : null;
}

/**
 * What a VACE re-render does. Restyle: a preset look, or your own words for it. Remove: the
 * painted area — one picture for every frame, or a mask video tracked through the clip (SAM 3) —
 * filled with what was behind it, or with `words` (Replace: "a vase of flowers").
 */
export type ClipVaceMode =
  | { kind: 'restyle'; style: ClipStyleId }
  | { kind: 'restyle'; look: string }
  | {
      kind: 'remove';
      mask: string;
      maskIsVideo?: boolean;
      words?: string;
      /**
       * Change the background: the mask is everything but the people (tracked by SAM 3 from the
       * word "person"), and `words` is the new place behind them.
       */
      background?: boolean;
    };

/** Your own look's words, tidied (Restyle · your own look). */
export const CLIP_LOOK_MAX = 200;
export function cleanClipLook(value: unknown): string {
  return typeof value === 'string'
    ? value
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, CLIP_LOOK_MAX)
        .replace(/[.\s]+$/, '')
    : '';
}

/** What fills a removed area: the place as it is behind it. */
export const CLIP_REMOVE_PROMPT =
  'The same scene with nothing in the masked area: only the background and surfaces that were behind it, continuous with the surroundings, the same light and camera.';
export const CLIP_REMOVE_NEGATIVE =
  'object, person, hand, text, logo, blur, smear, artefacts, distorted, different scene';

const QUALITY_NEGATIVE = 'blurry, distorted, extra limbs, flicker, watermark';

/**
 * LoadVideo (one chunk) → scale → control (depth, or the frames with the mask greyed) →
 * WanVaceToVideo → 2 high-noise steps → 2 low-noise steps → trim VACE's reference latent →
 * decode → SaveVideo MP4 (silent: the clip's sound goes back on after the join).
 */
export function buildClipVaceGraph(input: {
  video: string;
  width: number;
  height: number;
  fps: number;
  /** Frames in the chunk (4k + 1). */
  frames: number;
  seed: number;
  prefix: string;
  mode: ClipVaceMode;
  /**
   * Restyle: what the clip shows, its colours named ("a woman in a red dress, white walls").
   * Depth carries no colour — without it the look repainted the clothes and walls (a red dress
   * came out blue); the first frame as VACE's reference instead pulled it back to a photograph.
   */
  scene?: string;
  /**
   * Only the low-noise expert, for all 4 steps (one 17 GB model in memory, not two): for a
   * machine short of RAM — the two experts took ComfyUI to ~30 GB (vace-server.ts decides).
   */
  lowOnly?: boolean;
  /**
   * Restyle, a later chunk: the chunk before's restyled frame where this one starts (an input
   * picture) as VACE's reference, so the look's details carry on — each chunk redrew the walls
   * on its own (a window, then a painting, then wallpaper over 30 s). Already in the look, so it
   * doesn't pull back to a photograph as the clip's own frame did.
   */
  reference?: string;
}): Record<string, unknown> {
  const { width, height, frames } = input;
  const mode = input.mode;
  const look =
    mode.kind !== 'restyle'
      ? null
      : 'style' in mode
        ? CLIP_STYLES[mode.style]
        : {
            prompt: `The whole clip redrawn in this look: ${cleanClipLook(mode.look)}.`,
            negative: 'flat, unchanged photograph, blurry',
          };
  const scene =
    look && 'monochrome' in look && look.monochrome
      ? ''
      : input.scene?.trim().replace(/[.\s]+$/, '');
  const words = mode.kind === 'remove' ? cleanClipLook(mode.words) : '';
  const whole = look && 'whole' in look ? look.whole : '';
  const background = mode.kind === 'remove' && mode.background === true && words;
  const positive = look
    ? `${look.prompt}${scene ? ` The scene, its colours as they are: ${scene}.` : ''}${whole ? ` The whole frame — people, clothes and place — is ${whole}, not a photograph.` : ''}`
    : background
      ? `${words.charAt(0).toUpperCase()}${words.slice(1)}: the whole setting around and behind the people is ${words}, nothing of the old room left — a real place, photographed, its light falling on them. The people, their clothes and their movement stay exactly as they are.`
      : words
        ? `In the masked area: ${words} — part of the same scene, in the same light and camera, sitting naturally where it is.`
        : CLIP_REMOVE_PROMPT;
  const negative = `${look ? look.negative : background ? 'the old room, extra people, blur, smear, artefacts, distorted, cartoon' : words ? 'blur, smear, artefacts, distorted, different scene' : CLIP_REMOVE_NEGATIVE}, ${QUALITY_NEGATIVE}`;
  const graph: Record<string, unknown> = {
    '1': { class_type: 'LoadVideo', inputs: { file: input.video } },
    '2': { class_type: 'GetVideoComponents', inputs: { video: ['1', 0] } },
    '3': {
      class_type: 'ImageScale',
      inputs: { image: ['2', 0], upscale_method: 'lanczos', width, height, crop: 'disabled' },
    },
    '10': {
      class_type: 'UNETLoader',
      inputs: { unet_name: CLIP_VACE_MODELS.high, weight_dtype: 'default' },
    },
    '11': {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['10', 0], lora_name: CLIP_VACE_MODELS.loraHigh, strength_model: 1 },
    },
    '12': { class_type: 'ModelSamplingSD3', inputs: { model: ['11', 0], shift: 8 } },
    '20': {
      class_type: 'UNETLoader',
      inputs: { unet_name: CLIP_VACE_MODELS.low, weight_dtype: 'default' },
    },
    '21': {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['20', 0], lora_name: CLIP_VACE_MODELS.loraLow, strength_model: 1 },
    },
    '22': { class_type: 'ModelSamplingSD3', inputs: { model: ['21', 0], shift: 8 } },
    '13': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: CLIP_VACE_MODELS.textEncoder, type: 'wan', device: 'default' },
    },
    '14': { class_type: 'CLIPTextEncode', inputs: { clip: ['13', 0], text: positive } },
    '15': { class_type: 'CLIPTextEncode', inputs: { clip: ['13', 0], text: negative } },
    '16': { class_type: 'VAELoader', inputs: { vae_name: CLIP_VACE_MODELS.vae } },
  };
  let control: [string, number];
  let masks: [string, number] | null = null;
  if (mode.kind === 'restyle') {
    graph['28'] = {
      class_type: 'DepthAnythingV2Preprocessor',
      inputs: {
        image: ['3', 0],
        ckpt_name: 'depth_anything_v2_vitl.pth',
        resolution: Math.min(1024, Math.max(64, Math.round(Math.max(width, height) / 64) * 64)),
      },
    };
    // Smoothed: the depth map's steps came out as contour lines on skin, like wood grain (30 s).
    graph['30'] = {
      class_type: 'ImageBlur',
      inputs: { image: ['28', 0], blur_radius: 6, sigma: 3 },
    };
    control = ['30', 0];
    if (input.reference) {
      graph['29'] = { class_type: 'LoadImage', inputs: { image: input.reference } };
      graph['27'] = {
        class_type: 'ImageScale',
        inputs: { image: ['29', 0], upscale_method: 'lanczos', width, height, crop: 'disabled' },
      };
    }
  } else {
    // The painted area, white on black, scaled to the frame, a little grown: one picture repeated
    // on every frame, or the mask video SAM 3 tracked through the clip (this chunk's frames).
    if (mode.maskIsVideo) {
      graph['31'] = { class_type: 'LoadVideo', inputs: { file: mode.mask } };
      graph['30'] = { class_type: 'GetVideoComponents', inputs: { video: ['31', 0] } };
      graph['33'] = {
        class_type: 'ImageScale',
        inputs: {
          image: ['30', 0],
          upscale_method: 'nearest-exact',
          width,
          height,
          crop: 'disabled',
        },
      };
    } else {
      graph['31'] = { class_type: 'LoadImage', inputs: { image: mode.mask } };
      graph['32'] = {
        class_type: 'ImageScale',
        inputs: {
          image: ['31', 0],
          upscale_method: 'nearest-exact',
          width,
          height,
          crop: 'disabled',
        },
      };
      graph['33'] = {
        class_type: 'RepeatImageBatch',
        inputs: { image: ['32', 0], amount: frames },
      };
    }
    graph['34'] = { class_type: 'ImageToMask', inputs: { image: ['33', 0], channel: 'red' } };
    graph['35'] = {
      class_type: 'GrowMask',
      // Background: not grown — it would eat into the people the tracker already grew around.
      inputs: { mask: ['34', 0], expand: background ? 0 : 8, tapered_corners: true },
    };
    graph['36'] = {
      class_type: 'EmptyImage',
      inputs: { width, height, batch_size: frames, color: 0x7f7f7f },
    };
    // The frames with the area grey: VACE paints only where the mask is.
    graph['37'] = {
      class_type: 'ImageCompositeMasked',
      inputs: {
        destination: ['3', 0],
        source: ['36', 0],
        x: 0,
        y: 0,
        resize_source: false,
        mask: ['35', 0],
      },
    };
    control = ['37', 0];
    masks = ['35', 0];
  }
  Object.assign(graph, {
    '38': {
      class_type: 'WanVaceToVideo',
      inputs: {
        positive: ['14', 0],
        negative: ['15', 0],
        vae: ['16', 0],
        width,
        height,
        length: frames,
        batch_size: 1,
        strength: 1,
        control_video: control,
        ...(masks ? { control_masks: masks } : {}),
        ...(input.reference && !masks ? { reference_image: ['27', 0] } : {}),
      },
    },
    '41': {
      class_type: 'KSamplerAdvanced',
      inputs: {
        model: ['12', 0],
        add_noise: 'enable',
        noise_seed: input.seed,
        steps: 4,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        positive: ['38', 0],
        negative: ['38', 1],
        latent_image: ['38', 2],
        start_at_step: 0,
        end_at_step: 2,
        return_with_leftover_noise: 'enable',
      },
    },
    '42': {
      class_type: 'KSamplerAdvanced',
      inputs: {
        model: ['22', 0],
        add_noise: 'disable',
        noise_seed: input.seed,
        steps: 4,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        positive: ['38', 0],
        negative: ['38', 1],
        latent_image: ['41', 0],
        start_at_step: 2,
        end_at_step: 10000,
        return_with_leftover_noise: 'disable',
      },
    },
    '43': { class_type: 'TrimVideoLatent', inputs: { samples: ['42', 0], trim_amount: ['38', 3] } },
    '44': {
      class_type: 'VAEDecodeTiled',
      inputs: {
        samples: ['43', 0],
        vae: ['16', 0],
        tile_size: 512,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 8,
      },
    },
    '39': { class_type: 'CreateVideo', inputs: { images: ['44', 0], fps: input.fps } },
    [CLIP_VACE_SAVE_NODE]: {
      class_type: 'SaveVideo',
      inputs: { video: ['39', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
    },
  });
  if (input.lowOnly) {
    (graph['41'] as { inputs: Record<string, unknown> }).inputs.model = ['22', 0];
    delete graph['10'];
    delete graph['11'];
    delete graph['12'];
  }
  return graph;
}

export const CLIP_TRACK_SAVE_NODE = '10';
export const CLIP_TRACK_MODEL = 'sam3.1_multiplex_fp16.safetensors';

/**
 * SAM 3 follows what was painted on the first frame through the whole clip: the clip (scaled to
 * the re-render size) and the painted picture in, a black-and-white mask video out, as long as
 * the clip (Remove from clip cuts it per chunk). Live: a mug held in a moving hand, followed.
 */
export function buildClipTrackGraph(input: {
  video: string;
  /** The first frame's painted area (white), followed through the clip… */
  mask?: string;
  /** …or what to find in every frame by name ("person"), no painting needed. */
  find?: string;
  /** Everything but what was found (Change the background), the found area grown a little first. */
  invert?: boolean;
  width: number;
  height: number;
  fps: number;
  prefix: string;
}): Record<string, unknown> {
  const { width, height } = input;
  if (input.find) {
    return {
      '1': { class_type: 'LoadVideo', inputs: { file: input.video } },
      '2': { class_type: 'GetVideoComponents', inputs: { video: ['1', 0] } },
      '3': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CLIP_TRACK_MODEL } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: input.find, clip: ['3', 1] } },
      '11': {
        class_type: 'ImageScale',
        inputs: { image: ['2', 0], upscale_method: 'lanczos', width, height, crop: 'disabled' },
      },
      '6': {
        class_type: 'SAM3_VideoTrack',
        inputs: {
          images: ['11', 0],
          model: ['3', 0],
          detection_threshold: 0.4,
          max_objects: 4,
          detect_interval: 1,
          conditioning: ['4', 0],
        },
      },
      '7': { class_type: 'SAM3_TrackToMask', inputs: { track_data: ['6', 0], object_indices: '' } },
      // Grown before it is inverted: hair and a hand's edge stay theirs, not the new place's.
      '12': {
        class_type: 'GrowMask',
        inputs: {
          mask: ['7', 0],
          expand: Math.max(4, Math.round(Math.min(width, height) / 100)),
          tapered_corners: true,
        },
      },
      ...(input.invert ? { '13': { class_type: 'InvertMask', inputs: { mask: ['12', 0] } } } : {}),
      '8': { class_type: 'MaskToImage', inputs: { mask: [input.invert ? '13' : '12', 0] } },
      '9': { class_type: 'CreateVideo', inputs: { images: ['8', 0], fps: input.fps } },
      [CLIP_TRACK_SAVE_NODE]: {
        class_type: 'SaveVideo',
        inputs: { video: ['9', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
      },
    };
  }
  return {
    '1': { class_type: 'LoadVideo', inputs: { file: input.video } },
    '2': { class_type: 'GetVideoComponents', inputs: { video: ['1', 0] } },
    '3': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CLIP_TRACK_MODEL } },
    '4': { class_type: 'LoadImage', inputs: { image: input.mask ?? '' } },
    '11': {
      class_type: 'ImageScale',
      inputs: { image: ['2', 0], upscale_method: 'lanczos', width, height, crop: 'disabled' },
    },
    '12': {
      class_type: 'ImageScale',
      inputs: { image: ['4', 0], upscale_method: 'nearest-exact', width, height, crop: 'disabled' },
    },
    '5': { class_type: 'ImageToMask', inputs: { image: ['12', 0], channel: 'red' } },
    '6': {
      class_type: 'SAM3_VideoTrack',
      inputs: {
        images: ['11', 0],
        model: ['3', 0],
        detection_threshold: 0.5,
        max_objects: 1,
        detect_interval: 1,
        initial_mask: ['5', 0],
      },
    },
    '7': { class_type: 'SAM3_TrackToMask', inputs: { track_data: ['6', 0], object_indices: '' } },
    '8': { class_type: 'MaskToImage', inputs: { mask: ['7', 0] } },
    '9': { class_type: 'CreateVideo', inputs: { images: ['8', 0], fps: input.fps } },
    [CLIP_TRACK_SAVE_NODE]: {
      class_type: 'SaveVideo',
      inputs: { video: ['9', 0], filename_prefix: input.prefix, format: 'mp4', codec: 'h264' },
    },
  };
}
