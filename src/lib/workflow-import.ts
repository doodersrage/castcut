import {
  DEFAULT_CFG_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_FLUX_BASE_SHIFT_TOKEN,
  DEFAULT_FLUX_MAX_SHIFT_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_INIT_IMAGE_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SAMPLER_TOKEN,
  DEFAULT_SCHEDULER_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_SHIFT_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_WIDTH_TOKEN,
  detectWorkflowPlaceholders,
  listWorkflowNodeIds,
  type WorkflowPlaceholderTokens,
} from './comfyui-config';
import { optimizeWorkflowForQueue } from './workflow-queue-optimizer';
import { inferModelsFromWorkflowLabel } from './workflow-category-defaults';
import { loadSettingsCache } from './settings-cache';
import { normalizeQueueQualityProfile, type QueueQualityProfile } from './queue-quality-profile';

export type WorkflowImportResult = {
  ok: boolean;
  error?: string;
  errorDetail?: string;
  notice?: string;
  workflowJson?: string;
  placeholders?: ReturnType<typeof detectWorkflowPlaceholders>;
  autoAppliedBindings?: number;
  /** Persist on upsert so Health / queue skip match the import optimize pass. */
  contentHash?: string;
  optimizeModel?: string;
  optimizeProfile?: QueueQualityProfile;
};

