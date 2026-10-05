/**
 * "Fix an area": the player paints part of a finished still, says what should be there (or not),
 * and two candidates are rendered on the still's OWN engine — its graph (model, LoRAs, prompt) as
 * ComfyUI embedded it — with only that area re-sampled, then composited back so every pixel
 * outside the brush stays exactly as it was.
 *
 * The method is the one that worked in the limb-repair study (2026-10-03, Rapid AIO): Image 1 is
 * the still with the area filled flat grey (with the still itself as Image 1 Rapid re-painted the
 * same defect, even at denoise 1.0), a HARD noise mask on the painted area grown a few pixels,
 * and a SOFT feathered composite (fix-area-mask.ts). The study's limit holds: an isolated defect
 * (an arm, a hand, a stray object) is what a regional pass fixes — fused or phantom limbs on a
 * two-person still are redrawn from context.
 *
 * Pure: graph patching and the prompt line. Pixels are fix-area-mask.ts; ComfyUI is
 * fix-area-server.ts.
 */

export type FixAreaReference =
  /** Image 1 (and the sampled latent) is the still with the area painted flat grey. */
  | 'grey'
  /** Image 1 is the still as it is (edit-type engines can read what is there). */
  | 'still';

/** What the prompt asks for when the player leaves the box empty. */
export const FIX_AREA_DEFAULT_TEXT = 'clean, natural anatomy, nothing extra';

/** Output prefix of fix candidates in ComfyUI's output folder. */
export const FIX_AREA_OUTPUT_PREFIX = 'Castcut-fix';

/** Candidates per Fix — two seeds, queued back to back. */
export const FIX_AREA_CANDIDATES = 2;

/** Longest text kept from "What should be there?". */
export const FIX_AREA_TEXT_MAX = 300;

/**
 * Defaults, from the live A/B on four of the player's clothed stills (2026-10-05; Rapid AIO ×2,
 * Edit 2511, Qwen-Image 2.1): grey fill at full denoise cleaned 4/4. Grey at 0.75 left the grey
 * patch 4/4 (the server always runs grey at 1.0); the still itself as Image 1 re-painted the
 * stray hand on Rapid and tied on Edit 2511 / 2.1.
 */
export const FIX_AREA_DEFAULT_REFERENCE: FixAreaReference = 'grey';
export const FIX_AREA_DEFAULT_DENOISE = 1;

export function normalizeFixAreaText(text: string | null | undefined): string {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FIX_AREA_TEXT_MAX)
    .replace(/[.\s]+$/, '');
  return clean;
}

/** The line appended to the still's prompt. */
export function fixAreaPromptLine(
  text: string | null | undefined,
  reference: FixAreaReference
): string {
  const wanted = normalizeFixAreaText(text) || FIX_AREA_DEFAULT_TEXT;
  const line = `Fix only the marked area: ${wanted}.`;
  return reference === 'grey'
    ? `${line} The flat grey patch in the picture marks that area — repaint it so it blends into the photo (same light, skin, clothing and setting); keep everything else exactly as it is.`
    : `${line} Keep everything else exactly as it is.`;
}

export function normalizeFixAreaDenoise(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return FIX_AREA_DEFAULT_DENOISE;
  return Math.min(1, Math.max(0.3, Math.round(number * 100) / 100));
}

export function normalizeFixAreaReference(value: unknown): FixAreaReference {
  return value === 'still' ? 'still' : value === 'grey' ? 'grey' : FIX_AREA_DEFAULT_REFERENCE;
}

type GraphNode = { class_type: string; inputs: Record<string, unknown>; _meta?: unknown };
export type ApiGraph = Record<string, GraphNode>;
type Link = [string, number];

function isLink(value: unknown): value is Link {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'number'
  );
}

