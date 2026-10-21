import { POSE_MODEL_PROFILES } from '../pose/pose-model-profile';
import { MAX_INPUT_IMAGE_FILENAMES } from '../workflow/load-image-bindings';
import { beatLiesDown } from '../prompt/beat-text';
import { isFaceDownNudeSolo } from '../pose/face-down-solo';
export { isFaceDownNudeSolo } from '../pose/face-down-solo';

/**
 * "Renderer: Qwen-Image 2.1" — the queue builds the usual Qwen-Edit graph (Rapid AIO recipes,
 * partner faces, pose maps), then this pass swaps the sampler onto Qwen-Image 2.1 with the same
 * prompt and reference images. Every 2.1 sampler renders at about 1.6 MP (see
 * QWEN_IMAGE_21_CANVASES). Lightning is the same graph with the Fun-Acc 4-step sampler.
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

/**
 * Pruna 8-step LoRA (PrunaAI/Pruna-Qwen-Image-2.1) on its own fixed sigma schedule — core nodes
 * only (LoraLoaderModelOnly + ManualSigmas + BasicGuider), no custom pack. Live A/B (2026-10-01,
 * seed 101, 6 Day / try-on stills vs the full 30-step pass, Fun-Acc 4 and Viggle turbo 6):
 * matched the full pass on hand-in-hand / hug / kneel / lying and held the arms-up try-on that
 * gave Fun-Acc 4 ghost arms and Viggle a lost pose; 14–28 s vs 51–86 s. A duo selfie added a
 * third person on every sampler, the full pass included.
 */
export const QWEN_IMAGE_21_EIGHT_STEP_LORA = 'p_qwen_image_2.1_8step_v0.1.safetensors';
/** Pruna's 8-step nodes as given (no shift): 1 → 14/15 → 6/7 → 10/13 → 2/3 → 6/11 → 0.4 → 2/9 → 0. */
export const QWEN_IMAGE_21_EIGHT_STEP_SIGMAS = [
  1,
  14 / 15,
  6 / 7,
  10 / 13,
  2 / 3,
  6 / 11,
  0.4,
  2 / 9,
  0,
];

/**
 * The Qwen team's own 8-step Turbo (Qwen/Qwen-Image-2.1-Turbo, 2026-10-09), as Comfy-Org's
 * extracted LoRA on the 2.1 base, on the checkpoint's own sigmas (model_index.json
 * sample_sigmas, then 0). Live A/B (2026-10-17, the same six Day graphs and seeds as Pruna): a
 * beach-towel lying still clean 5/5 where Pruna melted or drew a twin 3/5; sharper on every pose,
 * close to the full 30-step pass, ~20 s like Pruna. Qwen Research License.
 */
export const QWEN_IMAGE_21_TURBO_LORA = 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors';
/**
 * The Turbo checkpoint itself (Comfy-Org int8 ConvRot, 7.3 GB) — loaded on its own, no base and no
 * LoRA. Same 38 Day beats and seeds as the LoRA route (2026-10-17): mean face distance 0.309 vs
 * 0.310 (closer on 19/38), every pose kept, ~11 s a still vs ~17 s. A Turbo install is 7.3 GB
 * instead of the 14.2 GB base + 0.9 GB LoRA; the LoRA route stays for installs that have only those.
 */
export const QWEN_IMAGE_21_TURBO_UNET = 'qwen_image_2.1_turbo_int8_convrot.safetensors';

/**
 * Load Turbo from its checkpoint? The queue's own inventory (fetched for preflight) decides when it
 * has one — every tool, re-rolls included, and never a checkpoint ComfyUI doesn't list; else the
 * runtime's guess from the cached inventory.
 */
export function qwenImage21TurboCheckpointFor(
  availableUnets: readonly string[] | null | undefined,
  runtimeFlag: boolean | undefined
): boolean | undefined {
  return availableUnets ? hasQwenImage21TurboCheckpoint({ unets: availableUnets }) : runtimeFlag;
}

/** ComfyUI lists the Turbo checkpoint (any folder, any casing). */
export function hasQwenImage21TurboCheckpoint(
  models:
    { unets?: readonly string[] | null; checkpoints?: readonly string[] | null } | null | undefined
): boolean {
  const want = QWEN_IMAGE_21_TURBO_UNET.toLowerCase();
  return [...(models?.unets ?? []), ...(models?.checkpoints ?? [])].some(
    name => name.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === want
  );
}
export const QWEN_IMAGE_21_TURBO_SIGMAS = [
  1, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0,
];

export function normalizeQwenRenderer(value: unknown): QwenRenderer {
  return value === 'qwen-image-2.1' ? 'qwen-image-2.1' : 'rapid';
}

/** The picker ids. Lightning is its own model, not a quality step on the base. */
export const QWEN_IMAGE_21_MODEL = 'qwen-image-2.1-edit';
export const QWEN_IMAGE_21_LIGHTNING_MODEL = 'qwen-image-2.1-edit-lightning-4';
export const QWEN_IMAGE_21_PRUNA_8_MODEL = 'qwen-image-2.1-edit-pruna-8';
export const QWEN_IMAGE_21_TURBO_8_MODEL = 'qwen-image-2.1-edit-turbo-8';
/**
 * Noct-Q V4 (Noctaluna, Hugging Face): a full Qwen-Image 2.1 merge, uncensored, as one int8
 * file (7.3 GB) that loads like the base. Same text encoder, VAE and Day recipes as Qwen-Image
 * 2.1; its own pass (QWEN_IMAGE_21_NOCT_PASS). Measured on the player's own Day graphs
 * (2026-10-21): clothed poses level with Turbo; sex-pose duos clearly better — the pair connect
 * where Turbo posed them side by side — so its duos stay on it (no Rapid hand-off).
 */
export const QWEN_IMAGE_21_NOCT_MODEL = 'qwen-image-2.1-edit-noct';
export const QWEN_IMAGE_21_NOCT_UNET = 'NoctQ_V4_int8_convrot.safetensors';
/**
 * cfg 1, not the model card's 3: at 3 every still came out dark and moody (daylight parks at
 * dusk), faces drifted from the plate, and two-person stills crashed ComfyUI (a segfault in its
 * memory manager, cond + uncond batch; also at cfg 2). Shift 3 instead of 2.1's 0.69 spends more
 * of the pass on the layout: a sofa sit lost its third leg. 35 steps: a lying still lost a third
 * hand that 25 kept. About 36 s a still on a 24 GB card.
 */
