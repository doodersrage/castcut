'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { recordAvoidedTokensFromGalleryEntry } from '@/lib/avoided-tokens';
import { recordCatalogBiasFromPrompt } from '@/lib/catalog-rating-bias';
import { learnFromLowRatedPrompt } from '@/lib/negative-learner';
import { markOnboardingGalleryReview } from '@/lib/onboarding-hooks';
import { pushNotification } from '@/lib/notification-center';
import { scrollGalleryEntryIntoView } from '@/lib/gallery-scroll';
import type { ComfyGalleryEntry, ComfyGalleryFilter } from '@/lib/comfyui-gallery';

type UseGalleryReviewOptions = {
  filter: ComfyGalleryFilter;
  visibleEntries: ComfyGalleryEntry[];
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedIdSet: Set<string>;
  setReviewRating: (id: string, rating: NonNullable<ComfyGalleryEntry['reviewRating']>) => void;
  toggleFavorite: (id: string) => void;
  onStatusMessage: (message: string) => void;
  /** When false, skip global review shortcuts (lightbox owns keyboard). */
  keyboardEnabled?: boolean;
};

export function useGalleryReview({
  filter,
  visibleEntries,
  selectedIds,
  setSelectedIds,
  selectedIdSet,
  setReviewRating,
  toggleFavorite,
  onStatusMessage,
  keyboardEnabled = true,
}: UseGalleryReviewOptions) {
  const reviewFocusIndex = useMemo(() => {
    if (!filter.reviewMode || visibleEntries.length === 0) {
      return 0;
    }
    const selectedIndex = visibleEntries.findIndex(entry => selectedIdSet.has(entry.id));
    return selectedIndex >= 0 ? selectedIndex : 0;
  }, [filter.reviewMode, visibleEntries, selectedIdSet]);

  const reviewFocusEntry = visibleEntries[reviewFocusIndex] ?? null;

  const advanceReviewFocus = useCallback(
    (entryId: string) => {
      if (!filter.reviewAutoAdvance) {
        return;
      }
      const startIndex = visibleEntries.findIndex(entry => entry.id === entryId);
      for (let index = startIndex + 1; index < visibleEntries.length; index += 1) {
        const nextEntry = visibleEntries[index];
        if (nextEntry.status === 'completed' && !nextEntry.reviewRating) {
          setSelectedIds([nextEntry.id]);
          return;
        }
      }
    },
    [filter.reviewAutoAdvance, setSelectedIds, visibleEntries]
  );

  const handleReviewRating = useCallback(
    (entry: ComfyGalleryEntry, rating: NonNullable<ComfyGalleryEntry['reviewRating']>) => {
      setReviewRating(entry.id, rating);
      recordCatalogBiasFromPrompt(entry.prompt, rating);
      if (rating >= 4) {
        void import('@/lib/sampler-memory').then(({ rememberSamplerFromGalleryEntry }) => {
          rememberSamplerFromGalleryEntry(entry);
        });
      }
      if (rating <= 2) {
        const added = recordAvoidedTokensFromGalleryEntry({
          prompt: entry.prompt,
          visionTags: entry.visionTags,
        });
        if (added > 0) {
          onStatusMessage(`Added ${added} motif(s) to avoided tokens from low rating.`);
        }
        const learned = learnFromLowRatedPrompt(entry.prompt, rating);
        if (learned > 0) {
          pushNotification({
            title: 'Negative learner',
            body: `${learned} token(s) recorded from low rating. Review in Settings → Advanced.`,
            href: '/settings',
            kind: 'system',
          });
        }
      }
      markOnboardingGalleryReview();
      void import('@/lib/auto-improve-loop')
        .then(({ runAutoImproveOnRating }) => runAutoImproveOnRating(entry, rating))
        .then(message => {
          if (message) {
            onStatusMessage(message);
          }
        })
        .catch(error => {
          onStatusMessage(
            error instanceof Error ? error.message : 'Auto-improve failed after rating.'
          );
        });
      advanceReviewFocus(entry.id);
    },
    [advanceReviewFocus, onStatusMessage, setReviewRating]
  );

  useEffect(() => {
    if (!filter.reviewMode || visibleEntries.length === 0) {
      return;
    }
    if (selectedIds.length === 0) {
      const firstCompleted =
        visibleEntries.find(entry => entry.status === 'completed') ?? visibleEntries[0];
      if (firstCompleted) {
        scheduleAfterCommit(() => {
          setSelectedIds([firstCompleted.id]);
        });
      }
    }
  }, [filter.reviewMode, selectedIds.length, setSelectedIds, visibleEntries]);

  useEffect(() => {
    if (!filter.focusEntryId?.trim()) {
      return;
    }
    const id = filter.focusEntryId.trim();
    scrollGalleryEntryIntoView(id);
    scheduleAfterCommit(() => {
      setSelectedIds(previous => (previous.includes(id) ? previous : [id]));
    });
  }, [filter.focusEntryId, setSelectedIds, visibleEntries.length]);

  useEffect(() => {
    if (!filter.reviewMode || !reviewFocusEntry) {
      return;
    }
    scrollGalleryEntryIntoView(reviewFocusEntry.id);
  }, [filter.reviewMode, reviewFocusEntry?.id, reviewFocusEntry]);

  useEffect(() => {
    if (!keyboardEnabled || !filter.reviewMode || !reviewFocusEntry) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key >= '1' && event.key <= '5') {
        const rating = Number(event.key) as 1 | 2 | 3 | 4 | 5;
        handleReviewRating(reviewFocusEntry, rating);
        event.preventDefault();
        return;
      }

      if (event.key === 'f' || event.key === 'F') {
        toggleFavorite(reviewFocusEntry.id);
        event.preventDefault();
        return;
      }

      if (event.key === 'n' || event.key === 'N' || event.key === 'ArrowRight') {
        const nextIndex = Math.min(reviewFocusIndex + 1, visibleEntries.length - 1);
        const nextEntry = visibleEntries[nextIndex];
        if (nextEntry) {
          setSelectedIds([nextEntry.id]);
        }
        event.preventDefault();
        return;
      }

      if (event.key === 'p' || event.key === 'P' || event.key === 'ArrowLeft') {
        const previousIndex = Math.max(reviewFocusIndex - 1, 0);
        const previousEntry = visibleEntries[previousIndex];
        if (previousEntry) {
          setSelectedIds([previousEntry.id]);
        }
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    filter.reviewMode,
    handleReviewRating,
    keyboardEnabled,
    reviewFocusEntry,
    reviewFocusIndex,
    setSelectedIds,
    toggleFavorite,
    visibleEntries,
  ]);

  return {
    reviewFocusIndex,
    reviewFocusEntry,
    handleReviewRating,
  };
}
