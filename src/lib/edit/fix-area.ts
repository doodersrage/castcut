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

/** What a Fix runs with: the player's choice, else the mode's default. */
export function resolveFixAreaRun(input: {
  mode: FixAreaMode;
  reference?: unknown;
  denoise?: unknown;
}): { reference: FixAreaReference; denoise: number } {
  const reference =
    input.reference === 'still' || input.reference === 'grey'
      ? input.reference
      : input.mode === 'face'
        ? FIX_AREA_FACE_REFERENCE
        : FIX_AREA_DEFAULT_REFERENCE;
  // A grey patch is only repainted at full denoise: at 0.75 the distilled engines left it grey
  // (4 of 4 in the first live A/B).
  if (reference === 'grey') return { reference, denoise: 1 };
  const denoise =
    input.denoise === undefined || input.denoise === null
      ? input.mode === 'face'
        ? FIX_AREA_FACE_DENOISE
        : FIX_AREA_DEFAULT_DENOISE
      : normalizeFixAreaDenoise(input.denoise);
  return { reference, denoise };
}

/** What the prompt asks for when the player leaves the box empty. */
export const FIX_AREA_DEFAULT_TEXT = 'clean, natural anatomy, nothing extra';

/**
 * `area`: the player painted the area. `face`: "Fix the face" — the detected face box is
 * painted, and the Cast's face crop goes in as an identity reference where the engine reads
 * images (the identity-aware face pass is what won the finishing-pass study, 2026-09-28).
 */
export type FixAreaMode = 'area' | 'face';

/** What a face fix asks for when the box is empty. */
export const FIX_AREA_FACE_TEXT =
  'her face, clear and natural, the same expression and gaze as the rest of the picture suggests';

/**
 * Fix the face runs on the still itself (the face visible) at half denoise, like the identity
 * face pass that won the finishing-pass study — a grey-fill redraw at full denoise lost the Cast
 * even with the face reference (round 2 A/B, four clothed solo stills, InsightFace distance to
 * the Cast face: original 0.54 / 0.71 / 0.22 / 0.13 → grey redraw with the reference 0.85 / 0.82
 * / 0.78 / 0.21; the still at 0.5 with the reference 0.53 / 0.74 / 0.26 / 0.15).
 */
export const FIX_AREA_FACE_REFERENCE: FixAreaReference = 'still';
export const FIX_AREA_FACE_DENOISE = 0.5;

/** A box as fractions of the picture (0–1), left / top / width / height. */
export type FixAreaBox = { x: number; y: number; width: number; height: number };

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
  reference: FixAreaReference,
  options?: {
    mode?: FixAreaMode;
    /** How the still's prompt names its pictures: "Image 2" or "<image2>" (face reference). */
    identityLabel?: string | null;
  }
): string {
  const face = options?.mode === 'face';
  const wanted = normalizeFixAreaText(text) || (face ? FIX_AREA_FACE_TEXT : FIX_AREA_DEFAULT_TEXT);
  const identity =
    face && options?.identityLabel
      ? ` The face is the same person as the face reference ${options.identityLabel} — the same features, eyes, nose, mouth, skin and hair — at the size and angle the picture already has.`
      : '';
  const line = `Fix only the marked area: ${wanted}.${identity}`;
  return reference === 'grey'
    ? `${line} The flat grey patch in the picture marks that area — repaint it so it blends into the photo (same light, skin, clothing and setting); keep everything else exactly as it is.`
    : `${line} Keep everything else exactly as it is.`;
}

/**
 * The box "Fix the face" paints around a detected face (brow to chin): wider for the ears and
 * cheeks, taller for the hairline and the chin, lifted a little toward the hair. Fractions of
 * the picture, clamped inside it.
 */
export function faceFixBox(
  face: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number }
): FixAreaBox {
  const w = Math.max(1, size.width);
  const h = Math.max(1, size.height);
  const faceW = Math.max(1, face.width);
  const faceH = Math.max(1, face.height);
  const boxW = faceW * 1.5;
  const boxH = faceH * 1.75;
  const centerX = face.x + faceW / 2;
  const centerY = face.y + faceH / 2 - faceH * 0.08;
  const x0 = Math.max(0, centerX - boxW / 2);
  const y0 = Math.max(0, centerY - boxH / 2);
  const x1 = Math.min(w, centerX + boxW / 2);
  const y1 = Math.min(h, centerY + boxH / 2);
  return {
    x: x0 / w,
    y: y0 / h,
    width: Math.max(0, x1 - x0) / w,
    height: Math.max(0, y1 - y0) / h,
  };
}

/** The painted pixels' box (fractions) from a one-byte-per-pixel mask, or null when empty. */
export function maskBoundsFraction(
  mask: ArrayLike<number>,
  size: { width: number; height: number },
  stride = 1,
  threshold = 128
): FixAreaBox | null {
  const { width, height } = size;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[(y * width + x) * stride]! < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return {
    x: minX / width,
    y: minY / height,
    width: (maxX - minX + 1) / width,
    height: (maxY - minY + 1) / height,
  };
}

/** Smallest zoom window as a share of the picture's side (a tiny stroke still gets context). */
export const FIX_AREA_ZOOM_MIN = 0.22;

