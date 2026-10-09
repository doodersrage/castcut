/**
 * ComfyUI's own editor (the litegraph frontend) only opens UI-format workflows from the
 * Workflows sidebar — `loadGraphData` reads `nodes` / `links`, and an API-format graph (the
 * `{ id: { class_type, inputs } }` map Castcut queues and embeds as `extra_pnginfo.workflow`)
 * loads as an empty canvas. Drag-and-drop does accept API JSON, but a file saved to
 * `userdata/workflows` does not, so "Open in ComfyUI" converts the queued graph here.
 *
 * Pure and shared: the converter runs on the server (it needs `/object_info` for the widget
 * order), the reverse mapping runs on Import (Settings → ComfyUI) to diff what the player
 * changed in the editor.
 */

/** One `/object_info` input spec: `[type | options[], { default, control_after_generate, … }]`. */
export type ComfyInputSpec = [unknown, Record<string, unknown>?];

export type ComfyNodeDef = {
  input?: {
    required?: Record<string, ComfyInputSpec>;
    optional?: Record<string, ComfyInputSpec>;
  };
  input_order?: { required?: string[]; optional?: string[] };
  output?: unknown[];
  output_name?: string[];
  display_name?: string;
};

export type ComfyNodeDefs = Record<string, ComfyNodeDef | undefined>;

export type ComfyApiNode = {
  class_type: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

export type ComfyApiPrompt = Record<string, ComfyApiNode>;

export type UiNodeInput = {
  name: string;
  type: string;
  link: number | null;
  widget?: { name: string };
};

export type UiNodeOutput = {
  name: string;
  type: string;
  links: number[] | null;
  slot_index: number;
};

export type UiNode = {
  id: number;
  type: string;
  title?: string;
  pos: [number, number];
  size: [number, number];
  flags: Record<string, unknown>;
  order: number;
  mode: number;
  inputs: UiNodeInput[];
  outputs: UiNodeOutput[];
  properties: Record<string, unknown>;
  widgets_values: unknown[];
};

/** `[id, origin node, origin slot, target node, target slot, type]` */
export type UiLink = [number, number, number, number, number, string];

/** What Castcut writes into `extra.castcut` so Import can tell what the player changed. */
export type AppEditorMeta = {
  version: 1;
  tool?: string;
  model?: string;
  galleryEntryId?: string;
  promptId?: string;
  createdAt: number;
  /** The graph exactly as queued — the baseline for Import's diff. */
  apiPrompt: ComfyApiPrompt;
  /** UI node id → API node id, when the API ids were not plain integers. */
  idMap?: Record<string, string>;
  /** API inputs no widget or socket could hold (dynamic-input packs), by node id. */
  unmapped?: Record<string, string[]>;
};

export type UiWorkflow = {
  last_node_id: number;
  last_link_id: number;
  nodes: UiNode[];
  links: UiLink[];
  groups: unknown[];
  config: Record<string, unknown>;
  extra: Record<string, unknown> & { castcut?: AppEditorMeta };
  version: number;
};

const WIDGET_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO']);
const SEED_NAMES = new Set(['seed', 'noise_seed']);
const UPLOAD_FLAGS = ['image_upload', 'video_upload', 'audio_upload', 'animated_image_upload'];

/** A widget slot in `widgets_values`: the input itself, or a frontend-only companion. */
export type WidgetSlot =
  | { kind: 'input'; name: string; type: string; spec: ComfyInputSpec }
  | { kind: 'control'; name: string }
  | { kind: 'upload'; name: string };

export function isApiPromptGraph(value: unknown): value is ComfyApiPrompt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.values(value as Record<string, unknown>);
  return (
    entries.length > 0 &&
    entries.every(
      node =>
        Boolean(node) &&
        typeof node === 'object' &&
        typeof (node as { class_type?: unknown }).class_type === 'string' &&
        Boolean((node as { inputs?: unknown }).inputs) &&
        typeof (node as { inputs?: unknown }).inputs === 'object'
    )
  );
}

