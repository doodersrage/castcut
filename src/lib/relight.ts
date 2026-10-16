/**
 * "Relight": a finished still re-lit (golden hour, window daylight, lamp light …) with everything
 * else kept, on the Qwen-Image-Edit Relight LoRA (dx8152/Qwen-Image-Edit-2509-Relight, trigger
 * 重新照明 "relight") over the still engine's edit checkpoint. Client-safe: graph and presets only.
 */

export const RELIGHT_SAVE_NODE = '10';
export const RELIGHT_LORA = 'Qwen-Edit-Relight.safetensors';

export const RELIGHT_LOOKS = [
  {
    id: 'golden',
    label: 'Golden hour',
    light: 'low golden-hour sunlight from the side, warm color temperature, long soft shadows',
  },
  {
    id: 'window',
    label: 'Window daylight',
    light: 'soft natural daylight from a window, neutral color, gentle shadows',
  },
  {
    id: 'lamp',
    label: 'Lamp at night',
    light: 'a single warm table lamp at night, dark room, soft falloff into shadow',
  },
  {
    id: 'overcast',
    label: 'Overcast',
    light: 'flat overcast daylight, cool soft light with almost no shadows',
  },
  {
    id: 'neon',
    label: 'Neon night',
    light: 'pink and blue neon light at night from the side, deep shadows',
  },
  {
    id: 'candle',
    label: 'Candlelight',
    light: 'flickering candlelight from below, very warm, dark surroundings',
  },
] as const;

export type RelightLookId = (typeof RELIGHT_LOOKS)[number]['id'];

export function relightPrompt(look: RelightLookId | string): string {
  const preset = RELIGHT_LOOKS.find(entry => entry.id === look);
  const light = (preset?.light ?? look).trim();
  return `重新照明, relight the image using ${light}. Keep every person, face, expression, pose, body, clothing and the room exactly as they are — only the light changes.`;
}

/** Edit size near 1 MP keeping the still's shape, sides multiples of 16. */
export function relightSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.sqrt((1024 * 1024) / Math.max(1, width * height));
  const snap = (value: number) => Math.max(16, Math.round((value * scale) / 16) * 16);
  return { width: snap(width), height: snap(height) };
}

/**
 * Rapid AIO checkpoint (its own CLIP / VAE; 4–6 Lightning steps built in) + the Relight LoRA; the
 * still is Image 1 and the reference latent.
 */
export function buildRelightGraph(input: {
  checkpoint: string;
  image: string;
  prompt: string;
  width: number;
  height: number;
  seed: number;
  prefix: string;
  loraStrength?: number;
}): Record<string, unknown> {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: input.checkpoint } },
    '2': {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['1', 0], lora_name: RELIGHT_LORA, strength_model: input.loraStrength ?? 1 },
    },
    '3': { class_type: 'LoadImage', inputs: { image: input.image } },
    '4': {
      class_type: 'ResizeAndPadImage',
      inputs: {
        image: ['3', 0],
        target_width: input.width,
        target_height: input.height,
        padding_color: 'white',
        interpolation: 'lanczos',
      },
    },
    '5': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { clip: ['1', 1], prompt: input.prompt, image1: ['4', 0] },
    },
    '6': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { clip: ['1', 1], prompt: '', image1: ['4', 0] },
    },
    '7': { class_type: 'VAEEncode', inputs: { pixels: ['4', 0], vae: ['1', 2] } },
    '8': { class_type: 'ReferenceLatent', inputs: { conditioning: ['5', 0], latent: ['7', 0] } },
    '9': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['2', 0], shift: 3.1 } },
    '11': {
      class_type: 'EmptySD3LatentImage',
      inputs: { width: input.width, height: input.height, batch_size: 1 },
    },
    '12': {
      class_type: 'KSampler',
      inputs: {
        model: ['9', 0],
        positive: ['8', 0],
        negative: ['6', 0],
        latent_image: ['11', 0],
        seed: input.seed,
        steps: 6,
        cfg: 1,
        sampler_name: 'euler_ancestral',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    '13': { class_type: 'VAEDecode', inputs: { samples: ['12', 0], vae: ['1', 2] } },
    [RELIGHT_SAVE_NODE]: {
      class_type: 'SaveImage',
      inputs: { images: ['13', 0], filename_prefix: input.prefix },
    },
  };
}