function asGraph(graph: unknown): ApiGraph | null {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return null;
  const out: ApiGraph = {};
  for (const [id, node] of Object.entries(graph as Record<string, unknown>)) {
    const record = node as { class_type?: unknown; inputs?: unknown } | null;
    if (!record || typeof record.class_type !== 'string') continue;
    const inputs =
      record.inputs && typeof record.inputs === 'object' && !Array.isArray(record.inputs)
        ? (record.inputs as Record<string, unknown>)
        : {};
    out[id] = { class_type: record.class_type, inputs: { ...inputs } };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Every node a node depends on (itself included). */
function ancestors(graph: ApiGraph, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id) || !graph[id]) continue;
    seen.add(id);
    for (const value of Object.values(graph[id]!.inputs)) {
      if (isLink(value)) stack.push(value[0]);
    }
  }
  return seen;
}

const SAVE_NODES = new Set(['SaveImage', 'Image Save', 'SaveImageWebsocket']);
const SAMPLERS = new Set([
  'KSampler',
  'KSamplerAdvanced',
  'SamplerCustomAdvanced',
  'SamplerCustom',
]);
const IMAGE_INPUT = /^(?:image\d+|images\.image_\d+)$/;
const FIRST_IMAGE_INPUT = /^(?:image1|images\.image_1)$/;
const PROMPT_INPUTS = ['prompt', 'text', 't5xxl', 'clip_l'] as const;

/** The still's save node: the first SaveImage (lowest id). */
function findSaveNode(graph: ApiGraph): string | null {
  const ids = Object.keys(graph)
    .filter(id => SAVE_NODES.has(graph[id]!.class_type) && isLink(graph[id]!.inputs.images))
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  return ids[0] ?? null;
}

/** The sampler nearest the saved image (a hires second pass wins over the first). */
function findSampler(graph: ApiGraph, from: Link): string | null {
  const queue: string[] = [from[0]];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id) || !graph[id]) continue;
    seen.add(id);
    if (SAMPLERS.has(graph[id]!.class_type)) return id;
    for (const value of Object.values(graph[id]!.inputs)) if (isLink(value)) queue.push(value[0]);
  }
  return null;
}

/** The VAE that decodes the sampler's latent. */
function findVae(graph: ApiGraph, sampler: string, save: string): Link | null {
  for (const id of ancestors(graph, save)) {
    const node = graph[id]!;
    if (!/^VAEDecode/.test(node.class_type)) continue;
    const samples = node.inputs.samples;
    if (isLink(samples) && samples[0] === sampler && isLink(node.inputs.vae)) {
      return node.inputs.vae;
    }
  }
  return null;
}

/** Conditioning links a sampler reads: positive first, then negative. */
function conditioningLinks(
  graph: ApiGraph,
  sampler: string
): { positive: Link[]; negative: Link[] } {
  const node = graph[sampler]!;
  const positive: Link[] = [];
  const negative: Link[] = [];
  const push = (list: Link[], value: unknown) => {
    if (isLink(value)) list.push(value);
  };
  if (node.class_type === 'SamplerCustomAdvanced') {
    const guiderLink = node.inputs.guider;
    const guider = isLink(guiderLink) ? graph[guiderLink[0]] : undefined;
    if (guider) {
      push(positive, guider.inputs.conditioning);
      push(positive, guider.inputs.positive);
      push(negative, guider.inputs.negative);
    }
  } else {
    push(positive, node.inputs.positive);
    push(negative, node.inputs.negative);
  }
  return { positive, negative };
}

function hasPromptText(node: GraphNode): boolean {
  return PROMPT_INPUTS.some(key => typeof node.inputs[key] === 'string');
}

/** Conditioning nodes up a chain (through ReferenceLatent / FluxGuidance / combines). */
function conditioningChain(graph: ApiGraph, start: Link): string[] {
  const out: string[] = [];
  const stack = [start[0]];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id) || !graph[id]) continue;
    seen.add(id);
    out.push(id);
    const node = graph[id]!;
    if (hasPromptText(node)) continue;
    for (const [key, value] of Object.entries(node.inputs)) {
      if (isLink(value) && /^conditioning/.test(key)) stack.push(value[0]);
    }
  }
  return out;
}

export type FixAreaGraphInput = {
  /** ComfyUI input name of the still as shown (the composite's base). */
  stillName: string;
  /** ComfyUI input name of the still with the hard-mask area filled grey. */
  fillName: string;
  hardMaskName: string;
  softMaskName: string;
  seed: number;
  denoise: number;
  reference: FixAreaReference;
  text?: string | null;
};

