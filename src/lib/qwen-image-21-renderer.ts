import { POSE_MODEL_PROFILES } from './pose/pose-model-profile';

/**
 * "Renderer: Qwen-Image 2.1" — the queue builds the usual Qwen-Edit graph (Rapid AIO recipes,
 * partner faces, pose maps), then this pass swaps the sampler onto Qwen-Image 2.1 with the same
 * prompt and reference images. Both the full sampler and the Lightning 4-step option
 * (`qwen-image-2.1-edit-lightning-4`) render at the native 2K size. Lightning is the same graph
 * with the Fun-Acc 4-step sampler.
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

/** T8 "Qwen Image 2.1 Fun ControlNet Union" checkpoint (models/controlnet). */
export const QWEN_IMAGE_21_POSE_CONTROLNET =
  'Qwen-Image-2.1-Fun-Controlnet-Union-ComfyUI.safetensors';
export const QWEN_IMAGE_21_POSE_CONTROL_NODE = 'QwenImage21UnionApply';
/** T8 "Qwen-Image-2.1 Fun-Acc PDD 4 Step" sampler and its paired file (models/loras). */
export const QWEN_IMAGE_21_FOUR_STEP_NODE = 'T8QwenImage21FunAccPDD4Step';
export const QWEN_IMAGE_21_FOUR_STEP_FILE = 'Qwen-Image-2.1-Fun-Acc-4Step-PDD-T8.safetensors';

export function normalizeQwenRenderer(value: unknown): QwenRenderer {
  return value === 'qwen-image-2.1' ? 'qwen-image-2.1' : 'rapid';
}

/** The picker ids. Lightning is its own model, not a quality step on the base. */
export const QWEN_IMAGE_21_MODEL = 'qwen-image-2.1-edit';
export const QWEN_IMAGE_21_LIGHTNING_MODEL = 'qwen-image-2.1-edit-lightning-4';

export function isQwenImage21Model(model: string | null | undefined): boolean {
  return String(model ?? '')
    .trim()
    .toLowerCase()
    .startsWith('qwen-image-2.1');
}

/** Fun-Acc 4-step. Distinct from Qwen-Image Lightning LoRAs (those do not load on 2.1). */
export function isQwenImage21LightningModel(model: string | null | undefined): boolean {
  const id = String(model ?? '')
    .trim()
    .toLowerCase();
  return id.startsWith('qwen-image-2.1') && id.includes('lightning-');
}

/** Steps by queue quality: the official pipeline runs ~40–50; 30 held likeness in the A/B. */
export function qwenImage21Steps(profile?: string | null): number {
  if (profile === 'draft') return 20;
  return 30;
}

/**
 * Official Qwen-Image 2.1 canvases (native ~2K). The Rapid graph this renderer converts is
 * ~1.2MP (960×1280); sampling there is the soft, shifted look — 2.1's training size is these.
 */
const QWEN_IMAGE_21_CANVASES = [
  { width: 2048, height: 2048 },
  { width: 2400, height: 1792 },
  { width: 1792, height: 2400 },
  { width: 2528, height: 1696 },
  { width: 1696, height: 2528 },
  { width: 2752, height: 1536 },
  { width: 1536, height: 2752 },
] as const;

/** Nearest official 2K canvas for the requested aspect. */
export function qwenImage21Canvas(
  width: number,
  height: number
): { width: number; height: number } {
  const ratio = width / Math.max(1, height);
  let best: { width: number; height: number } = QWEN_IMAGE_21_CANVASES[0];
  let bestDelta = Infinity;
  for (const size of QWEN_IMAGE_21_CANVASES) {
    const delta = Math.abs(Math.log(size.width / size.height) - Math.log(ratio));
    if (delta < bestDelta) {
      best = size;
      bestDelta = delta;
    }
  }
  return { width: best.width, height: best.height };
}

/**
 * TextEncodeQwenImage21 `resolution` is a pixel budget (area), not a side length. Matching it
 * to the canvas puts a same-aspect reference on the same grid as the sample — a mismatch shifts
 * the edit.
 */
export function qwenImage21Resolution(width: number, height: number): number {
  return Math.max(32, Math.round(Math.sqrt(width * height) / 32) * 32);
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

const IMAGE_ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
];

/**
 * "Image 2" and "the second image" → "<image2>": Qwen-Image 2.1's own reference syntax.
 * The Day brief says both, and only the "Image N" form was binding a face to a person.
 */
