import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  detectWorkflowPlaceholders,
  listWorkflowNodeIds,
  type WorkflowPlaceholderTokens,
} from './comfyui-config';
import { applyWorkflowNodeBindings, type WorkflowBindingChange } from './workflow-apply-bindings';
import { suggestWorkflowNodeMappings } from './workflow-node-mapper';
import { enrichWorkflowGraph } from './workflow-graph-enrich';
import { patchWorkflowSaveFormat } from './workflow-save-format';
import { listLoraBindTokens } from './workflow-lora-patch';
import { mergeLoraLibraryIntoCustomTokens, loadComfyUiSettings } from './comfyui-settings';
import { resolvePromptEncodeTextField } from './workflow-prompt-encode';
import {
  stringifyWorkflowCompact,
  stringifyWorkflowPretty,
  workflowContentHash,
  workflowObjectContentHash,
} from './workflow-content-hash';
import { repairQwenImageClipLoaderNodes } from './workflow-qwen-clip-repair';
import {
  isQwenLightningModel,
  patchModelSamplingInWorkflow,
  resolveModelSamplingParams,
} from './model-sampling-patch';
import {
  isDistilledFewStepImageModel,
  normalizeQueueQualityProfile,
  profileUsesUpscaleEnrich,
  resolveEffectiveSamplerPreset,
  type QueueQualityProfile,
} from './queue-quality-profile';
import { normalizeEmptyLatentForModel } from './workflow-direct-patch';
import { workflowHasCastcutQueueEnrich } from './workflow-enrich-markers';

/** Match object hash (current) or legacy pretty-JSON hash from older Optimize all runs. */
function workflowHashMatches(workflow: Record<string, unknown>, contentHash: string): boolean {
  // Early check with compact JSON - most common case
  if (workflowObjectContentHash(workflow) === contentHash) {
    return true;
  }

  // Only compute pretty JSON hash if the compact version doesn't match
  // This avoids expensive stringification when possible
  return workflowContentHash(stringifyWorkflowPretty(workflow)) === contentHash;
}

function canSkipFullOptimize(input: {
  skipIfUnchanged?: boolean;
  contentHash?: string;
  workflow: Record<string, unknown>;
  model?: string;
  qualityProfile?: QueueQualityProfile;
  optimizedModel?: string;
  optimizedProfile?: QueueQualityProfile;
}): boolean {
  // Early returns for quick rejections
  if (!input.skipIfUnchanged || !input.contentHash) {
    return false;
  }

  const optimizedModel = input.optimizedModel?.trim();
  const model = input.model?.trim();
  if (!optimizedModel || !model || optimizedModel !== model) {
    return false;
  }

  if (input.optimizedProfile == null) {
    return false;
  }

  if (
    normalizeQueueQualityProfile(input.optimizedProfile) !==
    normalizeQueueQualityProfile(input.qualityProfile)
  ) {
    return false;
  }

  // Only perform expensive hash matching when all other checks pass
  return workflowHashMatches(input.workflow, input.contentHash);
}

export type WorkflowQueueAudit = {
  nodeCount: number;
  placeholders: ReturnType<typeof detectWorkflowPlaceholders>;
  hasPositivePlaceholder: boolean;
  hasLatentSizeBinding: boolean;
  hasSamplerBinding: boolean;
  hasCheckpointBinding: boolean;
  hasInputImageBinding: boolean;
  warnings: string[];
};

export type WorkflowQueueOptimizeChange = {
  kind: 'binding' | 'audit';
  severity: 'info' | 'warn';
  message: string;
};

export type WorkflowQueueOptimizeResult = {
  workflow: Record<string, unknown>;
  workflowJson: string;
  bindingChanges: WorkflowBindingChange[];
  changes: WorkflowQueueOptimizeChange[];
  audit: WorkflowQueueAudit;
  contentHash?: string;
};

const CHECKPOINT_LOADER_TYPES = new Set(['CheckpointLoaderSimple', 'CheckpointLoader']);