export type FixAreaGraph = {
  graph: ApiGraph;
  saveNode: string;
  /** An edit-type engine (the encoder reads images, or reference latents are used). */
  edit: boolean;
};

/** Trim a ManualSigmas schedule to a partial denoise: start at `denoise`, keep what's below. */
export function trimSigmasForDenoise(sigmas: string, denoise: number): string {
  if (denoise >= 1) return sigmas;
  const values = sigmas
    .split(',')
    .map(part => Number(part.trim()))
    .filter(value => Number.isFinite(value));
  if (values.length < 2) return sigmas;
  const top = values[0]!;
  const start = top * denoise;
  const rest = values.filter(value => value < start);
  return [start, ...rest].map(value => value.toFixed(6)).join(', ');
}

/**
 * The still's graph, patched into a masked fix: null when the graph can't be re-rendered this
 * way (no SaveImage, no sampler, no VAE decode — a clip, a face-finish pass, an upload).
 */
export function buildFixAreaGraph(
  rawGraph: unknown,
  input: FixAreaGraphInput
): FixAreaGraph | null {
  const graph = asGraph(rawGraph);
  if (!graph) return null;
  const save = findSaveNode(graph);
  if (!save) return null;
  const saved = graph[save]!.inputs.images as Link;
  const sampler = findSampler(graph, saved);
  if (!sampler) return null;
  const vae = findVae(graph, sampler, save);
  if (!vae) return null;

  const ids = {
    still: 'fa_still',
    fill: 'fa_fill',
    hard: 'fa_hard',
    soft: 'fa_soft',
    encode: 'fa_encode',
    latent: 'fa_latent',
    composite: 'fa_composite',
  };
  graph[ids.still] = { class_type: 'LoadImage', inputs: { image: input.stillName } };
  const referenceImage: Link = input.reference === 'grey' ? [ids.fill, 0] : [ids.still, 0];
  if (input.reference === 'grey') {
    graph[ids.fill] = { class_type: 'LoadImage', inputs: { image: input.fillName } };
  }
  graph[ids.hard] = {
    class_type: 'LoadImageMask',
    inputs: { image: input.hardMaskName, channel: 'red' },
  };
  graph[ids.soft] = {
    class_type: 'LoadImageMask',
    inputs: { image: input.softMaskName, channel: 'red' },
  };
  graph[ids.encode] = { class_type: 'VAEEncode', inputs: { pixels: referenceImage, vae } };
  graph[ids.latent] = {
    class_type: 'SetLatentNoiseMask',
    inputs: { samples: [ids.encode, 0], mask: [ids.hard, 0] },
  };

  // Sampler: the masked latent, the new seed, the denoise.
  const node = graph[sampler]!;
  node.inputs.latent_image = [ids.latent, 0];
  const denoise = Math.min(1, Math.max(0, input.denoise));
  if (node.class_type === 'KSampler') {
    node.inputs.seed = input.seed;
    node.inputs.denoise = denoise;
  } else if (node.class_type === 'KSamplerAdvanced') {
    node.inputs.noise_seed = input.seed;
    const steps = typeof node.inputs.steps === 'number' ? node.inputs.steps : 8;
    node.inputs.start_at_step = Math.round(steps * (1 - denoise));
    node.inputs.add_noise = 'enable';
  } else if (node.class_type === 'SamplerCustom') {
    node.inputs.noise_seed = input.seed;
  } else {
    const noise = isLink(node.inputs.noise) ? graph[node.inputs.noise[0]] : undefined;
    if (noise && 'noise_seed' in noise.inputs) noise.inputs.noise_seed = input.seed;
  }
  const sigmasLink = node.inputs.sigmas;
  const sigmas = isLink(sigmasLink) ? graph[sigmasLink[0]] : undefined;
  if (sigmas && denoise < 1) {
    if (typeof sigmas.inputs.sigmas === 'string') {
      sigmas.inputs.sigmas = trimSigmasForDenoise(sigmas.inputs.sigmas, denoise);
    } else if ('denoise' in sigmas.inputs) {
      sigmas.inputs.denoise = denoise;
    }
  }

  // Conditioning: Image 1 = the reference (other images — plate, pose guide — dropped), reference
  // latents = the reference, the fix line on the positive prompt.
  const { positive, negative } = conditioningLinks(graph, sampler);
  const line = fixAreaPromptLine(input.text, input.reference);
  let edit = false;
  const patched = new Set<string>();
  const patchChain = (links: Link[], appendPrompt: boolean) => {
    for (const link of links) {
      for (const id of conditioningChain(graph, link)) {
        const chainNode = graph[id]!;
        if (chainNode.class_type === 'ReferenceLatent') {
          edit = true;
          chainNode.inputs.latent = [ids.encode, 0];
          // Chained reference latents (face crop, then plate) collapse to one.
          let upstream = chainNode.inputs.conditioning;
          while (isLink(upstream) && graph[upstream[0]]?.class_type === 'ReferenceLatent') {
            upstream = graph[upstream[0]]!.inputs.conditioning;
          }
          chainNode.inputs.conditioning = upstream;
          continue;
        }
        if (!hasPromptText(chainNode) || patched.has(`${id}:${appendPrompt}`)) continue;
        patched.add(`${id}:${appendPrompt}`);
        const imageKeys = Object.keys(chainNode.inputs).filter(key => IMAGE_INPUT.test(key));
        if (imageKeys.length > 0) {
          edit = true;
          for (const key of imageKeys) {
            if (FIRST_IMAGE_INPUT.test(key)) chainNode.inputs[key] = referenceImage;
            else delete chainNode.inputs[key];
          }
          if (!imageKeys.some(key => FIRST_IMAGE_INPUT.test(key))) {
            const first = imageKeys[0]!.startsWith('images.') ? 'images.image_1' : 'image1';
            chainNode.inputs[first] = referenceImage;
          }
        }
        if (appendPrompt) {
          for (const key of PROMPT_INPUTS) {
            const text = chainNode.inputs[key];
            if (typeof text === 'string' && text.trim()) {
              chainNode.inputs[key] = `${text.trim()}\n${line}`;
            }
          }
        }
      }
    }
  };
  patchChain(positive, true);
  patchChain(negative, false);

  // Composite the decoded result (after any post-decode step the still had, e.g. Rapid's blur)
  // onto the still through the soft mask, and save only that.
  graph[ids.composite] = {
    class_type: 'ImageCompositeMasked',
    inputs: {
      destination: [ids.still, 0],
      source: saved,
      x: 0,
      y: 0,
      resize_source: false,
      mask: [ids.soft, 0],
    },
  };
  graph[save]!.inputs.images = [ids.composite, 0];
  graph[save]!.inputs.filename_prefix = FIX_AREA_OUTPUT_PREFIX;
  const keep = ancestors(graph, save);
  for (const id of Object.keys(graph)) if (!keep.has(id)) delete graph[id];
  return { graph, saveNode: save, edit };
}

/** The positive prompt of a still's graph (for showing what the fix starts from). */
export function readFixAreaStillPrompt(rawGraph: unknown): string | null {
  const graph = asGraph(rawGraph);
  if (!graph) return null;
  const save = findSaveNode(graph);
  const sampler = save ? findSampler(graph, graph[save]!.inputs.images as Link) : null;
  if (!sampler) return null;
  for (const link of conditioningLinks(graph, sampler).positive) {
    for (const id of conditioningChain(graph, link)) {
      const node = graph[id]!;
      for (const key of PROMPT_INPUTS) {
        const text = node.inputs[key];
        if (typeof text === 'string' && text.trim()) return text.trim();
      }
    }
  }
  return null;
}

/** A random 32-bit seed per candidate, never the same twice in one Fix. */
export function fixAreaSeeds(count: number, random: () => number = Math.random): number[] {
  const seeds = new Set<number>();
  while (seeds.size < count) {
    let seed = Math.floor(random() * 2 ** 32) >>> 0;
    while (seeds.has(seed)) seed = (seed + 1) >>> 0;
    seeds.add(seed);
  }
  return [...seeds];
}
