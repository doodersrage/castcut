/**
 * Castcut node pack (comfyui-nodes/castcut): the post-render checks run inside the job instead of
 * as separate round trips. Pure — the graph rewrite runs at queue time (comfyui-config.ts
 * injectPromptsWithFallbacks), the report is read back from the job's /history entry.
 *
 * Best of two for hard poses, as ONE job: the sampler's latent is repeated into a batch of two
 * (two seeds' worth of noise, models and encodes shared), DWPose reads both takes,
 * CastcutPoseScore scores them against the guide with the same limb-angle + posture check the app
 * runs (a port, kept in step by shared test vectors), CastcutPickBest hands the closer take to the
 * job's SaveImage and CastcutReport saves the other one and writes both scores into the job's
 * output (`castcut`), where the Day hook picks them up (day-best-of-two.ts).
 *
 * Every rewrite is gated on the nodes being installed (object_info): without the pack — or with
 * a graph the rewrite doesn't recognise — the workflow comes back untouched, the same object.
 */

import type { NormalizedBody } from '@/lib/pose-library';

/** The pack's nodes (comfyui-nodes/castcut/castcut_nodes.py). */
export const CASTCUT_NODE_TYPES = [
  'CastcutPoseScore',
  'CastcutPickBest',
  'CastcutFaceDistance',
  'CastcutMaskRepair',
  'CastcutReport',
] as const;

/** What the one-job Best of two needs: the pack's pose nodes, DWPose and ComfyUI's batch node. */
export const CASTCUT_BEST_OF_TWO_NODES = [
  'CastcutPoseScore',
  'CastcutPickBest',
  'CastcutReport',
  'DWPreprocessor',
  'RepeatLatentBatch',
] as const;

/** What the in-job cut-out needs (BiRefNet matte + the pack's repair / composite). */
export const CASTCUT_CUTOUT_NODES = [
  'LoadBackgroundRemovalModel',
  'RemoveBackground',
  'CastcutMaskRepair',
  'CastcutReport',
] as const;

/** UI output key CastcutReport writes (`outputs[nodeId].castcut[0]`). */
export const CASTCUT_REPORT_KEY = 'castcut';

/** Takes in one Best-of-two job. */
export const CASTCUT_BEST_OF_TWO_TAKES = 2;

function hasAll(nodeTypes: Iterable<string> | null | undefined, needed: readonly string[]) {
  if (!nodeTypes) return false;
  const set = nodeTypes instanceof Set ? nodeTypes : new Set(nodeTypes);
  return needed.every(type => set.has(type));
}

/** Is the one-job Best of two possible on this ComfyUI (node types from object_info)? */
export function castcutBestOfTwoAvailable(nodeTypes: Iterable<string> | null | undefined): boolean {
  return hasAll(nodeTypes, CASTCUT_BEST_OF_TWO_NODES);
}

/** Is the in-job cut-out repair + composite possible on this ComfyUI? */
export function castcutCutoutAvailable(nodeTypes: Iterable<string> | null | undefined): boolean {
  return hasAll(nodeTypes, CASTCUT_CUTOUT_NODES);
}

/** The guide as CastcutPoseScore reads it (`guide_json`). */
export function castcutGuideJson(guide: NormalizedBody[], aspect: number): string {
  return JSON.stringify({
    guide: guide.map(body =>
      Array.from({ length: Math.max(18, body.length) }, (_, i) => {
        const point = body[i];
        return point ? { x: point.x, y: point.y } : null;
      })
    ),
    aspect,
  });
}

type GraphNode = { class_type?: string; inputs?: Record<string, unknown> };
type Link = [string, number];

function isLink(value: unknown): value is Link {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === 'string' || typeof value[0] === 'number') &&
    typeof value[1] === 'number'
  );
}

function nodeOf(workflow: Record<string, unknown>, id: string): GraphNode | null {
  const node = workflow[id];
  return node && typeof node === 'object' ? (node as GraphNode) : null;
}

/** A node that samples a latent (KSampler, KSamplerAdvanced, SamplerCustom…): a linked latent_image. */
function isSampler(node: GraphNode | null): boolean {
  return Boolean(node && isLink(node.inputs?.latent_image));
}

/** Does anything upstream of `start` sample (i.e. is `start` downstream of a sampler)? */
function samplerUpstream(workflow: Record<string, unknown>, start: Link): boolean {
  const seen = new Set<string>();
  const stack = [String(start[0])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodeOf(workflow, id);
    if (!node) continue;
    if (isSampler(node)) return true;
    for (const value of Object.values(node.inputs ?? {})) {
      if (isLink(value)) stack.push(String(value[0]));
    }
  }
  return false;
}

