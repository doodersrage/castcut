import { resolveComfyUiConfig } from './comfyui-client';
import { resolveActiveLoraStack } from './lora-stack';
import {
  injectPromptsWithFallbacks,
  resolveQueueInjectionContext,
  stripEmptyComfyUiRuntime,
  resolveWorkflowGraphEnrichOptions,
  type ComfyUiRuntimeConfig,
  type WorkflowParamValues,
} from './comfyui-config';
import { type WorkflowPlaceholderAuditIssue } from './workflow-placeholder-audit';
import { optimizeWorkflowForQueue } from './workflow-queue-optimizer';
import type { ComfyUiModelLists } from './comfyui-object-info';
import { collectWorkflowGraphPreflightIssues } from './workflow-preflight-core';
import { resolveUpscaleModelFilename } from './model-upscale-map';
import { resolveRefinerFilenameForModel } from './model-checkpoint-map';
import { loadSettingsCache } from './settings-cache';
import { mergeLoraLibraryIntoCustomTokens, loadComfyUiSettings } from './comfyui-settings';

export type WorkflowPreviewInventory = {
  models?: ComfyUiModelLists | null;
  supportsNeuralUpscaleTileSize?: boolean;
  objectInfoUnavailable?: boolean;
  nodeTypes?: Iterable<string> | null;
  webpSaveAdapters?: import('./workflow-save-format').WebpSaveAdapter[] | null;
};

export type WorkflowPreviewInput = {
  prompt: string;
  negativePrompt?: string;
  params?: WorkflowParamValues;
  comfy?: ComfyUiRuntimeConfig;
  model?: string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
  /**
   * Return the whole prepared graph. Previews shown on screen are cut at 6k characters; checks
   * that read the graph (LoRA stack, loader maps) need all of it.
   */
  fullWorkflow?: boolean;
  inventory?: WorkflowPreviewInventory;
};

export type WorkflowPreviewSnippet = {
  path: string;
  value: string;
};

export type WorkflowPreviewResult = {
  ok: boolean;
  error?: string;
  workflowSource?: 'client' | 'env' | 'minimal' | 'none';
  replacements?: {
    positive: number;
    negative: number;
    params: Partial<Record<keyof WorkflowParamValues, number>>;
    custom?: Record<string, number>;
  };
  resolvedParams?: WorkflowParamValues;
  snippets?: WorkflowPreviewSnippet[];
  workflowJson?: string;
  truncated?: boolean;
  preflightIssues?: WorkflowPlaceholderAuditIssue[];
  queueOptimizeChanges?: string[];
};

function findValuePaths(
  value: unknown,
  needle: string,
  path = '',
  limit = 6
): WorkflowPreviewSnippet[] {
  if (!needle || limit <= 0) {
    return [];
  }

  const snippets: WorkflowPreviewSnippet[] = [];

  if (typeof value === 'string') {
    if (value.includes(needle)) {
      snippets.push({
        path: path || 'root',
        value: value.length > 160 ? `${value.slice(0, 160)}…` : value,
      });
    }
    return snippets;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      snippets.push(
        ...findValuePaths(value[index], needle, `${path}[${index}]`, limit - snippets.length)
      );
      if (snippets.length >= limit) {
        break;
      }
    }
    return snippets;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      snippets.push(...findValuePaths(entry, needle, nextPath, limit - snippets.length));
      if (snippets.length >= limit) {
        break;
      }
    }
  }

  return snippets;
}

const MAX_PREVIEW_CHARS = 6000;

