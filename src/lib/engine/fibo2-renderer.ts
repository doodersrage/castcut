/**
 * Bria Fibo 2.0 Edit Turbo still engine (2026-10-23): a 4-step instruction editor (Qwen3-VL 4B
 * text encoder, FLUX.2 VAE) that takes up to ~4 reference images named `<image_1>`, `<image_2>`…
 *
 * It rides Qwen-Image 2.1's path end to end: the queue builds the Rapid AIO edit graph, the 2.1
 * converter turns it into a 2.1 graph (its recipes, prompt fixes, dropped maps, canvas and
 * hand-offs), and this pass swaps the 2.1 model, encoder and sampler for Fibo's — same prompt,
 * same reference images, same canvas (÷16), same seed.
 *
 * Two ComfyUI routes:
 * - `pack`: the ComfyUI-Fibo2 custom nodes (github.com/drphero/ComfyUI-Fibo2) on their converted
 *   checkpoint (theunlikely/Fibo-2.0-edit-turbo-ComfyUI — unfused tensors with `fibo2_native_format`
 *   metadata). Tested.
 * - `native`: ComfyUI's own Fibo 2.0 support (comfyanonymous/ComfyUI #17240, after v0.42.5):
 *   UNETLoader on Comfy-Org/Fibo-2.0's repackaged file, CLIPLoader type `fibo2`, TextEncodeFibo2.
 *   Used only when the pack's nodes are missing and ComfyUI has the built-in node. Not yet run
 *   here (the Desktop's v0.42.5 core predates it).
 *
 * The two diffusion files share a name upstream (`fibo2_edit_turbo_bf16.safetensors`) but not a
 * layout: the pack refuses Comfy-Org's file. The object_info fetch reads each candidate's
 * safetensors metadata (`/view_metadata`) so the pack is handed the converted one.
 *
 * Pose bench (2026-10-23, posebench3's own Turbo Day graphs converted here, seeds 11/22, by eye):
 * custom joints right 36/48 (75%) — Turbo 83%, Noct-Q 93%, Edit 2511 62%; from a photo 16/24
 * (67%) — 75% / 79% / 62%. No pose where it beat the better of Turbo and Noct-Q, so it is not in
 * "Pick the best engine per pose". Misses: one leg lifted, a kneel drawn as a low lunge, sits on a
 * ledge instead of the ground, shallow deadlift / skating crouch. Anatomy clean in all 72 stills;
 * face close to the plate but the hair redder and the skin smoother. ~17 s a still (1104×1472,
 * 4090; ~28 s the first after a load), ~29 s with two references.
 * The pose-map lead line (fibo2PoseMapLine) changed 1 of 36 (a back view stayed a back view);
 * the prompt as VGL JSON (`edit_instruction` + description) changed none of 6 — plain is kept.
 */

import {
  isNudePrompt,
  isPoseGuideFilename,
  QWEN_IMAGE_21_FILES,
  QWEN_IMAGE_21_TURBO_LORA,
} from './qwen-image-21-renderer';

type WorkflowNode = { class_type: string; inputs: Record<string, unknown> };
type Workflow = Record<string, WorkflowNode>;

export const FIBO2_MODEL_ID = 'fibo-2-edit-turbo';

/** ComfyUI-Fibo2 node pack (the tested route). */
export const FIBO2_PACK_NODES = {
  model: 'Fibo2DiffusionModelLoader',
  clip: 'Fibo2TextEncoderLoader',
  encode: 'Fibo2EditConditioning',
  scheduler: 'Fibo2Scheduler',
} as const;
export const FIBO2_PACK_URL = 'https://github.com/drphero/ComfyUI-Fibo2';
/** ComfyUI's built-in Fibo 2.0 node (core #17240) and its CLIPLoader type. */
export const FIBO2_NATIVE_NODE = 'TextEncodeFibo2';
export const FIBO2_NATIVE_CLIP_TYPE = 'fibo2';

