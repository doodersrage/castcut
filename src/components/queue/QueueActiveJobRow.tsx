'use client';

import { useEffect, useState } from 'react';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import { comfyUiJobProgressPercent } from '@/lib/comfyui-job-status';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { Button } from '@/components/ui/Button';
import QueueJobTitle from '@/components/queue/QueueJobTitle';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { formatEta } from '@/lib/queue-eta';
import type { QueueJobLabel } from '@/lib/queue-job-context';

export default function QueueActiveJobRow({
  entry,
  label,
  etaSec,
  onRetry,
  onCancel,
  onRunNext,
}: {
  entry: ComfyGalleryEntry;
  /** Where the job came from (Day slot, Story beat, tool) and where to open it. */
  label?: QueueJobLabel;
  /** Seconds until this job should be done. */
  etaSec?: number;
  onRetry: () => void;
  onCancel: () => void;
  /** Waiting jobs only: resubmit at the front of the queue. */
  onRunNext?: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    getComfyLivePreviewUrl(entry.promptId, [entry.clientId])
  );
  const percent = comfyUiJobProgressPercent(entry);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setPreviewUrl(getComfyLivePreviewUrl(entry.promptId, [entry.clientId]));
    });
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ promptId?: string; keys?: string[] }>).detail;
      const keys = detail?.keys ?? (detail?.promptId ? [detail.promptId] : []);
      const ours = [entry.promptId, entry.clientId].filter(Boolean) as string[];
      if (keys.length > 0 && ours.length > 0 && !keys.some(key => ours.includes(key))) {
        return;
      }
      setPreviewUrl(getComfyLivePreviewUrl(entry.promptId, [entry.clientId]));
    };
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    return () => {
      window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    };
  }, [entry.promptId, entry.clientId]);

  return (
    <li className="ui-list-row flex-col items-stretch gap-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-md border border-[var(--border-default)] object-cover"
          />
        ) : null}
        <div className="ui-list-primary min-w-0 space-y-1">
          <QueueJobTitle label={label} prompt={entry.prompt} />
          <p className="type-caption">
            {entry.status === 'running' ? 'Rendering' : 'Waiting'}
            {entry.queuePosition ? ` · #${entry.queuePosition}` : ''}
            {percent != null ? ` · ${percent}%` : ''}
            {etaSec ? ` · done in ${formatEta(etaSec)}` : ''}
            {entry.model ? ` · ${entry.model}` : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {onRunNext ? (
          <Button
            size="sm"
            variant="secondary"
            title="Resubmit this waiting job at the front of ComfyUI's queue"
            data-testid="queue-run-next"
            onClick={onRunNext}
          >
            Run next
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
        <Button size="sm" variant="danger" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </li>
  );
}
