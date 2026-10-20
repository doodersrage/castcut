'use client';

import { dispatchWebhook } from '../settings/webhook-settings';

const TRACKER_KEY = 'scheduled-batch-tracker-v1';

type ScheduledBatchTracker = {
  batchId: string;
  pending: number;
  total: number;
  startedAt: number;
};

export function registerScheduledBatchQueue(expectedJobs: number): void {
  if (typeof window === 'undefined' || expectedJobs <= 0) {
    return;
  }
  const tracker: ScheduledBatchTracker = {
    batchId: `sb-${Date.now()}`,
    pending: expectedJobs,
    total: expectedJobs,
    startedAt: Date.now(),
  };
  window.sessionStorage.setItem(TRACKER_KEY, JSON.stringify(tracker));
}

export function noteScheduledBatchJobComplete(tool?: string): void {
  if (typeof window === 'undefined' || tool !== 'scheduled-batch') {
    return;
  }

  try {
    const raw = window.sessionStorage.getItem(TRACKER_KEY);
    if (!raw) {
      return;
    }
    const tracker = JSON.parse(raw) as ScheduledBatchTracker;
    const pending = Math.max(0, tracker.pending - 1);
    if (pending > 0) {
      window.sessionStorage.setItem(TRACKER_KEY, JSON.stringify({ ...tracker, pending }));
      return;
    }

    window.sessionStorage.removeItem(TRACKER_KEY);
    void dispatchWebhook({
      event: 'scheduled.batch.completed',
      tool: 'scheduled-batch',
      queued: tracker.total,
      completedAt: Date.now(),
      message: `Scheduled batch ${tracker.batchId} finished (${tracker.total} jobs)`,
    });
    void fetch('/api/email/batch-completed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'client-scheduled',
        promptCount: tracker.total,
        queued: tracker.total,
        message: `Batch ${tracker.batchId} finished`,
      }),
    });
  } catch {
    window.sessionStorage.removeItem(TRACKER_KEY);
  }
}
