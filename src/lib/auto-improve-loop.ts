'use client';

import {
  galleryEntryAlreadyEnrichedForUpscale,
  galleryEntryIsFinalToMaxBump,
} from './gallery-entry-actions';
import {
  requeueComfyJobFromEntry,
  requeueMoireCleanFromGalleryEntry,
  requeueUpscaleFromGalleryEntry,
} from './comfyui-requeue';
import { queueMutatedGalleryJobs } from './gallery-mutations';
import { queueSeedExperiment } from './seed-experiment-queue';
import { loadComfyUiSettings } from './comfyui-settings';
import { recordAutoImproveJobs } from './auto-improve-log';
import { runLowRatingMutation } from './rating-prompt-mutations';
import type { ComfyGalleryEntry } from './comfyui-gallery';
import { isQwenLightningModel } from './model-sampling-patch';
import { isQwenRapidAioModel } from './model-denoise-defaults';

function formatRequeueFailure(label: string, result: { ok: boolean; error?: string }): string {
  return `Auto-improve: ${label} re-queue failed — ${result.error ?? 'ComfyUI queue failed.'}`;
}

type ImproveResult = {
  ok: boolean;
  error?: string;
  kind: string;
  /** Already at requested quality — not a queued success. */
  skipped?: boolean;
};

async function improveHighRatingEntry(
  entry: ComfyGalleryEntry,
  qualityProfile: 'final' | 'max',
  options?: {
    refineAfterComplete?: 'final' | 'max';
  }
): Promise<ImproveResult> {
  const result = await improveHighRatingEntryInner(entry, qualityProfile, options);
  if (result.ok && !result.skipped) {
    recordAutoImproveJobs(qualityProfile === 'max' ? 'Max re-queues' : 'Final re-queues', 1);
  }
  return result;
}

async function improveHighRatingEntryInner(
  entry: ComfyGalleryEntry,
  qualityProfile: 'final' | 'max',
  options?: {
    refineAfterComplete?: 'final' | 'max';
  }
): Promise<ImproveResult> {
  const model = entry.model ?? 'qwen-image-2512';

  if (isQwenRapidAioModel(model)) {
    if (galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)) {
      return {
        ok: true,
        skipped: true,
        kind: 'skipped moiré clean (already polished)',
      };
    }
    const result = await requeueMoireCleanFromGalleryEntry(entry, {
      qualityProfile,
    });
    const bumped = galleryEntryIsFinalToMaxBump(entry, qualityProfile);
    return {
      ok: result.ok,
      error: result.error,
      kind:
        qualityProfile === 'max'
          ? bumped
            ? 'moiré clean Max (bumped from Final)'
            : 'moiré clean (Max)'
          : 'moiré clean (Final)',
    };
  }

  if (isQwenLightningModel(model)) {
    const result = await requeueComfyJobFromEntry(entry, {
      newSeed: true,
      qualityProfile,
    });
    return {
      ok: result.ok,
      error: result.error,
      kind:
        qualityProfile === 'max'
          ? 'Lightning re-queue (Max, new seed)'
          : 'Lightning re-queue (Final, new seed)',
    };
  }

  if (galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)) {
    return {
      ok: true,
      skipped: true,
      kind:
        qualityProfile === 'max'
          ? 'skipped Max upscale (already enriched)'
          : 'skipped Final upscale (already enriched)',
    };
  }

  const result = await requeueUpscaleFromGalleryEntry(entry, {
    qualityProfile,
    refineAfterComplete: options?.refineAfterComplete,
  });
  const bumped = galleryEntryIsFinalToMaxBump(entry, qualityProfile);
  return {
    ok: result.ok,
    error: result.error,
    kind:
      qualityProfile === 'max'
        ? bumped
          ? 'Max upscale (bumped from Final)'
          : 'Max upscale'
        : 'Final upscale',
  };
}

