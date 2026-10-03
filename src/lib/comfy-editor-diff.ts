/**
 * What a player changed in ComfyUI's editor, against the graph Castcut queued: sampler, steps,
 * CFG, LoRAs, prompt… one row per changed value. Both sides are API-shaped graphs
 * (`uiWorkflowToApiPrompt` turns the edited file back into one).
 */

import { isApiLink, type ComfyApiPrompt } from './comfy-editor-graph';
import type { ModelSamplerOverrideFields } from './model-sampler-defaults';

export type EditorChangeKind =
  | 'sampler'
  | 'scheduler'
  | 'steps'
  | 'cfg'
  | 'denoise'
  | 'seed'
  | 'lora'
  | 'prompt'
  | 'model'
  | 'size'
  | 'node'
  | 'other';

export type EditorChange = {
  kind: EditorChangeKind;
  nodeId: string;
  classType: string;
  /** Input name, or '' for a node added / removed. */
  input: string;
  before?: unknown;
  after?: unknown;
};

const PROMPT_INPUTS = new Set(['text', 'prompt', 'text_g', 'text_l', 'positive', 'negative']);
const MODEL_INPUTS = new Set([
  'ckpt_name',
  'unet_name',
  'vae_name',
  'clip_name',
  'clip_name1',
  'clip_name2',
  'model_name',
  'control_net_name',
]);

function isLoraNode(classType: string): boolean {
  return /lora/i.test(classType);
}

export function classifyEditorInput(classType: string, input: string): EditorChangeKind {
  if (isLoraNode(classType)) return 'lora';
  if (input === 'sampler_name') return 'sampler';
  if (input === 'scheduler') return 'scheduler';
  if (input === 'steps') return 'steps';
  if (input === 'cfg' || input === 'guidance') return 'cfg';
  if (input === 'denoise') return 'denoise';
  if (input === 'seed' || input === 'noise_seed') return 'seed';
  if (PROMPT_INPUTS.has(input)) return 'prompt';
  if (MODEL_INPUTS.has(input)) return 'model';
  if (input === 'width' || input === 'height') return 'size';
  return 'other';
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  if (typeof a === 'number' || typeof b === 'number') {
    // The editor may store "8" where the queue sent 8.
    return String(a).trim() === String(b).trim();
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Scalar inputs that differ between the queued graph and the edited one (links are ignored). */
export function diffEditorGraphs(before: ComfyApiPrompt, after: ComfyApiPrompt): EditorChange[] {
  const changes: EditorChange[] = [];
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const nodeId of ids) {
    const was = before[nodeId];
    const now = after[nodeId];
    if (!now || !was) {
      const node = (now ?? was)!;
      changes.push({
        kind: isLoraNode(node.class_type) ? 'lora' : 'node',
        nodeId,
        classType: node.class_type,
        input: '',
        ...(was ? { before: node.class_type } : { after: node.class_type }),
      });
      continue;
    }
    if (was.class_type !== now.class_type) {
      changes.push({
        kind: 'node',
        nodeId,
        classType: now.class_type,
        input: '',
        before: was.class_type,
        after: now.class_type,
      });
      continue;
    }
    const inputs = new Set([...Object.keys(was.inputs ?? {}), ...Object.keys(now.inputs ?? {})]);
    for (const input of inputs) {
      const a = was.inputs?.[input];
      const b = now.inputs?.[input];
      // Links (and inputs the editor no longer stores) say nothing about a changed value.
      if (isApiLink(a) || isApiLink(b) || a === undefined || b === undefined) continue;
      if (sameValue(a, b)) continue;
      changes.push({
        kind: classifyEditorInput(now.class_type, input),
        nodeId,
        classType: now.class_type,
        input,
        before: a,
        after: b,
      });
    }
  }
  return changes;
}

const OVERRIDE_FIELD: Partial<Record<EditorChangeKind, keyof ModelSamplerOverrideFields>> = {
  sampler: 'samplerName',
  scheduler: 'scheduler',
  steps: 'steps',
  cfg: 'cfg',
  denoise: 'denoise',
};

/**
 * Sampler changes the Engine's sampler overrides can hold (steps, CFG, denoise, sampler,
 * scheduler). A field changed to two different values on two samplers is left out — there is
 * no single override for it.
 */
export function samplerOverridesFromEditorChanges(
  changes: EditorChange[]
): ModelSamplerOverrideFields {
  const seen = new Map<keyof ModelSamplerOverrideFields, Set<string>>();
  for (const change of changes) {
    const field = OVERRIDE_FIELD[change.kind];
    if (!field || change.after === undefined || change.after === null) continue;
    const values = seen.get(field) ?? new Set<string>();
    values.add(String(change.after).trim());
    seen.set(field, values);
  }
  const overrides: ModelSamplerOverrideFields = {};
  for (const [field, values] of seen) {
    if (values.size === 1) {
      const [value] = values;
      if (value) overrides[field] = value;
    }
  }
  return overrides;
}

const KIND_LABEL: Record<EditorChangeKind, string> = {
  sampler: 'Sampler',
  scheduler: 'Scheduler',
  steps: 'Steps',
  cfg: 'CFG',
  denoise: 'Denoise',
  seed: 'Seed',
  lora: 'LoRA',
  prompt: 'Prompt',
  model: 'Model file',
  size: 'Size',
  node: 'Node',
  other: 'Setting',
};

export function editorChangeLabel(change: EditorChange): string {
  return KIND_LABEL[change.kind];
}

export function formatEditorValue(value: unknown, max = 120): string {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Order rows so the ones a player cares about (sampler, LoRAs, prompt) come first. */
const KIND_ORDER: EditorChangeKind[] = [
  'sampler',
  'scheduler',
  'steps',
  'cfg',
  'denoise',
  'lora',
  'prompt',
  'model',
  'size',
  'seed',
  'node',
  'other',
];

export function sortEditorChanges(changes: EditorChange[]): EditorChange[] {
  return [...changes].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true })
  );
}