/** Save nodes that write the job's still (SaveImage and the WebP / extended save adapters). */
function isStillSave(node: GraphNode | null): boolean {
  const type = node?.class_type ?? '';
  return (
    /save/i.test(type) &&
    !/websocket|video|audio|animated|latent/i.test(type) &&
    isLink(node?.inputs?.images)
  );
}

export type CastcutRewrite =
  | { applied: true; workflow: Record<string, unknown> }
  | { applied: false; workflow: Record<string, unknown>; reason: string };

/** Node ids the rewrite adds (strings: ComfyUI accepts any id; these never collide with numbers). */
export const CASTCUT_BEST_OF_TWO_IDS = {
  batch: 'castcut-batch',
  detect: 'castcut-dwpose',
  score: 'castcut-pose-score',
  pick: 'castcut-pick-best',
  report: 'castcut-report',
} as const;

/**
 * Best of two in one job. Needs exactly one first-pass sampler (its latent is batched ×2) and
 * exactly one still save node (it gets the picked take). Anything else: unchanged.
 */
export function applyCastcutBestOfTwo(
  workflow: Record<string, unknown>,
  guideJson: string
): CastcutRewrite {
  const ids = Object.keys(workflow);
  if (ids.some(id => (Object.values(CASTCUT_BEST_OF_TWO_IDS) as string[]).includes(id))) {
    return { applied: false, workflow, reason: 'already rewritten' };
  }
  const roots = ids.filter(id => {
    const node = nodeOf(workflow, id);
    return isSampler(node) && !samplerUpstream(workflow, node!.inputs!.latent_image as Link);
  });
  if (roots.length !== 1) {
    return { applied: false, workflow, reason: `${roots.length} first-pass samplers` };
  }
  const saves = ids.filter(id => isStillSave(nodeOf(workflow, id)));
  if (saves.length !== 1) {
    return { applied: false, workflow, reason: `${saves.length} still save nodes` };
  }
  const next = structuredClone(workflow) as Record<string, GraphNode>;
  const sampler = next[roots[0]!]!;
  const save = next[saves[0]!]!;
  const latent = sampler.inputs!.latent_image as Link;
  const still = save.inputs!.images as Link;
  const id = CASTCUT_BEST_OF_TWO_IDS;
  next[id.batch] = {
    class_type: 'RepeatLatentBatch',
    inputs: { samples: latent, amount: CASTCUT_BEST_OF_TWO_TAKES },
  };
  sampler.inputs!.latent_image = [id.batch, 0];
  // Body only: CastcutPoseScore compares body joints. The gesture check (hands + vision,
  // pose-gesture.ts) runs in the app, so the one-job pair is picked on the body alone.
  next[id.detect] = {
    class_type: 'DWPreprocessor',
    inputs: { image: still, detect_body: 'enable', detect_hand: 'disable', detect_face: 'disable' },
  };
  next[id.score] = {
    class_type: 'CastcutPoseScore',
    inputs: { pose_keypoint: [id.detect, 1], guide_json: guideJson },
  };
  next[id.pick] = {
    class_type: 'CastcutPickBest',
    inputs: { images: still, scores_json: [id.score, 0] },
  };
  save.inputs!.images = [id.pick, 0];
  const prefix =
    typeof save.inputs!.filename_prefix === 'string' && save.inputs!.filename_prefix.trim()
      ? `${save.inputs!.filename_prefix.trim()}-alt`
      : 'castcut-alt';
  next[id.report] = {
    class_type: 'CastcutReport',
    inputs: { report_json: [id.pick, 3], alternate: [id.pick, 1], filename_prefix: prefix },
  };
  return { applied: true, workflow: next };
}

/** One take's pose check as CastcutPoseScore reports it (the PoseMatchResult shape), or null. */
export type CastcutPoseResult = { score: number } & Record<string, unknown>;

export type CastcutImageRef = { filename: string; subfolder: string; type: string };

