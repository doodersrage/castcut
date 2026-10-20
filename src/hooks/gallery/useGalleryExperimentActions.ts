'use client';

import { useMemo } from 'react';
import { formatMutatedJobsStatus, queueMutatedGalleryJobs } from '@/lib/gallery/mutations';
import { queueNegativeAbTest } from '@/lib/experiment/negative-ab-queue';
import { queueSeedExperiment } from '@/lib/experiment/seed-experiment-queue';
import { queueParamExperiment } from '@/lib/experiment/param-experiment-queue';
import { toastHeldMax } from '@/lib/app/toast';
import {
  galleryTopicsPath,
  galleryVariationsPath,
  prepareGalleryTopicsFromEntry,
  prepareGalleryVariationsFromEntry,
} from '@/lib/gallery/variations-handoff';
import { resolveExperimentWinnerEntry } from '@/lib/experiment/winners';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import type { ParamExperimentAxis } from '@/lib/experiment/param-experiment-queue';
import type { GalleryBulkExperimentHandlers } from '@/hooks/gallery/gallery-panel-actions-types';

export type UseGalleryExperimentActionsInput = {
  selectedEntries: ComfyGalleryEntry[];
  paramAxis: ParamExperimentAxis;
  setRequeueStatus: (status: string | null) => void;
  router: ReturnType<typeof import('next/navigation').useRouter>;
};

export type GalleryExperimentHandlers = Pick<
  GalleryBulkExperimentHandlers,
  | 'onSeedExperiment'
  | 'onParamExperiment'
  | 'onParamGrid'
  | 'onMutateWinner'
  | 'onVariations'
  | 'onTopics'
  | 'onNegativeAb'
>;

export function useGalleryExperimentActions({
  selectedEntries,
  paramAxis,
  setRequeueStatus,
  router,
}: UseGalleryExperimentActionsInput): GalleryExperimentHandlers {
  return useMemo(
    () => ({
      onSeedExperiment: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        setRequeueStatus('Queueing seed experiment…');
        void queueSeedExperiment({
          prompt: entry.prompt,
          model: entry.model ?? 'qwen-image-2512',
          negativePrompt: entry.negativePrompt,
          hints: entry.prompt.slice(0, 200),
          count: 4,
        }).then(({ queued, held, seeds }) => {
          if (held > 0) {
            toastHeldMax({
              text: 'Max seed experiment held until ComfyUI is idle',
              count: held,
            });
          }
          setRequeueStatus(
            [
              `Seed experiment queued ${queued}`,
              held > 0 ? `held ${held}` : null,
              `seeds ${seeds.join(', ')}`,
            ]
              .filter(Boolean)
              .join(' · ')
          );
        });
      },
      onParamExperiment: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        setRequeueStatus(`Queueing ${paramAxis} experiment…`);
        void queueParamExperiment({
          prompt: entry.prompt,
          model: entry.model ?? 'qwen-image-2512',
          negativePrompt: entry.negativePrompt,
          hints: entry.prompt.slice(0, 200),
          axis: paramAxis,
          baseParams: entry.queueParams,
          count: 4,
        }).then(({ queued, held, labels }) => {
          if (held > 0) {
            toastHeldMax({
              text: 'Max param experiment held until ComfyUI is idle',
              count: held,
            });
          }
          setRequeueStatus(
            [
              `Param experiment queued ${queued}`,
              held > 0 ? `held ${held}` : null,
              labels.join(', '),
            ]
              .filter(Boolean)
              .join(' · ')
          );
        });
      },
      onParamGrid: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        setRequeueStatus('Queueing CFG × steps grid…');
        void import('@/lib/experiment/param-experiment-grid')
          .then(({ queueParamExperimentGrid }) =>
            queueParamExperimentGrid({
              prompt: entry.prompt,
              model: entry.model ?? 'qwen-image-2512',
              negativePrompt: entry.negativePrompt,
              hints: entry.prompt.slice(0, 200),
              baseParams: entry.queueParams,
            })
          )
          .then(({ queued, held, cells }) => {
            if (held > 0) {
              toastHeldMax({
                text: 'Max param grid held until ComfyUI is idle',
                count: held,
              });
            }
            setRequeueStatus(
              [
                `Param grid queued ${queued}`,
                held > 0 ? `held ${held}` : null,
                `${cells.slice(0, 4).join('; ')}${cells.length > 4 ? '…' : ''}`,
              ]
                .filter(Boolean)
                .join(' · ')
            );
          });
      },
      onMutateWinner: () => {
        const entry = resolveExperimentWinnerEntry(selectedEntries) ?? selectedEntries[0];
        if (!entry) return;
        setRequeueStatus('Mutating crowned winner…');
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
          setRequeueStatus(formatMutatedJobsStatus(jobs, queued, held));
        });
      },
      onVariations: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        prepareGalleryVariationsFromEntry(entry);
        router.push(galleryVariationsPath());
      },
      onTopics: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        prepareGalleryTopicsFromEntry(entry);
        router.push(galleryTopicsPath());
      },
      onNegativeAb: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        void queueNegativeAbTest({
          prompt: entry.prompt,
          model: entry.model ?? 'qwen-image-2512',
          negativeA: entry.negativePrompt,
          hints: entry.prompt.slice(0, 200),
        }).then(({ queued, held, seed }) => {
          if (held > 0) {
            toastHeldMax({
              text: 'Max negative A/B held until ComfyUI is idle',
              count: held,
            });
          }
          setRequeueStatus(
            [`Negative A/B queued ${queued}`, held > 0 ? `held ${held}` : null, `seed ${seed}`]
              .filter(Boolean)
              .join(' · ')
          );
        });
      },
    }),
    [paramAxis, router, selectedEntries, setRequeueStatus]
  );
}
