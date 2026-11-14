/**
 * Scene runs the server was rendering when it stopped, picked up again (FINISHING_PLAN Phase 3):
 * called once by instrumentation-node after start. Only runs whose saved working copy says
 * "running" are resumed; each waits for the take it had in flight. Idempotent.
 */
import { apiError, apiJson } from '@/lib/api/response';
import { resumeServerRuns } from '@/lib/day/run-service-server';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isServerStorageEnabled()) {
    return apiError('Server storage disabled. Set PROMPT_DATA_DIR.', 503);
  }
  return apiJson({ resumed: resumeServerRuns(new URL(request.url).origin) });
}