export const FIBO2_FILES = {
  /** theunlikely's converted checkpoint (pack route) — upstream filename. */
  packUnet: 'fibo2_edit_turbo_bf16.safetensors',
  /** Comfy-Org/Fibo-2.0 repackage (built-in route) — the same upstream filename, fused layout. */
  nativeUnet: 'fibo2_edit_turbo_bf16.safetensors',
  clip: 'qwen3vl_4b_int8_convrot.safetensors',
  clipBf16: 'qwen3vl_4b_bf16.safetensors',
  vae: 'flux2-vae.safetensors',
} as const;

/** Bria's turbo recipe: 4 Euler steps, CFG 1. */
export const FIBO2_STEPS = 4;

/** Diffusion files that are Fibo 2.0 Edit Turbo by name (not the Dev model, not a GGUF). */
export const FIBO2_UNET_RE = /fibo[-_ ]?2.*edit.*turbo.*\.safetensors$/i;

export function isFibo2Model(model: string | null | undefined): boolean {
  return (
    String(model ?? '')
      .trim()
      .toLowerCase() === FIBO2_MODEL_ID
  );
}

const baseName = (name: string) => name.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';

export type Fibo2Inventory = {
  nodeTypes?: Iterable<string> | null;
  /** The pack loader's diffusion-model list (Fibo2DiffusionModelLoader model_name). */
  fibo2Unets?: readonly string[] | null;
  /**
   * The Fibo files whose safetensors metadata says they are the pack's converted format
   * (`fibo2_native_format` = 1). Undefined: not read — fall back to names.
   */
  fibo2PackUnets?: readonly string[] | null;
  /** UNETLoader list (the built-in route). */
  unets?: readonly string[] | null;
  clips?: readonly string[] | null;
  clipLoaderTypes?: readonly string[] | null;
  vaes?: readonly string[] | null;
};

export type Fibo2Files = {
  route: 'pack' | 'native';
  unet: string;
  clip: string;
  vae: string;
};

function pickClip(clips: readonly string[] | null | undefined): string | undefined {
  if (!clips) return undefined;
  const find = (file: string) => clips.find(entry => baseName(entry) === file.toLowerCase());
  return (
    find(FIBO2_FILES.clip) ??
    find(FIBO2_FILES.clipBf16) ??
    clips.find(entry => /qwen3[-_]?vl[-_]?4b/i.test(baseName(entry)) && !/gguf/i.test(entry))
  );
}

function pickVae(vaes: readonly string[] | null | undefined): string | undefined {
  if (!vaes) return undefined;
  return (
    vaes.find(entry => baseName(entry) === FIBO2_FILES.vae) ??
    vaes.find(entry => /flux[-_.]?2.*vae/i.test(baseName(entry)))
  );
}

/** The pack's converted checkpoint: metadata-verified when read, else by name. */
function pickPackUnet(inventory: Fibo2Inventory): string | undefined {
  if (inventory.fibo2PackUnets) {
    const verified = [...inventory.fibo2PackUnets];
    return (
      verified.find(entry => /nodepack/i.test(baseName(entry))) ??
      verified.find(entry => FIBO2_UNET_RE.test(baseName(entry))) ??
      verified[0]
    );
  }
  const candidates = (inventory.fibo2Unets ?? []).filter(
    entry => FIBO2_UNET_RE.test(baseName(entry)) && !/int8|fp8|nvfp4|w4a8/i.test(baseName(entry))
  );
  return (
    candidates.find(entry => /nodepack/i.test(baseName(entry))) ??
    candidates.find(entry => baseName(entry) === FIBO2_FILES.packUnet) ??
    candidates[0]
  );
}

/** The built-in route's file: Comfy-Org's repackage (not one the metadata says is the pack's). */
function pickNativeUnet(inventory: Fibo2Inventory): string | undefined {
  const pack = new Set((inventory.fibo2PackUnets ?? []).map(baseName));
  const candidates = (inventory.unets ?? []).filter(
    entry => FIBO2_UNET_RE.test(baseName(entry)) && !/gguf/i.test(entry)
  );
  return (
    candidates.find(
      entry => !pack.has(baseName(entry)) && baseName(entry) === FIBO2_FILES.nativeUnet
    ) ??
    candidates.find(entry => !pack.has(baseName(entry))) ??
    candidates[0]
  );
}

