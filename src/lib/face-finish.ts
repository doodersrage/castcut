/**
 * Day "Face finish": re-render only the face of a finished still, conditioned on the Cast face
 * crop so the detailer knows who she is.
 *
 * Live A/B on 8 real Rapid AIO Day stills (2026-09-28, face distance to the Cast plate, lower =
 * closer; originals 0.659): finishing with Qwen Edit 2511 + Lightning 0.492 (closer 8/8), Klein
 * 9B Distilled 0.532 (8/8, cleanest skin), the still's own Rapid checkpoint 0.581 (6/8). Klein 9B
 * Base painted cartoon faces (0.667) and is never used. The finisher does not have to match the
 * still's engine, so the best installed one serves every still. A generic text-prompt detailer
 * drifted every face (0.768); an UltraSharp upscale, a hires re-render and a Klein skin pass did
 * not beat the originals.
 */

export const FACE_FINISH_DENOISE = 0.35;

/**
 * Two-person stills: only the lead's face is re-rendered, a little harder (the faces are smaller).
 * Live on 8 Edit 2511 Vacation couple stills (2026-10-02, per-face distance to the Cast face):
 * the lead 0.563 before, 0.543 at 0.35 and 0.507 at 0.5; the partner's face unchanged (0.89).
 * The pass helped 5 of 8 and hurt profile faces, so the server keeps it only when the lead comes
 * out closer — 0.480 on the same eight, never worse than the original.
 */
export const FACE_FINISH_DUO_DENOISE = 0.5;

/** The lead must be this much closer to the Cast face than the other person to be told apart. */
export const LEAD_FACE_MARGIN = 0.05;

/** Which detected face is hers: by side, or the largest when only one face was probed. */
export type LeadFaceSide = 'leftmost' | 'rightmost' | 'largest';

export const FACE_FINISH_PROMPT =
  'Photorealistic close-up of the same woman as image 1: her exact face, eyes, nose, lips and hairline, natural skin texture, sharp natural detail.';

/** Klein reads the face crop as a ReferenceLatent, not a numbered image. */
export const FACE_FINISH_KLEIN_PROMPT =
  'Photorealistic close-up of the same woman as the reference image: her exact face, eyes, nose, lips and hairline, natural skin texture, sharp natural detail.';

/** Output node id — the server reads the finished image from here. */
export const FACE_FINISH_SAVE_NODE = '99';

export type FaceFinisher =
  | {
      kind: 'qwen-edit';
      unet: string;
      lightningLora: string;
      clip: string;
      vae: string;
    }
  | { kind: 'klein-distilled'; unet: string; clip: string; vae: string }
  | { kind: 'rapid'; checkpoint: string };

/** Installed model files, from ComfyUI object_info. */
export type FaceFinishInventory = {
  unets: readonly string[];
  loras: readonly string[];
  clips: readonly string[];
  vaes: readonly string[];
};