export function isApiLink(value: unknown): value is [string | number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === 'string' || typeof value[0] === 'number') &&
    typeof value[1] === 'number'
  );
}

function specType(spec: ComfyInputSpec | undefined): string {
  const raw = spec?.[0];
  if (Array.isArray(raw)) return 'COMBO';
  return typeof raw === 'string' ? raw : '*';
}

function specOptions(spec: ComfyInputSpec | undefined): Record<string, unknown> {
  const options = spec?.[1];
  return options && typeof options === 'object' ? options : {};
}

/** True when the frontend draws this input as a widget (and so stores it in `widgets_values`). */
export function isWidgetSpec(spec: ComfyInputSpec | undefined): boolean {
  if (!spec) return false;
  if (specOptions(spec).forceInput === true) return false;
  return WIDGET_TYPES.has(specType(spec));
}

/** Inputs in the order the frontend builds them: required, then optional. */
export function orderedInputs(def: ComfyNodeDef): Array<[string, ComfyInputSpec, boolean]> {
  const out: Array<[string, ComfyInputSpec, boolean]> = [];
  for (const group of ['required', 'optional'] as const) {
    const specs = def.input?.[group] ?? {};
    const order = def.input_order?.[group] ?? Object.keys(specs);
    for (const name of order) {
      const spec = specs[name];
      if (spec) out.push([name, spec, group === 'optional']);
    }
  }
  return out;
}

/** The `widgets_values` layout for a node: seeds get a "control after generate" companion, uploads a button. */
export function widgetSlots(def: ComfyNodeDef): WidgetSlot[] {
  const slots: WidgetSlot[] = [];
  for (const [name, spec] of orderedInputs(def)) {
    if (!isWidgetSpec(spec)) continue;
    const type = specType(spec);
    const options = specOptions(spec);
    slots.push({ kind: 'input', name, type, spec });
    if (
      options.control_after_generate === true ||
      (type === 'INT' && SEED_NAMES.has(name) && options.control_after_generate !== false)
    ) {
      slots.push({ kind: 'control', name: `${name}:control_after_generate` });
    }
    if (UPLOAD_FLAGS.some(flag => options[flag] === true)) {
      slots.push({ kind: 'upload', name: 'upload' });
    }
  }
  return slots;
}

function defaultWidgetValue(spec: ComfyInputSpec): unknown {
  const options = specOptions(spec);
  if ('default' in options) return options.default;
  const raw = spec[0];
  if (Array.isArray(raw)) return raw[0] ?? '';
  if (Array.isArray(options.options)) return (options.options as unknown[])[0] ?? '';
  switch (specType(spec)) {
    case 'INT':
    case 'FLOAT':
      return typeof options.min === 'number' ? options.min : 0;
    case 'BOOLEAN':
      return false;
    default:
      return '';
  }
}

function outputTypes(def: ComfyNodeDef | undefined): string[] {
  return (def?.output ?? []).map(entry =>
    Array.isArray(entry) ? 'COMBO' : typeof entry === 'string' ? entry : '*'
  );
}

/** Integer ids stay as they are (the editor shows them); anything else is renumbered. */
function assignUiIds(apiIds: string[]): {
  toUi: Map<string, number>;
  idMap?: Record<string, string>;
} {
  const toUi = new Map<string, number>();
  const plain = apiIds.every(id => /^[1-9]\d{0,8}$/.test(id));
  if (plain) {
    for (const id of apiIds) toUi.set(id, Number(id));
    return { toUi };
  }
  const idMap: Record<string, string> = {};
  apiIds.forEach((id, index) => {
    toUi.set(id, index + 1);
    idMap[String(index + 1)] = id;
  });
  return { toUi, idMap };
}

function sortApiIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

/** Longest link distance from a source node — the column a node sits in. */
function dependencyDepths(prompt: ComfyApiPrompt): Map<string, number> {
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let depth = 0;
    for (const value of Object.values(prompt[id]?.inputs ?? {})) {
      if (isApiLink(value) && prompt[String(value[0])]) {
        depth = Math.max(depth, depthOf(String(value[0])) + 1);
      }
    }
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  };
  for (const id of Object.keys(prompt)) depthOf(id);
  return depths;
}

