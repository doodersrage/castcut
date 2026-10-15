import { normalizeTrainJobs, upsertTrainJob, type TrainJob } from '@/lib/lora-train-job';

export function mergeJobs(local: TrainJob[], remote: TrainJob[]): TrainJob[] {
  let next = normalizeTrainJobs(local);
  for (const job of remote) {
    next = upsertTrainJob(next, job);
  }
  return next;
}

export function formatProgress(progress: number): string {
  return `${Math.round(clampPercent(progress))}%`;
}

export function clampPercent(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }
  return Math.min(100, Math.max(0, progress * 100));
}

export function statusTone(status: TrainJob['status']): string {
  switch (status) {
    case 'completed':
      return 'text-[var(--tint-success-text)]';
    case 'error':
      return 'text-[var(--tint-danger-text)]';
    case 'running':
      return 'text-[var(--accent-text)]';
    case 'manual':
      return 'text-[var(--tint-warning-text)]';
    default:
      return 'text-[var(--text-muted)]';
  }
}