/**
 * "Zoom to the area": the window every picture is cropped to — the painted box plus a margin
 * (a share of the box's longer side, never under the minimum window), kept inside the picture
 * and the same for the original and every take so they line up at one scale.
 */
export function fixAreaZoomWindow(
  box: FixAreaBox | null | undefined,
  aspect: number,
  margin = 0.6
): FixAreaBox | null {
  if (!box || box.width <= 0 || box.height <= 0) return null;
  const ratio = aspect > 0 ? aspect : 1;
  // Work in a square-pixel space (x scaled by the aspect) so the margin is the same on both axes.
  const px = { x: box.x * ratio, y: box.y, width: box.width * ratio, height: box.height };
  const longer = Math.max(px.width, px.height);
  const pad = longer * margin;
  const minSide = FIX_AREA_ZOOM_MIN * Math.max(ratio, 1);
  const side = Math.max(longer + 2 * pad, minSide);
  const centerX = px.x + px.width / 2;
  const centerY = px.y + px.height / 2;
  let w = Math.min(ratio, Math.max(px.width + 2 * pad, side));
  let h = Math.min(1, Math.max(px.height + 2 * pad, side));
  let x = centerX - w / 2;
  let y = centerY - h / 2;
  x = Math.min(Math.max(0, x), ratio - w);
  y = Math.min(Math.max(0, y), 1 - h);
  w = Math.max(0.01, w);
  h = Math.max(0.01, h);
  return { x: x / ratio, y, width: w / ratio, height: h };
}

/**
 * The pictures a still's graph took as its identity: a face crop upload (Day / Story face
 * breaks, nude face crops, the Face finish reference) and the Cast plate (cut-out, dress plate,
 * base plate) a face can be cropped from. Pose guides, partner plates, garments and masks never
 * count. A face crop is only a candidate: the one a lying plate's top window cut held hair
 * alone (2026-10-05, Castcut_02555's), so the server checks it shows a face before using it.
 */
export function findFixAreaIdentityImages(rawGraph: unknown): {
  face: string | null;
  plate: string | null;
} {
  const graph = asGraph(rawGraph);
  if (!graph) return { face: null, plate: null };
  const names = Object.values(graph)
    .filter(node => node.class_type === 'LoadImage' && typeof node.inputs.image === 'string')
    .map(node => String(node.inputs.image));
  const excluded =
    /pose-guide|pose_guide|partner|garment|packshot|mask|fix-area|shoe|footwear|outfit-back/i;
  const face = names.find(name => !excluded.test(name) && /face/i.test(name)) ?? null;
  const plate =
    names.find(
      name =>
        !excluded.test(name) &&
        !/face/i.test(name) &&
        /cutout|cut-out|plate|identity|lock/i.test(name)
    ) ?? null;
  return { face, plate };
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
  mode?: FixAreaMode;
  /** ComfyUI input name of the Cast face crop (Fix the face): Image 2 where the encoder reads images. */
  faceName?: string | null;
};

export type FixAreaGraph = {
  graph: ApiGraph;
  saveNode: string;
  /** An edit-type engine (the encoder reads images, or reference latents are used). */
  edit: boolean;
  /** The face reference went in as Image 2 (an encoder that reads images). */
  identity: boolean;
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
    face: 'fa_face',
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
  // latents = the reference, the fix line on the positive prompt. Fix the face: the Cast face
  // crop as Image 2 of the positive encoder (the identity channel of the finishing-pass study).
  const { positive, negative } = conditioningLinks(graph, sampler);
  const faceName = input.mode === 'face' ? input.faceName?.trim() || null : null;
  const stillPrompt = faceName ? readFixAreaStillPrompt(graph) : null;
  const identityLabel = faceName
    ? /<image1>/i.test(stillPrompt ?? '')
      ? '<image2>'
      : 'Image 2'
    : null;
  let identity = false;
  const identityImage: Link = [ids.face, 0];
  if (faceName) graph[ids.face] = { class_type: 'LoadImage', inputs: { image: faceName } };
  const line = fixAreaPromptLine(input.text, input.reference, {
    mode: input.mode ?? 'area',
    // Decided below: only when an encoder takes Image 2 (the line is rebuilt otherwise).
    identityLabel,
  });
  const plainLine = fixAreaPromptLine(input.text, input.reference, {
    mode: input.mode ?? 'area',
    identityLabel: null,
  });
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
          const dotted = imageKeys[0]!.startsWith('images.');
          if (!imageKeys.some(key => FIRST_IMAGE_INPUT.test(key))) {
            chainNode.inputs[dotted ? 'images.image_1' : 'image1'] = referenceImage;
          }
          if (faceName && appendPrompt) {
            chainNode.inputs[dotted ? 'images.image_2' : 'image2'] = identityImage;
            identity = true;
          }
        }
        if (appendPrompt) {
          for (const key of PROMPT_INPUTS) {
            const text = chainNode.inputs[key];
            if (typeof text === 'string' && text.trim()) {
              chainNode.inputs[key] = `${text.trim()}\n${
                faceName && imageKeys.length > 0 ? line : plainLine
              }`;
            }
          }
        }
      }
    }
  };
  patchChain(positive, true);
  patchChain(negative, false);
  if (faceName && !identity) delete graph[ids.face];

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
  return { graph, saveNode: save, edit, identity };
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
