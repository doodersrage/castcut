'use client';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { createTrainJob, upsertTrainJob } from '@/lib/lora/train-job';
import {
  clampPercent,
  formatProgress,
  statusTone,
} from '@/components/settings/lora-train/lora-train-utils';
import type { LoraTrainPanelViewModel } from '@/components/settings/lora-train/useLoraTrainPanel';

type Props = Pick<
  LoraTrainPanelViewModel,
  'jobs' | 'busy' | 'trigger' | 'outputPath' | 'markManualComplete' | 'persistJobs' | 'onStatus'
>;

export function LoraTrainPanelJobsList({
  jobs,
  busy,
  trigger,
  outputPath,
  markManualComplete,
  persistJobs,
  onStatus,
}: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-muted)]">Jobs</p>
      {jobs.length === 0 ? (
        <EmptyState
          compact
          icon="inbox"
          title="No train jobs yet"
          description="Export a dataset from Gallery, then start a job here (or record a manual one)."
          action={{
            label: 'Start manual job',
            onClick: () => {
              const job = createTrainJob({
                status: 'manual',
                trigger: trigger.trim(),
                outputPath: outputPath.trim(),
                commandOrUrl: 'manual',
              });
              persistJobs(upsertTrainJob(jobs, job));
              onStatus?.(`Manual job ${job.id} recorded locally.`);
            },
          }}
        />
      ) : (
        <ul className="space-y-3">
          {jobs.map(job => (
            <li
              key={job.id}
              className="ui-surface-inset space-y-2 transition hover:border-[var(--border-subtle)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="type-heading truncate font-mono text-sm text-[var(--text-primary)]">
                    {job.id}
                  </p>
                  <p className={`type-caption ${statusTone(job.status)}`}>
                    {job.status} · {formatProgress(job.progress)}
                    {job.trigger ? ` · trigger “${job.trigger}”` : ''}
                  </p>
                  {job.outputPath ? (
                    <p className="type-caption truncate font-mono text-[var(--text-muted)]">
                      {job.outputPath}
                    </p>
                  ) : null}
                  {job.error ? (
                    <p className="type-caption text-[var(--tint-danger-text)]">{job.error}</p>
                  ) : null}
                  {job.loraLibraryId ? (
                    <p className="type-caption text-[var(--tint-success-text)]">
                      Library id: {job.loraLibraryId}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.status !== 'completed' || !job.loraLibraryId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => markManualComplete(job)}
                    >
                      Register LoRA
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="ui-progress-track">
                <div
                  className="ui-progress-fill"
                  style={{ width: `${clampPercent(job.progress)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
