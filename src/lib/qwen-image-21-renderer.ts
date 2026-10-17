import { POSE_MODEL_PROFILES } from './pose/pose-model-profile';
import { beatLiesDown } from './beat-text';

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
  // A group still (day-group.ts: "Three people together", the third face as <image3>).
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

/**
 * A daytime Day recipe (no LIGHT line of its own — evening / night slots have one) gets a bright
 * one on 2.1: Turbo's daytime stills were dim next to Edit 2511's. Live, 8 daytime Everyday
 * beats, same seeds (2026-10-17): mean brightness 75 → 84, the beats kept, the Cast's face
 * closer (median distance 0.46 → 0.31).
 */
export const QWEN_IMAGE_21_LIE_BACK_LINE =
  'POSE FIRST: she lies flat on her back — her whole body horizontal across the frame, head and shoulders down on the pillow, back flat on the mattress, not propped up, not sitting, not leaning against the headboard; seen from the side at mattress height.';

/** One person, nude, the stance on her back (Day / Story adult recipes). */
export function isLyingBackNudeSolo(prompt: string): boolean {
  return (
    isNudePrompt(prompt) &&
    /\bShe lies (?:flat )?on her back\b/.test(prompt) &&
    !/\b(?:TWO PEOPLE|two people|partner|the man from|second image)\b/i.test(prompt)
  );
}

export function withLieBackLine(prompt: string): string {
  if (prompt.includes(QWEN_IMAGE_21_LIE_BACK_LINE)) return prompt;
  const lead = 'Keep facial likeness only: ';
  return prompt.includes(lead)
    ? prompt.replace(lead, `${lead}${QWEN_IMAGE_21_LIE_BACK_LINE} `)
    : `${QWEN_IMAGE_21_LIE_BACK_LINE} ${prompt}`;
}

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
  const duoMap = [1, 2, 3].some(slot => {
    const ref = encoder.inputs[`image${slot}`];
    return isRef(ref) && isMultiPersonPoseGuide(sourceFilename(workflow, ref));
  });
  const prompt = String(encoder.inputs.prompt ?? '');
  const profile = POSE_MODEL_PROFILES['qwen-image-2.1'];
  // Clothed two-person stills stay on 2.1 unless the profile hands them off (it no longer does:
  // Turbo on the couple recipe kept two people 56/56); their map is dropped below.
  return (
    Boolean(profile.penetrationEngine) &&
    (isPenetrationDuoPrompt(prompt, duoMap) ||
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
    /** Queue quality: Best renders a solo lying still on the full pass (see above). */
    qualityProfile?: string | null;
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
  // Every sampler uses the ~1.6 MP canvas for the requested aspect (see QWEN_IMAGE_21_CANVASES).
  // A one-person nude still lying on her back: 2.1 propped her up against the pillows (half
  // sitting) whatever the stance said — Turbo, three on-the-back beats: 0/3 lying in every prompt
  // and canvas tried; with QWEN_IMAGE_21_LIE_BACK_LINE on a landscape canvas, 6/6 flat on her
  // back, no twin (2026-10-17).
  const lyingBackNude = isLyingBackNudeSolo(String(encoder.inputs.prompt ?? ''));
  const canvas = lyingBackNude
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
  const unet = add({
    class_type: 'UNETLoader',
    inputs: {
      unet_name: turboCheckpoint ? QWEN_IMAGE_21_TURBO_UNET : QWEN_IMAGE_21_FILES.unet,
      weight_dtype: 'default',
    },
  });
  const clip = add({
    class_type: 'CLIPLoader',
    inputs: { clip_name: QWEN_IMAGE_21_FILES.clip, type: 'qwen_image', device: 'default' },
  });
  const vae = add({ class_type: 'VAELoader', inputs: { vae_name: QWEN_IMAGE_21_FILES.vae } });
  const referenceFiles = [1, 2, 3, 4]
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
  const cache = add({
    class_type: 'QwenImage21Cache',
    inputs: { model: [lora, 0], device: 'auto', dtype: 'default' },
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
  // Slot 4 too: a group still's room photo (the queue wires image4 on the encoder node).
  for (let slot = 1; slot <= 4; slot += 1) {
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
    prompt: (lyingBackNude ? withLieBackLine : (text: string) => text)(
      withPhotoRealismTail(
        withTwoPersonFaces(
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
    // Turbo on euler_ancestral (2026-10-17, same seeds): face closer on 26 of 38 Day beats (median
    // 0.238 → 0.205), a touch brighter (70 → 74; night 37 → 40), poses kept on all but one arms-up
    // beat, no extra time. CFG 1.75 + a negative made night darker (37 → 29) at twice the time; the
    // Glamour Realism LoRA (0.6) cost likeness (0.25 → 0.43). Pruna stays on euler (not tested).
    const pick = add({
      class_type: 'KSamplerSelect',
      inputs: { sampler_name: options.eightStepTurbo ? 'euler_ancestral' : 'euler' },
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