const COLUMN_WIDTH = 420;
const NODE_WIDTH = 360;
const ROW_GAP = 40;

function estimateNodeHeight(node: UiNode, def: ComfyNodeDef | undefined): number {
  const sockets = node.inputs.filter(input => !input.widget).length;
  const rows = Math.max(sockets, node.outputs.length);
  let height = 40 + rows * 22;
  for (const slot of def ? widgetSlots(def) : []) {
    if (slot.kind !== 'input') {
      height += slot.kind === 'upload' ? 260 : 24;
      continue;
    }
    height += slot.type === 'STRING' && specOptions(slot.spec).multiline === true ? 160 : 26;
  }
  if (!def) height += node.widgets_values.length * 26;
  return Math.min(height, 900);
}

/**
 * API graph → UI workflow the ComfyUI editor opens. Nodes are laid out in columns by dependency
 * depth, links are rebuilt from the inputs, and `widgets_values` follow `/object_info` input
 * order (seed widgets get "fixed" so the editor re-runs the exact seed).
 */
export function apiPromptToUiWorkflow(
  prompt: ComfyApiPrompt,
  defs: ComfyNodeDefs,
  meta?: Omit<AppEditorMeta, 'version' | 'apiPrompt' | 'idMap' | 'unmapped' | 'createdAt'> & {
    createdAt?: number;
  }
): UiWorkflow {
  const apiIds = sortApiIds(Object.keys(prompt));
  const { toUi, idMap } = assignUiIds(apiIds);
  const depths = dependencyDepths(prompt);
  const nodes = new Map<string, UiNode>();
  const unmapped: Record<string, string[]> = {};

  for (const apiId of apiIds) {
    const apiNode = prompt[apiId];
    const def = defs[apiNode.class_type];
    const apiInputs = apiNode.inputs ?? {};
    const inputs: UiNodeInput[] = [];
    const widgets: unknown[] = [];
    const used = new Set<string>();

    if (def) {
      for (const [name, spec] of orderedInputs(def)) {
        const widget = isWidgetSpec(spec);
        const value = apiInputs[name];
        const linked = isApiLink(value);
        // Optional sockets the graph does not use are left for the editor to add.
        if (!widget && !linked && !(name in apiInputs) && !def.input?.required?.[name]) continue;
        inputs.push({
          name,
          type: specType(spec),
          link: null,
          ...(widget ? { widget: { name } } : {}),
        });
        used.add(name);
      }
      for (const slot of widgetSlots(def)) {
        if (slot.kind === 'control') {
          widgets.push('fixed');
        } else if (slot.kind === 'upload') {
          widgets.push('image');
        } else {
          const value = apiInputs[slot.name];
          widgets.push(
            value === undefined || isApiLink(value) ? defaultWidgetValue(slot.spec) : value
          );
        }
      }
      for (const [name, value] of Object.entries(apiInputs)) {
        if (used.has(name)) continue;
        if (isApiLink(value)) {
          inputs.push({ name, type: '*', link: null });
        } else {
          (unmapped[apiId] ??= []).push(name);
        }
      }
    } else {
      // Not installed on this ComfyUI: keep values in graph order so the editor can show them
      // (as a missing node) once the pack is installed.
      for (const [name, value] of Object.entries(apiInputs)) {
        if (isApiLink(value)) inputs.push({ name, type: '*', link: null });
        else widgets.push(value);
      }
    }

    const outputs = outputTypes(def).map((type, index) => ({
      name: def?.output_name?.[index] ?? type,
      type,
      links: null as number[] | null,
      slot_index: index,
    }));
    const title = apiNode._meta?.title?.trim();
    nodes.set(apiId, {
      id: toUi.get(apiId)!,
      type: apiNode.class_type,
      ...(title && title !== (def?.display_name ?? apiNode.class_type) ? { title } : {}),
      pos: [0, 0],
      size: [NODE_WIDTH, 100],
      flags: {},
      order: 0,
      mode: 0,
      inputs,
      outputs,
      properties: { 'Node name for S&R': apiNode.class_type },
      widgets_values: widgets,
    });
  }

  const links: UiLink[] = [];
  let linkId = 0;
  for (const apiId of apiIds) {
    const target = nodes.get(apiId)!;
    const apiInputs = prompt[apiId].inputs ?? {};
    target.inputs.forEach((input, targetSlot) => {
      const value = apiInputs[input.name];
      if (!isApiLink(value)) return;
      const originId = String(value[0]);
      const origin = nodes.get(originId);
      if (!origin) return;
      const originSlot = value[1];
      // Unknown origin nodes have no declared outputs — grow them so the slot exists.
      while (origin.outputs.length <= originSlot) {
        const index = origin.outputs.length;
        origin.outputs.push({ name: `output_${index}`, type: '*', links: null, slot_index: index });
      }
      const output = origin.outputs[originSlot];
      linkId += 1;
      const type = output.type !== '*' ? output.type : input.type;
      links.push([linkId, origin.id, originSlot, target.id, targetSlot, type]);
      input.link = linkId;
      if (input.type === '*') input.type = type;
      output.links = [...(output.links ?? []), linkId];
    });
  }

  // Columns by depth, stacked top to bottom in id order; `order` is the execution order.
  const columns = new Map<number, string[]>();
  for (const apiId of apiIds) {
    const depth = depths.get(apiId) ?? 0;
    columns.set(depth, [...(columns.get(depth) ?? []), apiId]);
  }
  let order = 0;
  for (const depth of [...columns.keys()].sort((a, b) => a - b)) {
    let y = 0;
    for (const apiId of columns.get(depth)!) {
      const node = nodes.get(apiId)!;
      const def = defs[node.type];
      const height = estimateNodeHeight(node, def);
      const wide = def
        ? widgetSlots(def).some(slot => slot.kind === 'input' && slot.type === 'STRING')
        : false;
      node.pos = [depth * COLUMN_WIDTH, y];
      node.size = [wide ? NODE_WIDTH + 40 : NODE_WIDTH, height];
      node.order = order++;
      y += height + ROW_GAP;
    }
  }

  const uiNodes = apiIds.map(id => nodes.get(id)!);
  return {
    last_node_id: Math.max(0, ...uiNodes.map(node => node.id)),
    last_link_id: linkId,
    nodes: uiNodes,
    links,
    groups: [],
    config: {},
    extra: {
      ds: { scale: 0.6, offset: [40, 40] },
      castcut: {
        version: 1,
        ...(meta?.tool ? { tool: meta.tool } : {}),
        ...(meta?.model ? { model: meta.model } : {}),
        ...(meta?.galleryEntryId ? { galleryEntryId: meta.galleryEntryId } : {}),
        ...(meta?.promptId ? { promptId: meta.promptId } : {}),
        createdAt: meta?.createdAt ?? Date.now(),
        apiPrompt: prompt,
        ...(idMap ? { idMap } : {}),
        ...(Object.keys(unmapped).length > 0 ? { unmapped } : {}),
      },
    },
    version: 0.4,
  };
}

