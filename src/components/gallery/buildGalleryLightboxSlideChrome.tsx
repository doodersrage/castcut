'use client';

import type { ImageLightboxSlideChrome, ImageLightboxState } from '@/components/ui/ImageLightbox';
import {
  startComposeFromGalleryEntry,
  startControlNetFromGalleryEntry,
  startImproveFromGalleryEntry,
  startInpaintFromGalleryEntry,
  startOutpaintFromGalleryEntry,
  startReeditComposeFromGalleryEntry,
  startReeditRefineFromGalleryEntry,
  startVideoFromGalleryEntry,
} from '@/lib/improve-output';
import { comfyUiJobProgressPercent, comfyUiJobStatusLabel } from '@/lib/comfyui-job-status';
import { formatComfyHostLabel } from '@/lib/queue-status-notes';
import { galleryDerivedKindLabel } from '@/lib/gallery-derived-kind';
import {
  applyGalleryPromptAndStackToSession,
  applyGalleryStackToSession,
  galleryEntryCanSaveLook,
  galleryEntryHasRestorableStack,
  saveGalleryLookFromEntry,
} from '@/lib/gallery-stack-restore';
import { applyGalleryFaceToSession, galleryEntryCanLockFace } from '@/lib/gallery-identity-lock';
import { galleryToolHrefForEntry, galleryToolLabel } from '@/lib/gallery-tool-href';
import {
  galleryEntryLightboxUrls,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryThumbUrl,
  resolveGalleryLightboxEntry,
  resolveGalleryLightboxOpenIndex,
  setGalleryReviewNote,
  type ComfyGalleryEntry,
  type ComfyGalleryFilter,
} from '@/lib/comfyui-gallery';

export type BuildGalleryLightboxSlideChromeArgs = {
  resolvedLightbox: ImageLightboxState | null;
  lightboxEntries: ComfyGalleryEntry[];
  entries: ComfyGalleryEntry[];
  entryIdsWithDerivatives: Set<string>;
  selectedIdSet: Set<string>;
  selectedIds: string[];
  router: { push: (href: string) => void };
  handleReviewRating: (
    entry: ComfyGalleryEntry,
    rating: NonNullable<ComfyGalleryEntry['reviewRating']>
  ) => void;
  toggleFavorite: (id: string) => void;
  toggleSelected: (id: string) => void;
  removeEntry: (id: string) => void;
  setRequeueStatus: (status: string | null) => void;
  setCompareOpen: (open: boolean) => void;
  setFilter: (updater: (previous: ComfyGalleryFilter) => ComfyGalleryFilter) => void;
  applyPlaylistState: (index: number) => void;
};