/**
 * The route and files Fibo renders with on this ComfyUI, or null when it can't run: the pack's
 * four nodes and its converted checkpoint first, else the built-in node with a Fibo file — each
 * with the Qwen3-VL 4B encoder and the FLUX.2 VAE.
 */
export function pickFibo2Files(inventory: Fibo2Inventory): Fibo2Files | null {
  const nodeTypes = inventory.nodeTypes ? new Set(inventory.nodeTypes) : null;
  const clip = pickClip(inventory.clips);
  const vae = pickVae(inventory.vaes);
  if (!clip || !vae) return null;
  const packNodes = Object.values(FIBO2_PACK_NODES);
  // No node list (an older cache): the pack loader's own file list is only there with the pack.
  const hasPack = nodeTypes
    ? packNodes.every(type => nodeTypes.has(type))
    : Boolean(inventory.fibo2Unets?.length);
  if (hasPack) {
    const unet = pickPackUnet(inventory);
    if (unet) return { route: 'pack', unet, clip, vae };
  }
  // The built-in route: its encode node (when the node list is known) and CLIPLoader type.
  const hasNative =
    (!nodeTypes || nodeTypes.has(FIBO2_NATIVE_NODE)) &&
    Boolean(inventory.clipLoaderTypes?.includes(FIBO2_NATIVE_CLIP_TYPE));
  if (hasNative) {
    const unet = pickNativeUnet(inventory);
    if (unet) return { route: 'native', unet, clip, vae };
  }
  return null;
}

/** Default files when the inventory is unknown: the pack route, upstream names. */
export const FIBO2_DEFAULT_FILES: Fibo2Files = {
  route: 'pack',
  unet: FIBO2_FILES.packUnet,
  clip: FIBO2_FILES.clip,
  vae: FIBO2_FILES.vae,
};

/**
 * A pose map is a stick figure: said first, it is followed as the body's pose and not painted
 * into the scene. Pose bench A/B in the CHANGELOG.
 */
export function fibo2PoseMapLine(image: number): string {
  return `<image_${image}> is only a stick-figure pose map, not a person and not part of the photo: pose her whole body exactly like that figure — the same head, arms, hands, legs and lean, seen from the same side — and never draw the stick figure.`;
}

/**
 * The 2.1 prompt in Fibo's words: `<image1>` → `<image_1>` (Fibo's reference syntax), and a pose
 * map named first when one is attached (`poseMapImage`, 1-based).
 */
export function toFibo2Prompt(
  prompt: string,
  options: { poseMapImage?: number | null } = {}
): string {
  const text = prompt
    .replace(/<image([1-9])>/g, '<image_$1>')
    .replace(/\b[Ii]mage ([1-9])\b/g, '<image_$1>');
  const map = options.poseMapImage;
  return map && map > 0 ? `${fibo2PoseMapLine(map)} ${text}` : text;
}

const isRef = (value: unknown): value is [string, number] =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';

const OUTPUT_CLASS = /^(?:Save|Preview)/;

function pruneUnreachable(workflow: Workflow): Workflow {
  const outputs = Object.entries(workflow)
    .filter(([, node]) => OUTPUT_CLASS.test(node.class_type))
    .map(([id]) => id);
  if (outputs.length === 0) return workflow;
  const keep = new Set<string>();
  const stack = [...outputs];
  while (stack.length) {
    const id = stack.pop()!;
    if (keep.has(id) || !workflow[id]) continue;
    keep.add(id);
    for (const value of Object.values(workflow[id].inputs)) {
      if (isRef(value)) stack.push(value[0]);
    }
  }
  return Object.fromEntries(Object.entries(workflow).filter(([id]) => keep.has(id)));
}

function sourceFilename(workflow: Workflow, ref: [string, number]): string {
  let current: unknown = ref;
  for (let hops = 0; hops < 12 && isRef(current); hops += 1) {
    const node = workflow[current[0]];
    if (!node) return '';
    if (node.class_type === 'LoadImage') return String(node.inputs.image ?? '');
    current = node.inputs.image ?? node.inputs.pixels ?? node.inputs.images;
  }
  return '';
}

