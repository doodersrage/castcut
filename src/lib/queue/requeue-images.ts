'use client';

import type { WorkflowParamValues } from '../comfyui/config';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';
import { buildComfyViewPath } from '../comfyui/outputs';
import { resolveDurableGalleryStillUrl } from '../gallery/media-client';
import { isEditCapableModel, isInpaintModel } from '../model/denoise-defaults';
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  resolveComposeOutputLatentSize,
  toolUsesComposeFigureLatent,
} from '../model/resolution-defaults';
import { loadSettingsCache } from '../settings/cache';
import { probeImageUrlDimensions } from '../storage/browser-image-dimensions';
import { resolveQueueInputImage } from './input-image';

const EDIT_TOOLS = new Set(['refine', 'inpaint', 'image-prompt', 'controlnet', 'compose']);

function loadRequeueResolutionOrientation() {
  if (typeof window === 'undefined') {
    return DEFAULT_RESOLUTION_ORIENTATION;
  }
  return normalizeResolutionOrientation(loadSettingsCache().shared.modelResolutionOrientation);
}

function loadRequeueResolutionSizeTier() {
  if (typeof window === 'undefined') {
    return DEFAULT_RESOLUTION_SIZE_TIER;
  }
  return normalizeResolutionSizeTier(loadSettingsCache().shared.modelResolutionSizeTier);
}

export function resolveRequeueImageUrlsFromEntry(
  entry: Pick<
    ComfyGalleryEntry,
    | 'comfyUrl'
    | 'images'
    | 'tool'
    | 'model'
    | 'queueParams'
    | 'sourceImageUrl'
    | 'maskImageUrl'
    | 'controlImageUrls'
  > &
    Partial<Pick<ComfyGalleryEntry, 'id' | 'durableOriginalPath'>>
): { sourceImageUrl?: string; maskImageUrl?: string; controlImageUrls?: string[] } {
  const fromParams = buildGalleryImageUrlsFromQueueParams({
    comfyUrl: entry.comfyUrl ?? '',
    queueParams: entry.queueParams,
    sourceImageUrl: entry.sourceImageUrl,
    maskImageUrl: entry.maskImageUrl,
  });
  const controlImageUrls =
    entry.controlImageUrls?.map(url => url.trim()).filter(Boolean) ?? fromParams.controlImageUrls;
  const durableStill = resolveDurableGalleryStillUrl(entry);

  if (durableStill || entry.sourceImageUrl?.trim()) {
    return {
      sourceImageUrl: durableStill || entry.sourceImageUrl?.trim(),
      maskImageUrl: entry.maskImageUrl?.trim() || undefined,
      ...(controlImageUrls?.length ? { controlImageUrls } : {}),
    };
  }

  const comfyUrl = entry.comfyUrl?.replace(/\/+$/, '') ?? '';
  const params = entry.queueParams;

  const inputFromParams =
    params?.inputImageFilename?.trim() && comfyUrl
      ? buildComfyViewPath(comfyUrl, {
          filename: params.inputImageFilename.trim(),
          subfolder: '',
          type: 'input',
        })
      : undefined;

  const maskFromParams =
    params?.maskImageFilename?.trim() && comfyUrl
      ? buildComfyViewPath(comfyUrl, {
          filename: params.maskImageFilename.trim(),
          subfolder: '',
          type: 'input',
        })
      : undefined;

  const outputUrl =
    entry.images[0] && comfyUrl ? buildComfyViewPath(comfyUrl, entry.images[0]) : undefined;

  const needsInput =
    Boolean(params?.inputImageFilename) ||
    isEditCapableModel(entry.model ?? '') ||
    (entry.tool ? EDIT_TOOLS.has(entry.tool) : false);

  return {
    sourceImageUrl: inputFromParams ?? (needsInput ? outputUrl : undefined),
    maskImageUrl: entry.maskImageUrl?.trim() ?? maskFromParams,
    ...(controlImageUrls?.length ? { controlImageUrls } : {}),
  };
}

export type RefreshedRequeueQueueParams = {
  params?: WorkflowParamValues;
  /** Pixel size of the refreshed source upload — drives Compose/Refine latent AR. */
  figurePixelSize?: { width: number; height: number };
};

