/**
 * "Renderer: Qwen-Image 2.1" — the queue builds the usual Qwen-Edit graph (Rapid AIO recipes,
 * partner faces, pose maps), then this pass swaps the sampler onto Qwen-Image 2.1 with the same
 * prompt, reference images and canvas.
 *
 * Live A/B (2026-10-01, 12 stills vs Rapid AIO v23): Cast faces and body types held in every case
 * where Rapid drifted to generic faces and gym bodies; custom poses matched the skeleton; about
 * 5× slower (30 steps at cfg 1). Qwen-Edit LoRAs (20B) don't load on 2.1 — they are pruned.
 */

type WorkflowNode = { class_type: string; inputs: Record<string, unknown> };
type Workflow = Record<string, WorkflowNode>;

export const QWEN_IMAGE_21_FILES = {
  unet: 'qwen_image_2.1_bf16.safetensors',
  clip: 'qwen3vl_8b_int8_convrot.safetensors',
  vae: 'qwen_image_2.1_vae_bf16.safetensors',
} as const;

export type QwenRenderer = 'rapid' | 'qwen-image-2.1';

export function normalizeQwenRenderer(value: unknown): QwenRenderer {
  return value === 'qwen-image-2.1' ? 'qwen-image-2.1' : 'rapid';
}

/** Steps by queue quality: the official pipeline runs ~40–50; 30 held likeness in the A/B. */
export function qwenImage21Steps(profile?: string | null): number {
  if (profile === 'draft') return 20;
  if (profile === 'max') return 40;
  return 30;
}

const isRef = (value: unknown): value is [string, number] =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';

function isQwenEditEncoder(node: WorkflowNode | undefined): boolean {
  return node?.class_type === 'TextEncodeQwenImageEditPlus';
}

/** Walk a conditioning link back through ReferenceLatent / conditioning wrappers to the encoder. */
function findEncoder(workflow: Workflow, ref: unknown): string | null {
  let current = ref;
  for (let hops = 0; hops < 16 && isRef(current); hops += 1) {
    const id = current[0];
    const node = workflow[id];
    if (!node) return null;
    if (isQwenEditEncoder(node)) return id;
    current = node.inputs.conditioning ?? node.inputs.positive;
  }
  return null;
}

function findPrimarySampler(workflow: Workflow): string | null {
  for (const [id, node] of Object.entries(workflow)) {
    if (node.class_type === 'KSampler' && findEncoder(workflow, node.inputs.positive)) return id;
  }
  return null;
}

/** "Image 2" → "<image2>": Qwen-Image 2.1's own reference syntax. */
export function toQwenImage21Prompt(prompt: string): string {
  return prompt.replace(/\b[Ii]mage ([1-9])\b/g, '<image$1>');
}

const OUTPUT_CLASS = /^(?:Save|Preview)/;

/** Drop every node that no longer feeds an output (old loaders, LoRAs, ReferenceLatent chains). */
export function pruneUnreachableNodes(workflow: Workflow): Workflow {
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

/**
 * Rewire the graph's Qwen-Edit sampler onto Qwen-Image 2.1. Returns the graph untouched when it
 * has no Qwen-Edit sampler (text-to-image packs, video, other engines).
 */
export function convertQwenEditWorkflowToImage21(
  input: Record<string, unknown>,
  options: { steps?: number; fallbackSize?: { width: number; height: number } } = {}
): { workflow: Record<string, unknown>; converted: boolean } {
  const workflow = structuredClone(input) as Workflow;
  const samplerId = findPrimarySampler(workflow);
  if (!samplerId) return { workflow: input, converted: false };
  const sampler = workflow[samplerId];
  const encoderId = findEncoder(workflow, sampler.inputs.positive)!;
  const encoder = workflow[encoderId];

  const latentRef = sampler.inputs.latent_image;
  const latentNode = isRef(latentRef) ? workflow[latentRef[0]] : undefined;
  const width = Number(latentNode?.inputs.width) || options.fallbackSize?.width || 1024;
  const height = Number(latentNode?.inputs.height) || options.fallbackSize?.height || 1024;

  let next = Math.max(0, ...Object.keys(workflow).map(id => Number(id) || 0)) + 1;
  const add = (node: WorkflowNode) => {
    const id = String(next++);
    workflow[id] = node;
    return id;
  };
  const unet = add({
    class_type: 'UNETLoader',
    inputs: { unet_name: QWEN_IMAGE_21_FILES.unet, weight_dtype: 'default' },
  });
  const clip = add({
    class_type: 'CLIPLoader',
    inputs: { clip_name: QWEN_IMAGE_21_FILES.clip, type: 'qwen_image', device: 'default' },
  });
  const vae = add({ class_type: 'VAELoader', inputs: { vae_name: QWEN_IMAGE_21_FILES.vae } });
  const cache = add({
    class_type: 'QwenImage21Cache',
    inputs: { model: [unet, 0], device: 'auto', dtype: 'default' },
  });
  const encodeInputs: Record<string, unknown> = {
    clip: [clip, 0],
    vae: [vae, 0],
    prompt: toQwenImage21Prompt(String(encoder.inputs.prompt ?? '')),
    negative_prompt: '',
    resolution: 1024,
  };
  for (let slot = 1; slot <= 3; slot += 1) {
    const ref = encoder.inputs[`image${slot}`];
    if (isRef(ref)) encodeInputs[`images.image_${slot}`] = ref;
  }
  const encode = add({ class_type: 'TextEncodeQwenImage21', inputs: encodeInputs });
  const latent = add({
    class_type: 'EmptyLatentImage',
    inputs: { width, height, batch_size: 1 },
  });

  sampler.inputs = {
    ...sampler.inputs,
    model: [cache, 0],
    positive: [encode, 0],
    negative: [encode, 1],
    latent_image: [latent, 0],
    steps: options.steps ?? 30,
    cfg: 1,
    sampler_name: 'euler',
    scheduler: 'simple',
    denoise: 1,
  };
  for (const node of Object.values(workflow)) {
    if (
      node.class_type === 'VAEDecode' &&
      isRef(node.inputs.samples) &&
      node.inputs.samples[0] === samplerId
    ) {
      node.inputs.vae = [vae, 0];
    }
  }
  return { workflow: pruneUnreachableNodes(workflow), converted: true };
}
