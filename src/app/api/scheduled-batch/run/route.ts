import {
  runServerScheduledBatch,
  notifyServerScheduledBatchComplete,
  resolveServerScheduledBatchConfig,
  shouldRunServerScheduledBatch,
} from '@/lib/batch/server-scheduled-batch';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import type { ScheduledBatchConfig } from '@/lib/batch/scheduled-batch';

export const runtime = 'nodejs';

type RunBody = Partial<ScheduledBatchConfig> & {
  /** When true (instrumentation cron), skip the run if the interval has not elapsed. */
  gated?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RunBody;
    const { gated, ...configInput } = body;

    if (gated) {
      const config = await resolveServerScheduledBatchConfig();
      if (!(await shouldRunServerScheduledBatch(config))) {
        return apiJson({ ok: true, skipped: true, prompts: [], queued: 0 });
      }
    }

    const result = await runServerScheduledBatch(configInput);
    void notifyServerScheduledBatchComplete(result).catch(error => {
      console.error('notifyServerScheduledBatchComplete failed:', error);
    });
    return apiJson({ ok: true, skipped: false, ...result });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Server scheduled batch failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/scheduled-batch/run');
}
