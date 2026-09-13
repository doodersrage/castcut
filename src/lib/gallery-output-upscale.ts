import type { ComfyGalleryEntry } from './comfyui-gallery';
import { buildComfyViewPath } from './comfyui-outputs';
import { resolveDurableGalleryStillUrl } from './gallery-media-client';
import { isFluxFineTuneCheckpointModel } from './model-checkpoint-map';
import { isQwenLightningModel } from './model-sampling-patch';
import {
  lanczosPolishScaleAfterNeural,
  neuralTargetScaleAfterUpscale,
  neuralUpscaleTileSizeForProfile,
  parseNeuralUpscaleFactor,
  profileSkipsOutputUpscaleForModel,
  profileUsesNeuralUpscaleEnrich,
  profileUsesNeuralUpscalePolish,
  profileUsesSharpenAfterNeuralUpscale,
  rapidAioMoireBlurRadius,
  rapidAioMoireBlurSigma,
  rapidAioMoireDownscaleFactor,
  rapidAioMoireDownscaleMethod,
  rapidAioMoireRestoreScale,
  rapidAioMoireRestoreSharpenAlpha,
  profileUsesRapidAioMoireResample,
  sharpenAlphaForProfile,
  upscaleScaleForProfile,
  type QueueQualityProfile,
} from './queue-quality-profile';
import { IMAGE_SCALE_BY_NODE_TYPE } from './workflow-direct-patch';
import { DEFAULT_INPUT_IMAGE_TOKEN } from './comfyui-config';
import { isUpscaleModelInstalled } from './model-upscale-map';

type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
};

export type BuildGalleryUpscaleWorkflowInput = {
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>;
  upscaleModelFilename?: string;
  enrichNeuralPolish?: boolean;
  enrichSharpen?: boolean;
  /** Lightning skips upscale reprocess entirely. */
  model?: string;
  availableUpscaleModels?: string[] | null;
  supportsNeuralUpscaleTileSize?: boolean;
};

/** Thrown when a gallery upscale would not change output pixel size. */
export class GalleryUpscaleBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GalleryUpscaleBuildError';
  }
}

type GalleryOutputImageEntry = Pick<ComfyGalleryEntry, 'comfyUrl' | 'images' | 'sourceImageUrl'> &
  Partial<Pick<ComfyGalleryEntry, 'id' | 'durableOriginalPath'>>;

export function resolveGalleryOutputImageUrl(entry: GalleryOutputImageEntry): string | undefined {
  return resolveGalleryOutputImageUrls(entry)[0];
}

/** All output view URLs for a gallery entry (batch-aware). */
export function resolveGalleryOutputImageUrls(entry: GalleryOutputImageEntry): string[] {
  const durable = resolveDurableGalleryStillUrl(entry);
  if (durable) {
    return [durable];
  }
  const comfyUrl = entry.comfyUrl?.replace(/\/+$/, '') ?? '';
  const fromImages =
    comfyUrl && entry.images.length > 0
      ? entry.images.map(image => buildComfyViewPath(comfyUrl, image))
      : [];
  if (fromImages.length > 0) {
    return fromImages;
  }
  const fallback = entry.sourceImageUrl?.trim();
  return fallback ? [fallback] : [];
}

/**
 * Lightning must not re-encode or resample gallery outputs — soft scale still looks mushy.
 * Pass-through LoadImage → SaveImage only.
 */
export function buildLightningGalleryUpscaleWorkflow(): Record<string, WorkflowNode> {
  return {
    '1': {
      class_type: 'LoadImage',
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: 'Castcut — gallery output' },
    },
    '2': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'Castcut-upscale',
        images: ['1', 0],
      },
      _meta: { title: 'Castcut — save' },
    },
  };
}

/**
 * Gallery-only moiré cleanup matching queue polish:
 * Final → soft blur only (keeps acuity); Max → blur + mild bicubic↓/Lanczos↑.
 */
