'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  appendUserToolQualityRecipe,
  buildToolQualityRecipeFromGalleryEntry,
} from '@/lib/tool-quality-recipes';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { resolveSharedEffectiveSessionLoraStrengthOverrides } from '@/lib/comfyui-settings';
import { recordAvoidedTokensFromGalleryEntry } from '@/lib/avoided-tokens';
import { recordCatalogBiasFromPrompt } from '@/lib/catalog-rating-bias';
import { setLineageParent } from '@/lib/prompt-lineage-session';
import { formatMutatedJobsStatus, queueMutatedGalleryJobs } from '@/lib/gallery-mutations';
import { toastHeldMax } from '@/lib/app-toast';
import { startImproveFromGalleryEntry } from '@/lib/improve-output';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import type { GalleryComparePanelProps } from '@/components/GalleryComparePanel';
import { experimentGroupIdForPrompt } from '@/lib/experiment-groups';
import { markExperimentWinner } from '@/lib/experiment-winners';
import { applyGalleryStackToSession } from '@/lib/gallery-stack-restore';
import { galleryToolHref, galleryToolLabel } from '@/lib/gallery-tool-href';

const loadGalleryRequeue = () => import('@/lib/comfyui-requeue');

type UseGalleryCompareHandlersInput = {
  selectedEntries: ComfyGalleryEntry[];
  setFavorites: (ids: string[], favorite: boolean) => void;
  setReviewRating: (entryId: string, rating: ComfyGalleryEntry['reviewRating']) => void;
  toggleFavorite: (entryId: string) => void;
};