function pick(list: readonly string[], ...patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const hit = list.find(name => pattern.test(name));
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Best installed finisher: Qwen Edit 2511 + Lightning, then Klein 9B Distilled, then the still's
 * own Rapid / Qwen checkpoint. Null when nothing fits.
 */
export function resolveFaceFinisher(
  inventory: FaceFinishInventory,
  stillCheckpoint?: string | null
): FaceFinisher | null {
  const qwenUnet = pick(inventory.unets, /qwen[-_]?image[-_]?edit[-_]?2511/i);
  const qwenLora = pick(
    inventory.loras,
    /edit[-_]?2511[-_]?lightning[-_]?8/i,
    /edit[-_]?2511[-_]?lightning/i
  );
  const qwenClip = pick(inventory.clips, /qwen[-_]?2\.5[-_]?vl[-_]?7b/i);
  const qwenVae = pick(inventory.vaes, /qwen[-_]?image[-_]?vae/i);
  if (qwenUnet && qwenLora && qwenClip && qwenVae) {
    return {
      kind: 'qwen-edit',
      unet: qwenUnet,
      lightningLora: qwenLora,
      clip: qwenClip,
      vae: qwenVae,
    };
  }
  const kleinUnet = pick(inventory.unets, /flux[-_]?2[-_]?klein[-_]?9b[-_]?distilled/i);
  const kleinClip = pick(inventory.clips, /qwen[-_]?3[-_]?8b/i);
  const kleinVae = pick(inventory.vaes, /flux2[-_]?vae/i);
  if (kleinUnet && kleinClip && kleinVae) {
    return { kind: 'klein-distilled', unet: kleinUnet, clip: kleinClip, vae: kleinVae };
  }
  if (stillCheckpoint && /rapid[-_ ]?aio|qwen/i.test(stillCheckpoint)) {
    return { kind: 'rapid', checkpoint: stillCheckpoint };
  }
  return null;
}

/** The checkpoint a Castcut still was made with, from its embedded ComfyUI graph. */
export function readStillCheckpoint(graph: unknown): string | null {
  if (!graph || typeof graph !== 'object') return null;
  for (const node of Object.values(graph as Record<string, unknown>)) {
    const record = node as { class_type?: unknown; inputs?: Record<string, unknown> } | null;
    if (record?.class_type === 'CheckpointLoaderSimple') {
      const name = record.inputs?.ckpt_name;
      return typeof name === 'string' && name.trim() ? name.trim() : null;
    }
  }
  return null;
}

type GraphNode = { class_type: string; inputs: Record<string, unknown> };
type Link = [string, number];

function detailerNode(input: {
  model: Link;
  clip: Link;
  vae: Link;
  positive: Link;
  negative: Link;
  steps: number;
  sampler: string;
  seed: number;
}): GraphNode {
  return {
    class_type: 'FaceDetailer',
    inputs: {
      image: ['1', 0],
      model: input.model,
      clip: input.clip,
      vae: input.vae,
      guide_size: 512,
      guide_size_for: true,
      max_size: 1024,
      seed: input.seed,
      steps: input.steps,
      cfg: 1,
      sampler_name: input.sampler,
      scheduler: 'simple',
      positive: input.positive,
      negative: input.negative,
      denoise: FACE_FINISH_DENOISE,
      feather: 5,
      noise_mask: true,
      force_inpaint: true,
      bbox_threshold: 0.5,
      bbox_dilation: 10,
      bbox_crop_factor: 3,
      sam_detection_hint: 'center-1',
      sam_dilation: 0,
      sam_threshold: 0.93,
      sam_bbox_expansion: 0,
      sam_mask_hint_threshold: 0.7,
      sam_mask_hint_use_negative: 'False',
      drop_size: 10,
      bbox_detector: ['22', 0],
      wildcard: '',
      cycle: 1,
    },
  };
}

/**
 * The lead-only detailer for a two-person still: detect the faces, keep the one on the lead's
 * side, re-render just that one. Replaces node 23 (and adds 24 / 25).
 */
function leadOnlyDetailerNodes(all: GraphNode, side: LeadFaceSide): Record<string, GraphNode> {
  const a = all.inputs;
  return {
    '24': {
      class_type: 'BboxDetectorSEGS',
      inputs: {
        bbox_detector: a.bbox_detector,
        image: a.image,
        threshold: a.bbox_threshold,
        dilation: a.bbox_dilation,
        crop_factor: a.bbox_crop_factor,
        drop_size: a.drop_size,
        labels: 'all',
      },
    },
    '25': {
      class_type: 'ImpactSEGSOrderedFilter',
      // order true = descending: the largest x1 is the rightmost face, the largest area the
      // biggest one.
      inputs: {
        segs: ['24', 0],
        target: side === 'largest' ? 'area(=w*h)' : 'x1',
        order: side !== 'leftmost',
        take_start: 0,
        take_count: 1,
      },
    },
    '23': {
      class_type: 'DetailerForEach',
      inputs: {
        image: a.image,
        segs: ['25', 0],
        model: a.model,
        clip: a.clip,
        vae: a.vae,
        guide_size: a.guide_size,
        guide_size_for: a.guide_size_for,
        max_size: a.max_size,
        seed: a.seed,
        steps: a.steps,
        cfg: a.cfg,
        sampler_name: a.sampler_name,
        scheduler: a.scheduler,
        positive: a.positive,
        negative: a.negative,
        denoise: FACE_FINISH_DUO_DENOISE,
        feather: a.feather,
        noise_mask: a.noise_mask,
        force_inpaint: a.force_inpaint,
        wildcard: '',
        cycle: 1,
      },
    },
  };
}

/** Node ids the lead-face probe reports from (distance and x of the two largest faces). */
export const LEAD_FACE_PROBE_NODES = [
  { distance: 'pd0', x: 'px0' },
  { distance: 'pd1', x: 'px1' },
] as const;

/**
 * Which of the two largest faces in a still is the lead: each face is cropped and compared with
 * the Cast face crop (InsightFace cosine distance, lower = closer).
 */
export function buildLeadFaceProbeGraph(input: {
  stillName: string;
  faceName: string;
}): Record<string, GraphNode> {
  const graph: Record<string, GraphNode> = {
    '1': { class_type: 'LoadImage', inputs: { image: input.stillName } },
    '2': { class_type: 'LoadImage', inputs: { image: input.faceName } },
    '4': { class_type: 'FaceAnalysisModels', inputs: { library: 'insightface', provider: 'CUDA' } },
  };
  LEAD_FACE_PROBE_NODES.forEach((ids, index) => {
    graph[`b${index}`] = {
      class_type: 'FaceBoundingBox',
      inputs: {
        analysis_models: ['4', 0],
        image: ['1', 0],
        padding: 0,
        padding_percent: 0.3,
        index,
      },
    };
    graph[`d${index}`] = {
      class_type: 'FaceEmbedDistance',
      inputs: {
        analysis_models: ['4', 0],
        reference: ['2', 0],
        image: [`b${index}`, 0],
        similarity_metric: 'cosine',
        filter_thresh: 100,
        filter_best: 0,
        generate_image_overlay: false,
      },
    };
    graph[ids.distance] = { class_type: 'PreviewAny', inputs: { source: [`d${index}`, 1] } };
    graph[ids.x] = { class_type: 'PreviewAny', inputs: { source: [`b${index}`, 1] } };
  });
  return graph;
}

export type LeadFaceProbe = Array<{ x: number | null; distance: number | null }>;

/**
 * The lead among the probed faces: the one closest to the Cast face, when there are two distinct
 * faces and she is clearly the closer one. Null when the still shows one face, or the two cannot
 * be told apart — re-rendering the wrong face would give both people her face.
 */
export function pickLeadFace(
  probe: LeadFaceProbe
): { side: LeadFaceSide; distance: number } | null {
  const faces = probe.filter(
    (face): face is { x: number; distance: number } =>
      typeof face.x === 'number' && typeof face.distance === 'number' && face.distance < 50
  );
  if (faces.length !== 2 || faces[0]!.x === faces[1]!.x) return null;
  const [lead, other] = [...faces].sort((a, b) => a.distance - b.distance) as [
    { x: number; distance: number },
    { x: number; distance: number },
  ];
  if (other.distance - lead.distance < LEAD_FACE_MARGIN) return null;
  return { side: lead.x < other.x ? 'leftmost' : 'rightmost', distance: lead.distance };
}

/** A single visible face must be at least this close to the Cast face to be taken for hers. */
export const SOLE_FACE_MAX_DISTANCE = 0.8;

/**
 * True when the probe saw one face only and it is plausibly the lead's (the partner faces away,
 * or the still has one person after all) — the ordinary all-faces pass is then safe.
 */
export function soleFaceIsLead(probe: LeadFaceProbe): boolean {
  const faces = probe.filter(
    (face): face is { x: number; distance: number } =>
      typeof face.x === 'number' && typeof face.distance === 'number'
  );
  const distinct = new Set(faces.map(face => face.x));
  return distinct.size === 1 && faces[0]!.distance < SOLE_FACE_MAX_DISTANCE;
}

/**
 * Her face's distance in a probe taken after the pass: the face on her side (not simply the
 * closest one — that could be the partner's face drifting toward hers).
 */
export function leadFaceDistance(probe: LeadFaceProbe, side: LeadFaceSide): number | null {
  const faces = probe.filter(
    (face): face is { x: number; distance: number } =>
      typeof face.x === 'number' && typeof face.distance === 'number'
  );
  if (faces.length === 0) return null;
  if (side === 'largest' || new Set(faces.map(face => face.x)).size === 1) {
    return faces[0]!.distance;
  }
  const ordered = [...faces].sort((a, b) => a.x - b.x);
  return (side === 'leftmost' ? ordered[0] : ordered[ordered.length - 1])!.distance;
}

export function buildFaceFinishGraph(input: {
  /** ComfyUI input filename of the finished still. */
  stillName: string;
  /** ComfyUI input filename of the Cast face crop. */
  faceName: string;
  finisher: FaceFinisher;
  seed?: number;
  /** Two-person still: re-render only the face on this side (see pickLeadFace). */
  onlyFace?: LeadFaceSide;
}): Record<string, GraphNode> {
  const seed = input.seed ?? 777;
  const graph: Record<string, GraphNode> = {
    '1': { class_type: 'LoadImage', inputs: { image: input.stillName } },
    '2': { class_type: 'LoadImage', inputs: { image: input.faceName } },
    '22': {
      class_type: 'UltralyticsDetectorProvider',
      inputs: { model_name: 'bbox/face_yolov8m.pt' },
    },
  };
  const f = input.finisher;
  if (f.kind === 'klein-distilled') {
    Object.assign(graph, {
      '10': { class_type: 'UNETLoader', inputs: { unet_name: f.unet, weight_dtype: 'default' } },
      '13': { class_type: 'CLIPLoader', inputs: { clip_name: f.clip, type: 'flux2' } },
      '14': { class_type: 'VAELoader', inputs: { vae_name: f.vae } },
      '15': {
        class_type: 'ImageScaleToTotalPixels',
        inputs: { image: ['2', 0], upscale_method: 'lanczos', megapixels: 1, resolution_steps: 16 },
      },
      '16': { class_type: 'VAEEncode', inputs: { pixels: ['15', 0], vae: ['14', 0] } },
      '17': {
        class_type: 'CLIPTextEncode',
        inputs: { text: FACE_FINISH_KLEIN_PROMPT, clip: ['13', 0] },
      },
      '20': {
        class_type: 'ReferenceLatent',
        inputs: { conditioning: ['17', 0], latent: ['16', 0] },
      },
      '21': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['17', 0] } },
    });
    graph['23'] = detailerNode({
      model: ['10', 0],
      clip: ['13', 0],
      vae: ['14', 0],
      positive: ['20', 0],
      negative: ['21', 0],
      steps: 4,
      sampler: 'euler',
      seed,
    });
  } else {
    let model: Link;
    let clip: Link;
    let vae: Link;
    if (f.kind === 'qwen-edit') {
      Object.assign(graph, {
        '10': { class_type: 'UNETLoader', inputs: { unet_name: f.unet, weight_dtype: 'default' } },
        '11': {
          class_type: 'LoraLoaderModelOnly',
          inputs: { model: ['10', 0], lora_name: f.lightningLora, strength_model: 1 },
        },
        '12': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['11', 0], shift: 3.1 } },
        '13': { class_type: 'CLIPLoader', inputs: { clip_name: f.clip, type: 'qwen_image' } },
        '14': { class_type: 'VAELoader', inputs: { vae_name: f.vae } },
      });
      model = ['12', 0];
      clip = ['13', 0];
      vae = ['14', 0];
    } else {
      Object.assign(graph, {
        '10': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: f.checkpoint } },
        '12': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['10', 0], shift: 3.1 } },
      });
      model = ['12', 0];
      clip = ['10', 1];
      vae = ['10', 2];
    }
    Object.assign(graph, {
      '20': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip, prompt: FACE_FINISH_PROMPT, vae, image1: ['2', 0] },
      },
      '21': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['20', 0] } },
    });
    graph['23'] = detailerNode({
      model,
      clip,
      vae,
      positive: ['20', 0],
      negative: ['21', 0],
      steps: f.kind === 'qwen-edit' ? 8 : 6,
      sampler: f.kind === 'qwen-edit' ? 'euler' : 'euler_ancestral',
      seed,
    });
  }
  if (input.onlyFace) {
    Object.assign(graph, leadOnlyDetailerNodes(graph['23']!, input.onlyFace));
  }
  graph[FACE_FINISH_SAVE_NODE] = {
    class_type: 'SaveImage',
    inputs: { images: ['23', 0], filename_prefix: 'Castcut-face-finish' },
  };
  return graph;
}