export function buildGalleryMoireCleanWorkflow(
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'> = 'final'
): Record<string, WorkflowNode> {
  const blurRadius = rapidAioMoireBlurRadius(qualityProfile);
  const blurSigma = rapidAioMoireBlurSigma(qualityProfile);
  const resample = profileUsesRapidAioMoireResample(qualityProfile);

  const workflow: Record<string, WorkflowNode> = {
    '1': {
      class_type: 'LoadImage',
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: 'Castcut — gallery output' },
    },
    '2': {
      class_type: 'ImageBlur',
      inputs: {
        image: ['1', 0],
        blur_radius: blurRadius,
        sigma: blurSigma,
      },
      _meta: { title: 'Castcut — moiré polish' },
    },
  };

  let outputId = '2';
  let nextId = 3;

  if (resample) {
    const downscale = rapidAioMoireDownscaleFactor(qualityProfile);
    const downMethod = rapidAioMoireDownscaleMethod(qualityProfile);
    const restore = rapidAioMoireRestoreScale(qualityProfile);
    const sharpenAlpha = rapidAioMoireRestoreSharpenAlpha(qualityProfile);

    const downId = String(nextId++);
    workflow[downId] = {
      class_type: IMAGE_SCALE_BY_NODE_TYPE,
      inputs: {
        image: [outputId, 0],
        upscale_method: downMethod,
        scale_by: downscale,
      },
      _meta: { title: 'Castcut — moiré downscale' },
    };

    const restoreId = String(nextId++);
    workflow[restoreId] = {
      class_type: IMAGE_SCALE_BY_NODE_TYPE,
      inputs: {
        image: [downId, 0],
        upscale_method: 'lanczos',
        scale_by: restore,
      },
      _meta: { title: 'Castcut — moiré size restore' },
    };
    outputId = restoreId;

    if (sharpenAlpha > 0) {
      const sharpenId = String(nextId++);
      workflow[sharpenId] = {
        class_type: 'ImageSharpen',
        inputs: {
          image: [outputId, 0],
          sharpen_radius: 1,
          sigma: 0.6,
          alpha: sharpenAlpha,
        },
        _meta: { title: 'Castcut — moiré edge recovery' },
      };
      outputId = sharpenId;
    }
  }

  const saveId = String(nextId);
  workflow[saveId] = {
    class_type: 'SaveImage',
    inputs: {
      filename_prefix: 'Castcut-moire-clean',
      images: [outputId, 0],
    },
    _meta: { title: 'Castcut — save' },
  };

  return workflow;
}

function refuseIdentityUpscale(model: string | undefined, qualityProfile: string): never {
  if (isFluxFineTuneCheckpointModel(model) && qualityProfile === 'final') {
    throw new GalleryUpscaleBuildError(
      'UltraReal Final stays native size. Use Upscale → Max (neural preferred; mild Lanczos if no upscaler is mapped).'
    );
  }
  throw new GalleryUpscaleBuildError(
    `Upscale → ${qualityProfile} would not enlarge this model’s output (image-space enlarge is skipped). Use Re-queue with a different quality profile or model.`
  );
}

