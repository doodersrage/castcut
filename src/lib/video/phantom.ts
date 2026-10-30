/**
 * Generate a shot *with the Cast* (Phantom, ByteDance's subject-consistent Wan 2.1): a clip made
 * from words and the Cast's own pictures — no still drawn first — so her face, hair and clothes
 * carry into a shot that never existed. Cut's Generate a shot uses it when ComfyUI has the model.
 *
 * Spike (2026-10-30, a 480×832 5 s shot from a face crop and a full-length frame): with the
 * lightx2v text-to-video step-distill LoRA, 6 steps took 92 s and matched the reference face at
 * 0.35–0.38 (the Cast's own H3 keyframes: 0.22); without it, 20 steps took 14 min. It drew light
 * beams in the sky and an arm tattoo nobody asked for — named in the negative. Pure.
 */

export const PHANTOM_FILES = {
  unet: 'Wan2_1-T2V-14B-Phantom_fp8_e4m3fn_scaled_KJ.safetensors',
  /** Optional: 6 steps at CFG 1 instead of 20 with both guidances. */
  lora: 'lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors',
  clip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  vae: 'Wan2_1_VAE_bf16.safetensors',
} as const;

export const PHANTOM_REQUIRED_NODE = 'WanPhantomSubjectToVideo';
export const PHANTOM_SAVE_NODE = 'castcut_phantom_save';
/** 81 frames at 16 fps: about 5 s, Phantom's trained length. */
export const PHANTOM_FRAMES = 81;
export const PHANTOM_FPS = 16;
/** At most this many reference pictures (the face lock, the look plate, the outfit). */
export const PHANTOM_MAX_REFERENCES = 3;

const NEGATIVE =
  'blurry, low quality, distorted face, a different person, extra people, extra limbs, extra fingers, deformed hands, tattoos, light beams, lasers, lens flare streaks, text, watermark, subtitles, cartoon, static, still frame';

export type PhantomShape = 'wide' | 'vertical' | 'square';

/** The film's shape at Phantom's 480p budget (sides on its 16 px grid). */
export function phantomSize(shape: PhantomShape): { width: number; height: number } {
  if (shape === 'vertical') return { width: 480, height: 832 };
  if (shape === 'square') return { width: 624, height: 624 };
  return { width: 832, height: 480 };
}

/** The prompt: the shot's words, who it is (as in the pictures), one continuous shot. */
export function phantomPrompt(words: string, cast?: { name?: string; look?: string }): string {
  const who = cast?.name?.trim();
  const look = cast?.look?.trim().replace(/[.\s]+$/, '');
  return [
    words.trim().replace(/[.\s]+$/, '') + '.',
    who
      ? `${who} is the person in the reference pictures — the same face, hair and build.`
      : 'The person is the one in the reference pictures — the same face, hair and build.',
    look ? `${look}.` : '',
    'One continuous shot, natural light and colour, photorealistic.',
  ]
    .filter(Boolean)
    .join(' ');
}

type Node = { class_type: string; inputs: Record<string, unknown> };

/** The Phantom graph: the references batched in, the shot sampled and saved as an MP4. */
export function buildPhantomGraph(input: {
  prompt: string;
  /** ComfyUI input filenames of the reference pictures (at least one). */
  references: string[];
  width: number;
  height: number;
  seed: number;
  prefix: string;
  /** The step-distill LoRA is installed: 6 steps at CFG 1. */
  fast: boolean;
  frames?: number;
}): Record<string, Node> {
  const references = input.references.slice(0, PHANTOM_MAX_REFERENCES);
  if (!references.length) throw new Error('Phantom needs at least one picture of the Cast.');
  const graph: Record<string, Node> = {
    unet: {
      class_type: 'UNETLoader',
      inputs: { unet_name: PHANTOM_FILES.unet, weight_dtype: 'default' },
    },
    clip: {
      class_type: 'CLIPLoader',
      inputs: { clip_name: PHANTOM_FILES.clip, type: 'wan', device: 'default' },
    },
    vae: { class_type: 'VAELoader', inputs: { vae_name: PHANTOM_FILES.vae } },
    positive: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: input.prompt } },
    negative: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: NEGATIVE } },
  };
  let model: [string, number] = ['unet', 0];
  if (input.fast) {
    graph.lora = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model, lora_name: PHANTOM_FILES.lora, strength_model: 1 },
    };
    model = ['lora', 0];
  }
  graph.shift = { class_type: 'ModelSamplingSD3', inputs: { model, shift: 5 } };
  let images: [string, number] | null = null;
  references.forEach((name, index) => {
    graph[`ref${index}`] = { class_type: 'LoadImage', inputs: { image: name } };
    if (!images) {
      images = [`ref${index}`, 0];
      return;
    }
    // ImageBatch scales the second picture to the first's size.
    graph[`batch${index}`] = {
      class_type: 'ImageBatch',
      inputs: { image1: images, image2: [`ref${index}`, 0] },
    };
    images = [`batch${index}`, 0];
  });
  graph.phantom = {
    class_type: PHANTOM_REQUIRED_NODE,
    inputs: {
      positive: ['positive', 0],
      negative: ['negative', 0],
      vae: ['vae', 0],
      width: input.width,
      height: input.height,
      length: input.frames ?? PHANTOM_FRAMES,
      batch_size: 1,
      images,
    },
  };
  // The text and the pictures guided apart (Phantom's own 7.5 / 5); one pass with the LoRA.
  graph.guider = {
    class_type: 'DualCFGGuider',
    inputs: {
      model: ['shift', 0],
      cond1: ['phantom', 0],
      cond2: ['phantom', 1],
      negative: ['phantom', 2],
      cfg_conds: input.fast ? 1 : 7.5,
      cfg_cond2_negative: input.fast ? 1 : 5,
      style: 'regular',
    },
  };
  graph.noise = { class_type: 'RandomNoise', inputs: { noise_seed: input.seed } };
  graph.sampler = {
    class_type: 'KSamplerSelect',
    inputs: { sampler_name: input.fast ? 'euler' : 'uni_pc' },
  };
  graph.sigmas = {
    class_type: 'BasicScheduler',
    inputs: { model: ['shift', 0], scheduler: 'simple', steps: input.fast ? 6 : 20, denoise: 1 },
  };
  graph.sample = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise', 0],
      guider: ['guider', 0],
      sampler: ['sampler', 0],
      sigmas: ['sigmas', 0],
      latent_image: ['phantom', 3],
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } };
  graph.video = { class_type: 'CreateVideo', inputs: { images: ['decode', 0], fps: PHANTOM_FPS } };
  graph[PHANTOM_SAVE_NODE] = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: input.prefix, format: 'mp4' },
  };
  return graph;
}

/** What this ComfyUI can do: Phantom at all, and fast (the step-distill LoRA). */
export function phantomReadiness(installed: {
  unets: readonly string[];
  loras: readonly string[];
  nodes: readonly string[];
}): { available: boolean; fast: boolean } {
  const available =
    installed.nodes.includes(PHANTOM_REQUIRED_NODE) &&
    installed.unets.some(name => name.endsWith(PHANTOM_FILES.unet));
  return {
    available,
    fast: available && installed.loras.some(name => name.endsWith(PHANTOM_FILES.lora)),
  };
}
