/**
 * Where a render's time went (ENGINE_PLAN.md phase 1): each node of the job timed by the Castcut
 * node pack (StageTimer, /castcut/timings — its start, first progress step and end) and put in
 * a stage by its node type. A sampler's start to its first step is load: ComfyUI moves a model to
 * the GPU there, not in the loader node. Pure.
 */

/** The pack's record of one job (castcut_nodes.py StageTimer.timings). */
export type ComfyJobTimings = {
  started?: number | null;
  ended?: number | null;
  outcome?: string | null;
  cached?: string[];
  nodes?: Array<{ id: string; start: number; firstStep?: number | null; end?: number | null }>;
};

export const RENDER_STAGES = [
  'load',
  'encode',
  'sample',
  'decode',
  'finish',
  'save',
  'other',
] as const;
export type RenderStage = (typeof RENDER_STAGES)[number];

/** A render's time by stage (ms), its whole time, and how many nodes ComfyUI reused. */
export type RenderStages = Record<RenderStage, number> & { totalMs: number; cachedNodes: number };

/** The stage a node's own time counts toward, by its node type. */
export function nodeStage(classType: string): RenderStage {
  const type = classType.trim();
  if (/Detailer/i.test(type)) return 'finish';
  if (/Decode/i.test(type)) return 'decode';
  if (/(Sampler|KSampler)/i.test(type)) return 'sample';
  if (/(Loader|LoadCheckpoint|Load\w*Model|ModelSampling)/i.test(type)) return 'load';
  if (/(Encode|IPAdapter|ReferenceLatent|InstructPix)/i.test(type)) return 'encode';
  if (/^(Save|Preview)|CreateVideo|VideoCombine|SaveVideo|SaveAnimated/i.test(type)) return 'save';
  return 'other';
}

/**
 * A job's stage times from the pack's record and its graph (node id → class_type). Null when the
 * record has no nodes or no end (the job never ran here, or is still running).
 */
export function renderStagesOf(
  graph: Record<string, { class_type?: string } | undefined> | null | undefined,
  timings: ComfyJobTimings | null | undefined
): RenderStages | null {
  const nodes = timings?.nodes ?? [];
  if (!nodes.length || typeof timings?.ended !== 'number') return null;
  const out: RenderStages = {
    load: 0,
    encode: 0,
    sample: 0,
    decode: 0,
    finish: 0,
    save: 0,
    other: 0,
    totalMs: 0,
    cachedNodes: timings.cached?.length ?? 0,
  };
  for (const node of nodes) {
    const end = typeof node.end === 'number' ? node.end : timings.ended;
    const spent = Math.max(0, end - node.start);
    const stage = nodeStage(graph?.[node.id]?.class_type ?? '');
    if (stage === 'sample' && typeof node.firstStep === 'number' && node.firstStep >= node.start) {
      // The model moved to the GPU before the first step: that part is load.
      out.load += Math.max(0, node.firstStep - node.start);
      out.sample += Math.max(0, end - node.firstStep);
    } else {
      out[stage] += spent;
    }
  }
  const started = typeof timings.started === 'number' ? timings.started : nodes[0]!.start;
  out.totalMs = Math.max(0, timings.ended - started);
  // Time before the first node (graph checks, cached outputs) is other.
  const counted = RENDER_STAGES.reduce((sum, stage) => sum + out[stage], 0);
  if (out.totalMs > counted) out.other += out.totalMs - counted;
  return out;
}

/** A stored RenderStages, cleaned: undefined unless every field is a number ≥ 0. */
export function normalizeRenderStages(value: unknown): RenderStages | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const out = {} as RenderStages;
  for (const key of [...RENDER_STAGES, 'totalMs', 'cachedNodes'] as const) {
    const n = record[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return undefined;
    out[key] = Math.round(n);
  }
  return out;
}

/** "load 12.1 s · encode 3.0 s · sample 30.2 s · decode 1.1 s" — the stages that took time. */
export function formatRenderStages(stages: RenderStages | undefined): string {
  if (!stages) return '';
  return RENDER_STAGES.filter(stage => stages[stage] >= 50)
    .map(stage => `${stage} ${(stages[stage] / 1000).toFixed(1)} s`)
    .join(' · ');
}