const UNET_LOADER_TYPES = new Set(['UNETLoader', 'UnetLoaderGGUF']);

function countToken(raw: string, token: string): number {
  if (!token) {
    return 0;
  }
  let count = 0;
  let index = raw.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = raw.indexOf(token, index + token.length);
  }
  return count;
}

function workflowHasLoaderType(
  parsed: Record<string, { class_type?: string }>,
  loaderTypes: Set<string>
): boolean {
  return Object.values(parsed).some(node => loaderTypes.has(node.class_type ?? ''));
}

export function auditWorkflowStructure(
  workflowJson: string,
  tokens: WorkflowPlaceholderTokens
): WorkflowQueueAudit {
  const placeholders = detectWorkflowPlaceholders(workflowJson, tokens);
  let parsed: Record<string, { class_type?: string }> = {};
  try {
    parsed = JSON.parse(workflowJson) as Record<string, { class_type?: string }>;
  } catch {
    return {
      nodeCount: 0,
      placeholders,
      hasPositivePlaceholder: placeholders.positive > 0,
      hasLatentSizeBinding: placeholders.width > 0 && placeholders.height > 0,
      hasSamplerBinding: placeholders.seed > 0 && placeholders.steps > 0 && placeholders.cfg > 0,
      hasCheckpointBinding: false,
      hasInputImageBinding: placeholders.inputImage > 0,
      warnings: ['Workflow JSON is invalid.'],
    };
  }

  const nodeCount = listWorkflowNodeIds(parsed).length;
  const hasPositivePlaceholder = placeholders.positive > 0;
  const hasLatentSizeBinding = placeholders.width > 0 && placeholders.height > 0;
  const hasSamplerBinding = placeholders.seed > 0 && placeholders.steps > 0 && placeholders.cfg > 0;
  const hasCheckpointToken =
    countToken(workflowJson, DEFAULT_CHECKPOINT_TOKEN) > 0 ||
    countToken(workflowJson, DEFAULT_UNET_TOKEN) > 0;
  const hasLoaderNodes =
    workflowHasLoaderType(parsed, CHECKPOINT_LOADER_TYPES) ||
    workflowHasLoaderType(parsed, UNET_LOADER_TYPES);
  const hasCheckpointBinding = !hasLoaderNodes || hasCheckpointToken;
  const hasInputImageBinding = placeholders.inputImage > 0;

  const warnings: string[] = [];
  if (!hasPositivePlaceholder) {
    warnings.push(
      `No ${tokens.positive} placeholder — prompt injection may rely on CLIP heuristics only.`
    );
  }
  if (!hasLatentSizeBinding) {
    warnings.push(
      'Latent width/height placeholders missing — direct patch will still set EmptyLatentImage when enabled.'
    );
  }
  if (!hasSamplerBinding) {
    warnings.push(
      'Sampler placeholders missing — KSampler nodes are patched directly from queue params.'
    );
  }
  if (!hasCheckpointBinding) {
    warnings.push(
      'Checkpoint/UNET loader present without {{CHECKPOINT}}/{{UNET}} — set model checkpoint map or save an optimized copy with bindings.'
    );
  }

  return {
    nodeCount,
    placeholders,
    hasPositivePlaceholder,
    hasLatentSizeBinding,
    hasSamplerBinding,
    hasCheckpointBinding,
    hasInputImageBinding,
    warnings,
  };
}