export async function refreshQueueImageParamsForRequeue(input: {
  model?: string;
  tool?: string;
  queueParams?: WorkflowParamValues;
  sourceImageUrl?: string;
  maskImageUrl?: string;
  forceInputImage?: boolean;
}): Promise<RefreshedRequeueQueueParams> {
  const base = input.queueParams ? { ...input.queueParams } : {};
  const model = input.model ?? '';
  let figurePixelSize: { width: number; height: number } | undefined;
  const hadInputFilename = Boolean(base.inputImageFilename?.trim());
  const hadMaskFilename = Boolean(base.maskImageFilename?.trim());
  const needsFreshInput =
    input.forceInputImage ||
    hadInputFilename ||
    isEditCapableModel(model) ||
    (input.tool ? EDIT_TOOLS.has(input.tool) : false);
  const needsFreshMask = hadMaskFilename || isInpaintModel(model) || input.tool === 'inpaint';

  if (needsFreshInput && input.sourceImageUrl?.trim()) {
    try {
      const uploaded = await resolveQueueInputImage({
        imageUrl: input.sourceImageUrl,
        filename: base.inputImageFilename,
        model,
      });
      if (uploaded?.filename) {
        base.inputImageFilename = uploaded.filename;
      }
      if (uploaded?.width && uploaded?.height && uploaded.width > 0 && uploaded.height > 0) {
        figurePixelSize = { width: uploaded.width, height: uploaded.height };
      }
    } catch {
      // Keep stale filename; ComfyUI may reject it.
    }
    if (!figurePixelSize && input.sourceImageUrl?.trim()) {
      try {
        const probed = await probeImageUrlDimensions(input.sourceImageUrl.trim());
        if (probed) {
          figurePixelSize = probed;
        }
      } catch {
        /* optional */
      }
    }
    if (
      figurePixelSize &&
      model &&
      toolUsesComposeFigureLatent(input.tool) &&
      base.inputImageFilename?.trim()
    ) {
      const latent = resolveComposeOutputLatentSize(
        figurePixelSize.width,
        figurePixelSize.height,
        model,
        loadRequeueResolutionOrientation(),
        loadRequeueResolutionSizeTier()
      );
      base.width = latent.width;
      base.height = latent.height;
    }
  }

  if (needsFreshMask && input.maskImageUrl?.trim()) {
    try {
      const { resolveQueueInputImageFilename } = await import('./input-image');
      base.maskImageFilename = await resolveQueueInputImageFilename({
        imageUrl: input.maskImageUrl,
        filename: base.maskImageFilename,
        model,
        kind: 'mask',
        originalRef: base.inputImageFilename
          ? { name: base.inputImageFilename, type: 'input', subfolder: '' }
          : undefined,
      });
    } catch {
      // Keep stale mask filename.
    }
  }

  if (Object.keys(base).length === 0 && !figurePixelSize) {
    return { params: input.queueParams };
  }

  return { params: base, figurePixelSize };
}

export function buildComfyUploadedImageViewUrl(comfyUrl: string, filename: string): string {
  return buildComfyViewPath(comfyUrl.replace(/\/+$/, ''), {
    filename: filename.trim(),
    subfolder: '',
    type: 'input',
  });
}

export function buildGalleryImageUrlsFromQueueParams(input: {
  comfyUrl: string;
  queueParams?: WorkflowParamValues;
  sourceImageUrl?: string;
  maskImageUrl?: string;
}): {
  sourceImageUrl?: string;
  maskImageUrl?: string;
  controlImageUrls?: string[];
} {
  const comfyUrl = input.comfyUrl.replace(/\/+$/, '');
  const controlFilenames = [
    input.queueParams?.controlImageFilename?.trim() || '',
    ...(input.queueParams?.controlImageFilenames ?? []).map(name => name?.trim() || ''),
  ].filter(Boolean);
  // Dedupe while preserving order (index 0 often repeats controlImageFilename).
  const uniqueControl = [...new Set(controlFilenames)];
  const controlImageUrls = uniqueControl.map(name =>
    buildComfyUploadedImageViewUrl(comfyUrl, name)
  );

  const sourceImageUrl =
    input.sourceImageUrl?.trim() ||
    (input.queueParams?.inputImageFilename?.trim()
      ? buildComfyUploadedImageViewUrl(comfyUrl, input.queueParams.inputImageFilename.trim())
      : undefined) ||
    (uniqueControl[0] ? buildComfyUploadedImageViewUrl(comfyUrl, uniqueControl[0]) : undefined);
  const maskImageUrl =
    input.maskImageUrl?.trim() ||
    (input.queueParams?.maskImageFilename?.trim()
      ? buildComfyUploadedImageViewUrl(comfyUrl, input.queueParams.maskImageFilename.trim())
      : undefined);

  return {
    ...(sourceImageUrl ? { sourceImageUrl } : {}),
    ...(maskImageUrl ? { maskImageUrl } : {}),
    ...(controlImageUrls.length > 0 ? { controlImageUrls } : {}),
  };
}

export function auditRequeueImageReadiness(input: {
  model?: string;
  tool?: string;
  queueParams?: WorkflowParamValues;
  sourceImageUrl?: string;
  maskImageUrl?: string;
  forceInputImage?: boolean;
}): Array<{ severity: 'error' | 'warn'; message: string }> {
  const issues: Array<{ severity: 'error' | 'warn'; message: string }> = [];
  const model = input.model ?? '';
  const needsInput =
    input.forceInputImage ||
    Boolean(input.queueParams?.inputImageFilename) ||
    isEditCapableModel(model) ||
    (input.tool ? EDIT_TOOLS.has(input.tool) : false);
  const needsMask =
    Boolean(input.queueParams?.maskImageFilename) ||
    isInpaintModel(model) ||
    input.tool === 'inpaint';

  if (needsInput && !input.sourceImageUrl?.trim() && !input.queueParams?.inputImageFilename) {
    issues.push({
      severity: 'warn',
      message: 'Re-queue may fail — no source image URL available to refresh the ComfyUI upload.',
    });
  }

  if (needsMask && !input.maskImageUrl?.trim()) {
    issues.push({
      severity: 'warn',
      message:
        'Inpaint re-queue without a refreshable mask URL — re-draw the mask or re-run from Refine/Inpaint.',
    });
  }

  return issues;
}