/** The sampler fed by the 2.1 encoder (through a BasicGuider on the fast passes). */
function findSampler(workflow: Workflow, encoderId: string): string | null {
  for (const [id, node] of Object.entries(workflow)) {
    const positive = node.inputs.positive;
    if (isRef(positive) && positive[0] === encoderId) return id;
    const guider = node.inputs.guider;
    if (node.class_type === 'SamplerCustomAdvanced' && isRef(guider)) {
      const conditioning = workflow[guider[0]]?.inputs.conditioning;
      if (isRef(conditioning) && conditioning[0] === encoderId) return id;
    }
  }
  return null;
}

const snap16 = (value: number) => Math.max(16, Math.round(value / 16) * 16);

/**
 * A Qwen-Image 2.1 graph (convertQwenEditWorkflowToImage21's output) → Fibo 2.0 Edit Turbo.
 * Not converted when there is no 2.1 encoder (a still the 2.1 pass kept on Rapid's graph — a
 * sex-pose duo — stays there).
 */
export function convertImage21WorkflowToFibo2(
  input: Record<string, unknown>,
  options: {
    files?: Fibo2Files | null;
    steps?: number;
    fallbackSize?: { width: number; height: number };
  } = {}
): { workflow: Record<string, unknown>; converted: boolean } {
  const workflow = structuredClone(input) as Workflow;
  const encoderId = Object.keys(workflow).find(
    id => workflow[id]?.class_type === 'TextEncodeQwenImage21'
  );
  if (!encoderId) return { workflow: input, converted: false };
  const samplerId = findSampler(workflow, encoderId);
  if (!samplerId) return { workflow: input, converted: false };
  const encoder = workflow[encoderId];
  const sampler = workflow[samplerId];
  const files = options.files ?? FIBO2_DEFAULT_FILES;

  const latentRef = sampler.inputs.latent_image;
  const latentNode = isRef(latentRef) ? workflow[latentRef[0]] : undefined;
  const width = snap16(Number(latentNode?.inputs.width) || options.fallbackSize?.width || 1024);
  const height = snap16(Number(latentNode?.inputs.height) || options.fallbackSize?.height || 1024);
  const noiseRef = sampler.inputs.noise;
  const seed = Number(
    (isRef(noiseRef) ? workflow[noiseRef[0]]?.inputs.noise_seed : sampler.inputs.seed) ?? 0
  );

  const refs = Object.entries(encoder.inputs)
    .map(([key, value]) => ({ n: Number(key.match(/^images\.image_(\d+)$/)?.[1]), value }))
    .filter(
      (entry): entry is { n: number; value: [string, number] } =>
        Number.isFinite(entry.n) && isRef(entry.value)
    )
    .sort((a, b) => a.n - b.n)
    .map(entry => entry.value);
  const mapIndex = refs.findIndex(ref => isPoseGuideFilename(sourceFilename(workflow, ref)));
  const prompt = toFibo2Prompt(String(encoder.inputs.prompt ?? ''), {
    poseMapImage: mapIndex >= 0 ? mapIndex + 1 : null,
  });

  let next = Math.max(0, ...Object.keys(workflow).map(id => Number(id) || 0)) + 1;
  const add = (node: WorkflowNode) => {
    const id = String(next++);
    workflow[id] = node;
    return id;
  };
  const vae = add({ class_type: 'VAELoader', inputs: { vae_name: files.vae } });
  const steps = options.steps ?? FIBO2_STEPS;

  if (files.route === 'native') {
    const model = add({
      class_type: 'UNETLoader',
      inputs: { unet_name: files.unet, weight_dtype: 'default' },
    });
    const clip = add({
      class_type: 'CLIPLoader',
      inputs: { clip_name: files.clip, type: FIBO2_NATIVE_CLIP_TYPE, device: 'default' },
    });
    const encodeInputs: Record<string, unknown> = {
      clip: [clip, 0],
      prompt,
      negative_prompt: '',
      vae: [vae, 0],
      width,
      height,
      batch_size: 1,
    };
    refs.forEach((ref, index) => {
      encodeInputs[`images.image_${index + 1}`] = ref;
    });
    const encode = add({ class_type: FIBO2_NATIVE_NODE, inputs: encodeInputs });
    workflow[samplerId] = {
      class_type: 'KSampler',
      inputs: {
        model: [model, 0],
        positive: [encode, 0],
        negative: [encode, 1],
        latent_image: [encode, 2],
        seed,
        steps,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    };
  } else {
    const model = add({
      class_type: FIBO2_PACK_NODES.model,
      inputs: { model_name: files.unet, dtype: 'default' },
    });
    const clip = add({
      class_type: FIBO2_PACK_NODES.clip,
      inputs: { clip_name: files.clip, dtype: 'default' },
    });
    const encodeInputs: Record<string, unknown> = {
      clip: [clip, 0],
      vae: [vae, 0],
      prompt,
      width,
      height,
      render_text_images: true,
    };
    // The pack's growing sockets are image0, image1, …
    refs.forEach((ref, index) => {
      encodeInputs[`images.image${index}`] = ref;
    });
    const encode = add({ class_type: FIBO2_PACK_NODES.encode, inputs: encodeInputs });
    const latent = add({
      class_type: 'EmptyFlux2LatentImage',
      inputs: { width, height, batch_size: 1 },
    });
    const sigmas = add({
      class_type: FIBO2_PACK_NODES.scheduler,
      inputs: { latent: [latent, 0], steps },
    });
    const guider = add({
      class_type: 'BasicGuider',
      inputs: { model: [model, 0], conditioning: [encode, 0] },
    });
    const noise = add({ class_type: 'RandomNoise', inputs: { noise_seed: seed } });
    const pick = add({ class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } });
    workflow[samplerId] = {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: [noise, 0],
        guider: [guider, 0],
        sampler: [pick, 0],
        sigmas: [sigmas, 0],
        latent_image: [latent, 0],
      },
    };
  }
  for (const node of Object.values(workflow)) {
    if (
      node.class_type === 'VAEDecode' &&
      isRef(node.inputs.samples) &&
      node.inputs.samples[0] === samplerId
    ) {
      node.inputs.vae = [vae, 0];
    }
  }
  return { workflow: pruneUnreachable(workflow), converted: true };
}