export const QWEN_IMAGE_21_NOCT_PASS = { steps: 35, shift: 3 } as const;

export function isQwenImage21NoctModel(model: string | null | undefined): boolean {
  return (
    String(model ?? '')
      .trim()
      .toLowerCase() === QWEN_IMAGE_21_NOCT_MODEL
  );
}

export function isQwenImage21Model(model: string | null | undefined): boolean {
  return String(model ?? '')
    .trim()
    .toLowerCase()
    .startsWith('qwen-image-2.1');
}

/**
 * A 2.1 fast engine (Fun-Acc 4-step or Pruna 8-step). Distinct from Qwen-Image Lightning LoRAs
 * (those do not load on 2.1).
 */
export function isQwenImage21LightningModel(model: string | null | undefined): boolean {
  const id = String(model ?? '')
    .trim()
    .toLowerCase();
  return (
    id.startsWith('qwen-image-2.1') &&
    (id.includes('lightning-') || id.includes('pruna-') || id.includes('turbo-'))
  );
}

/** Which fast sampler a 2.1 engine renders with; null = the full euler pass. */
export function qwenImage21FastSampler(
  model: string | null | undefined
): 'fun-acc-4' | 'pruna-8' | 'turbo-8' | null {
  if (!isQwenImage21LightningModel(model)) return null;
  const id = String(model).trim();
  if (/turbo-8$/i.test(id)) return 'turbo-8';
  return /pruna-8$/i.test(id) ? 'pruna-8' : 'fun-acc-4';
}

/**
 * A one-person lying / reclining still on Good or Best quality renders with the full 30-step
 * pass instead of the Pruna 8-step LoRA. Pruna sometimes melted a reclining body or drew a twin
 * of her on the bed / beach / sofa (live, Day Everyday, 2026-10-03); the same graphs at the full
 * 30 steps were clean 4 of 4, at 47–78 s against 17–40 s. On Good too since 2026-10-17: a beach
 * towel still melted 2/2 seeds at 8 steps, clean at 30 (standing, lunge, sofa and bed poses were
 * fine at 8). Fast keeps the 8-step speed. Two-person stills are left alone.
 */
export function qwenImage21FullStepsForStill(input: {
  qualityProfile?: string | null;
  prompt: string;
  /** One person on the still (no partner face, no two-person map). */
  solo: boolean;
}): boolean {
  return (
    (input.qualityProfile === 'max' || input.qualityProfile === 'final') &&
    input.solo &&
    !/\bTWO PEOPLE\b/.test(input.prompt) &&
    beatLiesDown(input.prompt)
  );
}

/** Steps by queue quality: the official pipeline runs ~40–50; 30 held likeness in the A/B. */
export function qwenImage21Steps(profile?: string | null): number {
  if (profile === 'draft') return 20;
  return 30;
}

/**
 * Qwen-Image 2.1 canvases, about 1.6 MP. The official template's default budget is 1024 with
 * "up to 2048" supported; the app rendered at the 2K maximum for a day (879d0387) and the stills
 * were the complaint. Same seed, Day cooking beat, 2026-10-01:
 *
 *   sampler          1792×2400            1104×1472
 *   Pruna 8-step     dim and hazy, 169 s  bright and clean, 35 s
 *   Fun-Acc 4-step   fine, 105 s          fine, 35 s
 *   full 30-step     fine, 518 s          fine, 65 s
 *
 * Close crops showed only marginally more detail at 2K, and a walking beat came apart there
 * (face distance 0.91). The Pruna schedule is not made for 2K at all.
 */
const QWEN_IMAGE_21_CANVASES = [
  { width: 1280, height: 1280 },
  { width: 1472, height: 1104 },
  { width: 1104, height: 1472 },
  { width: 1536, height: 1024 },
  { width: 1024, height: 1536 },
  { width: 1664, height: 928 },
  { width: 928, height: 1664 },
] as const;

/** Nearest 2.1 canvas for the requested aspect. */
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

/** A Day / Story pose guide image of any headcount. */
export function isPoseGuideFilename(filename: string): boolean {
  return /pose-guide/i.test(filename);
}

/**
 * A pose the player drew in the editor or took from a photo ("…-photo-…"): the map is the only
 * place that pose exists, so it is always sent.
 */
