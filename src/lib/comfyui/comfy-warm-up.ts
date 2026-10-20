/**
 * Engine warm-up: a tiny copy of a real still graph that loads the same weights (same loader
 * nodes and inputs, so ComfyUI's cache hands them straight to the real job) and samples one
 * step at 64×64 into a PreviewImage. Nothing is saved.
 *
 * Pure — building the graph and deciding whether to send it. The server side (template store,
 * queue checks, VRAM) is comfy-warm-up-server.ts.
 */

import { mainModelKeyFromGraph, sameModelKey } from './comfy-model-batch';

type ApiNode = { class_type: string; inputs: Record<string, unknown>; _meta?: unknown };
export type ApiGraph = Record<string, ApiNode>;

const WARM_UP_SIZE = 64;
const SIZE_INPUTS = new Set(['width', 'height', 'target_width', 'target_height']);
const OUTPUT_CLASS = /^(Save|Preview)|VideoCombine|SaveAnimated|Image Save/i;
const SAMPLER_CLASS = /^(KSampler|KSamplerAdvanced|SamplerCustom|SamplerCustomAdvanced)$/;

function isLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';
}

function asGraph(raw: unknown): ApiGraph | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const graph: ApiGraph = {};
  for (const [id, node] of Object.entries(raw as Record<string, unknown>)) {
    if (!node || typeof node !== 'object') continue;
    const { class_type: classType, inputs } = node as { class_type?: unknown; inputs?: unknown };
    if (typeof classType !== 'string') continue;
    graph[id] = {
      class_type: classType,
      inputs:
        inputs && typeof inputs === 'object' && !Array.isArray(inputs)
          ? { ...(inputs as Record<string, unknown>) }
          : {},
    };
  }
  return graph;
}

/**
 * The warm-up copy of `source`, or null when it has no sampler, no decode or no main model.
 * Image loads become a 64×64 EmptyImage (the real inputs may be gone), sizes drop to 64, the
 * sampler runs one step, and everything that is not upstream of the first VAEDecode is dropped
 * (saves, upscales, detailers). Loader nodes are kept byte-for-byte.
 */
export function buildWarmUpGraph(source: unknown): ApiGraph | null {
  const graph = asGraph(source);
  if (!graph) return null;
  if (!mainModelKeyFromGraph(graph)) return null;
  if (!Object.values(graph).some(node => SAMPLER_CLASS.test(node.class_type))) return null;
  const decodeId = Object.keys(graph)
    .filter(id => graph[id]!.class_type === 'VAEDecode')
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))[0];
  if (!decodeId) return null;

  for (const [id, node] of Object.entries(graph)) {
    if (/^LoadImage(?!Mask)/.test(node.class_type) || node.class_type === 'LoadImageOutput') {
      graph[id] = {
        class_type: 'EmptyImage',
        inputs: { width: WARM_UP_SIZE, height: WARM_UP_SIZE, batch_size: 1, color: 0 },
      };
      continue;
    }
    if (node.class_type === 'LoadImageMask') {
      graph[id] = {
        class_type: 'SolidMask',
        inputs: { value: 1, width: WARM_UP_SIZE, height: WARM_UP_SIZE },
      };
      continue;
    }
    for (const [name, value] of Object.entries(node.inputs)) {
      if (isLink(value)) continue;
      if (SIZE_INPUTS.has(name) && typeof value === 'number' && value > WARM_UP_SIZE) {
        node.inputs[name] = WARM_UP_SIZE;
      } else if ((name === 'batch_size' || name === 'length') && typeof value === 'number') {
        node.inputs[name] = 1;
      } else if (name === 'steps' && typeof value === 'number') {
        node.inputs[name] = 1;
      } else if (name === 'end_at_step' && typeof value === 'number') {
        node.inputs[name] = 10_000;
      } else if (name === 'start_at_step' && typeof value === 'number') {
        node.inputs[name] = 0;
      } else if (name === 'sigmas' && typeof value === 'string') {
        node.inputs[name] = '1.0, 0.0';
      }
    }
  }

  const previewId = 'warmup_preview';
  graph[previewId] = { class_type: 'PreviewImage', inputs: { images: [decodeId, 0] } };

  // Keep only what the preview needs.
  const keep = new Set<string>();
  const stack = [previewId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (keep.has(id) || !graph[id]) continue;
    keep.add(id);
    for (const value of Object.values(graph[id]!.inputs)) {
      if (isLink(value)) stack.push(value[0]);
    }
  }
  const pruned: ApiGraph = {};
  for (const id of Object.keys(graph)) {
    if (keep.has(id) && (id === previewId || !OUTPUT_CLASS.test(graph[id]!.class_type))) {
      pruned[id] = graph[id]!;
    }
  }
  // A dropped output node somewhere upstream would leave a dangling link.
  for (const node of Object.values(pruned)) {
    for (const value of Object.values(node.inputs)) {
      if (isLink(value) && !pruned[value[0]]) return null;
    }
  }
  if (!Object.values(pruned).some(node => SAMPLER_CLASS.test(node.class_type))) return null;
  return pruned;
}

export type WarmUpSkipReason = 'busy' | 'already-loaded' | 'no-template' | 'vram' | 'unreachable';

export type WarmUpDecision = { go: true } | { go: false; reason: WarmUpSkipReason };

/**
 * Warm up only on an idle ComfyUI (nothing running or waiting — never ahead of anyone's job),
 * only when the engine is not the one that ran last, and only when free VRAM holds the model
 * next to what is loaded (a model bigger than the card counts at 90 % of it — ComfyUI streams
 * the rest). Unknown sizes don't block.
 */
export function decideWarmUp(input: {
  queueRunning: number;
  queuePending: number;
  targetModelKey: string | null;
  lastModelKey?: string | null;
  vramFreeBytes?: number;
  vramTotalBytes?: number;
  modelBytes?: number;
}): WarmUpDecision {
  if (!input.targetModelKey) return { go: false, reason: 'no-template' };
  if (input.queueRunning > 0 || input.queuePending > 0) return { go: false, reason: 'busy' };
  if (input.lastModelKey && sameModelKey(input.lastModelKey, input.targetModelKey)) {
    return { go: false, reason: 'already-loaded' };
  }
  const { vramFreeBytes: free, vramTotalBytes: total, modelBytes } = input;
  if (free != null && modelBytes != null && modelBytes > 0) {
    const need = total && total > 0 ? Math.min(modelBytes, total * 0.9) : modelBytes;
    if (free < need) return { go: false, reason: 'vram' };
  }
  return { go: true };
}

export function warmUpSkipLine(reason: WarmUpSkipReason, engine: string): string {
  switch (reason) {
    case 'busy':
      return `${engine} warm-up skipped — ComfyUI is busy.`;
    case 'already-loaded':
      return `${engine} is already loaded.`;
    case 'no-template':
      return `${engine} warm-up skipped — no recent still on this engine to copy.`;
    case 'vram':
      return `${engine} warm-up skipped — not enough free VRAM next to the loaded model.`;
    case 'unreachable':
      return `${engine} warm-up skipped — ComfyUI is not reachable.`;
  }
}
