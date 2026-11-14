/**
 * What the page's sendComfyUi (usePromptResultComfyUiQueueSingle) sends POST /api/comfyui, built
 * on the server (FINISHING_PLAN Phase 3) — local ComfyUI only, from settings passed in. The same
 * steps in the same order: the queue engine, the runtime, the VRAM guard, the prompts (LoRA
 * trigger of the character passed in), the pictures (filenames as given; URLs uploaded with
 * `upload`), the queue params. Not here, by design: Studio plugins' queue hooks (the page's; with
 * none, the job's own denoise and cfg are applied as the page applies them), the
 * workflow preflight's node install, holding a Max job until idle, saving prompt history, live
 * previews. Checked against the page in the golden take requests (e2e/scene.spec.ts).
 */
import type { AthleticSport } from '../scene/athletic-sport-profiles';
import type { CharacterRecord } from '../character/os';
import type { ComfyUiModelLists } from '../comfyui/object-info';
import type { ComfyImageModel } from '../comfy-models/client';
import { parseWorkflowJson } from '../comfyui/config';
import type { ComfyUiQueueRequest } from '../comfyui/queue-take-server';
import { resolveRuntimeForQueueAsync } from '../comfyui/runtime-for-model';
import { injectLoraTriggers } from '../lora/prompt-injection';
import { MAX_INPUT_IMAGE_FILENAMES } from '../workflow/load-image-bindings';
import type { ResolveQueueParamsOptions } from './params-settings';
import { prepareQueuePrompts } from './prompt-prep';
import { resolveModelForQueueTool } from './tool-model';
import { guardQueueQualityForVram, type VramSnapshot } from './vram-queue-guard';
import { buildQueueSingleParams } from '@/hooks/prompt-result/queue-single-params';
import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';

export type ServerQueueSettings = NonNullable<ResolveQueueParamsOptions['settings']>;

export type ServerQueueContext = {
  settings: ServerQueueSettings;
  /** ComfyUI's models (object_info), fetched by the caller; null: not known. */
  inventory?: ComfyUiModelLists | null;
  /** Whose LoRA trigger leads the prompt (the page: its active Cast member). */
  character?: CharacterRecord;
  /** The card's free VRAM (ComfyUI's /system_stats); none: the guard keeps the profile. */
  readVram?: (comfyUrl?: string) => Promise<VramSnapshot | null>;
  /** A picture URL put in ComfyUI's input folder: its name there and its size. */
  upload?: (
    url: string
  ) => Promise<{ filename: string; width?: number; height?: number } | null | undefined>;
};

/** The page's queue config: the tool's model, tool and hints (PromptResultActionsConfig). */
export type ServerQueueConfig = { model: string; tool: string; hints?: string };