export function isPlayerPoseGuide(filename: string): boolean {
  return /pose-guide.*-photo-/i.test(filename);
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
  // A group still (day-group.ts: "Three people together", the third face as <image3>; "Four
  // people together", the fourth as <image4> — Turbo, four group beats × 2 seeds, four distinct
  // people in their own clothes 8/8, 2026-10-17).
  if (/\bFour people together\b/.test(prompt)) {
    return `Exactly four people, each with exactly two arms on their own body — no extra, floating, or shared arm. <image1>, <image2>, <image3> and <image4> are only the four people's faces, hair and skin — four different people, never the same face twice, and do not paste those photos into the scene. ${prompt}`;
  }
  if (/\bThree people together\b/.test(prompt)) {
    return `Exactly three people, each with exactly two arms on their own body — no extra, floating, or shared arm. <image1>, <image2> and <image3> are only the three people's faces, hair and skin — three different people, never the same face twice, and do not paste those photos into the scene. ${prompt}`;
  }
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

export const QWEN_IMAGE_21_LIE_BACK_LINE =
  'POSE FIRST: she lies flat on her back — her whole body horizontal across the frame, head and shoulders down on the pillow, back flat on the mattress, not propped up, not sitting, not leaning against the headboard; seen from the side at mattress height.';

/** One person, nude, the stance on her back (Day / Story adult recipes). */
export function isLyingBackNudeSolo(
  prompt: string,
  options: { ignoreImageWords?: boolean } = {}
): boolean {
  const twoPeople = options.ignoreImageWords
    ? /\b(?:TWO PEOPLE|two people|her partner|the man from)\b/i
    : /\b(?:TWO PEOPLE|two people|partner|the man from|second image)\b/i;
  return (
    isNudePrompt(prompt) &&
    /\bShe lies (?:flat )?on her back\b/.test(prompt) &&
    !twoPeople.test(prompt)
  );
}

const LIE_SIDE_RE =
  /\bShe lies on her side on the (couch|sofa|daybed|chaise|lounger|bench|floor|rug|bed|mattress|beach towel|towel|blanket|sand|grass)\b/;

/** The side-lying line for a nude one-person still lying on her side, or null. */
export function lieSideLineFor(prompt: string): string | null {
  if (!isNudePrompt(prompt)) return null;
  if (/\b(?:TWO PEOPLE|two people|her partner|the man from)\b/i.test(prompt)) return null;
  const surface = LIE_SIDE_RE.exec(prompt)?.[1];
  if (!surface) return null;
  const head = /^(?:bed|mattress)$/.test(surface)
    ? 'pillow'
    : /couch|sofa|daybed|chaise|lounger/.test(surface)
      ? 'cushion at one end'
      : 'ground';
  return `POSE FIRST: she lies on her side along the ${surface} — her whole body horizontal, head resting on the ${head}, hips and legs along it, not sitting up; seen from the front at ${surface} height.`;
}

/** `line` at the head of the edit (after "Keep facial likeness only: "), once. */
function withLeadLine(prompt: string, line: string): string {
  if (prompt.includes(line)) return prompt;
  const lead = 'Keep facial likeness only: ';
  return prompt.includes(lead) ? prompt.replace(lead, `${lead}${line} `) : `${line} ${prompt}`;
}

export function withLieBackLine(prompt: string): string {
  return withLeadLine(prompt, lieBackLineFor(prompt));
}

/**
 * Knees up on her back: seen from the side, the two raised legs overlap and 2.1 drew one leg
 * (3/3 on the user's renders, 2026-10-19). From the foot of the bed both legs show 3/3, still
 * lying (same seeds).
 */
export const QWEN_IMAGE_21_LIE_BACK_KNEES_UP_LINE =
  'POSE FIRST: she lies flat on her back — head and shoulders down on the pillow, back flat on the mattress, not sitting, not leaning against the headboard; seen from the foot of the bed, looking along her body toward her face, both knees up and apart — her left leg and her right leg both in frame, two feet.';

const KNEES_UP_RE = /\bknees? (?:pulled|drawn) up\b/i;

/** The lying-on-her-back line for this stance (knees up gets the foot-of-the-bed camera). */
export function lieBackLineFor(prompt: string): string {
  return KNEES_UP_RE.test(prompt)
    ? QWEN_IMAGE_21_LIE_BACK_KNEES_UP_LINE
    : QWEN_IMAGE_21_LIE_BACK_LINE;
}

const SOLO_TWO_PEOPLE_RE = /\b(?:TWO PEOPLE|two people|her partner|the man from)\b/i;

/**
 * Bent over and on all fours (one person, nude): 2.1 knelt her upright, or stood her straight,
 * on the recipe's words alone — 0/6 on the user's renders, 2026-10-19. Saying the angle of the
 * body first: bent over 6/6, all fours 6/6 (same seeds, portrait and landscape).
 */
export function bentSoloLineFor(prompt: string): string | null {
  if (!isNudePrompt(prompt) || SOLO_TWO_PEOPLE_RE.test(prompt)) return null;
  const bent = /\bShe stands bent forward over (the [^,]+?), chest down on it\b/.exec(prompt);
  if (bent) {
    const surface = bent[1];
    const bed = /\bbed\b/.test(surface);
    return `POSE FIRST: she is bent over at the hips — feet on the floor, legs straight, her upper body lying flat across ${surface} with her cheek on ${bed ? 'the sheets' : 'it'}; seen from the side at ${bed ? 'bed' : 'its'} height.`;
  }
  const fours = /\bShe is on all fours on (the [^,]+?),/.exec(prompt);
  if (fours) {
    const reach = /\breaches back\b/i.test(prompt)
      ? ' her right arm reaches back under her body between her thighs.'
      : '';
    return `POSE FIRST: seen from the side — her knees on ${fours[1]} under her raised hips, her chest low near it, propped on her left forearm; her back slopes down from her hips to her shoulders;${reach || ' her right hand braced beside her.'}`;
  }
  return null;
}

/**
 * Showy pose wording → what a person would really do, on 2.1 only (Edit 2511 / Rapid needed the
 * strong wording to leave the plate's arms-at-sides stand). The user's own Turbo stills, same
 * graphs and seeds (2026-10-17): every rooftop / street dance came out as a stage pose — both
 * arms overhead, a knee lifted; "reaching for a pier railing" stood her with one arm in the air.
 * With these: she sways and laughs with one hand up (5/5 dances), leans on the railing catching
 * her breath (2/2), stretches with her feet flat. Dropping the pose wording altogether was worse
 * (the coffee, the book, the camera went too) and a general "candid photo" line changed nothing.
 */
const NATURAL_POSE_REWRITES: ReadonlyArray<[string, string]> = [
  [
    'both arms raised overhead, one knee lifted mid-step, hips mid-sway',
    'swaying to the music, one hand raised loosely above her shoulder, the other at her waist, hips turning, soft knees, mid-laugh',
  ],
  [
    'both arms stretched high overhead, back long, up on the balls of the feet',
    'a lazy stretch, arms up with soft elbows, back arched a little, both feet flat, eyes half closed',
  ],
  [
    'stands stretching both arms overhead, weight on one leg',
    'stretches lazily, arms up with soft elbows, both feet flat',
  ],
];
const REACH_UP = /\b([Ss])he stands reaching up with one arm high, the other arm out\b/g;

export function withNaturalPoses(prompt: string): string {
  let out = prompt;
  for (const [from, to] of NATURAL_POSE_REWRITES) out = out.split(from).join(to);
  // Reaching for a railing / rail: leaning on it, not an arm in the air.
  if (
    /\breach(?:es|ing)?\s+(?:for|toward|towards)\s+(?:a|the)\s+(?:\w+\s+)?(?:railing|rail|handrail|balustrade)\b/i.test(
      out
    )
  ) {
    out = out.replace(
      REACH_UP,
      (_match, s1: string) =>
        `${s1}he leans on the railing with one hand on it, catching her breath`
    );
  }
  return withCandidStill(
    withNaturalLookBack(
      withHeldProps(withKitLowercase(withSwimsuitColour(withDuoJobs(withAcrossTable(out)))))
    )
  );
}

/**
 * "Looking back over her shoulder at the camera" turned the head past what a neck can: a back
 * view with the face crop's straight-on face on it (an owl turn). A body three-quarters away and
 * the head turned only as far as a real neck turns, face in three-quarter profile: natural on 2/4
 * of the user's own walk / kneel look-backs vs 0/4, none worse (same graphs and seeds,
 * 2026-10-20).
 */
const LOOK_BACK = /\blooking back over (?:her|one|a|the) shoulder(?: at the camera)?/g;
const NATURAL_LOOK_BACK =
  'her body turned three-quarters away from the camera and her head turned back over her shoulder only as far as a real neck turns - face in three-quarter profile, eyes glancing back at the camera';

function withNaturalLookBack(prompt: string): string {
  return withGroundSlide(prompt.replace(LOOK_BACK, NATURAL_LOOK_BACK));
}

/**
 * A slide into a base drew her running at it (softball, both seeds, 2026-10-20 sweep): the
 * slide said in the body — down on the dirt, on her hip, lead leg out at the base.
 */
export const QWEN_IMAGE_21_SLIDE_BODY =
  'down on the dirt, sliding on her hip and the back of her thigh, lead leg straight out toward the base, the other leg bent under her, body low along the ground in a cloud of dust — not running, not upright';

function withGroundSlide(prompt: string): string {
  if (!/\bslid(?:e|es|ing)\b[^.\n]*\b(?:base|plate|home)\b|\bsliding:/i.test(prompt)) return prompt;
  if (prompt.includes(QWEN_IMAGE_21_SLIDE_BODY)) return prompt;
  return prompt.replace(
    /(POSE FIRST: )([^\n]*?)(\.)(?=\s|$)/,
    (_match, head: string, pose: string, dot: string) =>
      `${head}${pose}; ${QWEN_IMAGE_21_SLIDE_BODY}${dot}`
  );
}

/**
 * One person in a scene (a Day / Story still, not a plate or a finish edit) came out as a catalogue
 * lineup: centred, square to the camera, legs straight. The edit closer's "keep … camera
 * framing" pinned the face crop's straight-on framing, "with defined posture" (the athletic build)
 * stood her up straight, and "full body in frame" was said twice. Without them and with the
 * camera put to one side: looser on 4/16 of the user's own stills (8 graphs × 2 seeds; a kneel now
 * kneels on both seeds, legs cross, hips sway), none worse. Body wording ("weight on one leg") made
 * the kneel stand up instead, so the line names the camera and the moment only.
 */
export const QWEN_IMAGE_21_CANDID_LINE =
  'Photographed candidly by a friend from a three-quarter angle, slightly off-centre in the frame, a real moment between poses, relaxed and unposed - not a fashion lineup, not facing the camera square on.';

function withCandidStill(prompt: string): string {
  if (!/\sSCENE: /.test(prompt) || /\btwo people\b|\bpartner\b/i.test(prompt)) return prompt;
  let out = prompt
    .replace('Keep facial identity and camera framing.', 'Keep facial identity.')
    .replace(/,? with defined posture\b/g, '');
  const first = out.indexOf('full body in frame');
  if (first >= 0) {
    const head = out.slice(0, first + 'full body in frame'.length);
    out = head + out.slice(head.length).replace(/,? full body in frame/g, '');
  }
  // A sport still is mid-action ("ACTION: …", "POSE FIRST: mid-action"): never "relaxed, between
  // poses", never a relaxed stance.
  if (/\bACTION: |POSE FIRST: mid-action\b/.test(out)) return out;
  out = withRelaxedPoseFirst(out);
  return out.includes(QWEN_IMAGE_21_CANDID_LINE)
    ? out
    : out.replace(/(\s)SCENE: /, `$1${QWEN_IMAGE_21_CANDID_LINE} SCENE: `);
}

/** A POSE FIRST line that already puts her off her feet or in motion: left as it is. */
const NOT_STANDING_RE =
  /\b(?:sit|sits|sitting|seated|kneel\w*|lie|lies|lying|lay\w*|crouch\w*|squat\w*|bend\w*|bent (?:over|forward|down|double)|on all fours|curl\w*|foot (?:up|on)|armchair|sofa|couch|bed|floor|jump\w*|leap\w*|run\w*|jog\w*|walk\w*|stride|mid-step|climb\w*|lean\w*|perch\w*|reclin\w*|dance\w*|danc\w*|swim\w*|cycl\w*|rid\w*|skat\w*|ski\w*|hang\w*|handstand|stretch\w*)\b/i;

export const QWEN_IMAGE_21_RELAXED_STANCE =
  'standing relaxed, her weight on one leg and the other knee softly bent, hips and shoulders turned a little from the camera';
export const QWEN_IMAGE_21_LEAN_BODY =
  'her shoulder and hip resting against it, weight on one leg, one foot crossed over the other';

/**
 * The POSE FIRST line, made natural on 2.1 (the user's own sweep of every one-person Day layout,
 * 2026-10-20, full plate, two seeds):
 * - A standing gesture (hands on hips, in pockets, arms crossed, a phone, a drink, a wave…) came
 *   out a mannequin — centred, square on, legs straight together; the arms were right. Her stance
 *   is said: weight on one leg, a soft knee, turned a little. Only for a standing pose: on the
 *   kneel, "weight on one leg" stood her up.
 * - "leaning against a café wall" stood her upright next to it (no body words): how she leans.
 * - Eating or drinking "at a café table" stood her beside the table: she sits on a chair at it.
 */
function withRelaxedPoseFirst(prompt: string): string {
  return prompt.replace(
    /(POSE FIRST: )([^\n]*?)(\.)(?=\s|$)/,
    (match, head: string, pose: string, dot: string) => {
      let next = pose;
      if (/\bleaning against\b/i.test(next) && !/\bshoulder\b|\bhip\b/i.test(next)) {
        next = `${next}, ${QWEN_IMAGE_21_LEAN_BODY}`;
      } else if (
        /\b(?:eat\w*|drink\w*|sipp\w*|breakfast|lunch|dinner)\b[^—]*\bat (?:a|the) (?:\w+ )?(?:café |cafe |restaurant |dining |kitchen |breakfast |bistro )?table\b|\bat (?:a|the) (?:\w+ )?(?:café|cafe|restaurant|dining|bistro) table\b[^—]*\b(?:eat\w*|drink\w*|sipp\w*)\b/i.test(
          next
        ) &&
        !/\b(?:sit|sits|sitting|seated|stand\w*)\b/i.test(next)
      ) {
        next = `${next}, sitting on a chair at the table`;
      } else if (!NOT_STANDING_RE.test(next) && !next.includes(QWEN_IMAGE_21_RELAXED_STANCE)) {
        next = `${next}, ${QWEN_IMAGE_21_RELAXED_STANCE}`;
      }
      return next === pose ? match : `${head}${next}${dot}`;
    }
  );
}

/**
 * A prop the moment puts in her hand ("fruit bags in hand") but the POSE FIRST line left out (a
 * layout cue stood in for the beat) went missing: market selfie 0/3 with bags. The moment's own
 * clause carried into POSE FIRST: 3/3 (wide sweep, 2026-10-18).
 */
function withHeldProps(prompt: string): string {
  const moment = prompt.match(/\bMoment: ([^\n]*?)\.(?=\s|$)/)?.[1] ?? '';
  const held = moment
    .split(/\s*[,;—]\s*/)
    .find(clause => /\bin (?:one |both |each |her |his )?hands?\b/i.test(clause))
    ?.trim();
  if (!held || held.split(/\s+/).length > 8) return prompt;
  return prompt.replace(
    /(POSE FIRST: )([^\n]*?)(\.)(?=\s|$)/,
    (match, head: string, pose: string, dot: string) =>
      pose.toLowerCase().includes(held.toLowerCase()) ? match : `${head}${pose} — ${held}${dot}`
  );
}

/**
 * 2.1 draws text well: the Sport brief's capitalised "SPORT KIT" label came out printed on the
 * jersey ("SPORT KIT", "SPORTKIT", 3/6). In lower case: 0/6, the jerseys still team kit with a
 * number (wide sweep, 2026-10-18). "Plain kit, no printed words" also cleared it but turned
 * jerseys into beige vests.
 */
function withKitLowercase(prompt: string): string {
  return prompt
    .replace(/\bSPORT KIT\b/g, 'sport kit')
    .replace(/\bATHLETIC KIT ONLY\b/g, 'athletic kit only');
}

/**
 * A shared task gives each of the two a job of their own. "Cooking with her partner, both stirring
 * one pot" left her standing beside him facing the camera; a generic "both doing it together"
 * line barely helped. One job each, "one of them … the other …" (any pairing), same seeds
 * (night sweep, 2026-10-17): cooking 2/2 vs 0/2, laptop at a desk 2/2 vs 0/2, a shared menu 2/2
 * vs 0/2, breakfast trays 2/2 vs 0/2. Baking and board games as for groups (day-group.ts).
 */
const DUO_TASKS: ReadonlyArray<{ re: RegExp; jobs: string }> = [
  {
    re: /\bbak(?:e|es|ing)\b/i,
    jobs: 'one of them rolls out dough with a rolling pin, the other cracks an egg into a mixing bowl, both looking down at the work',
  },
  {
    re: /\b(?:cook(?:s|ing)?|stirring (?:one|a|the) pot|making (?:dinner|lunch|breakfast|brunch|pasta|pizza|a meal)|preparing (?:a |the )?(?:meal|dinner|lunch))\b/i,
    jobs: 'one of them stirs the pot with a wooden spoon, the other leans in tasting from a second spoon',
  },
  {
    re: /\b(?:laptop|computer screen|monitor)\b/i,
    jobs: 'one of them types on the laptop, the other leans in pointing at the screen, both looking at the screen, not at the camera',
  },
  {
    re: /\b(?:sharing|reading|studying) (?:a |the |one )?(?:menu|map|book|guidebook)\b/i,
    jobs: 'one of them holds it open between them pointing at the page, the other leans in reading it, both looking down at it',
  },
  {
    re: /\b(?:sharing breakfast|breakfast in bed|trays on their laps|sharing (?:a |the )?(?:meal|dinner|lunch|brunch))\b/i,
    jobs: 'one of them lifts a forkful of food, the other sips a drink, turned toward each other, mid-conversation',
  },
  // Night Out (2026-10-17, 2/2 each vs none): "sharing coffee" had no mugs, "dancing with a
  // friend" was a handshake, "sharing one mic" had one singer.
  {
    re: /\b(?:sharing (?:a |the )?coffee|coffee together|having coffee)\b/i,
    jobs: 'each holds a mug of coffee in both hands, turned toward each other, mid-conversation',
  },
  {
    re: /\bdanc(?:e|es|ing) (?:with (?:a |her |his |their )|together\b)/i,
    jobs: 'dancing together face to face, swaying to the music, one of them twirls the other by the hand, both laughing',
  },
  {
    re: /\b(?:karaoke|(?:sharing|share) (?:one|a|the) (?:mic|microphone))\b/i,
    jobs: 'both lean in to the one microphone between them, cheek to cheek, both singing with mouths open',
  },
  {
    re: /\b(?:board game|card game|playing cards|chess|dice)\b/i,
    jobs: 'one of them rolls the dice, the other moves a piece on the board, both looking down at the game',
  },
];

function withDuoJobs(prompt: string): string {
  // A drawn layout's cue can stand in for the beat in POSE FIRST ("face each other, one hand
  // joined …" for a dance): read the task from the Moment line too.
  const moment = prompt.match(/\bMoment: ([^\n]*?)\.(?=\s|$)/)?.[1] ?? '';
  return prompt.replace(
    /(POSE FIRST: the two people — )([^\n]*?)(\.)(?=\s|$)/,
    (match, head: string, beat: string, dot: string) => {
      if (/\bone of them\b|\beach holds\b|\bboth lean in\b/i.test(beat)) return match;
      const task = DUO_TASKS.find(entry => entry.re.test(beat) || entry.re.test(moment));
      return task ? `${head}${beat} — ${task.jobs}${dot}` : match;
    }
  );
}

/**
 * A bare "she wears a swimsuit" (a Vacation scene that brings its own clothes, no outfit picture)
 * came out skin-toned on 2.1 — 4/4 seeds read as nude. A bold solid colour: 3/3 clearly fabric
 * (night sweep, 2026-10-17).
 */
export const QWEN_IMAGE_21_SWIMSUIT_WORDS =
  'a solid-colour swimsuit in a bold colour, clearly fabric, never skin-toned or nude-looking';

function withSwimsuitColour(prompt: string): string {
  return prompt.replace(
    /\b([Ss]he wears) a swimsuit\b(?![^.;]*\bcolou?r)/g,
    `$1 ${QWEN_IMAGE_21_SWIMSUIT_WORDS}`
  );
}

/**
 * "Across from" a partner / friend at a table or booth sat the two side by side on one bench,
 * facing the camera (night sweep, diner booth, 0/3). Facing each other across the table, seen
 * from the side: 3/3, same seeds (2026-10-17).
 */
export const QWEN_IMAGE_21_ACROSS_TABLE_LINE =
  'they sit on opposite sides of the table, facing each other across it, the table between them; seen from the side so both faces show in profile or three-quarter';

const ACROSS_BEAT =
  /\b(?:(?:sits?|sitting|seated)\s+)?(?:across|opposite)\s+(?:the\s+table\s+)?from\s+(?:her|his|their|a|the)\b|\bfacing each other across\b/i;

function withAcrossTable(prompt: string): string {
  if (prompt.includes(QWEN_IMAGE_21_ACROSS_TABLE_LINE)) return prompt;
  return prompt.replace(
    /(POSE FIRST: the two people — )([^\n]*?)(\.)(?=\s|$)/,
    (match, head: string, beat: string, dot: string) =>
      ACROSS_BEAT.test(beat) ? `${head}${beat} — ${QWEN_IMAGE_21_ACROSS_TABLE_LINE}${dot}` : match
  );
}

/**
 * A daytime Day recipe (no LIGHT line of its own — evening / night slots have one) gets a bright
 * one on 2.1: Turbo's daytime stills were dim next to Edit 2511's. Live, 8 daytime Everyday
 * beats, same seeds (2026-10-17): mean brightness 75 → 84, the beats kept, the Cast's face
 * closer (median distance 0.46 → 0.31).
 */
export const QWEN_IMAGE_21_DAYLIGHT_LINE =
  'LIGHT: bright, well-exposed natural light — her face, body and the place clearly lit, true colours, a real photograph exposed for the scene, not dim or murky.';

/**
 * Night: the Day line's "lit only by the place's own lights … deep shadows" came out murky on 2.1
 * (Turbo, six night beats: mean brightness 32.5 vs Edit 2511's 48); exposure words alone made it
 * darker (29). Bright, coloured pools of the place's own light: 37, neon in the scene, the face
 * still close (median distance 0.26; 2511 0.43) — 2026-10-17.
 */
export const QWEN_IMAGE_21_NIGHT_LIGHT_LINE =
  "LIGHT: night — lit by the place's own lights (street lamps, neon signs, shop windows, headlights, lamps): bright pools of warm and coloured light falling on her, vivid neon and lamp colour in the scene, her face, body and outfit clearly lit by them. She is lit like the place around her, not by a studio light.";

export function withDaylightLine(prompt: string): string {
  if (/\bLIGHT: night\b/.test(prompt)) {
    return prompt.replace(
      /LIGHT: night\b[^\n]*?She is lit like the place around her, not by a studio light\./,
      QWEN_IMAGE_21_NIGHT_LIGHT_LINE
    );
  }
  if (/\bLIGHT:/.test(prompt) || !/\bDay photo:/.test(prompt)) return prompt;
  return prompt.replace(/(\bOUTFIT \(mandatory\))/, `${QWEN_IMAGE_21_DAYLIGHT_LINE}\n$1`);
}

/**
 * A Day photo recipe ends "Photorealistic photograph, natural skin."; Edit 2511's queue adds
 * "natural photograph, lifelike skin pores, camera realism" — 2.1 (on Rapid's graph) didn't get
 * it. With it and the slot's Camera line, Turbo's stills were sharper and less front-on, likeness
 * the same (24 Everyday stills, 2026-10-17).
 */
export function withPhotoRealismTail(prompt: string): string {
  const lit = withDaylightLine(prompt);
  if (/lifelike skin pores/i.test(lit)) return lit;
  return lit.replace(
    /\bPhotorealistic photograph, natural skin\./,
    'Photorealistic photograph, natural skin, natural photograph, lifelike skin pores, camera realism.'
  );
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
  /\b(?:penetrat\w*|(?:penis|cock|strap-on)\s+(?:is\s+)?inside|inside her|thrust\w*|fuck(?:s|ing)?\s+(?:her|him)|rides?\s+(?:him|her|his)|riding\s+(?:him|her|his)|mid-?sex|having sex|cowgirl|doggy|missionary)\b/i;

/** The prompt itself says two people are in the still (Day / Story adult duo recipes). */
const TWO_PEOPLE_PROMPT_RE =
  /\b(?:explicit sex photo|exactly two people|exactly one man and one woman|the (?:man|woman) has the face from)\b/i;

/**
 * Two-person penetration stills stay on the engine's own model (Rapid AIO NSFW is trained for
 * them). On 2.1 they came out fused or role-swapped, or posed "near" the act — with the pose map,
 * without it, with the Fun ControlNet Union (0.6–1.0) and with 2.1 NSFW LoRAs (live A/B on the
 * user's own duos, 2026-10-01). Two people are read from the map or from the prompt: 2.1 sends
 * no duo map, and the partner's face upload is named like the lead's — so lap and kneeling sex
 * slipped through to 2.1 and came out side by side (0/8, 2026-10-19). Day routes these to Rapid
 * before the graph is built (resolveDayStillModel); this is the fallback for other tools.
 */
export function isPenetrationDuoPrompt(prompt: string, hasDuoPoseMap: boolean): boolean {
  return (hasDuoPoseMap || TWO_PEOPLE_PROMPT_RE.test(prompt)) && PENETRATION_RE.test(prompt);
}

/**
 * Clothed two-person stills also stay on the engine's own model. On 2.1 (Pruna and the full
 * sampler, ~1.6 MP, 2026-10-02) the pair fused into one body, the partner showed as a ghost
 * behind the lead, or one person vanished — 6 of 6 Everyday beats in the sweep; with the
 * two-person map back they were two people in 2 of 3 but twins in the same dress. Rapid renders
 * the same beats as two distinct people with the partner's own face.
 */
export function isClothedDuoStill(prompt: string, hasDuoPoseMap: boolean): boolean {
  return hasDuoPoseMap && !isNudePrompt(prompt);
}

function keepsOnEngineModel(workflow: Workflow, encoder: WorkflowNode): boolean {
  const attached = [1, 2, 3]
    .map(slot => encoder.inputs[`image${slot}`])
    .filter(isRef)
    .map(ref => sourceFilename(workflow, ref));
  const duoMap = attached.some(name => isMultiPersonPoseGuide(name));
  const solo = !duoMap && !attached.some(name => isDayPartnerFaceFilename(name));
  const prompt = String(encoder.inputs.prompt ?? '');
  const profile = POSE_MODEL_PROFILES['qwen-image-2.1'];
  // Clothed two-person stills stay on 2.1 unless the profile hands them off (it no longer does:
  // Turbo on the couple recipe kept two people 56/56); their map is dropped below.
  return (
    Boolean(profile.penetrationEngine) &&
    (isPenetrationDuoPrompt(prompt, duoMap) ||
      isFaceDownNudeSolo(prompt, solo) ||
      (Boolean(profile.clothedDuoEngine) && isClothedDuoStill(prompt, duoMap)))
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
    /** Pruna 8-step LoRA + its fixed sigmas (core nodes). Ignored when `fourStep` is on. */
    eightStep?: boolean;
    /** With `eightStep`: the Turbo LoRA and sigmas instead of Pruna's (no full-pass fallback). */
    eightStepTurbo?: boolean;
    /** With `eightStepTurbo`: load the Turbo checkpoint (QWEN_IMAGE_21_TURBO_UNET), no base + LoRA. */
    turboCheckpoint?: boolean;
    /**
     * The full pass on another Qwen-Image 2.1 model file in place of the base (Noct-Q). Ignored
     * by the fast samplers, which load their own.
     */
    fullUnet?: string;
    /** The sampling shift (ModelSamplingAuraFlow) instead of 2.1's own 0.69 — the full pass only. */
    shift?: number;
    /**
     * The player's own Qwen-Image 2.1 LoRAs (their LoRA stack, 2.1 family only), chained onto the
     * model in order. Nothing else adds a LoRA here — the source graph's LoRAs are 20B and drop.
     */
    userLoras?: ReadonlyArray<{ name: string; strength: number }>;
    /** Queue quality: Best renders a solo lying still on the full pass (see above). */
    qualityProfile?: string | null;
    /** Convert every still, none kept on Rapid's model ("Pick the best engine per pose" off). */
    keepEngine?: boolean;
  } = {}
): { workflow: Record<string, unknown>; converted: boolean } {
  const workflow = structuredClone(input) as Workflow;
  const samplerId = findPrimarySampler(workflow);
  if (!samplerId) return { workflow: input, converted: false };
  const sampler = workflow[samplerId];
  const encoderId = findEncoder(workflow, sampler.inputs.positive)!;
  const encoder = workflow[encoderId];
  if (!options.keepEngine && keepsOnEngineModel(workflow, encoder)) {
    return { workflow: input, converted: false };
  }

  const latentRef = sampler.inputs.latent_image;
  const latentNode = isRef(latentRef) ? workflow[latentRef[0]] : undefined;
  const requestedWidth = Number(latentNode?.inputs.width) || options.fallbackSize?.width || 1024;
  const requestedHeight = Number(latentNode?.inputs.height) || options.fallbackSize?.height || 1024;
  // Every sampler uses the ~1.6 MP canvas for the requested aspect (see QWEN_IMAGE_21_CANVASES).
  // A one-person nude still lying on her back: 2.1 propped her up against the pillows (half
  // sitting) whatever the stance said — Turbo, three on-the-back beats: 0/3 lying in every prompt
  // and canvas tried; with QWEN_IMAGE_21_LIE_BACK_LINE on a landscape canvas, 6/6 flat on her
  // back, no twin (2026-10-17).
  // One person: no partner's face and no two-person map attached (the words of the source prompt
  // name its pose map "the second image", which read as a second person — the night sweep's
  // on-her-back beats all missed the fix, 3/3 half sitting, 2026-10-17).
  const attached = Array.from({ length: MAX_INPUT_IMAGE_FILENAMES }, (_, i) => i + 1)
    .map(slot => encoder.inputs[`image${slot}`])
    .filter(isRef)
    .map(ref => sourceFilename(workflow, ref));
  const soloAttached = !attached.some(
    name => isMultiPersonPoseGuide(name) || isDayPartnerFaceFilename(name)
  );
  const sourceText = toQwenImage21Prompt(String(encoder.inputs.prompt ?? ''));
  const lyingBackNude = soloAttached && isLyingBackNudeSolo(sourceText, { ignoreImageWords: true });
  // On her side on a couch / sofa: 2.1 sat her up the same way (night sweep: 3/3 sitting); the
  // side line on the landscape canvas laid her along it 3/3 (2026-10-17).
  const lyingSideLine = soloAttached && !lyingBackNude ? lieSideLineFor(sourceText) : null;
  const lyingNude = lyingBackNude || lyingSideLine !== null;
  const bentLine = soloAttached && !lyingNude ? bentSoloLineFor(sourceText) : null;
  const canvas = lyingNude
    ? { width: 1472, height: 1104 }
    : qwenImage21Canvas(requestedWidth, requestedHeight);

  let next = Math.max(0, ...Object.keys(workflow).map(id => Number(id) || 0)) + 1;
  const add = (node: WorkflowNode) => {
    const id = String(next++);
    workflow[id] = node;
    return id;
  };
  const turboCheckpoint =
    options.turboCheckpoint === true &&
    options.eightStepTurbo === true &&
    options.eightStep === true &&
    options.fourStep !== true;
  const fastPass = options.fourStep === true || options.eightStep === true;
  const fullUnet = fastPass ? '' : options.fullUnet?.trim() || '';
  const unet = add({
    class_type: 'UNETLoader',
    inputs: {
      unet_name: turboCheckpoint ? QWEN_IMAGE_21_TURBO_UNET : fullUnet || QWEN_IMAGE_21_FILES.unet,
      weight_dtype: 'default',
    },
  });
  const clip = add({
    class_type: 'CLIPLoader',
    inputs: { clip_name: QWEN_IMAGE_21_FILES.clip, type: 'qwen_image', device: 'default' },
  });
  const vae = add({ class_type: 'VAELoader', inputs: { vae_name: QWEN_IMAGE_21_FILES.vae } });
  const referenceFiles = Array.from({ length: MAX_INPUT_IMAGE_FILENAMES }, (_, i) => i + 1)
    .map(slot => encoder.inputs[`image${slot}`])
    .filter(isRef)
    .map(ref => sourceFilename(workflow, ref));
  const eightStep =
    options.eightStep === true &&
    options.fourStep !== true &&
    // Turbo held lying stills at 8 steps (5/5); only Pruna falls back to the full pass.
    (options.eightStepTurbo === true ||
      !qwenImage21FullStepsForStill({
        qualityProfile: options.qualityProfile,
        prompt: String(encoder.inputs.prompt ?? ''),
        solo: !referenceFiles.some(
          name => isMultiPersonPoseGuide(name) || isDayPartnerFaceFilename(name)
        ),
      }));
  const lora =
    eightStep && !turboCheckpoint
      ? add({
          class_type: 'LoraLoaderModelOnly',
          inputs: {
            model: [unet, 0],
            lora_name: options.eightStepTurbo
              ? QWEN_IMAGE_21_TURBO_LORA
              : QWEN_IMAGE_21_EIGHT_STEP_LORA,
            strength_model: 1,
          },
        })
      : unet;
  let withUserLoras = lora;
  for (const user of options.userLoras ?? []) {
    if (!user.name.trim() || !(user.strength > 0)) continue;
    withUserLoras = add({
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: [withUserLoras, 0],
        lora_name: user.name.trim(),
        strength_model: Math.round(user.strength * 100) / 100,
      },
    });
  }
  const cache = add({
    class_type: 'QwenImage21Cache',
    inputs: { model: [withUserLoras, 0], device: 'auto', dtype: 'default' },
  });
  let samplerModel: [string, number] = [cache, 0];
  if (!fastPass && options.shift && options.shift > 0) {
    samplerModel = [
      add({
        class_type: 'ModelSamplingAuraFlow',
        inputs: { model: samplerModel, shift: options.shift },
      }),
      0,
    ];
  }
  // A two-person pose map is a limb diagram. 2.1 paints it: fused bodies, a third person, a
  // bare arm in the gap (live, 2026-10-01). Those stay out; a one-person map stays. Fun
  // ControlNet Union made anatomy worse and stays off unless the caller turns it on.
  const nudeStill = isNudePrompt(String(encoder.inputs.prompt ?? ''));
  const profile = POSE_MODEL_PROFILES['qwen-image-2.1'];
  const duoMapDelivery = nudeStill ? profile.mapDelivery.duoNude : profile.mapDelivery.duoClothed;
  const kept: Array<{ from: number; ref: [string, number] }> = [];
  const dropped: number[] = [];
  // Every slot the queue wires (image1 … imageN): a group still's fourth face, its room photo.
  for (let slot = 1; slot <= MAX_INPUT_IMAGE_FILENAMES; slot += 1) {
    const ref = encoder.inputs[`image${slot}`];
    if (!isRef(ref)) continue;
    const filename = sourceFilename(workflow, ref);
    // A planned one-person map on a face-crop still is painted as limbs too (see the profile);
    // the player's own pose is kept — on a full-body plate 2.1 follows it exactly.
    const droppedSolo =
      profile.mapDelivery.solo === 'none' &&
      isPoseGuideFilename(filename) &&
      !isMultiPersonPoseGuide(filename) &&
      !isPlayerPoseGuide(filename);
    if (droppedSolo || (duoMapDelivery === 'none' && isMultiPersonPoseGuide(filename)))
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
    prompt: (lyingBackNude
      ? withLieBackLine
      : lyingSideLine || bentLine
        ? (text: string) => withLeadLine(text, (lyingSideLine || bentLine) as string)
        : (text: string) => text)(
      withPhotoRealismTail(
        withTwoPersonFaces(
          withoutDroppedReferences(
            withProfilePromptFixes(
              withNaturalPoses(toQwenImage21Prompt(String(encoder.inputs.prompt ?? ''))),
              {
                namePartnerOutfit: profile.namePartnerOutfit,
                dressWhenNoOutfit: profile.dressWhenNoOutfit && !nudeStill,
              }
            ),
            dropped,
            kept.map(entry => entry.from)
          ),
          {
            partnerImage: partnerKept >= 0 ? partnerKept + 1 : null,
            droppedPoseMap: dropped.length > 0,
          }
        )
      )
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
  if (eightStep) {
    const noise = add({
      class_type: 'RandomNoise',
      inputs: { noise_seed: sampler.inputs.seed ?? 0 },
    });
    const guider = add({
      class_type: 'BasicGuider',
      inputs: { model: samplerModel, conditioning: [encode, 0] },
    });
    // Turbo on er_sde (2026-10-18): euler_ancestral's fresh noise each step left an 8 px crosshatch
    // on fine texture now and then (skin, denim, knit — "moiré"). 13 Day beats × 3 seeds, same
    // graphs: grid score lower on 32 of 39 (strong-grid renders 5 → 1), face closer on 21 of 36
    // (median 0.239 → 0.207), brightness and poses unchanged. Plain euler: grid 26 / 39, face
    // 0.236. A linear_quadratic schedule instead of Turbo's own sigmas flattened the light.
    // (2026-10-17: euler_ancestral had beaten euler on likeness, 26 of 38; CFG 1.75 + a negative
    // and the Glamour Realism LoRA both lost.) Pruna stays on euler (not tested).
    const pick = add({
      class_type: 'KSamplerSelect',
      inputs: { sampler_name: options.eightStepTurbo ? 'er_sde' : 'euler' },
    });
    const sigmas = add({
      class_type: 'ManualSigmas',
      inputs: {
        sigmas: (options.eightStepTurbo
          ? QWEN_IMAGE_21_TURBO_SIGMAS
          : QWEN_IMAGE_21_EIGHT_STEP_SIGMAS
        )
          .map(value => value.toFixed(6))
          .join(', '),
      },
    });
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
  // Rapid AIO's moiré polish (blur / resample before the save) has no screen-door to clean on
  // 2.1 and only softened it: the save takes the decoded image again.
  for (const node of Object.values(workflow)) {
    if (!OUTPUT_CLASS.test(node.class_type)) continue;
    let ref = node.inputs.images;
    while (isRef(ref)) {
      const upstream = workflow[ref[0]];
      if (
        !upstream ||
        !/^(?:ImageBlur|ImageScaleBy|ImageSharpen)$/.test(upstream.class_type) ||
        !/moir/i.test(String((upstream as { _meta?: { title?: string } })._meta?.title ?? ''))
      )
        break;
      ref = upstream.inputs.image;
    }
    if (isRef(ref)) node.inputs.images = ref;
  }
  return { workflow: pruneUnreachableNodes(workflow), converted: true };
}
