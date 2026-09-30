'use client';

import { useCallback, type MutableRefObject } from 'react';
import type { GalleryCardActions } from '@/components/gallery/GalleryCardItem';
import {
  startRefineFromGalleryEntry,
  startReeditRefineFromGalleryEntry,
} from '@/lib/improve-output';
import { toastBulkQueueSummary } from '@/lib/app-toast';
import { firstUnreviewedInRun } from '@/lib/gallery-queue-runs';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import {
  clearExperimentWinner,
  loadExperimentWinners,
  markExperimentWinner,
  type ExperimentWinnerRecord,
} from '@/lib/experiment-winners';

type UseGalleryExperimentGridHandlersArgs = {
  experimentWinners: Record<string, ExperimentWinnerRecord>;
  setExperimentWinners: (winners: Record<string, ExperimentWinnerRecord>) => void;
  setReviewRatings: (entryIds: string[], rating: 1 | 2 | 3 | 4 | 5) => void;
  setSelectedIds: (ids: string[]) => void;
  setCompareOpen: (open: boolean) => void;
  setRequeueStatus: (status: string | null) => void;
  galleryCardActionsRef: MutableRefObject<GalleryCardActions>;
  /** Review mode on/off — Review run switches it on at the run's first unrated still. */
  setReviewMode: (on: boolean) => void;
};

export function useGalleryExperimentGridHandlers({
  experimentWinners,
  setExperimentWinners,
  setReviewRatings,
  setSelectedIds,
  setCompareOpen,
  setRequeueStatus,
  galleryCardActionsRef,
  setReviewMode,
}: UseGalleryExperimentGridHandlersArgs) {
  const onReviewRun = useCallback(
    (runEntries: ComfyGalleryEntry[]) => {
      const first = firstUnreviewedInRun(runEntries);
      if (!first) {
        return;
      }
      setSelectedIds([first.id]);
      setReviewMode(true);
    },
    [setReviewMode, setSelectedIds]
  );

  const onCrownExperiment = useCallback(
    (groupId: string, entryId: string) => {
      if (experimentWinners[groupId]?.entryId === entryId) {
        clearExperimentWinner(groupId);
      } else {
        markExperimentWinner(groupId, entryId);
        setReviewRatings([entryId], 5);
      }
      setExperimentWinners(loadExperimentWinners());
    },
    [experimentWinners, setExperimentWinners, setReviewRatings]
  );

  const onCompareExperiment = useCallback(
    (entriesForCompare: ComfyGalleryEntry[]) => {
      setSelectedIds(entriesForCompare.slice(0, 4).map(entry => entry.id));
      setCompareOpen(true);
    },
    [setCompareOpen, setSelectedIds]
  );

  const onRequeueExperiment = useCallback(
    (entriesForRequeue: ComfyGalleryEntry[]) => {
      setRequeueStatus(`Re-queueing ${entriesForRequeue.length} still(s) with new seeds…`);
      void import('@/lib/comfyui-requeue')
        .then(({ requeueComfyJobs }) =>
          requeueComfyJobs(
            entriesForRequeue.map(entry => ({
              prompt: entry.prompt,
              negativePrompt: entry.negativePrompt,
              tool: entry.tool,
              model: entry.model,
              queueParams: entry.queueParams,
              newSeed: true,
              parentGalleryEntryId: entry.id,
              derivedKind: 'variation' as const,
            })),
            setRequeueStatus
          )
        )
        .then(({ queued, failed }) => {
          toastBulkQueueSummary({
            label: 'Experiment re-queue finished',
            queued,
            failed,
          });
        });
    },
    [setRequeueStatus]
  );

  const onWinnerUpscale = useCallback(
    (entry: ComfyGalleryEntry) => galleryCardActionsRef.current.upscale(entry.id, 'final'),
    [galleryCardActionsRef]
  );

  const onWinnerRefine = useCallback(
    (entry: ComfyGalleryEntry) => startRefineFromGalleryEntry(entry),
    []
  );

  const onWinnerContinue = useCallback(
    (entry: ComfyGalleryEntry) => startReeditRefineFromGalleryEntry(entry),
    []
  );

  return {
    onReviewRun,
    onCrownExperiment,
    onCompareExperiment,
    onRequeueExperiment,
    onWinnerUpscale,
    onWinnerRefine,
    onWinnerContinue,
  };
}