export function buildGalleryLightboxSlideChrome({
  resolvedLightbox,
  lightboxEntries,
  entries,
  entryIdsWithDerivatives,
  selectedIdSet,
  selectedIds,
  router,
  handleReviewRating,
  toggleFavorite,
  toggleSelected,
  removeEntry,
  setRequeueStatus,
  setCompareOpen,
  setFilter,
  applyPlaylistState,
}: BuildGalleryLightboxSlideChromeArgs): ImageLightboxSlideChrome | null {
  if (!resolvedLightbox) {
    return null;
  }
  const resolved = resolveGalleryLightboxEntry(lightboxEntries, resolvedLightbox.index);
  if (!resolved) {
    return null;
  }
  const { entry } = resolved;
  const isVideo = galleryEntryPrimaryMediaKind(entry) === 'video';
  const completed = entry.status === 'completed';
  const qp = entry.queueParams;
  const parentId = entry.parentGalleryEntryId;
  const hasParent = Boolean(parentId);
  const hasDerivatives = entryIdsWithDerivatives.has(entry.id);
  const hasSibling = Boolean(
    parentId && entries.some(item => item.parentGalleryEntryId === parentId && item.id !== entry.id)
  );
  const paramString = (value: unknown) =>
    value === undefined || value === null || value === '' ? undefined : String(value);
  const parentEntry = parentId ? entries.find(item => item.id === parentId) : undefined;
  const beforeAfterUrl = parentEntry
    ? galleryEntryLightboxUrls(parentEntry)[0] ||
      galleryEntryPrimaryThumbUrl(parentEntry) ||
      undefined
    : undefined;
  const jobLive =
    entry.status === 'pending' || entry.status === 'running' || entry.status === 'error'
      ? {
          status: entry.status,
          label:
            entry.statusMessage?.trim() ||
            comfyUiJobStatusLabel({
              status: entry.status,
              progressValue: entry.progressValue,
              progressMax: entry.progressMax,
              progressNode: entry.progressNode,
              queuePosition: entry.queuePosition,
              promptId: entry.promptId,
            }),
          percent: comfyUiJobProgressPercent(entry),
        }
      : null;

  return {
    rating: entry.reviewRating ?? null,
    favorite: Boolean(entry.favorite),
    onRate: rating => handleReviewRating(entry, rating),
    onToggleFavorite: () => toggleFavorite(entry.id),
    showImprove: completed && !isVideo,
    showCompose: completed && !isVideo,
    showInpaint: completed && !isVideo,
    showExact: Boolean(entry.hasStoredWorkflow || entry.workflowJson),
    showUseStack: galleryEntryHasRestorableStack(entry),
    showUsePromptStack: galleryEntryHasRestorableStack(entry) && Boolean(entry.prompt?.trim()),
    showUseFace: galleryEntryCanLockFace(entry),
    showSaveLook: galleryEntryCanSaveLook(entry),
    showRequeue: true,
    onImprove: () => startImproveFromGalleryEntry(entry),
    onCompose: () => startComposeFromGalleryEntry(entry),
    onInpaint: () => startInpaintFromGalleryEntry(entry),
    onExactRequeue: () => {
      setRequeueStatus('Replaying exact graph…');
      void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
        requeueComfyJobFromEntry(entry, {
          newSeed: false,
          exactGraph: true,
          onStatus: setRequeueStatus,
        })
      );
    },
    onUseStack: galleryEntryHasRestorableStack(entry)
      ? () => {
          applyGalleryStackToSession(entry);
          router.push(galleryToolHrefForEntry(entry));
        }
      : undefined,
    onUsePromptStack:
      galleryEntryHasRestorableStack(entry) && entry.prompt?.trim()
        ? () => {
            applyGalleryPromptAndStackToSession(entry);
            router.push(galleryToolHrefForEntry(entry));
          }
        : undefined,
    onUseFace: galleryEntryCanLockFace(entry)
      ? () => {
          setRequeueStatus(`Locking face on ${galleryToolLabel(entry.tool)}…`);
          void applyGalleryFaceToSession(entry).then(result => {
            if (result.ok) {
              router.push(galleryToolHrefForEntry(entry));
              return;
            }
            setRequeueStatus(result.error ?? 'Face lock failed.');
          });
        }
      : undefined,
    onSaveLook: galleryEntryCanSaveLook(entry)
      ? () => {
          const saved = saveGalleryLookFromEntry(entry);
          setRequeueStatus(
            saved.ok ? `Saved look · ${saved.label}` : (saved.error ?? 'Save look failed.')
          );
        }
      : undefined,
    onRequeue: () => {
      setRequeueStatus('Re-queueing…');
      void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
        requeueComfyJobFromEntry(entry, {
          newSeed: false,
          onStatus: setRequeueStatus,
        })
      );
    },
    onRetryStickyHost: entry.comfyUrl?.trim()
      ? () => {
          setRequeueStatus(`Re-queueing on ${entry.comfyUrl}…`);
          void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
            requeueComfyJobFromEntry(entry, {
              newSeed: false,
              exactGraph: Boolean(entry.hasStoredWorkflow || entry.workflowJson),
              comfyUrlOverride: entry.comfyUrl,
              onStatus: setRequeueStatus,
            })
          );
        }
      : undefined,
    showSeedVariation: completed,
    onRequeueNewSeed: completed
      ? () => {
          setRequeueStatus('Re-queueing with new seed…');
          void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
            requeueComfyJobFromEntry(entry, {
              newSeed: true,
              exactGraph: false,
              onStatus: setRequeueStatus,
            })
          );
        }
      : undefined,
    onRequeueSeedPlusOne: completed
      ? () => {
          const currentSeed = Number(entry.queueParams?.seed);
          if (!Number.isFinite(currentSeed)) {
            setRequeueStatus('Re-queueing with new seed…');
            void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
              requeueComfyJobFromEntry(entry, {
                newSeed: true,
                exactGraph: false,
                onStatus: setRequeueStatus,
              })
            );
            return;
          }
          const nextSeed = Math.trunc(currentSeed) + 1;
          setRequeueStatus(`Re-queueing with seed ${nextSeed}…`);
          void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
            requeueComfyJobFromEntry(entry, {
              seedOverride: nextSeed,
              exactGraph: false,
              onStatus: setRequeueStatus,
            })
          );
        }
      : undefined,
    note: entry.reviewNote ?? '',
    onNoteChange: note => {
      setGalleryReviewNote(entry.id, note);
      setRequeueStatus(note.trim() ? 'Review note saved' : 'Review note cleared');
    },
    meta: {
      model: entry.model,
      tool: entry.tool,
      seed: paramString(qp?.seed),
      cfg: paramString(qp?.cfg),
      steps: paramString(qp?.steps),
      width: paramString(qp?.width),
      height: paramString(qp?.height),
      prompt: entry.prompt,
      negativePrompt: entry.negativePrompt,
      derivedKind: galleryDerivedKindLabel(entry.derivedKind),
      host: formatComfyHostLabel(entry.comfyUrl) ?? undefined,
    },
    onCopyPrompt: entry.prompt
      ? () => {
          void navigator.clipboard.writeText(entry.prompt).catch(() => undefined);
        }
      : undefined,
    onCopyNegative: entry.negativePrompt
      ? () => {
          void navigator.clipboard.writeText(entry.negativePrompt ?? '').catch(() => undefined);
        }
      : undefined,
    compareSelected: selectedIdSet.has(entry.id),
    compareCount: selectedIds.length,
    onAddToCompare: () => {
      toggleSelected(entry.id);
      const nextSelected = selectedIdSet.has(entry.id)
        ? selectedIds.length - 1
        : selectedIds.length + 1;
      setRequeueStatus(
        nextSelected === 0
          ? 'Removed from compare selection'
          : `${nextSelected} selected for compare${
              nextSelected >= 2 && nextSelected <= 4
                ? ' · ready'
                : nextSelected > 4
                  ? ' · max 4'
                  : ''
            }`
      );
    },
    onOpenCompare: () => {
      if (selectedIds.length >= 2 && selectedIds.length <= 4) {
        setCompareOpen(true);
      } else if (!selectedIdSet.has(entry.id) && selectedIds.length === 1) {
        toggleSelected(entry.id);
        setCompareOpen(true);
      } else {
        setRequeueStatus('Select 2–4 images to compare');
      }
    },
    onRemove: () => {
      if (!window.confirm('Remove this entry from the gallery?')) {
        return;
      }
      removeEntry(entry.id);
      setRequeueStatus('Removed from gallery');
    },
    hasParent,
    hasDerivatives,
    hasSibling,
    beforeAfterUrl,
    beforeAfterLabel: beforeAfterUrl
      ? galleryDerivedKindLabel(entry.derivedKind) || 'Parent'
      : undefined,
    job: jobLive,
    showOutpaint: completed && !isVideo,
    showControlNet: completed && !isVideo,
    showVideo: completed && !isVideo,
    onOutpaint: completed && !isVideo ? () => startOutpaintFromGalleryEntry(entry) : undefined,
    onControlNet: completed && !isVideo ? () => startControlNetFromGalleryEntry(entry) : undefined,
    onVideo: completed && !isVideo ? () => startVideoFromGalleryEntry(entry) : undefined,
    onReeditRefine: completed ? () => startReeditRefineFromGalleryEntry(entry) : undefined,
    onReeditCompose:
      completed && !isVideo ? () => startReeditComposeFromGalleryEntry(entry) : undefined,
    onShowParent: hasParent
      ? () => {
          if (!parentId) {
            return;
          }
          if (lightboxEntries.some(item => item.id === parentId)) {
            applyPlaylistState(resolveGalleryLightboxOpenIndex(lightboxEntries, parentId, 0));
            setRequeueStatus('Jumped to parent output');
            return;
          }
          setFilter(previous => ({
            ...previous,
            focusEntryId: parentId,
            derivativeOfEntryId: undefined,
            similarToEntryId: undefined,
          }));
          setRequeueStatus('Showing source output…');
        }
      : undefined,
    onShowDerivatives: hasDerivatives
      ? () => {
          setFilter(previous => ({
            ...previous,
            derivativeOfEntryId: entry.id,
            focusEntryId: undefined,
            similarToEntryId: undefined,
          }));
          setRequeueStatus('Showing derived outputs…');
        }
      : undefined,
    onJumpToSibling: hasSibling
      ? () => {
          if (!parentId) {
            return;
          }
          const siblings = lightboxEntries.filter(item => item.parentGalleryEntryId === parentId);
          if (siblings.length >= 2) {
            const current = siblings.findIndex(item => item.id === entry.id);
            const next = siblings[(current + 1) % siblings.length];
            if (next) {
              applyPlaylistState(resolveGalleryLightboxOpenIndex(lightboxEntries, next.id, 0));
              setRequeueStatus('Jumped to sibling output');
            }
            return;
          }
          setFilter(previous => ({
            ...previous,
            derivativeOfEntryId: parentId,
            focusEntryId: undefined,
            similarToEntryId: undefined,
          }));
          setRequeueStatus('Showing sibling outputs…');
        }
      : undefined,
  };
}