export function useGalleryCompareHandlers({
  selectedEntries,
  setFavorites,
  setReviewRating,
  toggleFavorite,
}: UseGalleryCompareHandlersInput) {
  const router = useRouter();
  const [compareStatus, setCompareStatus] = useState<string | null>(null);
  const [compareWinnerId, setCompareWinnerId] = useState<string | null>(null);

  const resetCompare = useCallback(() => {
    setCompareStatus(null);
    setCompareWinnerId(null);
  }, []);

  const onPickWinner = useCallback<NonNullable<GalleryComparePanelProps['onPickWinner']>>(
    entry => {
      setCompareWinnerId(entry.id);
      const groupId = experimentGroupIdForPrompt(entry.prompt);
      if (groupId) {
        markExperimentWinner(groupId, entry.id);
      }
      const compareIds = selectedEntries.slice(0, 4).map(item => item.id);
      setFavorites(
        compareIds.filter(id => id !== entry.id),
        false
      );
      setFavorites([entry.id], true);
      setReviewRating(entry.id, 5);
      recordCatalogBiasFromPrompt(entry.prompt, 5);
      if (entry.historyId) {
        setLineageParent({
          parentHistoryId: entry.historyId,
          sourcePrompt: entry.prompt,
          sourceTool: entry.tool,
        });
      }
      const shared = loadSettingsCache().shared;
      const built = buildToolQualityRecipeFromGalleryEntry({
        ...entry,
        sessionLoraStrengthOverrides:
          entry.sessionLoraStrengthOverrides ??
          resolveSharedEffectiveSessionLoraStrengthOverrides(entry.model),
      });
      if (built.ok) {
        const nextRecipes = appendUserToolQualityRecipe(shared.toolQualityRecipes, built.recipe);
        saveSharedSettings({
          ...shared,
          toolQualityRecipes: nextRecipes,
        });
      }
      const stack = applyGalleryStackToSession(entry);
      setCompareStatus(
        `Winner: ${entry.model ?? 'unknown'} · seed ${entry.queueParams?.seed ?? '?'}${
          built.ok ? ' · recipe saved' : ''
        }${stack.applied ? ` · stack on ${galleryToolLabel(entry.tool)}` : ''}`
      );
      router.push(galleryToolHref(entry.tool));
      void import('@/lib/auto-improve-loop')
        .then(({ runAutoImproveOnRating }) => runAutoImproveOnRating(entry, 5))
        .then(message => {
          if (message) {
            setCompareStatus(message);
          }
        })
        .catch(error => {
          setCompareStatus(error instanceof Error ? error.message : 'Auto-improve failed.');
        });
    },
    [router, selectedEntries, setFavorites, setReviewRating]
  );

  const onSaveWinnerRecipe = useCallback<
    NonNullable<GalleryComparePanelProps['onSaveWinnerRecipe']>
  >(entry => {
    const shared = loadSettingsCache().shared;
    const built = buildToolQualityRecipeFromGalleryEntry({
      ...entry,
      sessionLoraStrengthOverrides:
        entry.sessionLoraStrengthOverrides ??
        resolveSharedEffectiveSessionLoraStrengthOverrides(entry.model),
    });
    if (!built.ok) {
      setCompareStatus(built.error);
      return;
    }
    const nextRecipes = appendUserToolQualityRecipe(shared.toolQualityRecipes, built.recipe);
    saveSharedSettings({
      ...shared,
      toolQualityRecipes: nextRecipes,
    });
    setCompareStatus(
      `Saved recipe “${built.recipe.label}” · ${built.recipe.queueQualityProfile}${
        built.recipe.model ? ` · ${built.recipe.model}` : ''
      }`
    );
  }, []);

  const onRate = useCallback<NonNullable<GalleryComparePanelProps['onRate']>>(
    (entryId, rating) => {
      setReviewRating(entryId, rating);
      const entry = selectedEntries.find(item => item.id === entryId);
      if (entry && rating && rating <= 2) {
        recordAvoidedTokensFromGalleryEntry({
          prompt: entry.prompt,
          visionTags: entry.visionTags,
        });
      }
      if (entry) {
        recordCatalogBiasFromPrompt(entry.prompt, rating);
        if (rating) {
          void import('@/lib/auto-improve-loop')
            .then(({ runAutoImproveOnRating }) => runAutoImproveOnRating(entry, rating))
            .then(message => {
              if (message) {
                setCompareStatus(message);
              }
            })
            .catch(error => {
              setCompareStatus(error instanceof Error ? error.message : 'Auto-improve failed.');
            });
        }
      }
    },
    [selectedEntries, setReviewRating]
  );

  const onMutate = useCallback<NonNullable<GalleryComparePanelProps['onMutate']>>(entry => {
    setCompareStatus('Queueing mutations…');
    void queueMutatedGalleryJobs({
      entry,
      kinds: ['variation', 'location', 'wardrobe'],
      count: 3,
    }).then(({ queued, held, jobs }) => {
      if (held > 0) {
        toastHeldMax({
          text: 'Max mutations held until ComfyUI is idle',
          count: held,
        });
      }
      setCompareStatus(formatMutatedJobsStatus(jobs, queued, held));
    });
  }, []);

  const onUpscale = useCallback<NonNullable<GalleryComparePanelProps['onUpscale']>>(
    (entry, qualityProfile) => {
      setCompareStatus(`Upscaling (${qualityProfile})…`);
      void loadGalleryRequeue()
        .then(({ requeueUpscaleFromGalleryEntry }) =>
          requeueUpscaleFromGalleryEntry(entry, {
            qualityProfile,
            onStatus: setCompareStatus,
          })
        )
        .then(result => {
          if (!result.ok) {
            setCompareStatus(result.error ?? 'Upscale failed.');
            return;
          }
          if (result.held) {
            const message = 'Max upscale held until ComfyUI queue is idle';
            setCompareStatus(message);
            toastHeldMax({ text: message });
          }
        });
    },
    []
  );

  const onMoireClean = useCallback<NonNullable<GalleryComparePanelProps['onMoireClean']>>(
    (entry, qualityProfile) => {
      setCompareStatus(
        qualityProfile === 'max' ? 'Queueing moiré clean (Max)…' : 'Queueing moiré clean (Final)…'
      );
      void loadGalleryRequeue()
        .then(({ requeueMoireCleanFromGalleryEntry }) =>
          requeueMoireCleanFromGalleryEntry(entry, {
            qualityProfile,
            onStatus: setCompareStatus,
          })
        )
        .then(result => {
          if (!result.ok) {
            setCompareStatus(result.error ?? 'Moiré clean failed.');
            return;
          }
          if (result.held) {
            const message = 'Max moiré clean held until ComfyUI queue is idle';
            setCompareStatus(message);
            toastHeldMax({ text: message });
          }
        });
    },
    []
  );

  const onRefine = useCallback<NonNullable<GalleryComparePanelProps['onRefine']>>(entry => {
    setCompareStatus('Queueing low-denoise refine…');
    void loadGalleryRequeue()
      .then(({ requeueRefineFromGalleryEntry }) =>
        requeueRefineFromGalleryEntry(entry, {
          onStatus: setCompareStatus,
        })
      )
      .then(result => {
        if (!result.ok) {
          setCompareStatus(result.error ?? 'Refine failed.');
          return;
        }
        if (result.held) {
          const message = 'Max refine held until ComfyUI queue is idle';
          setCompareStatus(message);
          toastHeldMax({ text: message });
        }
      });
  }, []);

  const onSoftSecondPass = useCallback<NonNullable<GalleryComparePanelProps['onSoftSecondPass']>>(
    entry => {
      setCompareStatus('Queueing soft second pass…');
      void loadGalleryRequeue()
        .then(({ requeueSoftSecondPassFromGalleryEntry }) =>
          requeueSoftSecondPassFromGalleryEntry(entry, {
            onStatus: setCompareStatus,
          })
        )
        .then(result => {
          if (!result.ok) {
            setCompareStatus(result.error ?? 'Soft second pass failed.');
            return;
          }
          if (result.held) {
            const message = 'Soft second pass held until ComfyUI queue is idle';
            setCompareStatus(message);
            toastHeldMax({ text: message });
          }
        });
    },
    []
  );

  const onSkinRefine = useCallback<NonNullable<GalleryComparePanelProps['onSkinRefine']>>(entry => {
    setCompareStatus('Queueing skin refine…');
    void Promise.all([
      loadGalleryRequeue(),
      import('@/lib/comfyui-settings'),
      import('@/lib/play-skin-refine'),
    ])
      .then(([{ requeueSkinRefineFromGalleryEntry }, { loadComfyUiSettings }, skin]) => {
        const model = skin.resolvePlaySkinRefineQueueModel(loadComfyUiSettings());
        return requeueSkinRefineFromGalleryEntry(entry, {
          model,
          onStatus: setCompareStatus,
        });
      })
      .then(result => {
        if (!result.ok) {
          setCompareStatus(result.error ?? 'Skin refine failed.');
          return;
        }
        if (result.held) {
          const message = 'Skin refine held until ComfyUI queue is idle';
          setCompareStatus(message);
          toastHeldMax({ text: message });
        }
      });
  }, []);

  const onUpscaleWinner = useCallback<NonNullable<GalleryComparePanelProps['onUpscaleWinner']>>(
    entry => {
      setCompareStatus('Upscaling compare winner at Max…');
      void loadGalleryRequeue()
        .then(({ requeueUpscaleFromGalleryEntry }) =>
          requeueUpscaleFromGalleryEntry(entry, {
            qualityProfile: 'max',
            onStatus: setCompareStatus,
          })
        )
        .then(result => {
          if (!result.ok) {
            setCompareStatus(result.error ?? 'Upscale failed.');
            return;
          }
          if (result.held) {
            const message = 'Max upscale held until ComfyUI queue is idle';
            setCompareStatus(message);
            toastHeldMax({ text: message });
          }
        });
    },
    []
  );

  return {
    compareStatus,
    compareWinnerId,
    resetCompare,
    compareHandlers: {
      onPickWinner,
      onSaveWinnerRecipe,
      onRate,
      onFavorite: toggleFavorite,
      onMutate,
      onUpscale,
      onMoireClean,
      onRefine,
      onSoftSecondPass,
      onSkinRefine,
      onUpscaleWinner,
      onImprove: startImproveFromGalleryEntry,
      status: compareStatus,
      compareWinnerId,
    } satisfies Omit<GalleryComparePanelProps, 'entries' | 'onClose'>,
  };
}
