import type { QueueQualityProfile } from './queue-quality-profile';
import { normalizeQueueQualityProfile } from './queue-quality-profile';

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

type SaveFormatChange = {
  kind: 'audit';
  severity: 'info' | 'warn';
  message: string;
};

export type WorkflowSaveFormat = 'png' | 'webp';

export type WebpSaveAdapter = {
  classType: string;
  /** Input that selects file type / extension. */
  formatKey: string;
  /** Preferred values tried in order until one is set. */
  formatValues: string[];
  qualityKey?: string;
  qualityValue?: number | boolean;
  losslessKey?: string;
  losslessValue?: boolean;
};

const FORMAT_INPUT_KEYS = [
  'file_type',
  'format',
  'file_format',
  'output_ext',
  'file_extension',
  'extension',
] as const;

const QUALITY_INPUT_KEYS = ['quality', 'webp_quality', 'image_quality'] as const;

/**
 * Known ComfyUI custom save nodes that can emit WebP.
 * Stock SaveImage is PNG-only — Draft compact saves require one of these
 * (or any object_info node discovered by {@link discoverWebpSaveAdapters}).
 */
export const WEBP_SAVE_ADAPTERS: readonly WebpSaveAdapter[] = [
  {
    classType: 'SaveImageExtended',
    formatKey: 'file_type',
    formatValues: ['WEBP (lossy)', 'WEBP', 'webp', 'WebP'],
    qualityKey: 'quality',
    qualityValue: 82,
  },
  {
    classType: 'Save Image Extended',
    formatKey: 'file_type',
    formatValues: ['WEBP (lossy)', 'WEBP', 'webp', 'WebP'],
    qualityKey: 'quality',
    qualityValue: 82,
  },
  {
    classType: 'SaveImagePlus',
    formatKey: 'format',
    formatValues: ['webp', 'WEBP', 'WebP'],
    qualityKey: 'quality',
    qualityValue: 82,
  },
  {
    classType: 'SaveImageWithMetaData',
    formatKey: 'file_format',
    formatValues: ['webp', 'WEBP', 'WebP'],
    qualityKey: 'quality',
    qualityValue: 82,
  },
  {
    classType: 'Image Save',
    formatKey: 'file_extension',
    formatValues: ['webp', 'WEBP'],
    qualityKey: 'quality',
    qualityValue: 82,
  },
  {
    classType: 'SaveImageExtended+',
    formatKey: 'output_ext',
    formatValues: ['webp', 'WEBP', '.webp'],
    qualityKey: 'quality',
    qualityValue: 90,
  },
];

function readInputSection(
  node: Record<string, unknown>,
  group: 'required' | 'optional'
): Record<string, unknown> | null {
  const input = node.input;
  if (!input || typeof input !== 'object') {
    return null;
  }
  const section = (input as Record<string, unknown>)[group];
  if (!section || typeof section !== 'object') {
    return null;
  }
  return section as Record<string, unknown>;
}

function listInputNames(node: Record<string, unknown>): string[] {
  const names = new Set<string>();
  const input = node.input;
  if (!input || typeof input !== 'object') {
    return [];
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === 'required' || key === 'optional') {
      continue;
    }
    names.add(key);
  }
  for (const group of ['required', 'optional'] as const) {
    const section = readInputSection(node, group);
    if (section) {
      for (const key of Object.keys(section)) {
        names.add(key);
      }
    }
  }
  return [...names];
}

function readComboOptions(node: Record<string, unknown>, inputName: string): string[] {
  const input = node.input;
  if (!input || typeof input !== 'object') {
    return [];
  }
  const record = input as Record<string, unknown>;
  const direct = record[inputName];
  if (Array.isArray(direct) && Array.isArray(direct[0])) {
    return direct[0].filter((item): item is string => typeof item === 'string');
  }
  for (const group of ['required', 'optional'] as const) {
    const section = readInputSection(node, group);
    const entry = section?.[inputName];
    if (Array.isArray(entry) && Array.isArray(entry[0])) {
      return entry[0].filter((item): item is string => typeof item === 'string');
    }
  }
  return [];
}

function pickWebpFormatValues(options: string[]): string[] {
  const webp = options.filter(option => /webp/i.test(option));
  if (webp.length === 0) {
    return [];
  }
  const lossy = webp.find(option => /lossy/i.test(option));
  const plain = webp.find(option => !/lossless/i.test(option));
  const ordered = [lossy, plain, ...webp].filter(
    (value, index, list): value is string => Boolean(value) && list.indexOf(value) === index
  );
  return ordered;
}

function looksLikeSaveNodeName(classType: string): boolean {
  const lower = classType.toLowerCase();
  if (lower.includes('load')) {
    return false;
  }
  return (
    lower.includes('saveimage') ||
    lower.includes('save_image') ||
    lower.includes('save image') ||
    lower.includes('imagesave') ||
    lower.includes('saver') ||
    (lower.includes('save') && lower.includes('image'))
  );
}

/**
 * Scan ComfyUI object_info for save nodes that expose a WebP format option.
 */
