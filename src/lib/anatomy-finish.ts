/**
 * Anatomy finish: Qwen-Image 2.1 Turbo draws women's genitals malformed. An anatomy LoRA fixes
 * them, but on the whole render it moves the pose and her face — even on the last step alone
 * (likeness 0.14 → 0.22; on the full schedule 0.33). Turbo settles shape in its early, high-noise
 * steps, so the LoRA has to work where the shape is made, and only there: the still is kept as it
 * rendered, the crotch is cropped (from the DWPose hips and knees), re-rendered at 1024 with the
 * LoRA at a partial denoise, colour-matched and blended back under a soft oval. Pose and face are
 * the original's pixel for pixel (live 2026-10-18: 5/5 solos, no seam at full size; denoise 0.85
 * invented a hand, 0.70 kept the hand and thighs).
 */

/** The anatomy LoRA (Civitai 2986844 "FemaledVaginus-NSFW" v1.3b) — matched by name. */
export const ANATOMY_FINISH_LORA_RE = /femaled[-_ ]?vaginus/i;
export const ANATOMY_FINISH_LORA_STRENGTH = 1.0;

/** Turbo's last four sigmas: denoise ≈ 0.70 of the crop. */
export const ANATOMY_FINISH_SIGMAS = [0.89508, 0.845148, 0.704534, 0.414568, 0];

/** The crop is re-rendered at this size (square). */
export const ANATOMY_FINISH_SIZE = 1024;

export const ANATOMY_FINISH_PROMPT =
  'Close-up photograph of the bare crotch of a nude adult woman, her hand resting near it: natural, realistic female anatomy — vulva with labia majora and labia minora in correct, true-to-life shape and proportion, natural skin texture with visible pores, soft natural shading, photorealistic anatomy. Keep the hand, fingers, thighs, skin tone, light and framing exactly as they are.';

export const ANATOMY_FINISH_SAVE_NODE = '99';

export type AnatomyBox = { x: number; y: number; size: number };

type Keypoint = { x: number; y: number; c: number };

/** OpenPose BODY_18 indices. */
const R_HIP = 8;
const R_KNEE = 9;
const L_HIP = 11;
const L_KNEE = 12;

function keypoint(flat: readonly number[], index: number): Keypoint | null {
  const x = flat[index * 3];
  const y = flat[index * 3 + 1];
  const c = flat[index * 3 + 2];
  if (typeof x !== 'number' || typeof y !== 'number' || typeof c !== 'number') return null;
  return c > 0.3 && (x > 0 || y > 0) ? { x, y, c } : null;
}

/**
 * The square around her crotch: centred between the hips, a third of the way down to the knees,
 * 1.7 hip widths wide (at least 256 px), kept inside the picture. Null without both hips.
 */
export function anatomyBoxFromPose(
  keypoints: readonly number[],
  width: number,
  height: number
): AnatomyBox | null {
  const rHip = keypoint(keypoints, R_HIP);
  const lHip = keypoint(keypoints, L_HIP);
  if (!rHip || !lHip) return null;
  const hipWidth = Math.max(Math.abs(lHip.x - rHip.x), width * 0.12);
  const hipY = (rHip.y + lHip.y) / 2;
  const knees = [keypoint(keypoints, R_KNEE), keypoint(keypoints, L_KNEE)].filter(
    (k): k is Keypoint => k !== null
  );
  const kneeY = knees.length ? Math.max(...knees.map(k => k.y)) : hipY + hipWidth;
  const cx = (rHip.x + lHip.x) / 2;
  const cy = hipY + 0.35 * Math.max(0, kneeY - hipY);
  const size = Math.round(Math.min(Math.max(256, 1.7 * hipWidth), width, height));
  const x = Math.round(Math.min(Math.max(0, cx - size / 2), width - size));
  const y = Math.round(Math.min(Math.max(0, cy - size / 2), height - size));
  return { x, y, size };
}