function stripUtf8Bom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function previewImportText(raw: string, maxLength = 120): string {
  const compact = raw.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength)}…`;
}

function buildJsonParseHints(raw: string, message: string): string {
  const hints: string[] = [];

  if (/unexpected token/i.test(message) && raw.charCodeAt(0) === 0xfeff) {
    hints.push('The file starts with a UTF-8 BOM — re-save the file as UTF-8 without BOM.');
  }

  if (/'[^']*':/.test(raw) && !/"[^"]*":/.test(raw)) {
    hints.push(
      'Keys appear to use single quotes; JSON requires double quotes around keys and strings.'
    );
  }

  if (/\/\/|\/\*/.test(raw)) {
    hints.push('Comments are not allowed in JSON — remove // or /* */ lines before importing.');
  }

  if (/,\s*[}\]]/.test(raw)) {
    hints.push('Trailing commas are not valid JSON — remove the comma after the last property.');
  }

  if (/^\s*<[?!]?[a-z]/i.test(raw)) {
    hints.push('This file looks like HTML or XML, not a ComfyUI workflow export.');
  }

  if (!raw.trim().startsWith('{') && !raw.trim().startsWith('[')) {
    hints.push(
      `Expected JSON starting with "{" (ComfyUI API workflow). File starts with: ${previewImportText(raw, 40)}`
    );
  }

  hints.push(
    'In ComfyUI, use Save (API Format) — not the UI workflow export (nodes/links) or a screenshot/metadata sidecar.'
  );

  return hints.join(' ');
}

function parseImportJson(
  raw: string
): { ok: true; value: unknown } | { ok: false; error: string; errorDetail?: string } {
  const trimmed = stripUtf8Bom(raw.trim());
  if (!trimmed) {
    return { ok: false, error: 'Workflow file is empty.' };
  }

  if (/^\s*<[?!]?[a-z]/i.test(trimmed)) {
    return {
      ok: false,
      error: 'File is not JSON.',
      errorDetail:
        'Content looks like HTML or XML. Choose a .json file exported from ComfyUI (Save → API Format).',
    };
  }

  try {
    let parsed: unknown = JSON.parse(trimmed);

    if (typeof parsed === 'string') {
      const inner = parsed.trim();
      if (!inner) {
        return {
          ok: false,
          error: 'JSON root is an empty string.',
          errorDetail: 'Expected a workflow object with numeric node IDs (e.g. "3", "6").',
        };
      }

      try {
        parsed = JSON.parse(inner);
      } catch (innerError) {
        const innerMessage =
          innerError instanceof Error ? innerError.message : 'Unknown parse error';
        return {
          ok: false,
          error: 'JSON root is a string, but the inner content is not valid JSON.',
          errorDetail: `Inner parse error: ${innerMessage}. Preview: ${previewImportText(inner)}`,
        };
      }
    }

    return { ok: true, value: parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    return {
      ok: false,
      error: `Invalid JSON: ${message}`,
      errorDetail: buildJsonParseHints(trimmed, message),
    };
  }
}

function isUiWorkflowExport(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.nodes) && record.links != null;
}

function describeUnrecognizedWorkflowShape(parsed: unknown): string {
  if (parsed == null) {
    return 'JSON parsed to null or undefined.';
  }

  if (typeof parsed !== 'object') {
    return `JSON root is ${typeof parsed} (${JSON.stringify(parsed)}). Expected an object with numeric node IDs.`;
  }

  if (Array.isArray(parsed)) {
    return `JSON root is an array (${parsed.length} item${parsed.length === 1 ? '' : 's'}). Expected a ComfyUI API workflow object keyed by node ID (e.g. "3", "6").`;
  }

  const record = parsed as Record<string, unknown>;
  const topLevelKeys = Object.keys(record);
  if (topLevelKeys.length === 0) {
    return 'JSON root is an empty object {}.';
  }

  const numericKeys = listWorkflowNodeIds(record);
  if (numericKeys.length === 0) {
    const nestedKeys = ['prompt', 'workflow', 'graph'].filter(key => key in record);
    const keySample = topLevelKeys
      .slice(0, 8)
      .map(key => `"${key}"`)
      .join(', ');
    const suffix = topLevelKeys.length > 8 ? ` (+${topLevelKeys.length - 8} more)` : '';

    if (nestedKeys.length > 0) {
      return `Top-level keys: ${keySample}${suffix}. Found nested field(s) ${nestedKeys.join(', ')}, but none contain numeric ComfyUI node IDs.`;
    }

    if (Array.isArray(record.nodes)) {
      return `Top-level keys: ${keySample}${suffix}. This resembles a ComfyUI UI workflow — re-export using Save (API Format).`;
    }

    return `Top-level keys: ${keySample}${suffix}. None are numeric node IDs (expected keys like "3", "6" with class_type and inputs).`;
  }

  return 'Could not locate a ComfyUI API workflow in this file.';
}

function extractApiWorkflowObject(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  if (isUiWorkflowExport(record)) {
    return null;
  }

  if (listWorkflowNodeIds(record).length > 0) {
    return record;
  }

  for (const key of ['prompt', 'workflow', 'graph']) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const workflow = nested as Record<string, unknown>;
      if (listWorkflowNodeIds(workflow).length > 0) {
        return workflow;
      }
    }
  }

  return null;
}

export function prepareWorkflowJsonImport(
  raw: string,
  tokens: WorkflowPlaceholderTokens = {
    positive: DEFAULT_POSITIVE_TOKEN,
    negative: DEFAULT_NEGATIVE_TOKEN,
    seed: DEFAULT_SEED_TOKEN,
    width: DEFAULT_WIDTH_TOKEN,
    height: DEFAULT_HEIGHT_TOKEN,
    cfg: DEFAULT_CFG_TOKEN,
    steps: DEFAULT_STEPS_TOKEN,
    sampler: DEFAULT_SAMPLER_TOKEN,
    scheduler: DEFAULT_SCHEDULER_TOKEN,
    shift: DEFAULT_SHIFT_TOKEN,
    fluxMaxShift: DEFAULT_FLUX_MAX_SHIFT_TOKEN,
    fluxBaseShift: DEFAULT_FLUX_BASE_SHIFT_TOKEN,
    denoise: DEFAULT_DENOISE_TOKEN,
    inputImage: DEFAULT_INPUT_IMAGE_TOKEN,
    maskImage: DEFAULT_MASK_IMAGE_TOKEN,
    initImage: DEFAULT_INIT_IMAGE_TOKEN,
    videoFrames: DEFAULT_VIDEO_FRAMES_TOKEN,
    videoFps: DEFAULT_VIDEO_FPS_TOKEN,
  },
  options?: {
    name?: string;
    filename?: string;
  }
): WorkflowImportResult {
  const parsedResult = parseImportJson(raw);
  if (!parsedResult.ok) {
    return {
      ok: false,
      error: parsedResult.error,
      errorDetail: parsedResult.errorDetail,
    };
  }

  const parsed = parsedResult.value;

  if (isUiWorkflowExport(parsed)) {
    return {
      ok: false,
      error: 'This is a ComfyUI UI workflow export (nodes/links).',
      errorDetail:
        'Castcut needs API format JSON. In ComfyUI, open the workflow menu and choose Save (API Format), then import that file.',
    };
  }

  const workflow = extractApiWorkflowObject(parsed);
  if (!workflow) {
    return {
      ok: false,
      error: 'No ComfyUI API workflow found in this file.',
      errorDetail: describeUnrecognizedWorkflowShape(parsed),
    };
  }

  let workflowJson = JSON.stringify(workflow, null, 2);
  let notice: string | undefined;

  const inferredModels = inferModelsFromWorkflowLabel({
    name: options?.name ?? '',
    filename: options?.filename ?? '',
  });
  const optimizeModel = inferredModels[0] ?? loadSettingsCache().shared.model;
  const shared = loadSettingsCache().shared;

  const optimized = optimizeWorkflowForQueue({
    workflow,
    tokens,
    model: optimizeModel,
    qualityProfile: shared.queueQualityProfile,
    enrichGraph: shared.workflowGraphEnrich !== false,
    enrichSdxlRefiner: shared.workflowSdxlRefinerEnrich !== false,
    enrichNeuralPolish: shared.workflowNeuralUpscalePolish !== false,
    enrichSharpen: shared.workflowSharpenAfterUpscale === true,
  });
  workflowJson = optimized.workflowJson;
  const placeholders = optimized.audit.placeholders;
  const autoAppliedBindings = optimized.bindingChanges.length;

  if (autoAppliedBindings > 0) {
    notice = `Auto-applied ${autoAppliedBindings} placeholder binding(s). Review the JSON before queueing.`;
  }

  if (placeholders.positive === 0) {
    notice =
      (notice ? `${notice} ` : '') +
      `No ${tokens.positive} placeholder yet — use Edit JSON → Apply bindings, or add ${tokens.positive} to a CLIP Text Encode node.`;
  }

  return {
    ok: true,
    workflowJson,
    notice,
    placeholders,
    autoAppliedBindings,
    contentHash: optimized.contentHash,
    optimizeModel: String(optimizeModel),
    optimizeProfile: normalizeQueueQualityProfile(shared.queueQualityProfile),
  };
}