export function discoverWebpSaveAdapters(
  objectInfo: Record<string, unknown> | null | undefined
): WebpSaveAdapter[] {
  if (!objectInfo) {
    return [];
  }

  const discovered: WebpSaveAdapter[] = [];
  for (const [classType, rawNode] of Object.entries(objectInfo)) {
    if (
      classType === 'SaveImage' ||
      classType === 'SaveImageAdvanced' ||
      !rawNode ||
      typeof rawNode !== 'object'
    ) {
      continue;
    }
    const node = rawNode as Record<string, unknown>;
    const inputNames = listInputNames(node);
    if (!inputNames.includes('images')) {
      continue;
    }
    const namedSave = looksLikeSaveNodeName(classType);
    const hasFilenamePrefix = inputNames.includes('filename_prefix');
    // Require a save-like name, or the common SaveImage filename_prefix field.
    if (!namedSave && !hasFilenamePrefix) {
      continue;
    }

    let formatKey: string | null = null;
    let formatValues: string[] = [];
    for (const key of FORMAT_INPUT_KEYS) {
      if (!inputNames.includes(key)) {
        continue;
      }
      const options = readComboOptions(node, key);
      const webpValues = pickWebpFormatValues(options);
      if (webpValues.length > 0) {
        formatKey = key;
        formatValues = webpValues;
        break;
      }
      // Free-string format fields (no combo) — only for clearly named save nodes.
      if (options.length === 0 && namedSave) {
        formatKey = key;
        formatValues = ['webp', 'WEBP', 'WebP', '.webp'];
        break;
      }
    }
    if (!formatKey || formatValues.length === 0) {
      continue;
    }

    const qualityKey = QUALITY_INPUT_KEYS.find(key => inputNames.includes(key));
    discovered.push({
      classType,
      formatKey,
      formatValues,
      ...(qualityKey
        ? {
            qualityKey,
            qualityValue: 82,
          }
        : {}),
    });
  }

  return discovered;
}

export function resolveWorkflowSaveFormat(
  qualityProfile?: QueueQualityProfile | string | null,
  compactDraftSaves = true
): WorkflowSaveFormat {
  const profile = normalizeQueueQualityProfile(qualityProfile);
  if (compactDraftSaves && profile === 'draft') {
    return 'webp';
  }
  return 'png';
}

export function resolveSaveFilenamePrefix(
  current: unknown,
  qualityProfile?: QueueQualityProfile | string | null
): string {
  const profile = normalizeQueueQualityProfile(qualityProfile);
  const raw = typeof current === 'string' && current.trim() ? current.trim() : 'Castcut';
  const root = raw.replace(/-(draft|final|max)$/i, '') || 'Castcut';
  if (profile === 'draft') {
    return `${root}-draft`;
  }
  if (profile === 'max') {
    return `${root}-max`;
  }
  return root;
}

export function mergeWebpSaveAdapters(
  availableNodeTypes?: Iterable<string> | null,
  discovered: readonly WebpSaveAdapter[] = []
): WebpSaveAdapter[] {
  const available =
    availableNodeTypes instanceof Set
      ? availableNodeTypes
      : availableNodeTypes
        ? new Set(availableNodeTypes)
        : null;

  const known = WEBP_SAVE_ADAPTERS.filter(
    adapter => !available || available.has(adapter.classType)
  );
  const extras = discovered.filter(
    adapter =>
      (!available || available.has(adapter.classType)) &&
      !known.some(entry => entry.classType === adapter.classType)
  );
  return [...known, ...extras];
}

export function pickWebpSaveAdapter(
  availableNodeTypes?: Iterable<string> | null,
  discovered: readonly WebpSaveAdapter[] = []
): WebpSaveAdapter | null {
  return mergeWebpSaveAdapters(availableNodeTypes, discovered)[0] ?? null;
}

function knownSaveClassTypes(adapters: readonly WebpSaveAdapter[]): Set<string> {
  return new Set([
    'SaveImage',
    ...WEBP_SAVE_ADAPTERS.map(adapter => adapter.classType),
    ...adapters.map(adapter => adapter.classType),
  ]);
}

function isSaveLikeNode(node: WorkflowNode | undefined, knownTypes: Set<string>): boolean {
  if (!node?.class_type || !node.inputs || node.inputs.images == null) {
    return false;
  }
  // Handled separately — never rewrite away from SaveImageAdvanced.
  if (node.class_type === 'SaveImageAdvanced') {
    return false;
  }
  if (knownTypes.has(node.class_type)) {
    return true;
  }
  const lower = node.class_type.toLowerCase();
  if (lower.includes('load')) {
    return false;
  }
  return typeof node.inputs.filename_prefix === 'string' && looksLikeSaveNodeName(node.class_type);
}

/**
 * ComfyUI built-in SaveImageAdvanced requires `format` (png|exr). Packs often
 * omit it (UI widget defaults), which crashes API queue with:
 * SaveImageAdvanced.execute() missing 1 required positional argument: 'format'
 * Keep the node type — only fill required format fields in place.
 */
