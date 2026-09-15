import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { loadSettingsCache } from '@/lib/settings-cache';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';

export async function buildQueueSingleParams(input: {
  config: { tool: string };
  options?: SendComfyUiOptions;
  queueModel: ComfyImageModel;
  effectiveTool: string;
  workflow?: Record<string, unknown>;
  effectiveQualityProfile: import('@/lib/queue-quality-profile').QueueQualityProfile;
  inputImageFilename?: string;
  inputImageFilenames: string[];
  maskImageFilename?: string;
  controlImageFilename?: string;
  controlImageFilenames: string[];
  uploadedFigureSize?: { width: number; height: number };
  pluginDenoise?: string | number;
  pluginCfg?: string | number;
}): Promise<WorkflowParamValues> {
  const {
    options,
    queueModel,
    effectiveTool,
    workflow,
    effectiveQualityProfile,
    inputImageFilename,
    inputImageFilenames,
    maskImageFilename,
    controlImageFilename,
    controlImageFilenames,
    uploadedFigureSize,
    pluginDenoise,
    pluginCfg,
  } = input;
  void input.config;

  const queueParams = resolveQueueParams({
    model: queueModel,
    tool: effectiveTool,
    base: options?.queueParamsBase,
    workflow,
    inputImageFilename,
    inputImageFilenames: inputImageFilenames.some(Boolean) ? inputImageFilenames : undefined,
    maskImageFilename,
    controlImageFilename,
    controlImageFilenames: controlImageFilenames.length > 0 ? controlImageFilenames : undefined,
    qualityProfile: effectiveQualityProfile,
    resolutionSizeTier: options?.resolutionSizeTier,
    resolutionOrientation: options?.resolutionOrientation,
    preserveInputAspect: options?.preserveInputAspect,
    forceNewSeed: true,
    figurePixelSize: options?.figurePixelSize ?? uploadedFigureSize,
  });

  if (pluginDenoise != null && pluginDenoise.toString().trim() !== '') {
    const { resolveUserSamplerDenoiseOverride } = await import('@/lib/model-sampler-defaults');
    if (!resolveUserSamplerDenoiseOverride(loadSettingsCache().shared.modelSamplerOverrides)) {
      queueParams.denoise = pluginDenoise;
    }
  }
  if (pluginCfg != null && pluginCfg.toString().trim() !== '') {
    queueParams.cfg = pluginCfg;
  }

  {
    const { ensureDistilledSamplerParams } = await import('@/lib/model-sampler-defaults');
    const { isQwenRapidAioModel, isWanRapidAioModel } =
      await import('@/lib/model-denoise-defaults');
    const { isQwenLightningModel, isWanLightningModel } =
      await import('@/lib/model-sampling-patch');
    const isDistilled =
      isQwenLightningModel(queueModel) ||
      isWanLightningModel(queueModel) ||
      isQwenRapidAioModel(queueModel) ||
      isWanRapidAioModel(queueModel);
    if (isDistilled) {
      Object.assign(queueParams, ensureDistilledSamplerParams(queueParams, queueModel));
      const { resolveDistilledQueueDenoise } = await import('@/lib/model-denoise-defaults');
      const { resolveUserSamplerDenoiseOverride } = await import('@/lib/model-sampler-defaults');
      const userDenoiseOverride = resolveUserSamplerDenoiseOverride(
        loadSettingsCache().shared.modelSamplerOverrides
      );
      const resolvedDenoise = resolveDistilledQueueDenoise(queueModel, {
        tool: effectiveTool,
        hasInputImage: Boolean(inputImageFilename),
        hasMaskImage: Boolean(maskImageFilename),
        paramsDenoise: queueParams.denoise,
        userDenoiseOverride,
      });
      if (resolvedDenoise != null) {
        queueParams.denoise = resolvedDenoise;
      }
    }
  }

  if (effectiveTool === 'compose') {
    const { isFluxKleinModel, isZImageModel } = await import('@/lib/model-denoise-defaults');
    const { isCloudEngine } = await import('@/lib/engine/capabilities');
    const cloudEngine = isCloudEngine(loadSettingsCache().shared.inferenceEngine);
    // Cloud face-ref uses ordered image refs + prompt instruction — never IP-Adapter patches.
    if (!cloudEngine && isFluxKleinModel(queueModel)) {
      const { buildComposeKleinQueuePatch } = await import('@/lib/compose-identity-lock');
      const kleinPatch = buildComposeKleinQueuePatch({
        model: queueModel,
        inputImageFilename,
        inputImageFilenames,
        identityLock: options?.identityLock === true,
        identityLockStrength: options?.identityLockStrength,
        identityKind: options?.identityKind,
      });
      if (kleinPatch) {
        Object.assign(queueParams, kleinPatch);
      }
    } else if (!cloudEngine && options?.identityLock && !isZImageModel(queueModel)) {
      const { buildComposeIdentityLockQueuePatch } = await import('@/lib/compose-identity-lock');
      const identityPatch = buildComposeIdentityLockQueuePatch({
        enabled: true,
        strength: options.identityLockStrength,
        identityKind: options.identityKind,
        inputImageFilename,
      });
      if (identityPatch) {
        Object.assign(queueParams, identityPatch);
      }
    }
  } else if (options?.identityLock) {
    const { isCloudEngine } = await import('@/lib/engine/capabilities');
    if (!isCloudEngine(loadSettingsCache().shared.inferenceEngine)) {
      const { buildComposeIdentityLockQueuePatch } = await import('@/lib/compose-identity-lock');
      const identityPatch = buildComposeIdentityLockQueuePatch({
        enabled: true,
        strength: options.identityLockStrength,
        identityKind: options.identityKind,
        inputImageFilename,
      });
      if (identityPatch) {
        Object.assign(queueParams, identityPatch);
      }
    }
  }

  return queueParams;
}