export function toQwenImage21Prompt(prompt: string): string {
  return prompt
    .replace(/\b[Ii]mage ([1-9])\b/g, '<image$1>')
    .replace(
      /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth) image\b/gi,
      (_match, word: string) => {
        const index = IMAGE_ORDINALS.indexOf(word.toLowerCase());
        return index >= 0 ? `<image${index + 1}>` : _match;
      }
    );
}

/** Clothed Day partner face (`day-partner-vl-*`) and the invented stand-in crop. */
export function isDayPartnerFaceFilename(filename: string): boolean {
  const name = filename.trim().split(/[/\\]/).pop() ?? '';
  return /^day-partner-(?:vl|man|woman)-/i.test(name);
}

/** The LoadImage filename behind an image link (through resize / scale nodes). */
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

/** Day / Story pose guides for two or more people ("day-pose-guide-lap-59c64f-x2-…"). */
export function isMultiPersonPoseGuide(filename: string): boolean {
  return /pose-guide.*-x[2-9]\b/i.test(filename);
}

/**
 * Remove the sentences that point at dropped references ("Match the two bodies in the second
 * image (pose map)."), then renumber <imageN> for the references that remain.
 */
export function withoutDroppedReferences(
  prompt: string,
  dropped: number[],
  keptSlots: number[]
): string {
  if (dropped.length === 0) return prompt;
  const ordinals = ['first', 'second', 'third'];
  const mentionsDropped = (sentence: string) =>
    /pose map/i.test(sentence) ||
    dropped.some(
      slot =>
        sentence.includes(`<image${slot}>`) ||
        new RegExp(`\\b${ordinals[slot - 1]} image\\b`, 'i').test(sentence)
    );
  const kept = prompt
    .split(/(?<=[.!?])\s+|\n+/)
    .filter(sentence => sentence.trim() && !mentionsDropped(sentence));
  const renumbered = kept.join(' ').replace(/<image([1-9])>/g, (match, n: string) => {
    const index = keptSlots.indexOf(Number(n));
    return index >= 0 ? `<image${index + 1}>` : match;
  });
  return renumbered;
}

/**
 * Clothed duos: 2.1 dresses BOTH people in the lead's outfit ("she (wearing X) and her partner…
 * in their own different clothes" → two green suits). A named partner kit stays on that person.
 * Inventing a substitute ("a plain black knit top and dark jeans") replaced an assigned wardrobe
 * (live kitchen duo, 2026-10-01) — when no kit is named, forbid the lead's outfit instead.
 */
export function withDistinctPartnerOutfit(prompt: string): string {
  const match = prompt.match(
    /TWO PEOPLE in this photo: (she|he) \(wearing ([^)]+)\) and ((?:her|his|the) [\w-]+(?: [\w-]+)?)(?: \(wearing ([^)]+)\))? —/
  );
  if (!match || /\bOnly (?:she|he) wears the\b/.test(prompt)) return prompt;
  const [, pronoun, outfit, who, namedPartner] = match;
  const other = pronoun === 'he' ? 'him' : 'her';
  const garment = (text: string) => text.trim().replace(/^the\s+/i, '');
  const partner = namedPartner?.trim();
  const line = partner
    ? ` Only ${pronoun} wears the ${garment(outfit!)}; ${who} wears the ${garment(partner)} — never the same outfit or color as ${other}.`
    : ` Only ${pronoun} wears the ${garment(outfit!)}. ${who![0]!.toUpperCase()}${who!.slice(1)} does not wear that outfit, any piece of it, or the same color.`;
  const sentenceEnd = prompt.indexOf('.', match.index! + match[0].length);
  if (sentenceEnd < 0) return prompt;
  return prompt.slice(0, sentenceEnd + 1) + line + prompt.slice(sentenceEnd + 1);
}

/**
 * 2.1 treats `<image1>` as the picture to edit, so a duo copies that face and hair onto both
 * bodies. The partner crop is a face photo, not a third person, and a dropped pose map must not
 * leave a spare arm. This leads the prompt, where 2.1 follows it.
 */