export async function buildServerQueueRequest(
  prompt: string,
  options: SendComfyUiOptions | undefined,
  config: ServerQueueConfig,
  ctx: ServerQueueContext,
  sport?: AthleticSport | null
): Promise<ComfyUiQueueRequest> {
  const { settings } = ctx;
  const shared = settings.shared;
  const effectiveTool = options?.queueTool ?? config.tool;
  const requestedModel = (options?.queueModel ?? config.model) as ComfyImageModel;
  const queueModel = resolveModelForQueueTool(requestedModel, effectiveTool);

  const baseRuntime = await resolveRuntimeForQueueAsync(requestedModel, effectiveTool, {
    ...(options?.sessionActiveLoraIds
      ? { sessionActiveLoraIds: options.sessionActiveLoraIds }
      : {}),
    ...(options?.sessionLoraStrengthOverrides
      ? { sessionLoraStrengthOverrides: options.sessionLoraStrengthOverrides }
      : {}),
    ...(options?.identityLock ? { skipFaceChangingLoras: true } : {}),
    ...(typeof options?.kleinColorAnchorMax === 'number'
      ? { kleinColorAnchorMax: options.kleinColorAnchorMax }
      : {}),
    settings,
    inventory: ctx.inventory ?? null,
  });
  const vramGuard = await guardQueueQualityForVram({
    profile: options?.qualityProfile ?? baseRuntime.queueQualityProfile,
    runtime: baseRuntime,
    settings: { shared },
    readVram: ctx.readVram ?? (async () => null),
  });
  let runtime = { ...(vramGuard.runtime ?? baseRuntime) };
  let effectiveQualityProfile = vramGuard.profile;
  if (options?.draftPreviewLite) {
    runtime = {
      ...runtime,
      queueQualityProfile: 'draft',
      workflowGraphEnrich: false,
      compactDraftSaves: true,
    };
    effectiveQualityProfile = 'draft';
  }
  if (options?.customTokens?.length) {
    const byToken = new Map((runtime.customTokens ?? []).map(entry => [entry.token, entry]));
    for (const entry of options.customTokens) {
      if (entry.token?.trim() && entry.value?.trim()) {
        byToken.set(entry.token.trim(), { token: entry.token.trim(), value: entry.value.trim() });
      }
    }
    runtime.customTokens = [...byToken.values()];
  }
  if (options?.regionalSlots?.length) {
    runtime.regionalSlots = options.regionalSlots;
  }

  const { positive, negative } = await prepareQueuePrompts({
    model: queueModel,
    positive: injectLoraTriggers(prompt, { character: ctx.character }),
    hints: options?.queueHints ?? config.hints,
    sport,
    tool: effectiveTool,
    explicitNegative: options?.explicitNegative,
    embeddingTokens: shared.sessionEmbeddingTokens,
    turboEditStrength: options?.turboEditStrength ?? shared.turboEditStrength,
    settings: { shared, comfyUi: settings.comfyUi },
  });

  // The pictures: named files as given; a URL is uploaded (the page uploads it even when a
  // filename rides along), and Image 1's size is what ComfyUI got.
  let inputImageFilename = options?.inputImageFilename?.trim();
  let uploadedFigureSize: { width: number; height: number } | undefined;
  const filenames: string[] = (options?.inputImageFilenames ?? []).map(name => name?.trim() ?? '');
  while (filenames.length < MAX_INPUT_IMAGE_FILENAMES) filenames.push('');
  if (options?.inputImage) {
    throw new Error('The server queues pictures by filename or URL, not a File.');
  }
  const imageOneUrl = options?.inputImageUrl?.trim();
  if (imageOneUrl) {
    const uploaded = await ctx.upload?.(imageOneUrl);
    inputImageFilename = uploaded?.filename;
    if (uploaded?.width && uploaded?.height) {
      uploadedFigureSize = { width: uploaded.width, height: uploaded.height };
    }
  }
  if (inputImageFilename) filenames[0] = inputImageFilename;
  for (let i = 1; i < MAX_INPUT_IMAGE_FILENAMES; i += 1) {
    const url = options?.inputImageUrls?.[i]?.trim();
    if (!url) continue;
    const uploaded = await ctx.upload?.(url);
    if (uploaded?.filename) filenames[i] = uploaded.filename;
  }
  const inputImageFilenames = filenames.map(name => name.trim());
  while (inputImageFilenames.length > 0 && !inputImageFilenames[inputImageFilenames.length - 1]) {
    inputImageFilenames.pop();
  }
  if (!inputImageFilename && inputImageFilenames[0]) inputImageFilename = inputImageFilenames[0];
  // Control images as the page lays them out: the named first one in slot 0, then the rest.
  let controlImageFilename = options?.controlImageFilename?.trim();
  const controlSlots = (options?.controlImageFilenames ?? []).map(name => name?.trim() ?? '');
  while (controlSlots.length < 4) controlSlots.push('');
  if (controlImageFilename) controlSlots[0] = controlImageFilename;
  const controlImageFilenames = controlSlots.filter(Boolean);
  if (!controlImageFilename && controlImageFilenames[0])
    controlImageFilename = controlImageFilenames[0];

  const workflow = runtime.workflowJson?.trim()
    ? (parseWorkflowJson(runtime.workflowJson) ?? undefined)
    : undefined;
  const params = await buildQueueSingleParams({
    config: { tool: config.tool },
    options,
    queueModel,
    effectiveTool,
    workflow,
    effectiveQualityProfile,
    inputImageFilename,
    inputImageFilenames,
    maskImageFilename: options?.maskImageFilename?.trim(),
    controlImageFilename,
    controlImageFilenames,
    uploadedFigureSize,
    // The page's plugin hook hands back the job's own denoise and cfg (no plugins: as asked), and
    // they are applied over the resolved params; the server does the same.
    pluginDenoise: options?.queueParamsBase?.denoise,
    pluginCfg: options?.queueParamsBase?.cfg,
    settings,
  });

  return {
    prompt: positive,
    negativePrompt: negative,
    model: queueModel,
    params,
    front: true,
    comfy: runtime,
  };
}