async function runFallbackHighRatingImprove(
  entry: ComfyGalleryEntry,
  rating: NonNullable<ComfyGalleryEntry['reviewRating']>,
  settings: ReturnType<typeof loadComfyUiSettings>,
  priorNote?: string
): Promise<string | null> {
  if (settings.autoMutateOnHighRating) {
    const { queued, held, jobs } = await queueMutatedGalleryJobs({
      entry,
      kinds: ['variation', 'location', 'wardrobe'],
      count: 3,
    });
    recordAutoImproveJobs('mutations', queued);
    const prefix = priorNote ? `${priorNote}; ` : 'Auto-improve: ';
    const wardrobe = jobs.find(job => job.kind === 'wardrobe' && job.summary)?.summary;
    const wardrobeNote = wardrobe ? ` · wardrobe ${wardrobe.split(',')[0]?.trim()}` : '';
    const heldNote = held > 0 ? ` · held ${held} Max` : '';
    return `${prefix}queued ${queued} mutations for ${rating}★ output${heldNote}${wardrobeNote}.`;
  }

  if (settings.autoSeedExperimentOnHighRating) {
    const { queued, held } = await queueSeedExperiment({
      prompt: entry.prompt,
      model: entry.model ?? 'qwen-image-2512',
      negativePrompt: entry.negativePrompt,
      hints: entry.prompt.slice(0, 200),
      count: 4,
    });
    recordAutoImproveJobs('seed experiments', queued);
    const prefix = priorNote ? `${priorNote}; ` : 'Auto-improve: ';
    const heldNote = held > 0 ? ` · held ${held} Max` : '';
    return `${prefix}queued ${queued} seed experiments for ${rating}★ output${heldNote}.`;
  }

  return priorNote ? `${priorNote}.` : null;
}

export async function runAutoImproveOnRating(
  entry: ComfyGalleryEntry,
  rating: ComfyGalleryEntry['reviewRating']
): Promise<string | null> {
  if (!rating) {
    return null;
  }

  if (rating <= 2) {
    if (loadComfyUiSettings().autoRefineOnLowRating !== false) {
      // Opens Refine with a corrective intent — nothing is queued, so nothing to log.
      return runLowRatingMutation(entry, rating);
    }
    return null;
  }

  const settings = loadComfyUiSettings();
  const model = entry.model ?? 'qwen-image-2512';

  if (rating === 5 && settings.autoRequeueMaxOnFiveStar !== false) {
    const refineAfterComplete =
      settings.autoImg2imgRefineOnFiveStar &&
      !isQwenLightningModel(model) &&
      !isQwenRapidAioModel(model)
        ? ('max' as const)
        : undefined;
    const maxResult = await improveHighRatingEntry(entry, 'max', {
      refineAfterComplete,
    });
    if (maxResult.ok && !maxResult.skipped) {
      if (refineAfterComplete) {
        return `Auto-improve: ${maxResult.kind}; refine will queue when upscale finishes.`;
      }
      if (settings.autoImg2imgRefineOnFiveStar && isQwenLightningModel(model)) {
        return `Auto-improve: ${maxResult.kind} (Lightning skips img2img refine).`;
      }
      if (settings.autoImg2imgRefineOnFiveStar && isQwenRapidAioModel(model)) {
        return `Auto-improve: ${maxResult.kind} (Rapid AIO skips img2img refine after polish).`;
      }
      return `Auto-improve: ${maxResult.kind}.`;
    }

    if (maxResult.skipped) {
      return runFallbackHighRatingImprove(
        entry,
        rating,
        settings,
        `Auto-improve: ${maxResult.kind}`
      );
    }

    if (settings.autoRequeueFinalOnHighRating !== false) {
      const finalResult = await improveHighRatingEntry(entry, 'final');
      if (finalResult.ok && !finalResult.skipped) {
        return `Auto-improve: Max path failed (${maxResult.error ?? 'queue error'}); used ${finalResult.kind} instead.`;
      }
      if (finalResult.skipped) {
        return runFallbackHighRatingImprove(
          entry,
          rating,
          settings,
          `Auto-improve: ${finalResult.kind}`
        );
      }
      return formatRequeueFailure('Max and Final improve', finalResult);
    }

    return formatRequeueFailure(maxResult.kind, maxResult);
  }

  if (rating >= 4 && settings.autoRequeueFinalOnHighRating !== false) {
    const result = await improveHighRatingEntry(entry, 'final');
    if (result.ok && !result.skipped) {
      return `Auto-improve: ${result.kind}.`;
    }
    if (result.skipped) {
      return runFallbackHighRatingImprove(entry, rating, settings, `Auto-improve: ${result.kind}`);
    }
    return formatRequeueFailure(result.kind, result);
  }

  return runFallbackHighRatingImprove(entry, rating, settings);
}

export async function runAutoImproveOnFavorite(
  entry: ComfyGalleryEntry,
  favorite: boolean
): Promise<string | null> {
  if (!favorite || !loadComfyUiSettings().autoSeedExperimentOnFavorite) {
    return null;
  }

  const { queued, held } = await queueSeedExperiment({
    prompt: entry.prompt,
    model: entry.model ?? 'qwen-image-2512',
    negativePrompt: entry.negativePrompt,
    hints: entry.prompt.slice(0, 200),
    count: 3,
  });
  recordAutoImproveJobs('seed experiments', queued);
  const heldNote = held > 0 ? ` · held ${held} Max` : '';
  return `Auto-improve: queued ${queued} seed experiments for favorite${heldNote}.`;
}