export function withTwoPersonFaces(
  prompt: string,
  faces: { partnerImage: number | null; droppedPoseMap: boolean }
): string {
  if (/\bexactly two arms\b/i.test(prompt)) return prompt;
  let partnerImage = faces.partnerImage;
  if (partnerImage == null) {
    const mentioned = prompt.match(/<image([1-9])> is the face\b/);
    if (mentioned) partnerImage = Number(mentioned[1]);
  }
  const duo = /\bTWO PEOPLE\b/.test(prompt) || partnerImage != null;
  if (!duo) return prompt;
  if (!faces.droppedPoseMap && partnerImage == null) return prompt;
  const parts = [
    'Exactly two people, each with exactly two arms on their own body — no extra, floating, or shared arm.',
  ];
  if (partnerImage != null && partnerImage !== 1) {
    parts.push(
      `<image1> is only the first person's face, hair and skin — that person alone, never copied onto anyone else, and do not paste that photo into the scene. <image${partnerImage}> is only the second person's face, hair and skin — a different face and different hair, never the same person as the first.`
    );
  }
  return `${parts.join(' ')} ${prompt}`;
}

const UNNAMED_KIT_LINE = "replace clothing with this slot's catalog wardrobe kit";
const DRESSED_FALLBACK_LINE =
  'she is fully dressed in everyday clothes that suit the beat and the setting (a casual top and trousers or jeans, shoes outdoors) — never the underwear or bare skin from <image1>';

/** The per-model prompt fixes Qwen-Image 2.1's profile asks for. */
export function withProfilePromptFixes(
  prompt: string,
  fixes: { namePartnerOutfit: boolean; dressWhenNoOutfit: boolean }
): string {
  let next = fixes.namePartnerOutfit ? withDistinctPartnerOutfit(prompt) : prompt;
  if (fixes.dressWhenNoOutfit) next = next.replace(UNNAMED_KIT_LINE, DRESSED_FALLBACK_LINE);
  return next;
}

/** Nude / explicit stills (Day Intimate & Raunchy, Story adult beats). */
export function isNudePrompt(prompt: string): boolean {
  return /\b(?:nude|naked|explicit|sex(?:ual)?|topless)\b/i.test(prompt);
}

/** Penetration between two people (not oral, kissing, touching). */
const PENETRATION_RE =
  /\b(?:penetrat\w*|(?:penis|cock|strap-on)\s+(?:is\s+)?inside|inside her|thrust\w*|fuck(?:s|ing)?\s+(?:her|him)|rides?\s+(?:him|her)|riding\s+(?:him|her)|cowgirl|doggy|missionary)\b/i;

/**
 * Two-person penetration stills stay on the engine's own model (Rapid AIO NSFW is trained for
 * them). On 2.1 they came out fused or role-swapped, or posed "near" the act — with the pose map,
 * without it, with the Fun ControlNet Union (0.6–1.0) and with 2.1 NSFW LoRAs (live A/B on the
 * user's own duos, 2026-10-01).
 */
export function isPenetrationDuoPrompt(prompt: string, hasDuoPoseMap: boolean): boolean {
  return hasDuoPoseMap && PENETRATION_RE.test(prompt);
}

