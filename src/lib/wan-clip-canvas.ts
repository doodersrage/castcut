/**
 * WAN image-to-video canvas from the start still. WanImageToVideo / WanFirstLastFrameToVideo
 * resize the start (and end) image to the node's width × height with a CENTER CROP, and the
 * queue fills those from the Video tool's canvas (768² by default) — so a portrait Day / Story
 * still (3:4, 2:3) lost its top and bottom: heads cut at the brow, feet gone, before the first
 * frame even moved.
 *
 * Live A/B (2026-10-04, 7 portrait clothed Day stills, WAN 2.2 Rapid AIO, same seeds): see
 * CHANGELOG. This keeps the canvas's pixel budget (so render time stays put) and takes the
 * still's aspect, both sides multiples of 16, via core GetImageSize + ComfyMathExpression —
 * the same nodes the LTX-2.5 converter uses.
 */

type WorkflowNode = { class_type?: string; inputs?: Record<string, unknown>; _meta?: unknown };
type Workflow = Record<string, WorkflowNode>;

export const WAN_CLIP_CANVAS_NODES = ['GetImageSize', 'ComfyMathExpression'] as const;

const WAN_I2V = new Set(['WanImageToVideo', 'WanFirstLastFrameToVideo']);
/** WAN latents are 1/8 of the frame and patched 2×2 — keep both sides on a 16 grid. */
const GRID = 16;

const isRef = (value: unknown): value is [string, number] =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';

function plainNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/** The LoadImage behind a start_image link (through a few resize nodes). */
function startLoader(workflow: Workflow, ref: unknown): string | undefined {
  for (let depth = 0; isRef(ref) && depth < 4; depth += 1) {
    const source = workflow[ref[0]];
    if (source?.class_type === 'LoadImage') return ref[0];
    ref = source?.inputs?.image;
  }
  return undefined;
}

function nextId(workflow: Workflow, from: number): string {
  let id = from;
  while (workflow[String(id)]) id += 1;
  return String(id);
}

/** Width × height for a still of `stillWidth × stillHeight` at the canvas's pixel budget. */
export function wanClipCanvas(
  stillWidth: number,
  stillHeight: number,
  budget: number
): { width: number; height: number } {
  const ratio = stillWidth > 0 && stillHeight > 0 ? stillWidth / stillHeight : 1;
  const snap = (value: number) => Math.max(GRID * 16, Math.round(value / GRID) * GRID);
  return { width: snap(Math.sqrt(budget * ratio)), height: snap(Math.sqrt(budget / ratio)) };
}

/**
 * Point a WAN I2V node's width / height at the start still's aspect (same pixel budget). No-op
 * when the graph has no WAN I2V node fed by a LoadImage, or its size is already a link.
 */
export function sizeWanClipFromStill(input: Record<string, unknown>): {
  workflow: Record<string, unknown>;
  applied: boolean;
} {
  const workflow = structuredClone(input) as Workflow;
  const entry = Object.entries(workflow).find(([, node]) => WAN_I2V.has(node?.class_type ?? ''));
  const inputs = entry?.[1].inputs;
  if (!inputs) return { workflow, applied: false };
  const width = plainNumber(inputs.width);
  const height = plainNumber(inputs.height);
  const loader = startLoader(workflow, inputs.start_image);
  if (!width || !height || !loader) return { workflow, applied: false };

  const budget = Math.round(width * height);
  const sizeId = nextId(workflow, 920);
  workflow[sizeId] = {
    class_type: 'GetImageSize',
    inputs: { image: [loader, 0] },
    _meta: { title: 'Start still size (clip canvas)' },
  };
  const math = (expression: string): WorkflowNode => ({
    class_type: 'ComfyMathExpression',
    inputs: { expression, 'values.a': [sizeId, 0], 'values.b': [sizeId, 1] },
  });
  const widthId = nextId(workflow, Number(sizeId) + 1);
  workflow[widthId] = math(`max(256, round(sqrt(${budget} * a / b) / ${GRID}) * ${GRID})`);
  const heightId = nextId(workflow, Number(widthId) + 1);
  workflow[heightId] = math(`max(256, round(sqrt(${budget} * b / a) / ${GRID}) * ${GRID})`);
  inputs.width = [widthId, 1];
  inputs.height = [heightId, 1];
  return { workflow, applied: true };
}