/** The first person's BODY keypoints in DWPose's `openpose_json`, or null. */
export function firstPersonKeypoints(openposeJson: string): number[] | null {
  try {
    const parsed = JSON.parse(openposeJson) as unknown;
    const frame = Array.isArray(parsed) ? parsed[0] : parsed;
    const people = (frame as { people?: Array<{ pose_keypoints_2d?: unknown }> })?.people;
    const flat = people?.[0]?.pose_keypoints_2d;
    return Array.isArray(flat) && flat.every(v => typeof v === 'number') ? flat : null;
  } catch {
    return null;
  }
}

/**
 * Per-channel offset that takes the patch's average colour to the original's: the re-rendered
 * crop came out a little warmer than the still around it.
 */
export function colourMatch(
  patch: { mean: readonly number[]; std: readonly number[] },
  original: { mean: readonly number[]; std: readonly number[] }
): { gain: number[]; offset: number[] } {
  // Mean only: matching the spread as well flattened the patch (duller, greyer than the skin
  // around it, 2026-10-18).
  const gain = [1, 1, 1];
  const offset = [0, 1, 2].map(i => (original.mean[i] ?? 0) - (patch.mean[i] ?? 0));
  return { gain, offset };
}

/** The pass's graph: the crop, re-rendered on Turbo with the anatomy LoRA. */
export function buildAnatomyFinishGraph(input: {
  cropName: string;
  /** Turbo checkpoint, or the base with the Turbo LoRA. */
  unet: string;
  turboLora?: string | null;
  clip: string;
  vae: string;
  anatomyLora: string;
  seed?: number;
}): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const graph: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {
    '1': { class_type: 'LoadImage', inputs: { image: input.cropName } },
    '2': { class_type: 'UNETLoader', inputs: { unet_name: input.unet, weight_dtype: 'default' } },
    '3': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: input.clip, type: 'qwen_image', device: 'default' },
    },
    '4': { class_type: 'VAELoader', inputs: { vae_name: input.vae } },
    '5': { class_type: 'VAEEncode', inputs: { pixels: ['1', 0], vae: ['4', 0] } },
  };
  let model: [string, number] = ['2', 0];
  if (input.turboLora) {
    graph['6'] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model, lora_name: input.turboLora, strength_model: 1 },
    };
    model = ['6', 0];
  }
  graph['7'] = {
    class_type: 'LoraLoaderModelOnly',
    inputs: {
      model,
      lora_name: input.anatomyLora,
      strength_model: ANATOMY_FINISH_LORA_STRENGTH,
    },
  };
  Object.assign(graph, {
    '8': {
      class_type: 'TextEncodeQwenImage21',
      inputs: {
        clip: ['3', 0],
        vae: ['4', 0],
        prompt: ANATOMY_FINISH_PROMPT,
        negative_prompt: '',
        resolution: ANATOMY_FINISH_SIZE,
      },
    },
    '9': { class_type: 'BasicGuider', inputs: { model: ['7', 0], conditioning: ['8', 0] } },
    '10': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral' } },
    '11': {
      class_type: 'ManualSigmas',
      inputs: { sigmas: ANATOMY_FINISH_SIGMAS.map(s => s.toFixed(6)).join(', ') },
    },
    '12': { class_type: 'RandomNoise', inputs: { noise_seed: input.seed ?? 4242 } },
    '13': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['12', 0],
        guider: ['9', 0],
        sampler: ['10', 0],
        sigmas: ['11', 0],
        latent_image: ['5', 0],
      },
    },
    '14': { class_type: 'VAEDecode', inputs: { samples: ['13', 0], vae: ['4', 0] } },
    [ANATOMY_FINISH_SAVE_NODE]: {
      class_type: 'SaveImage',
      inputs: { images: ['14', 0], filename_prefix: 'Castcut-anatomy-finish' },
    },
  });
  return graph;
}
