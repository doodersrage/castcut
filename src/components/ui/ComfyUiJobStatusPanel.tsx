'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  comfyUiJobEngineLabel,
  comfyUiJobProgressPercent,
  comfyUiJobStatusLabel,
  formatComfyUiJobProgressLabel,
  isComfyUiJobProcessing,
  type ComfyUiJobTrackerState,
} from '@/lib/comfyui-job-status';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import { loadComfyGallery, COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery';
import { cancelComfyGalleryJob } from '@/lib/comfyui-queue-cancel';
import { cancelComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import { cancelComfyUiJob } from '@/lib/comfyui-queue-control';
import { toastQueueOutcome } from '@/lib/app-toast';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

type ComfyUiJobStatusPanelProps = {
  job: ComfyUiJobTrackerState;
  compact?: boolean;
  /** Called after a successful cancel so parents can sync tracker state. */
  onCancelled?: (job: ComfyUiJobTrackerState) => void;
};

function statusTone(job: ComfyUiJobTrackerState): string {
  if (job.status === 'running') {
    return 'text-[var(--tint-info-text)] border-[var(--tint-info-border)] bg-[var(--tint-info-bg)]';
  }
  if (job.status === 'pending') {
    return 'text-[var(--accent-text)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]';
  }
  if (job.status === 'error') {
    return 'text-[var(--tint-danger-text)] border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)]';
  }
  return 'text-[var(--tint-success-text)] border-[var(--tint-success-border)] bg-[var(--tint-success-bg)]';
}

function isCancelledJob(job: ComfyUiJobTrackerState): boolean {
  return job.status === 'error' && Boolean(job.statusMessage?.toLowerCase().includes('cancel'));
}

function ProgressBar({ percent, label }: { percent: number; label?: string | null }) {
  return (
    <div className="space-y-1.5 pt-1">
      <div
        className="ui-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label || `Generation progress ${percent}%`}
      >
        <div className="ui-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {label ? <p className="type-caption text-[var(--text-tertiary)]">{label}</p> : null}
    </div>
  );
}

function cancelledJobState(job: ComfyUiJobTrackerState): ComfyUiJobTrackerState {
  return {
    ...job,
    status: 'error',
    statusMessage: 'Cancelled',
    queuePosition: null,
    progressValue: undefined,
    progressMax: undefined,
    progressNode: undefined,
  };
}

export default function ComfyUiJobStatusPanel({
  job,
  compact = false,
  onCancelled,
}: ComfyUiJobStatusPanelProps) {
  const [localCancel, setLocalCancel] = useState<{
    promptId: string;
    phase: 'cancelling' | 'cancelled';
  } | null>(null);

  const cancelledOverride =
    localCancel?.promptId === job.promptId && localCancel.phase === 'cancelled'
      ? cancelledJobState(job)
      : null;
  const cancelling = localCancel?.promptId === job.promptId && localCancel.phase === 'cancelling';

  // Mirror external cancels (system tray / queue) into this panel.
  useEffect(() => {
    if (!isComfyUiJobProcessing(job)) {
      return;
    }
    if (localCancel?.promptId === job.promptId && localCancel.phase === 'cancelled') {
      return;
    }
    const promptId = job.promptId;
    const syncFromGallery = () => {
      const entry = loadComfyGallery().find(item => item.promptId === promptId);
      if (entry?.status === 'error' && entry.statusMessage?.toLowerCase().includes('cancel')) {
        setLocalCancel({ promptId, phase: 'cancelled' });
      }
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncFromGallery);
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncFromGallery);
  }, [job, localCancel]);

  const displayJob = cancelledOverride ?? job;
  const processing = isComfyUiJobProcessing(displayJob);
  const cancelled = isCancelledJob(displayJob);
  const label = comfyUiJobStatusLabel(displayJob);
  const percent = comfyUiJobProgressPercent(displayJob);
  const progressLabel = formatComfyUiJobProgressLabel(displayJob);
  const engineLabel = comfyUiJobEngineLabel(displayJob);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    () => displayJob.previewUrl ?? getComfyLivePreviewUrl(displayJob.promptId)
  );

  useEffect(() => {
    scheduleAfterCommit(() => {
      setPreviewUrl(displayJob.previewUrl ?? getComfyLivePreviewUrl(displayJob.promptId));
    });
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ promptId?: string; keys?: string[] }>).detail;
      const keys = detail?.keys ?? (detail?.promptId ? [detail.promptId] : []);
      if (keys.length > 0 && !keys.includes(displayJob.promptId)) {
        return;
      }
      setPreviewUrl(displayJob.previewUrl ?? getComfyLivePreviewUrl(displayJob.promptId));
    };
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    return () => {
      window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    };
  }, [displayJob.previewUrl, displayJob.promptId]);

  const handleCancel = () => {
    if (!processing || cancelling) {
      return;
    }
    const promptId = job.promptId.trim();
    setLocalCancel({ promptId: job.promptId, phase: 'cancelling' });
    const galleryEntry = loadComfyGallery().find(
      entry => entry.promptId === promptId || entry.id === promptId
    );

    void (
      galleryEntry
        ? cancelComfyGalleryJob(galleryEntry)
        : cancelComfyUiJob({
            promptId,
            comfyUrl: job.comfyUrl,
            deleteHistory: true,
          }).then(result => {
            cancelComfyGalleryPoll(promptId);
            return result;
          })
    )
      .then(result => {
        if (!result.ok) {
          setLocalCancel(null);
          toastQueueOutcome({ ok: false, text: result.error ?? 'Cancel failed.' });
          return;
        }
        const next = cancelledJobState(job);
        setLocalCancel({ promptId: job.promptId, phase: 'cancelled' });
        onCancelled?.(next);
        toastQueueOutcome({ ok: true, text: 'Job cancelled' });
      })
      .catch(() => {
        setLocalCancel(null);
        toastQueueOutcome({ ok: false, text: 'Cancel failed.' });
      });
  };

  return (
    <div
      className={`ui-card overflow-hidden border ${statusTone(displayJob)}`}
      role="status"
      aria-live="polite"
      aria-busy={processing}
    >
      <div className={`flex items-start gap-3 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
        {processing && !previewUrl ? (
          <span className="ui-spinner ui-spinner-sm mt-0.5 shrink-0" aria-hidden />
        ) : !processing ? (
          <span
            className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
              displayJob.status === 'error' ? 'bg-[var(--tint-danger)]' : 'bg-[var(--tint-success)]'
            }`}
            aria-hidden
          />
        ) : null}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-medium ${compact ? 'type-caption' : 'type-body-sm'}`}>
              {displayJob.status === 'running'
                ? `${engineLabel} is generating`
                : displayJob.status === 'pending'
                  ? `${engineLabel} job queued`
                  : cancelled
                    ? `${engineLabel} job cancelled`
                    : displayJob.status === 'error'
                      ? `${engineLabel} job failed`
                      : `${engineLabel} job finished`}
            </p>
            <span className="rounded-full border border-current/20 px-2 py-0.5 type-overline opacity-90">
              {percent != null && displayJob.status === 'running' ? 'Running' : label}
            </span>
            {percent != null ? (
              <span className="rounded-full border border-current/20 px-2 py-0.5 type-caption tabular-nums">
                {percent}%
              </span>
            ) : null}
            {processing ? (
              <button
                type="button"
                disabled={cancelling}
                data-testid="comfy-job-cancel"
                onClick={handleCancel}
                className="ml-auto shrink-0 rounded-lg border border-current/25 px-2.5 py-1 type-caption font-medium transition hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            ) : null}
          </div>

          {processing && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Live ComfyUI preview"
              className="mt-1 max-h-56 w-full rounded-lg border border-[var(--border-default)]/50 object-contain bg-[var(--bg-base)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            />
          ) : null}

          {displayJob.statusMessage?.trim() && displayJob.statusMessage.trim() !== progressLabel ? (
            <p className="type-caption text-[var(--text-secondary)]">{displayJob.statusMessage}</p>
          ) : null}

          {percent != null ? <ProgressBar percent={percent} label={progressLabel} /> : null}

          <p className="type-caption text-[var(--text-tertiary)]">
            <span className="font-mono">{displayJob.promptId}</span>
            {displayJob.comfyUrl ? (
              <>
                {' · '}
                <span className="break-all">{displayJob.comfyUrl}</span>
              </>
            ) : null}
          </p>

          {!compact ? (
            <div className="pt-1">
              <Link
                href="/gallery"
                className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                Open gallery
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ComfyUiGalleryJobPlaceholder({
  entry,
}: {
  entry: {
    promptId?: string;
    clientId?: string;
    status: ComfyUiJobTrackerState['status'];
    statusMessage?: string;
    queuePosition?: number | null;
    progressValue?: number;
    progressMax?: number;
    progressNode?: string | null;
  };
}) {
  const processing = entry.status === 'pending' || entry.status === 'running';
  const percent = comfyUiJobProgressPercent(entry);
  const progressLabel = formatComfyUiJobProgressLabel(entry);
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    getComfyLivePreviewUrl(entry.promptId, [entry.clientId])
  );

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
    <div
      className="relative flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-base)]/80 px-4 text-center"
      role="status"
      aria-live="polite"
      aria-busy={processing}
    >
      {processing && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Latent render preview"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}

      {processing && !previewUrl ? <span className="ui-spinner ui-spinner-lg" aria-hidden /> : null}

      <div className="relative z-10 w-full max-w-[14rem] space-y-2 rounded-xl bg-[var(--bg-base)]/55 px-3 py-2 backdrop-blur-sm">
        <p className="type-overline text-[var(--accent-text)]">
          {previewUrl ? 'Latent · ' : ''}
          {entry.status === 'running'
            ? 'Rendering'
            : entry.status === 'pending'
              ? 'Queued'
              : 'Waiting'}
        </p>
        {entry.queuePosition != null && entry.queuePosition > 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            Position {entry.queuePosition} in queue
          </p>
        ) : entry.status === 'running' && percent == null ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            {previewUrl ? 'Receiving latent frames…' : 'Executing workflow…'}
          </p>
        ) : null}
        {percent != null ? (
          <div className="space-y-1.5">
            <div
              className="ui-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={progressLabel || `Generation progress ${percent}%`}
            >
              <div className="ui-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            {progressLabel ? (
              <p className="text-[11px] text-[var(--text-muted)]">
                {percent != null ? `${percent}% · ${progressLabel}` : progressLabel}
              </p>
            ) : percent != null ? (
              <p className="text-[11px] tabular-nums text-[var(--text-muted)]">{percent}%</p>
            ) : null}
          </div>
        ) : entry.statusMessage?.trim() ? (
          <p className="text-[11px] text-[var(--text-muted)]">{entry.statusMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