export function suggestedOptimizedWorkflowName(baseName: string): string {
  const trimmed = baseName.trim() || 'workflow';
  if (/\(optimized\)$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} (optimized)`;
}

function filterMappingsForOptimize(
  workflowJson: string,
  mappings: ReturnType<typeof suggestWorkflowNodeMappings>,
  tokens: WorkflowPlaceholderTokens
): ReturnType<typeof suggestWorkflowNodeMappings> {
  let parsed: Record<string, { inputs?: Record<string, unknown> }> = {};
  try {
    parsed = JSON.parse(workflowJson) as Record<string, { inputs?: Record<string, unknown> }>;
  } catch {
    return [];
  }

  return mappings.filter(mapping => {
    if (!mapping.suggestedBinding || mapping.suggestedBinding === 'custom') {
      return false;
    }

    const inputs = parsed[mapping.nodeId]?.inputs;
    if (!inputs) {
      return false;
    }

    if (mapping.suggestedBinding === 'positive') {
      const promptField = resolvePromptEncodeTextField(inputs);
      const field = promptField ?? (typeof inputs.text === 'string' ? 'text' : null);
      if (field && typeof inputs[field] === 'string') {
        const text = inputs[field] as string;
        if (text.includes(tokens.positive) || text.includes(tokens.negative)) {
          return false;
        }
      }
    }

    if (mapping.suggestedBinding === 'negative') {
      const promptField = resolvePromptEncodeTextField(inputs);
      const field = promptField ?? (typeof inputs.text === 'string' ? 'text' : null);
      if (field && typeof inputs[field] === 'string') {
        const text = inputs[field] as string;
        if (text.includes(tokens.negative) || text.includes(tokens.positive)) {
          return false;
        }
      }
    }

    if (mapping.suggestedBinding === 'sampler') {
      const seed = inputs.seed;
      const steps = inputs.steps;
      const cfg = inputs.cfg;
      if (
        typeof seed === 'string' &&
        seed.includes(tokens.seed) &&
        typeof steps === 'string' &&
        steps.includes(tokens.steps) &&
        typeof cfg === 'string' &&
        cfg.includes(tokens.cfg)
      ) {
        return false;
      }
    }

    if (mapping.suggestedBinding === 'latent') {
      const width = inputs.width;
      const height = inputs.height;
      if (
        typeof width === 'string' &&
        width.includes(tokens.width) &&
        typeof height === 'string' &&
        height.includes(tokens.height)
      ) {
        return false;
      }
    }

    if (mapping.suggestedBinding === 'controlNetLoader') {
      const value = inputs.control_net_name;
      if (typeof value === 'string' && value.includes('{{CONTROLNET')) {
        return false;
      }
    }

    if (mapping.suggestedBinding === 'loraLoader') {
      const value = inputs.lora_name;
      if (typeof value === 'string' && /^\{\{LORA_/.test(value.trim())) {
        return false;
      }
      if (typeof value === 'string' && value.trim() && /\.safetensors$/i.test(value.trim())) {
        return false;
      }
    }

    if (mapping.suggestedBinding === 'controlImage') {
      const value = inputs.image;
      if (typeof value === 'string' && value.includes('{{CONTROL_IMAGE}}')) {
        return false;
      }
    }

    return true;
  });
}

function workflowUsesCastcutPlaceholders(
  workflowJson: string,
  tokens: WorkflowPlaceholderTokens
): boolean {
  const placeholders = detectWorkflowPlaceholders(workflowJson, tokens);
  return (
    placeholders.positive > 0 ||
    placeholders.negative > 0 ||
    placeholders.seed > 0 ||
    placeholders.steps > 0 ||
    placeholders.width > 0 ||
    placeholders.height > 0 ||
    countToken(workflowJson, DEFAULT_CHECKPOINT_TOKEN) > 0 ||
    countToken(workflowJson, DEFAULT_UNET_TOKEN) > 0
  );
}

function workflowIsFullyBound(audit: WorkflowQueueAudit): boolean {
  return (
    audit.hasPositivePlaceholder &&
    audit.hasLatentSizeBinding &&
    audit.hasSamplerBinding &&
    audit.hasCheckpointBinding
  );
}

export function optimizeWorkflowForQueue(input: {
  workflow: Record<string, unknown>;
  tokens: WorkflowPlaceholderTokens;
  model?: string;
  qualityProfile?: QueueQualityProfile;
  upscaleModelFilename?: string;
  refinerCheckpointFilename?: string;
  enabled?: boolean;
  enrichGraph?: boolean;
  enrichSdxlRefiner?: boolean;
  enrichNeuralPolish?: boolean;
  enrichSharpen?: boolean;
  loraBindTokens?: string[];
  /** When set and matches current workflow hash, skip re-binding if already fully bound. */
  contentHash?: string;
  skipIfUnchanged?: boolean;
  /** Model id used when lastOptimizedHash was written — required for full early-exit. */
  optimizedModel?: string;
  /** Quality profile used when lastOptimizedHash was written — required for full early-exit. */
  optimizedProfile?: QueueQualityProfile;
  availableUpscaleModels?: string[] | null;
  availableCheckpoints?: string[] | null;
  supportsNeuralUpscaleTileSize?: boolean;
  /** ComfyUI object_info node class names — used to pick WebP save nodes for Draft. */
  availableNodeTypes?: Iterable<string> | null;
  /** Live object_info WebP save adapters (from format combo discovery). */
  webpSaveAdapters?: import('./workflow-save-format').WebpSaveAdapter[] | null;
  /** When true (default), Draft queues prefer WebP save nodes when installed. */
  compactDraftSaves?: boolean;
  /** When true, Edit-2511 Lightning still skips Final/Max Lanczos (native decode). */
  hasInputImage?: boolean;
}): WorkflowQueueOptimizeResult {
  const enabled = input.enabled !== false;
  const enrichGraph = input.enrichGraph !== false;
  const loraBindTokens =
    input.loraBindTokens ??
    (typeof window !== 'undefined'
      ? listLoraBindTokens(
          mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings()).customTokens ?? []
        )
      : []);
  const changes: WorkflowQueueOptimizeChange[] = [];

  // Library-optimized graphs: skip bind/enrich/sampling when hash+model+profile match.
  // Still apply save-format so Draft can pick up live WebP adapters.
  if (canSkipFullOptimize(input)) {
    const saveFormatPatch = patchWorkflowSaveFormat({
      workflow: input.workflow,
      qualityProfile: input.qualityProfile,
      compactDraftSaves: input.compactDraftSaves,
      availableNodeTypes: input.availableNodeTypes,
      webpSaveAdapters: input.webpSaveAdapters,
    });
    const workflow = saveFormatPatch.workflow;
    changes.push(...saveFormatPatch.changes);
    changes.push({
      kind: 'audit',
      severity: 'info',
      message:
        'Skipped full optimize — workflow hash, model, and quality profile unchanged since last Optimize all.',
    });
    const workflowJson = stringifyWorkflowPretty(workflow);
    const audit = auditWorkflowStructure(stringifyWorkflowCompact(workflow), input.tokens);
    for (const warning of audit.warnings) {
      changes.push({
        kind: 'audit',
        severity: 'warn',
        message: warning,
      });
    }
    return {
      workflow,
      workflowJson,
      bindingChanges: [],
      changes,
      audit,
      contentHash: workflowObjectContentHash(workflow),
    };
  }

  const qwenClipRepair = repairQwenImageClipLoaderNodes(input.workflow);
  let workflow = qwenClipRepair.workflow;
  const latentNormalize = normalizeEmptyLatentForModel(workflow, input.model);
  workflow = latentNormalize.workflow;
  let workflowJson = stringifyWorkflowCompact(workflow);
  if (qwenClipRepair.repairedNodeIds.length > 0) {
    changes.push({
      kind: 'audit',
      severity: 'info',
      message: `Repaired Qwen CLIP loader on node(s) ${qwenClipRepair.repairedNodeIds.join(', ')} — Qwen Image uses CLIPLoader (type qwen_image), not DualCLIPLoader.`,
    });
  }
  if (latentNormalize.converted > 0) {
    changes.push({
      kind: 'audit',
      severity: 'info',
      message: `Converted ${latentNormalize.converted} empty-latent node(s) to the correct family for ${input.model ?? 'model'}.`,
    });
  }

  // Lightning: keep the imported graph intact (no auto-bind / sampling / refiner).
  // Sampler CFG/steps are forced at inject time. Prep strips community/leftover
  // UltraSharp + Lanczos. 2512 Final/Max get a blur-only decode polish.
  if (isQwenLightningModel(input.model)) {
    const wantsLightningGraphEnrich =
      enabled && enrichGraph && profileUsesUpscaleEnrich(input.qualityProfile);

    let skipLightningGraphEnrich = false;
    if (wantsLightningGraphEnrich && input.skipIfUnchanged && input.contentHash) {
      if (
        workflowHashMatches(workflow, input.contentHash) &&
        workflowHasCastcutQueueEnrich(workflow)
      ) {
        skipLightningGraphEnrich = true;
      }
    }

    if (wantsLightningGraphEnrich && !skipLightningGraphEnrich) {
      const enriched = enrichWorkflowGraph({
        workflow,
        tokens: input.tokens,
        model: input.model,
        qualityProfile: input.qualityProfile,
        enrichSampling: false,
        enrichSdxlRefiner: false,
        enrichSharpen: false,
        enrichNeuralPolish: false,
        hasInputImage: input.hasInputImage,
      });
      workflow = enriched.workflow;
      changes.push(...enriched.changes);
    } else if (skipLightningGraphEnrich) {
      changes.push({
        kind: 'audit',
        severity: 'info',
        message:
          'Skipped Lightning output re-enrich — workflow hash unchanged and Castcut polish markers present.',
      });
    }

    const saveFormatPatch = patchWorkflowSaveFormat({
      workflow,
      qualityProfile: input.qualityProfile,
      compactDraftSaves: input.compactDraftSaves,
      availableNodeTypes: input.availableNodeTypes,
      webpSaveAdapters: input.webpSaveAdapters,
    });
    workflow = saveFormatPatch.workflow;
    changes.push(...saveFormatPatch.changes);
    const workflowJsonLightning = stringifyWorkflowPretty(workflow);
    const auditLightning = auditWorkflowStructure(stringifyWorkflowCompact(workflow), input.tokens);
    for (const warning of auditLightning.warnings) {
      changes.push({
        kind: 'audit',
        severity: 'warn',
        message: warning,
      });
    }
    changes.push({
      kind: 'audit',
      severity: 'info',
      message: wantsLightningGraphEnrich
        ? 'Lightning queue: skipped auto-bind — native Comfy graph; 2512 uses blur polish instead of upscale.'
        : 'Lightning queue: skipped auto-bind/enrich — using workflow as exported from ComfyUI.',
    });
    return {
      workflow,
      workflowJson: workflowJsonLightning,
      bindingChanges: [],
      changes,
      audit: auditLightning,
      contentHash: workflowObjectContentHash(workflow),
    };
  }

  let skipBinding = false;
  if (input.skipIfUnchanged && input.contentHash) {
    if (workflowHashMatches(workflow, input.contentHash)) {
      const audit = auditWorkflowStructure(workflowJson, input.tokens);
      // Bindings are stable — Final/Max enrich still depends on queue quality profile.
      skipBinding = workflowIsFullyBound(audit);
    }
  }

  let bindingChanges: WorkflowBindingChange[] = [];
  const usesCastcutPlaceholders = workflowUsesCastcutPlaceholders(workflowJson, input.tokens);

  if (enabled && !skipBinding) {
    const initialAudit = auditWorkflowStructure(workflowJson, input.tokens);
    if (!workflowIsFullyBound(initialAudit)) {
      const mappings = filterMappingsForOptimize(
        workflowJson,
        suggestWorkflowNodeMappings(workflowJson),
        input.tokens
      );

      if (mappings.length > 0) {
        const applied = applyWorkflowNodeBindings(workflowJson, mappings, input.tokens, {
          loraBindTokens: usesCastcutPlaceholders ? loraBindTokens : [],
        });
        if (applied.changes.length > 0) {
          workflowJson = applied.json;
          bindingChanges = applied.changes;
          changes.push({
            kind: 'binding',
            severity: 'info',
            message: `Auto-bound ${applied.changes.length} workflow field(s) for queue takeover.`,
          });
        }
      }
    }
  }

  workflow = JSON.parse(workflowJson) as Record<string, unknown>;

  // Lightning uses the early-return path above (Lanczos-only for Final/Max).
  const shouldEnrichGraph =
    enrichGraph && !isQwenLightningModel(input.model) && !isDistilledFewStepImageModel(input.model);

  // Batch queue: when bindings are stable and enrich markers already exist, skip re-enrich.
  const skipEnrich =
    skipBinding &&
    input.skipIfUnchanged &&
    (!profileUsesUpscaleEnrich(input.qualityProfile) || workflowHasCastcutQueueEnrich(workflow));

  if (enabled && shouldEnrichGraph && !skipEnrich) {
    const enriched = enrichWorkflowGraph({
      workflow,
      tokens: input.tokens,
      model: input.model,
      qualityProfile: input.qualityProfile,
      upscaleModelFilename: input.upscaleModelFilename,
      refinerCheckpointFilename: input.refinerCheckpointFilename,
      enrichSdxlRefiner: input.enrichSdxlRefiner,
      enrichNeuralPolish: input.enrichNeuralPolish,
      // Sharpen on Lightning tends to halo — keep Final/Max soft scale only.
      enrichSharpen: isQwenLightningModel(input.model) ? false : input.enrichSharpen,
      enrichSampling: !isQwenLightningModel(input.model),
      availableUpscaleModels: input.availableUpscaleModels,
      availableCheckpoints: input.availableCheckpoints,
      supportsNeuralUpscaleTileSize: input.supportsNeuralUpscaleTileSize,
      hasInputImage: input.hasInputImage,
    });
    workflow = enriched.workflow;
    workflowJson = stringifyWorkflowCompact(workflow);
    changes.push(...enriched.changes);
  } else if (skipEnrich && shouldEnrichGraph) {
    changes.push({
      kind: 'audit',
      severity: 'info',
      message: 'Skipped re-enrich — workflow hash unchanged and Castcut enrich markers present.',
    });
  }

  if (input.model) {
    const samplingParams = resolveModelSamplingParams(
      input.model,
      resolveEffectiveSamplerPreset('base', input.qualityProfile, {
        model: input.model,
      })
    );
    const samplingPatch = patchModelSamplingInWorkflow(workflow, samplingParams, input.model);
    const patchedFields = Object.values(samplingPatch.patched).reduce(
      (sum, count) => sum + (count ?? 0),
      0
    );
    if (patchedFields > 0) {
      workflow = samplingPatch.workflow;
      workflowJson = stringifyWorkflowCompact(workflow);
      changes.push({
        kind: 'binding',
        severity: 'info',
        message: 'Resolved model-sampling placeholders (shift / Flux max-base).',
      });
    }
  }

  const saveFormatPatch = patchWorkflowSaveFormat({
    workflow,
    qualityProfile: input.qualityProfile,
    compactDraftSaves: input.compactDraftSaves,
    availableNodeTypes: input.availableNodeTypes,
    webpSaveAdapters: input.webpSaveAdapters,
  });
  workflow = saveFormatPatch.workflow;
  workflowJson = stringifyWorkflowCompact(workflow);
  if (saveFormatPatch.changes.length > 0) {
    changes.push(...saveFormatPatch.changes);
  }

  const audit = auditWorkflowStructure(workflowJson, input.tokens);
  for (const warning of audit.warnings) {
    changes.push({
      kind: 'audit',
      severity: 'warn',
      message: warning,
    });
  }

  return {
    workflow,
    workflowJson: stringifyWorkflowPretty(workflow),
    bindingChanges,
    changes,
    audit,
    /** Object hash of the fully optimized graph — persist as lastOptimizedHash. */
    contentHash: workflowObjectContentHash(workflow),
  };
}
