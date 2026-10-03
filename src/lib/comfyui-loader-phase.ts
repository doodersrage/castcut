/**
 * "Loading <engine>…" vs "Rendering" for a running job: ComfyUI's websocket says which node is
 * executing; the job's graph says whether that node loads weights. Pure.
 */

import { mainModelKeyFromGraph } from './comfy-model-batch';

const LOADER_CLASS =
  /(Loader|LoaderSimple|LoaderGGUF|LoaderModelOnly)$|^Load(Checkpoint|Diffusion)/i;
const NOT_A_LOADER = /^Load(Image|Video|Audio|Mask)|ImageLoader|VideoLoader/i;

/** Known engines by main weights file, in the app's words. */
const ENGINE_LABELS: Array<[RegExp, string]> = [
  [/wan2?\.?2.*rapid/i, 'WAN 2.2 Rapid'],
  [/wan/i, 'WAN'],
  [/rapid[-_]?aio.*nsfw/i, 'Rapid AIO NSFW'],
  [/rapid[-_]?aio/i, 'Rapid AIO'],
  [/ltx[-_]?2\.5/i, 'LTX-2.5'],
  [/ltx/i, 'LTX'],
  [/edit[-_]?2511/i, 'Qwen Edit 2511'],
  [/edit[-_]?2509/i, 'Qwen Edit 2509'],
  [/qwen[-_]?image[-_]?2\.1/i, 'Qwen-Image 2.1'],
  [/qwen[-_]?image[-_]?2512/i, 'Qwen-Image 2512'],
  [/klein/i, 'FLUX.2 Klein'],
  [/flux/i, 'FLUX'],
  [/z[-_]?image/i, 'Z-Image'],
];

/** A friendly engine name for a main model key / file name. */
export function engineLabelForModelKey(key: string | null | undefined): string {
  const raw = (key ?? '').trim();
  if (!raw) return 'the model';
  for (const [pattern, label] of ENGINE_LABELS) {
    if (pattern.test(raw)) return label;
  }
  return raw.split('+')[0]!.replace(/[_-]+/g, ' ');
}

export function isLoaderClass(classType: string): boolean {
  return LOADER_CLASS.test(classType) && !NOT_A_LOADER.test(classType);
}

/**
 * Status line for `nodeId` executing in `graph`: "Loading Qwen Edit 2511…" on a loader node,
 * "Rendering" otherwise; null when the node is not in the graph.
 */
export function executingPhaseMessage(graph: unknown, nodeId: string): string | null {
  if (!graph || typeof graph !== 'object') return null;
  const node = (graph as Record<string, { class_type?: unknown }>)[nodeId];
  if (!node || typeof node.class_type !== 'string') return null;
  if (isLoaderClass(node.class_type)) {
    return `Loading ${engineLabelForModelKey(mainModelKeyFromGraph(graph))}…`;
  }
  return 'Rendering';
}
