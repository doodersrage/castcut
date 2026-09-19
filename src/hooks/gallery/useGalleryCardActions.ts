'use client';

import { useLayoutEffect, useRef } from 'react';
import type { GalleryCardActions } from '@/components/gallery/GalleryCardItem';
import { startAnatomyRepairFromGalleryEntry } from '@/lib/improve-output';
import { toastHeldMax, toastQueueOutcome } from '@/lib/app-toast';
import { buildGalleryHandoff, galleryHandoffPath, saveGalleryHandoff } from '@/lib/gallery-handoff';
import { cancelComfyGalleryJob } from '@/lib/comfyui-queue-cancel';
import { galleryEntryPrimaryMediaKind, type ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { loadSettingsCache } from '@/lib/settings-cache';
import type { UseGalleryPanelActionsInput } from '@/hooks/gallery/gallery-panel-actions-types';

const loadGalleryRequeue = () => import('@/lib/comfyui-requeue');

export const EMPTY_GALLERY_CARD_ACTIONS: GalleryCardActions = {
  toggleSelected: () => undefined,
  remove: () => undefined,
  toggleFavorite: () => undefined,
  requeue: () => undefined,
  cancel: () => undefined,
  upscale: () => undefined,
  refine: () => undefined,
  softSecondPass: () => undefined,
  skinRefine: () => undefined,
  faceDetail: () => undefined,
  anatomyRepair: () => undefined,
  moireClean: () => undefined,
  showParent: () => undefined,
  showDerivatives: () => undefined,
  openImage: () => undefined,
  prefetchImage: () => undefined,
  reviewRating: () => undefined,
  downloadError: () => undefined,
  visionTagClick: () => undefined,
  userTagClick: () => undefined,
  customGroupClick: () => undefined,
  viewWorkflow: () => undefined,
  restoreExactGraph: () => undefined,
  pick: () => undefined,
};

export type UseGalleryCardActionsInput = Pick<
  UseGalleryPanelActionsInput,
  | 'entriesRef'
  | 'toggleSelected'
  | 'removeEntry'
  | 'toggleFavorite'
  | 'setRequeueStatus'
  | 'setDownloadError'
  | 'setFilter'
  | 'setWorkflowEntry'
  | 'openLightboxForEntryId'
  | 'prefetchLightboxForEntryId'
  | 'handleReviewRating'
  | 'pickFor'
  | 'router'
>;

export function useGalleryCardActions({
  entriesRef,
  toggleSelected,
  removeEntry,
  toggleFavorite,
  setRequeueStatus,
  setDownloadError,
  setFilter,
  setWorkflowEntry,
  openLightboxForEntryId,
  prefetchLightboxForEntryId,
  handleReviewRating,
  pickFor,
  router,
}: UseGalleryCardActionsInput) {
  const galleryCardActionsRef = useRef<GalleryCardActions>(EMPTY_GALLERY_CARD_ACTIONS);

  useLayoutEffect(() => {
    galleryCardActionsRef.current = {
      toggleSelected,
      remove: removeEntry,
      toggleFavorite: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        const willFavorite = entry ? !entry.favorite : false;
        toggleFavorite(id);
        if (entry && willFavorite) {
          void import('@/lib/auto-improve-loop')
            .then(({ runAutoImproveOnFavorite }) => runAutoImproveOnFavorite(entry, true))
            .then(message => {
              if (message) {
                setRequeueStatus(message);
              }
            });
        }
      },
      requeue: (
        id: string,
        newSeed: boolean,
        qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile,
        options?: { exactGraph?: boolean; stickyHost?: boolean }
      ) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        const exactGraph = options?.exactGraph !== false;
        const stickyHost = options?.stickyHost === true && Boolean(entry.comfyUrl?.trim());
        setRequeueStatus(
          stickyHost
            ? `Re-queueing on ${entry.comfyUrl}…`
            : exactGraph
              ? 'Replaying exact graph…'
              : 'Queueing variation…'
        );
        void loadGalleryRequeue()
          .then(({ requeueComfyJobFromEntry }) =>
            requeueComfyJobFromEntry(entry, {
              newSeed,
              qualityProfile,
              exactGraph,
              ...(stickyHost ? { comfyUrlOverride: entry.comfyUrl } : {}),
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              const message = result.error ?? 'Re-queue failed.';
              setRequeueStatus(message);
              toastQueueOutcome({ ok: false, text: message });
              return;
            }
            const profileNote = qualityProfile ? `${qualityProfile} quality · ` : '';
            const message = [
              'queued variation',
              profileNote,
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
              newSeed ? 'new seed' : 'same params',
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      cancel: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus('Cancelling job…');
        void cancelComfyGalleryJob(entry).then(result => {
          if (!result.ok) {
            const message = result.error ?? 'Cancel failed.';
            setRequeueStatus(message);
            toastQueueOutcome({ ok: false, text: message });
            return;
          }
          setRequeueStatus('Job cancelled.');
          toastQueueOutcome({ ok: true, text: 'Job cancelled' });
        });
      },
      upscale: (id: string, qualityProfile: 'final' | 'max', options?: { force?: boolean }) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus(options?.force ? 'Force upscaling…' : 'Upscaling…');
        void loadGalleryRequeue()
          .then(({ requeueUpscaleFromGalleryEntry }) =>
            requeueUpscaleFromGalleryEntry(entry, {
              qualityProfile,
              force: options?.force,
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Upscale failed.');
              toastQueueOutcome({ ok: false, text: result.error ?? 'Upscale failed.' });
              return;
            }
            if (result.held) {
              const message = 'Max upscale held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              options?.force ? 'force upscale queued' : 'upscale queued',
              result.vramDowngraded
                ? 'Max → Final (VRAM)'
                : `${qualityProfile} quality · same image`,
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      refine: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus('Queueing low-denoise refine…');
        void loadGalleryRequeue()
          .then(({ requeueRefineFromGalleryEntry }) =>
            requeueRefineFromGalleryEntry(entry, {
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Refine failed.');
              toastQueueOutcome({ ok: false, text: result.error ?? 'Refine failed.' });
              return;
            }
            if (result.held) {
              const message = 'Max refine held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              'refine queued',
              result.vramDowngraded ? 'Max → Final (VRAM)' : 'low denoise · same seed',
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      softSecondPass: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus('Queueing soft second pass…');
        void loadGalleryRequeue()
          .then(({ requeueSoftSecondPassFromGalleryEntry }) =>
            requeueSoftSecondPassFromGalleryEntry(entry, {
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Soft second pass failed.');
              toastQueueOutcome({
                ok: false,
                text: result.error ?? 'Soft second pass failed.',
              });
              return;
            }
            if (result.held) {
              const message = 'Soft second pass held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              'soft second pass queued',
              result.vramDowngraded ? 'Max → Final (VRAM)' : 'gentle denoise · same seed',
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      skinRefine: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus('Queueing skin refine…');
        void Promise.all([
          loadGalleryRequeue(),
          import('@/lib/comfyui-settings'),
          import('@/lib/play-skin-refine'),
        ])
          .then(([{ requeueSkinRefineFromGalleryEntry }, { loadComfyUiSettings }, skin]) => {
            const settings = loadComfyUiSettings();
            const model = skin.resolvePlaySkinRefineQueueModel(settings);
            return requeueSkinRefineFromGalleryEntry(entry, {
              model,
              onStatus: setRequeueStatus,
            });
          })
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Skin refine failed.');
              toastQueueOutcome({
                ok: false,
                text: result.error ?? 'Skin refine failed.',
              });
              return;
            }
            if (result.held) {
              const message = 'Skin refine held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              'skin refine queued',
              result.vramDowngraded ? 'Max → Final (VRAM)' : 'natural skin · pose locked',
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      faceDetail: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus('Queueing face detail…');
        void loadGalleryRequeue()
          .then(({ requeueFaceDetailFromGalleryEntry }) =>
            requeueFaceDetailFromGalleryEntry(entry, {
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Face detail failed.');
              toastQueueOutcome({ ok: false, text: result.error ?? 'Face detail failed.' });
              return;
            }
            if (result.held) {
              const message = 'Face detail held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              'face detail queued',
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      anatomyRepair: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        startAnatomyRepairFromGalleryEntry(entry);
      },
      moireClean: (id: string, qualityProfile: 'final' | 'max', options?: { force?: boolean }) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus(
          options?.force
            ? qualityProfile === 'max'
              ? 'Force moiré clean (Max)…'
              : 'Force moiré clean (Final)…'
            : qualityProfile === 'max'
              ? 'Queueing moiré clean (Max)…'
              : 'Queueing moiré clean (Final)…'
        );
        void loadGalleryRequeue()
          .then(({ requeueMoireCleanFromGalleryEntry }) =>
            requeueMoireCleanFromGalleryEntry(entry, {
              qualityProfile,
              force: options?.force,
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Moiré clean failed.');
              toastQueueOutcome({
                ok: false,
                text: result.error ?? 'Moiré clean failed.',
              });
              return;
            }
            if (result.held) {
              const message = 'Max moiré clean held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              options?.force ? 'force moiré clean queued' : 'moiré clean queued',
              result.vramDowngraded
                ? 'Max → Final (VRAM)'
                : qualityProfile === 'max'
                  ? 'Max · blur → bicubic → Lanczos'
                  : 'Final · soft blur only',
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      showParent: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry?.parentGalleryEntryId) {
          return;
        }
        setFilter(previous => ({
          ...previous,
          focusEntryId: entry.parentGalleryEntryId,
          derivativeOfEntryId: undefined,
          similarToEntryId: undefined,
        }));
        setRequeueStatus('Showing source output…');
      },
      showDerivatives: (id: string) => {
        setFilter(previous => ({
          ...previous,
          derivativeOfEntryId: id,
          focusEntryId: undefined,
          similarToEntryId: undefined,
        }));
        setRequeueStatus('Showing derived outputs…');
      },
      openImage: openLightboxForEntryId,
      prefetchImage: prefetchLightboxForEntryId,
      reviewRating: (id: string, rating: ComfyGalleryEntry['reviewRating']) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (entry && rating) {
          handleReviewRating(entry, rating);
        }
      },
      downloadError: setDownloadError,
      visionTagClick: (tag: string) => {
        setFilter(previous => ({ ...previous, query: tag, userTag: undefined }));
      },
      userTagClick: (tag: string) => {
        setFilter(previous => ({
          ...previous,
          userTag: previous.userTag === tag ? undefined : tag,
        }));
      },
      customGroupClick: (group: string) => {
        setFilter(previous => ({
          ...previous,
          customGroup: previous.customGroup === group ? undefined : group,
        }));
      },
      viewWorkflow: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (entry) {
          setWorkflowEntry(entry);
        }
      },
      restoreExactGraph: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry?.promptId?.trim()) {
          setRequeueStatus('No Comfy prompt id — cannot restore graph.');
          return;
        }
        setRequeueStatus('Restoring exact graph from ComfyUI history…');
        void loadGalleryRequeue()
          .then(({ restoreExactGraphFromComfyHistory }) =>
            restoreExactGraphFromComfyHistory(entry, { onStatus: setRequeueStatus })
          )
          .then(result => {
            setRequeueStatus(result.message);
          })
          .catch(error => {
            setRequeueStatus(
              error instanceof Error ? error.message : 'Failed to restore exact graph.'
            );
          });
      },
      pick: (id: string) => {
        const target = pickFor;
        if (!target) {
          return;
        }
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry || entry.status !== 'completed') {
          setRequeueStatus('Pick a completed still image.');
          return;
        }
        if (galleryEntryPrimaryMediaKind(entry) !== 'image') {
          setRequeueStatus('Only still images can be picked in this mode.');
          return;
        }
        if (target === 'cast') {
          const fromQuery =
            typeof window !== 'undefined'
              ? new URLSearchParams(window.location.search).get('character')?.trim() || ''
              : '';
          const characterId =
            fromQuery ||
            (typeof window !== 'undefined'
              ? loadSettingsCache().shared.activeCharacterId?.trim() || ''
              : '');
          if (characterId) {
            saveGalleryHandoff({
              ...buildGalleryHandoff(entry, target),
              characterId,
            });
            router.push(galleryHandoffPath(target, { characterId }));
            return;
          }
          setRequeueStatus('Open Cast look plate → Choose from Gallery so the character is known.');
          return;
        }
        saveGalleryHandoff(buildGalleryHandoff(entry, target));
        router.push(galleryHandoffPath(target));
      },
    };
  }, [
    entriesRef,
    toggleSelected,
    removeEntry,
    toggleFavorite,
    setRequeueStatus,
    setDownloadError,
    openLightboxForEntryId,
    prefetchLightboxForEntryId,
    handleReviewRating,
    setFilter,
    setWorkflowEntry,
    pickFor,
    router,
  ]);

  return galleryCardActionsRef;
}
