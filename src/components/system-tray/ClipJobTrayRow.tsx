'use client';

import Link from 'next/link';
import { useState } from 'react';
import { TrayProgressBar } from '@/components/system-tray/TrayProgressBar';
import { clipTrayStatus } from '@/components/system-tray/system-tray-helpers';
import { clipJobPercent } from '@/lib/clip/clip-jobs';
import {
  cancelTrackedClipJob,
  dismissClipJob,
  retryClipJob,
  type TrackedClipJob,
} from '@/lib/clip/clip-jobs-tracker';
import { settingsComfyUiSectionHref } from '@/lib/settings/comfyui-nav';

const ROW_BUTTON =
  'shrink-0 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50';

/** A clip job (Sharpen & smooth, Make more realistic) in the jobs panel: progress and Cancel, or Retry. */
export function ClipJobTrayRow({ job }: { job: TrackedClipJob }) {
  const [pending, setPending] = useState(false);
  const failed = job.state === 'failed';
  const percent = clipJobPercent(job.job);
  return (
    <li
      data-testid={`clip-job-row-${job.tool}`}
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/80 px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--text-primary)]">{job.label}</p>
          <p
            className={`mt-1 type-caption ${failed ? 'text-[var(--tint-danger-text)]' : 'text-[var(--text-tertiary)]'}`}
          >
            {clipTrayStatus(job)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {failed ? (
            <>
              {job.missing?.length ? (
                <Link href={settingsComfyUiSectionHref('model-assets')} className={ROW_BUTTON}>
                  Install
                </Link>
              ) : (
                <button
                  type="button"
                  data-testid="clip-job-retry"
                  disabled={pending}
                  onClick={() => {
                    setPending(true);
                    void retryClipJob(job.jobId)
                      .catch(() => undefined)
                      .finally(() => setPending(false));
                  }}
                  className={ROW_BUTTON}
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                aria-label={`Dismiss ${job.label}`}
                onClick={() => dismissClipJob(job.jobId)}
                className={ROW_BUTTON}
              >
                Dismiss
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="clip-job-cancel"
              disabled={pending}
              onClick={() => {
                setPending(true);
                void cancelTrackedClipJob(job.jobId).finally(() => setPending(false));
              }}
              className={ROW_BUTTON}
            >
              {pending ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
      {failed ? null : (
        <div className="mt-2">
          <TrayProgressBar percent={percent} label={`${job.label}: ${percent}%`} compact />
        </div>
      )}
    </li>
  );
}