export function previewWorkflowInjection(input: WorkflowPreviewInput): WorkflowPreviewResult {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { ok: false, error: 'Prompt is required.' };
  }

  const runtime = stripEmptyComfyUiRuntime(input.comfy);
  const config = resolveComfyUiConfig(runtime);

  if (!config.workflow) {
    const { params: resolvedParams } = resolveQueueInjectionContext({
      runtime,
      override: input.params,
      model: input.model ?? runtime?.queueTargetModel,
    });
    return {
      ok: true,
      workflowSource: 'minimal',
      replacements: { positive: 1, negative: 0, params: {} },
      resolvedParams,
      snippets: [{ path: 'minimal.prompt', value: prompt.slice(0, 160) }],
      workflowJson: JSON.stringify(
        { note: 'Minimal fallback workflow (no custom workflow configured)' },
        null,
        2
      ),
    };
  }

  const {
    params: resolvedParams,
    loaders,
    customTokens: runtimeTokens,
  } = resolveQueueInjectionContext({
    runtime,
    override: input.params,
    model: input.model ?? runtime?.queueTargetModel,
    workflow: config.workflow,
  });

  const modelId = input.model ?? runtime?.queueTargetModel ?? 'qwen-image-2512';
  const shared = loadSettingsCache().shared;
  const settings = mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings(), {
    activeOnly: true,
  });
  const inventoryModels = input.inventory?.models;

  // Settings → runtime merged tokens → per-workflow overrides (last wins).
  const customTokenByKey = new Map<string, { token: string; value: string }>();
  for (const entry of [
    ...(settings.customTokens ?? []),
    ...runtimeTokens,
    ...(runtime?.workflowCustomTokens ?? []),
  ]) {
    const token = entry.token?.trim();
    const value = entry.value?.trim();
    if (token && value) {
      customTokenByKey.set(token, { token, value });
    }
  }
  const customTokens = [...customTokenByKey.values()];

  if (inventoryModels?.upscaleModels?.length) {
    const upscale = resolveUpscaleModelFilename(modelId, {
      upscaleMap: shared.modelUpscaleMap,
      customTokens: settings.customTokens,
      availableUpscaleModels: inventoryModels.upscaleModels,
    });
    if (upscale) {
      resolvedParams.upscaleModelFilename = upscale;
    }
  }
  if (inventoryModels?.checkpoints?.length) {
    const refiner = resolveRefinerFilenameForModel(modelId, {
      refinerMap: shared.modelRefinerMap,
      customTokens: settings.customTokens,
      availableCheckpoints: inventoryModels.checkpoints,
    });
    if (refiner) {
      resolvedParams.refinerCheckpointFilename = refiner;
    }
  }

  const optimized =
    runtime?.workflowQueueOptimize !== false
      ? optimizeWorkflowForQueue({
          workflow: config.workflow,
          tokens: config.placeholderTokens,
          model: modelId,
          qualityProfile: runtime?.queueQualityProfile,
          upscaleModelFilename: resolvedParams.upscaleModelFilename,
          refinerCheckpointFilename: resolvedParams.refinerCheckpointFilename,
          skipIfUnchanged: true,
          contentHash: runtime?.workflowOptimizedHash,
          optimizedModel: runtime?.workflowOptimizedModel,
          optimizedProfile: runtime?.workflowOptimizedProfile,
          availableUpscaleModels: inventoryModels?.upscaleModels,
          availableCheckpoints: inventoryModels?.checkpoints,
          supportsNeuralUpscaleTileSize: input.inventory?.supportsNeuralUpscaleTileSize,
          availableNodeTypes: input.inventory?.nodeTypes,
          webpSaveAdapters: input.inventory?.webpSaveAdapters,
          compactDraftSaves: runtime?.compactDraftSaves,
          ...resolveWorkflowGraphEnrichOptions(runtime),
        })
      : {
          workflow: config.workflow,
          changes: [] as import('./workflow-queue-optimizer').WorkflowQueueOptimizeChange[],
        };

  const injected = injectPromptsWithFallbacks(
    optimized.workflow,
    {
      positive: prompt,
      negative: input.negativePrompt,
      params: resolvedParams,
      customTokens,
    },
    config.placeholderTokens,
    {
      legacyPositiveNodeId: config.legacyPositiveNodeId,
      legacyNegativeNodeId: config.legacyNegativeNodeId,
      directWorkflowPatching: runtime?.directWorkflowPatching,
      syncWorkflowLoadersToModel: runtime?.syncWorkflowLoadersToModel,
      loaders,
      model: modelId,
      availableCheckpoints: inventoryModels?.checkpoints,
      availableUnets: inventoryModels?.unets,
      availableVaes: inventoryModels?.vaes,
      availableClips: inventoryModels?.clips,
      availableLoras: inventoryModels?.loras,
      qualityProfile: runtime?.queueQualityProfile,
      // The browser forwards its session-filtered library on the runtime; the server has no
      // LoRA settings of its own, so without this previews were built with no LoRAs at all.
      loraLibrary: runtime?.loraLibrary ?? settings.loraLibrary,
      samplerOverrides: runtime?.modelSamplerOverrides,
      // Same renderer swaps as the queue (Engine → Qwen-Image 2.1, LTX-2.5 clips), so the
      // preview — and the engine health check that reads it — shows the graph that renders.
      availableNodeTypes: input.inventory?.nodeTypes,
      qwenRenderer: runtime?.qwenRenderer,
      qwenImage21FourStep: runtime?.qwenImage21FourStep,
      qwenImage21EightStep: runtime?.qwenImage21EightStep,
      videoRenderer: runtime?.videoRenderer,
    }
  );

  const snippets: WorkflowPreviewSnippet[] = [...findValuePaths(injected.workflow, prompt, '', 3)];

  if (input.negativePrompt?.trim()) {
    snippets.push(...findValuePaths(injected.workflow, input.negativePrompt.trim(), '', 2));
  }

  // One line per place: two params with the same value (width and height on a square canvas)
  // each found the first match, so the list repeated "6.inputs.width → 1328".
  const shownPaths = new Set(snippets.map(snippet => snippet.path));
  for (const value of Object.values(resolvedParams)) {
    // Exact matches only when looking past the first place: "8" (steps) is also inside
    // "model_fp8_v1.safetensors", which is not a place the value was put.
    const next = findValuePaths(injected.workflow, String(value), '', 12).find(
      snippet => !shownPaths.has(snippet.path) && snippet.value === String(value)
    );
    if (next) {
      shownPaths.add(next.path);
      snippets.push(next);
    }
    if (snippets.length >= 8) {
      break;
    }
  }

  const workflowJson = JSON.stringify(injected.workflow, null, 2);
  const truncated = !input.fullWorkflow && workflowJson.length > MAX_PREVIEW_CHARS;
  const model = modelId;
  const optimizerWarnings: WorkflowPlaceholderAuditIssue[] = (optimized.changes ?? [])
    .filter(change => change.severity === 'warn')
    .map(change => ({ severity: 'warn' as const, message: change.message }));
  const preflightIssues =
    config.workflowSource === 'none'
      ? []
      : [
          ...optimizerWarnings,
          ...collectWorkflowGraphPreflightIssues({
            workflowJson,
            model,
            hasInputImage: input.hasInputImage ?? Boolean(resolvedParams.inputImageFilename),
            hasMaskImage: input.hasMaskImage ?? Boolean(resolvedParams.maskImageFilename),
            syncWorkflowLoadersToModel: runtime?.syncWorkflowLoadersToModel,
            models: inventoryModels,
            objectInfoUnavailable: input.inventory?.objectInfoUnavailable === true,
            customTokens,
            stackLoraFilenames: resolveActiveLoraStack(
              runtime?.loraLibrary ?? settings.loraLibrary
            ).map(entry => entry.filename),
          }),
        ];

  const queueOptimizeChanges = optimized.changes
    ?.filter(change => change.severity === 'info')
    .map(change => change.message);

  return {
    ok: true,
    workflowSource: config.workflowSource,
    replacements: {
      positive: injected.positiveReplacements,
      negative: injected.negativeReplacements,
      params: injected.paramReplacements,
      custom: injected.customReplacements,
    },
    resolvedParams,
    snippets: snippets.slice(0, 8),
    workflowJson: truncated ? `${workflowJson.slice(0, MAX_PREVIEW_CHARS)}\n…` : workflowJson,
    truncated,
    preflightIssues,
    queueOptimizeChanges,
  };
}