/** What a ComfyUI object_info read says about Fibo (models lists + node types). */
export function fibo2InventoryFrom(
  models:
    | {
        unets?: readonly string[];
        clips?: readonly string[];
        clipLoaderTypes?: readonly string[];
        vaes?: readonly string[];
        fibo2Unets?: readonly string[];
        fibo2PackUnets?: readonly string[];
      }
    | null
    | undefined,
  nodeTypes?: Iterable<string> | null
): Fibo2Inventory | null {
  if (!models) return null;
  return {
    nodeTypes: nodeTypes ?? null,
    fibo2Unets: models.fibo2Unets ?? null,
    fibo2PackUnets: models.fibo2PackUnets ?? null,
    unets: models.unets ?? null,
    clips: models.clips ?? null,
    clipLoaderTypes: models.clipLoaderTypes ?? null,
    vaes: models.vaes ?? null,
  };
}

/**
 * Fibo renders this still (its 2.1 graph): not a nude one. Bria trains on licensed data, and on
 * Day Intimate beats (2026-10-23, 3 solo + 3 duo, Turbo's own graphs) it drew none nude — topless
 * at most, briefs on every solo, bra and briefs on the duos, no genitals, and the sex placement
 * softened into a pose beside him. Those stills render on 2.1 Turbo, else Rapid NSFW.
 */
export function fibo2RendersStill(image21Workflow: Record<string, unknown>): boolean {
  const encoder = Object.values(image21Workflow as Workflow).find(
    node => node?.class_type === 'TextEncodeQwenImage21'
  );
  return !isNudePrompt(String(encoder?.inputs.prompt ?? ''));
}

/** ComfyUI has 2.1 Turbo as the base + Turbo LoRA (the checkpoint is checked on its own). */
export function hasQwenImage21TurboLoraRoute(inventory: {
  unets?: readonly string[] | null;
  loras?: readonly string[] | null;
}): boolean {
  const has = (list: readonly string[] | null | undefined, file: string) =>
    Boolean(list?.some(entry => baseName(entry) === file.toLowerCase()));
  return (
    has(inventory.unets, QWEN_IMAGE_21_FILES.unet) && has(inventory.loras, QWEN_IMAGE_21_TURBO_LORA)
  );
}
