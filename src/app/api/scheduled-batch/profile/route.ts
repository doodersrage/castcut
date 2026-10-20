import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import {
  loadServerScheduledBatchStatus,
  saveServerScheduledBatchProfile,
  saveServerScheduledBatchScheduler,
} from '@/lib/batch/server-scheduled-batch';
import type { ScheduledBatchProfile } from '@/lib/batch/scheduled-batch-profile';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const status = await loadServerScheduledBatchStatus();
    return apiJson(status);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Failed to load scheduled batch profile.',
      500
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<ScheduledBatchProfile> & {
      enabled?: boolean;
      intervalMinutes?: number;
    };
    const { enabled, intervalMinutes, ...profileBody } = body;
    const hasScheduler = enabled !== undefined || intervalMinutes !== undefined;
    const hasProfile = Object.values(profileBody).some(value => value !== undefined);
    if (hasScheduler) {
      await saveServerScheduledBatchScheduler({ enabled, intervalMinutes });
    }
    if (hasProfile) {
      const result = await saveServerScheduledBatchProfile(profileBody);
      if (!hasScheduler) {
        return apiJson(result);
      }
    } else if (!hasScheduler) {
      const result = await saveServerScheduledBatchProfile(profileBody);
      return apiJson(result);
    }
    const status = await loadServerScheduledBatchStatus();
    return apiJson(status);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Failed to save scheduled batch profile.',
      500
    );
  }
}

export async function DELETE() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/scheduled-batch/profile');
}