export type CastcutBestOfTwoReport = {
  bestIndex: number;
  otherIndex: number;
  /** Per take, in batch order; null = DWPose read nobody / the frame couldn't be parsed. */
  scores: Array<number | null>;
  results: Array<CastcutPoseResult | null>;
  /** The other take, saved by CastcutReport next to the still. */
  alternate: CastcutImageRef | null;
};

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The first `castcut` UI output in a job's history outputs (`entry.outputs`). */
export function findCastcutReport(outputs: unknown): Record<string, unknown> | null {
  if (!outputs || typeof outputs !== 'object') return null;
  for (const output of Object.values(outputs as Record<string, unknown>)) {
    const list = (output as Record<string, unknown> | null)?.[CASTCUT_REPORT_KEY];
    const report = Array.isArray(list) ? list[0] : null;
    if (report && typeof report === 'object') return report as Record<string, unknown>;
  }
  return null;
}

/** A Best-of-two report from a job's outputs, or null when the job didn't run one. */
export function parseCastcutBestOfTwoReport(outputs: unknown): CastcutBestOfTwoReport | null {
  const report = findCastcutReport(outputs);
  if (!report || report.kind !== 'pick-best') return null;
  const bestIndex = finite(report.bestIndex);
  const otherIndex = finite(report.otherIndex);
  const scores = Array.isArray(report.scores) ? report.scores.map(finite) : [];
  if (bestIndex == null || otherIndex == null || scores.length < 1) return null;
  const results = Array.isArray(report.results)
    ? report.results.map(entry =>
        entry && typeof entry === 'object' && finite((entry as { score?: unknown }).score) != null
          ? (entry as CastcutPoseResult)
          : null
      )
    : [];
  const alternates = Array.isArray(report.alternates) ? report.alternates : [];
  const first = alternates[0] as Partial<CastcutImageRef> | undefined;
  return {
    bestIndex,
    otherIndex,
    scores,
    results,
    alternate:
      first && typeof first.filename === 'string' && first.filename.trim()
        ? {
            filename: first.filename,
            subfolder: typeof first.subfolder === 'string' ? first.subfolder : '',
            type: typeof first.type === 'string' && first.type ? first.type : 'output',
          }
        : null,
  };
}

/** The app's view URL for a ComfyUI output (as stills carry it). */
export function castcutViewUrl(ref: CastcutImageRef): string {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  return `/api/comfyui/view?${params.toString()}`;
}

/** In-job cut-out: CastcutMaskRepair's per-image numbers (`report.images[i]`). */
export type CastcutMaskRepairReport = {
  filledHolePixels: number;
  regrownPixels: number;
  plainBackdrop: boolean;
  subjectShare: number;
  looksIsolated: boolean;
};

export function parseCastcutMaskRepairReport(outputs: unknown): CastcutMaskRepairReport | null {
  const report = findCastcutReport(outputs);
  if (!report || report.kind !== 'mask-repair' || !Array.isArray(report.images)) return null;
  const image = report.images[0] as Partial<CastcutMaskRepairReport> | undefined;
  if (!image || typeof image !== 'object') return null;
  return {
    filledHolePixels: finite(image.filledHolePixels) ?? 0,
    regrownPixels: finite(image.regrownPixels) ?? 0,
    plainBackdrop: image.plainBackdrop === true,
    subjectShare: finite(image.subjectShare) ?? 0,
    looksIsolated: image.looksIsolated === true,
  };
}

/**
 * LoadImage → BiRefNet matte → CastcutMaskRepair (hole fill; edge regrowth off: BiRefNet's edges
 * are right) → the composite on the fill as a temp preview, and the repair numbers as the report.
 */
export function buildCastcutCutoutGraph(input: {
  imageName: string;
  modelInput: string;
  modelName: string;
  fill: { r: number; g: number; b: number };
}): Record<string, unknown> {
  const hex = `#${[input.fill.r, input.fill.g, input.fill.b]
    .map(value =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
  return {
    '1': { class_type: 'LoadImage', inputs: { image: input.imageName } },
    '2': {
      class_type: 'LoadBackgroundRemovalModel',
      inputs: { [input.modelInput]: input.modelName },
    },
    '3': {
      class_type: 'RemoveBackground',
      inputs: { bg_removal_model: ['2', 0], image: ['1', 0] },
    },
    '4': {
      class_type: 'CastcutMaskRepair',
      inputs: {
        image: ['1', 0],
        mask: ['3', 0],
        fill: hex,
        regrow_edges: false,
        // LoadImage's own transparency (1 = transparent): kept, as the local composite does.
        source_mask: ['1', 1],
      },
    },
    '5': { class_type: 'PreviewImage', inputs: { images: ['4', 0] } },
    '6': { class_type: 'CastcutReport', inputs: { report_json: ['4', 2] } },
  };
}