export function buildGalleryUpscaleWorkflow(
  input: BuildGalleryUpscaleWorkflowInput
): Record<string, WorkflowNode> {
  if (isQwenLightningModel(input.model)) {
    return buildLightningGalleryUpscaleWorkflow();
  }

  const targetOut = upscaleScaleForProfile(input.qualityProfile, { model: input.model });
  if (
    profileSkipsOutputUpscaleForModel(input.qualityProfile, { model: input.model }) ||
    targetOut <= 1.001
  ) {
    refuseIdentityUpscale(input.model, input.qualityProfile);
  }

  let nextId = 1;
  const id = () => String(nextId++);

  const loadId = id();
  const workflow: Record<string, WorkflowNode> = {
    [loadId]: {
      class_type: 'LoadImage',
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: 'Castcut — gallery output' },
    },
  };

  let outputNodeId = loadId;
  const modelName = input.upscaleModelFilename?.trim();
  const useNeural =
    profileUsesNeuralUpscaleEnrich(input.qualityProfile, { model: input.model }) &&
    Boolean(modelName) &&
    isUpscaleModelInstalled(modelName, input.availableUpscaleModels);

  if (useNeural && modelName) {
    const loaderId = id();
    workflow[loaderId] = {
      class_type: 'UpscaleModelLoader',
      inputs: { model_name: modelName },
      _meta: { title: 'Castcut — upscale model' },
    };

    const upscaleId = id();
    const tileSize =
      input.supportsNeuralUpscaleTileSize === true
        ? neuralUpscaleTileSizeForProfile(input.qualityProfile)
        : 0;
    const upscaleInputs: Record<string, unknown> = {
      upscale_model: [loaderId, 0],
      image: [outputNodeId, 0],
    };
    if (tileSize > 0) {
      upscaleInputs.tile_size = tileSize;
    }
    workflow[upscaleId] = {
      class_type: 'ImageUpscaleWithModel',
      inputs: upscaleInputs,
      _meta: { title: 'Castcut — neural upscale' },
    };
    outputNodeId = upscaleId;

    const usePolish =
      input.enrichNeuralPolish !== false &&
      profileUsesNeuralUpscalePolish(input.qualityProfile, { model: input.model });
    const polishScale = usePolish ? lanczosPolishScaleAfterNeural({ model: input.model }) : 1;

    const targetScale = neuralTargetScaleAfterUpscale(input.qualityProfile, {
      model: input.model,
      neuralFactor: parseNeuralUpscaleFactor(modelName),
      polishScale: polishScale > 1 ? polishScale : undefined,
    });
    if (targetScale > 0 && targetScale !== 1) {
      const targetId = id();
      workflow[targetId] = {
        class_type: IMAGE_SCALE_BY_NODE_TYPE,
        inputs: {
          image: [outputNodeId, 0],
          upscale_method: 'area',
          scale_by: targetScale,
        },
        _meta: { title: 'Castcut — neural target upscale' },
      };
      outputNodeId = targetId;
    }

    if (usePolish && polishScale > 1) {
      const polishId = id();
      workflow[polishId] = {
        class_type: IMAGE_SCALE_BY_NODE_TYPE,
        inputs: {
          image: [outputNodeId, 0],
          upscale_method: 'lanczos',
          scale_by: polishScale,
        },
        _meta: { title: 'Castcut — Lanczos polish' },
      };
      outputNodeId = polishId;
    }
  } else {
    // UltraReal Max: mild Lanczos (~1.35×) when neural is unavailable.
    const scaleBy = upscaleScaleForProfile(input.qualityProfile, { model: input.model });
    if (scaleBy <= 1.001) {
      refuseIdentityUpscale(input.model, input.qualityProfile);
    }
    const scaleId = id();
    workflow[scaleId] = {
      class_type: IMAGE_SCALE_BY_NODE_TYPE,
      inputs: {
        image: [outputNodeId, 0],
        upscale_method: 'lanczos',
        scale_by: scaleBy,
      },
      _meta: { title: 'Castcut — output upscale' },
    };
    outputNodeId = scaleId;
  }

  const forceUltraRealMildSharpen =
    isFluxFineTuneCheckpointModel(input.model) && input.qualityProfile === 'max';
  if (
    (input.enrichSharpen === true || forceUltraRealMildSharpen) &&
    profileUsesSharpenAfterNeuralUpscale(input.qualityProfile, {
      afterNeural: useNeural,
      model: input.model,
    })
  ) {
    const sharpenId = id();
    workflow[sharpenId] = {
      class_type: 'ImageSharpen',
      inputs: {
        image: [outputNodeId, 0],
        sharpen_radius: 1,
        sigma: 0.45,
        alpha: sharpenAlphaForProfile(input.qualityProfile, { model: input.model }),
      },
      _meta: { title: 'Castcut — output sharpen' },
    };
    outputNodeId = sharpenId;
  }

  const saveId = id();
  workflow[saveId] = {
    class_type: 'SaveImage',
    inputs: {
      filename_prefix: 'Castcut-upscale',
      images: [outputNodeId, 0],
    },
    _meta: { title: 'Castcut — save' },
  };

  return workflow;
}
