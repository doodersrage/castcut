'use client';

import type { ScheduledBatchProfile } from './scheduled-batch-profile';

export type ScheduledBatchServerStatus = {
  profile: ScheduledBatchProfile;
  lastRunAt?: number;
  persisted: boolean;
  enabled: boolean;
  intervalMinutes?: number;
};

export type ScheduledBatchProfilePushResult = {
  profile: ScheduledBatchProfile;
  persisted: boolean;
};

/** Reads the server's active scheduled-batch profile + last run status (for Settings display). */
export async function fetchScheduledBatchServerStatus(): Promise<ScheduledBatchServerStatus | null> {
  try {
    const response = await fetch('/api/scheduled-batch/profile');
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as ScheduledBatchServerStatus;
  } catch {
    return null;
  }
}

/** Pushes the current Studio Automation config to server storage so the headless runner matches Settings. */
export async function pushScheduledBatchProfile(
  profile: Partial<ScheduledBatchProfile>
): Promise<ScheduledBatchProfilePushResult | null> {
  try {
    const response = await fetch('/api/scheduled-batch/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as ScheduledBatchProfilePushResult;
  } catch {
    return null;
  }
}