/** Class types a graph uses — what the converter needs `/object_info` for. */
export function apiPromptClassTypes(prompt: ComfyApiPrompt): string[] {
  return [
    ...new Set(
      Object.values(prompt)
        .map(node => node.class_type)
        .filter(Boolean)
    ),
  ];
}

/** Canvas-only nodes: never queued (a primitive's value already sits on its target widget). */
const FRONTEND_ONLY_TYPES = new Set(['Note', 'MarkdownNote', 'Reroute', 'PrimitiveNode']);

type LooseUiNode = {
  id?: unknown;
  type?: unknown;
  mode?: unknown;
  title?: unknown;
  inputs?: Array<{ name?: unknown; link?: unknown; widget?: unknown }>;
  widgets_values?: unknown;
};

export function isUiWorkflow(value: unknown): value is { nodes: unknown[]; links?: unknown } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { nodes?: unknown }).nodes)
  );
}

/** Castcut's metadata on a workflow file, when it came from "Open in ComfyUI". */
export function readAppEditorMeta(workflow: unknown): AppEditorMeta | null {
  if (!isUiWorkflow(workflow)) return null;
  // Stored under `extra.castcut` (the key Castcut first saved it with; kept so saved workflows load).
  const meta = (workflow as { extra?: { castcut?: unknown } }).extra?.castcut;
  if (!meta || typeof meta !== 'object') return null;
  const record = meta as Partial<AppEditorMeta>;
  return isApiPromptGraph(record.apiPrompt) ? (record as AppEditorMeta) : null;
}