function keepsOnEngineModel(workflow: Workflow, encoder: WorkflowNode): boolean {
  const duoMap = [1, 2, 3].some(slot => {
    const ref = encoder.inputs[`image${slot}`];
    return isRef(ref) && isMultiPersonPoseGuide(sourceFilename(workflow, ref));
  });
  return (
    Boolean(POSE_MODEL_PROFILES['qwen-image-2.1'].penetrationEngine) &&
    isPenetrationDuoPrompt(String(encoder.inputs.prompt ?? ''), duoMap)
  );
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
  options: {
    steps?: number;
    fallbackSize?: { width: number; height: number };
    /**
     * The Fun ControlNet Union pose nodes are installed (QwenImage21UnionApply): a dropped
     * two-person map drives the pose through the ControlNet instead of being lost.
     */
    poseControl?: { strength?: number; endPercent?: number } | false;
    /**
     * Alibaba PAI Fun-Acc PDD 4-step (T8 node): four steps instead of 30. Needs the
     * T8QwenImage21FunAccPDD4Step node and its paired model file in models/loras.
     */
    fourStep?: boolean;
  } = {}
): { workflow: Record<string, unknown>; converted: boolean } {
  const workflow = structuredClone(input) as Workflow;
  const samplerId = findPrimarySampler(workflow);
  if (!samplerId) return { workflow: input, converted: false };
  const sampler = workflow[samplerId];
  const encoderId = findEncoder(workflow, sampler.inputs.positive)!;
  const encoder = workflow[encoderId];
  if (keepsOnEngineModel(workflow, encoder)) return { workflow: input, converted: false };

  const latentRef = sampler.inputs.latent_image;
  const latentNode = isRef(latentRef) ? workflow[latentRef[0]] : undefined;
  const requestedWidth = Number(latentNode?.inputs.width) || options.fallbackSize?.width || 1024;
  const requestedHeight = Number(latentNode?.inputs.height) || options.fallbackSize?.height || 1024;
  // Both samplers use the native 2K canvas. The 4-step pass used to stay on the Rapid
  // plate (~960×1280) for speed, and that size is below what these weights hold detail at.
  const canvas = qwenImage21Canvas(requestedWidth, requestedHeight);

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
  let samplerModel: [string, number] = [cache, 0];
  // A two-person pose map is a limb diagram. 2.1 paints it: fused bodies, a third person, a
  // bare arm in the gap (live, 2026-10-01). Those stay out; a one-person map stays. Fun
  // ControlNet Union made anatomy worse and stays off unless the caller turns it on.
  const nudeStill = isNudePrompt(String(encoder.inputs.prompt ?? ''));
  const profile = POSE_MODEL_PROFILES['qwen-image-2.1'];
  const duoMapDelivery = nudeStill ? profile.mapDelivery.duoNude : profile.mapDelivery.duoClothed;
  const kept: Array<{ from: number; ref: [string, number] }> = [];
  const dropped: number[] = [];
  for (let slot = 1; slot <= 3; slot += 1) {
    const ref = encoder.inputs[`image${slot}`];
    if (!isRef(ref)) continue;
    if (duoMapDelivery === 'none' && isMultiPersonPoseGuide(sourceFilename(workflow, ref)))
      dropped.push(slot);
    else kept.push({ from: slot, ref });
  }
  const poseMap = dropped.length ? encoder.inputs[`image${dropped[0]}`] : undefined;
  if (options.poseControl && isRef(poseMap)) {
    const union = add({
      class_type: 'QwenImage21UnionLoader',
      inputs: { union_model: QWEN_IMAGE_21_POSE_CONTROLNET },
    });
    const apply = add({
      class_type: 'QwenImage21UnionApply',
      inputs: {
        model: [cache, 0],
        union_patch: [union, 0],
        vae: [vae, 0],
        control_image: poseMap,
        control_mode: 'Pose',
        strength: options.poseControl.strength ?? 0.8,
        start_percent: 0,
        end_percent: options.poseControl.endPercent ?? 1,
      },
    });
    samplerModel = [apply, 0];
  }
  const partnerKept = kept.findIndex(entry =>
    isDayPartnerFaceFilename(sourceFilename(workflow, entry.ref))
  );
  const encodeInputs: Record<string, unknown> = {
    clip: [clip, 0],
    vae: [vae, 0],
    prompt: withTwoPersonFaces(
      withoutDroppedReferences(
        withProfilePromptFixes(toQwenImage21Prompt(String(encoder.inputs.prompt ?? '')), {
          namePartnerOutfit: profile.namePartnerOutfit,
          dressWhenNoOutfit: profile.dressWhenNoOutfit && !nudeStill,
        }),
        dropped,
        kept.map(entry => entry.from)
      ),
      {
        partnerImage: partnerKept >= 0 ? partnerKept + 1 : null,
        droppedPoseMap: dropped.length > 0,
      }
    ),
    negative_prompt: '',
    resolution: qwenImage21Resolution(canvas.width, canvas.height),
  };
  kept.forEach((entry, index) => {
    encodeInputs[`images.image_${index + 1}`] = entry.ref;
  });
  const encode = add({ class_type: 'TextEncodeQwenImage21', inputs: encodeInputs });
  const latent = add({
    class_type: 'EmptyLatentImage',
    inputs: { width: canvas.width, height: canvas.height, batch_size: 1 },
  });

  sampler.inputs = {
    ...sampler.inputs,
    model: samplerModel,
    positive: [encode, 0],
    negative: [encode, 1],
    latent_image: [latent, 0],
    steps: options.steps ?? 30,
    cfg: 1,
    sampler_name: 'euler',
    scheduler: 'simple',
    denoise: 1,
  };
  if (options.fourStep) {
    workflow[samplerId] = {
      class_type: QWEN_IMAGE_21_FOUR_STEP_NODE,
      inputs: {
        model: samplerModel,
        positive: [encode, 0],
        latent_image: [latent, 0],
        model_file: QWEN_IMAGE_21_FOUR_STEP_FILE,
        seed: sampler.inputs.seed ?? 0,
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
  return { workflow: pruneUnreachableNodes(workflow), converted: true };
}