function ensureSaveImageAdvancedInputs(
  inputs: Record<string, unknown>,
  filenamePrefix: string
): Record<string, unknown> {
  const next = { ...inputs };
  if (typeof next.format !== 'string' || !next.format.trim()) {
    next.format = 'png';
  }
  const format = String(next.format).toLowerCase();
  if (typeof next.bit_depth !== 'string' || !next.bit_depth.trim()) {
    next.bit_depth = format === 'exr' ? '32-bit float' : '8-bit';
  }
  if (typeof next.input_color_space !== 'string' || !next.input_color_space.trim()) {
    next.input_color_space = 'sRGB';
  }
  next.filename_prefix = filenamePrefix;
  return next;
}

function applyWebpAdapterInputs(inputs: Record<string, unknown>, adapter: WebpSaveAdapter): void {
  inputs[adapter.formatKey] = adapter.formatValues[0];
  if (adapter.qualityKey && adapter.qualityValue != null) {
    inputs[adapter.qualityKey] = adapter.qualityValue;
  }
  if (adapter.losslessKey && adapter.losslessValue != null) {
    inputs[adapter.losslessKey] = adapter.losslessValue;
  }
}

/**
 * Profile-aware save node patch:
 * - Draft + compact: rewrite SaveImage → WebP-capable custom node when installed
 * - Final/Max: force stock SaveImage (PNG) and profile filename prefixes
 * - SaveImageAdvanced: fill required format fields in place (do not demote)
 */
export function patchWorkflowSaveFormat(input: {
  workflow: Record<string, unknown>;
  qualityProfile?: QueueQualityProfile | string | null;
  compactDraftSaves?: boolean;
  availableNodeTypes?: Iterable<string> | null;
  /** Adapters discovered from live ComfyUI object_info. */
  webpSaveAdapters?: readonly WebpSaveAdapter[] | null;
}): {
  workflow: Record<string, unknown>;
  changes: SaveFormatChange[];
} {
  const workflow = structuredClone(input.workflow) as Record<string, WorkflowNode>;
  const changes: SaveFormatChange[] = [];
  const format = resolveWorkflowSaveFormat(input.qualityProfile, input.compactDraftSaves !== false);
  const discovered = (input.webpSaveAdapters ?? []).filter(
    adapter => adapter.classType !== 'SaveImageAdvanced'
  );
  const webpAdapter =
    format === 'webp' ? pickWebpSaveAdapter(input.availableNodeTypes, discovered) : null;
  const knownTypes = knownSaveClassTypes(discovered);

  let advancedRepaired = 0;
  for (const node of Object.values(workflow)) {
    if (node?.class_type !== 'SaveImageAdvanced' || !node.inputs) {
      continue;
    }
    const prefix = resolveSaveFilenamePrefix(node.inputs.filename_prefix, input.qualityProfile);
    node.inputs = ensureSaveImageAdvancedInputs(node.inputs, prefix);
    advancedRepaired += 1;
  }
  if (advancedRepaired > 0) {
    changes.push({
      kind: 'audit',
      severity: 'info',
      message: `Filled SaveImageAdvanced format fields (png / 8-bit / sRGB) on ${advancedRepaired} node(s) for API queue.`,
    });
  }

  let patched = 0;
  for (const node of Object.values(workflow)) {
    if (!isSaveLikeNode(node, knownTypes) || !node.inputs) {
      continue;
    }

    const images = node.inputs.images;
    const prefix = resolveSaveFilenamePrefix(node.inputs.filename_prefix, input.qualityProfile);

    if (format === 'webp' && webpAdapter) {
      node.class_type = webpAdapter.classType;
      const nextInputs: Record<string, unknown> = {
        images,
        filename_prefix: prefix,
      };
      applyWebpAdapterInputs(nextInputs, webpAdapter);
      node.inputs = nextInputs;
      patched += 1;
      continue;
    }

    // Keepers, or draft without a WebP save node: stock PNG SaveImage
    node.class_type = 'SaveImage';
    node.inputs = {
      images,
      filename_prefix: prefix,
    };
    patched += 1;
  }

  if (patched === 0 && advancedRepaired === 0) {
    return { workflow, changes };
  }

  if (format === 'webp' && webpAdapter) {
    changes.push({
      kind: 'audit',
      severity: 'info',
      message: `Draft compact save: using ${webpAdapter.classType} (WebP · ${String(webpAdapter.formatValues[0])}) on ${patched} save node(s).`,
    });
  } else if (format === 'webp' && !webpAdapter && patched > 0) {
    changes.push({
      kind: 'audit',
      severity: 'warn',
      message:
        'Draft compact save requested WebP, but no WebP save node is installed (e.g. SaveImageExtended). Keeping PNG SaveImage; install a WebP save custom node for smaller draft files.',
    });
    changes.push({
      kind: 'audit',
      severity: 'info',
      message: `Updated ${patched} SaveImage filename prefix(es) for draft profile.`,
    });
  } else if (patched > 0) {
    changes.push({
      kind: 'audit',
      severity: 'info',
      message: `Keeper save: PNG SaveImage on ${patched} node(s) with profile filename prefixes.`,
    });
  }

  return { workflow, changes };
}