/**
 * UI workflow (as the editor saved it) → API-shaped graph, for diffing. Muted and bypassed
 * nodes are left out (they don't run); widget values come from `widgets_values` in
 * `/object_info` order, links from the link table. Unknown node types keep their values under
 * `widget_<n>`.
 */
export function uiWorkflowToApiPrompt(
  workflow: { nodes: unknown[]; links?: unknown; extra?: unknown },
  defs: ComfyNodeDefs
): ComfyApiPrompt {
  const meta = readAppEditorMeta(workflow);
  const apiIdFor = (uiId: unknown) => {
    const key = String(uiId);
    return meta?.idMap?.[key] ?? key;
  };
  const linkTable = new Map<number, { origin: unknown; slot: number }>();
  if (Array.isArray(workflow.links)) {
    for (const link of workflow.links) {
      if (Array.isArray(link) && typeof link[0] === 'number') {
        linkTable.set(link[0], { origin: link[1], slot: Number(link[2]) || 0 });
      } else if (
        link &&
        typeof link === 'object' &&
        typeof (link as { id?: unknown }).id === 'number'
      ) {
        const record = link as { id: number; origin_id?: unknown; origin_slot?: unknown };
        linkTable.set(record.id, {
          origin: record.origin_id,
          slot: Number(record.origin_slot) || 0,
        });
      }
    }
  }

  const typeById = new Map<string, string>();
  for (const raw of workflow.nodes) {
    const node = raw as LooseUiNode;
    if (typeof node?.type === 'string') typeById.set(String(node.id), node.type);
  }

  const prompt: ComfyApiPrompt = {};
  for (const raw of workflow.nodes) {
    const node = raw as LooseUiNode;
    if (typeof node?.type !== 'string' || node.id === undefined) continue;
    // 2 = muted, 4 = bypassed: neither runs.
    if (node.mode === 2 || node.mode === 4) continue;
    if (FRONTEND_ONLY_TYPES.has(node.type)) continue;
    const def = defs[node.type];
    const inputs: Record<string, unknown> = {};
    const values = Array.isArray(node.widgets_values) ? node.widgets_values : [];
    if (def) {
      let index = 0;
      for (const slot of widgetSlots(def)) {
        const value = values[index++];
        if (slot.kind === 'input' && value !== undefined) inputs[slot.name] = value;
      }
    } else if (Array.isArray(node.widgets_values)) {
      node.widgets_values.forEach((value, index) => {
        inputs[`widget_${index}`] = value;
      });
    } else if (node.widgets_values && typeof node.widgets_values === 'object') {
      Object.assign(inputs, node.widgets_values as Record<string, unknown>);
    }
    for (const input of node.inputs ?? []) {
      if (typeof input?.name !== 'string' || typeof input.link !== 'number') continue;
      const link = linkTable.get(input.link);
      if (!link) continue;
      // A widget fed by a primitive keeps its value on the widget; real links win otherwise.
      if (FRONTEND_ONLY_TYPES.has(typeById.get(String(link.origin)) ?? '')) continue;
      inputs[input.name] = [apiIdFor(link.origin), link.slot];
    }
    const title = typeof node.title === 'string' ? node.title : undefined;
    prompt[apiIdFor(node.id)] = {
      class_type: node.type,
      inputs,
      ...(title ? { _meta: { title } } : {}),
    };
  }
  return prompt;
}
