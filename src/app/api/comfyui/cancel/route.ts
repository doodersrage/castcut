import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { cancelComfyUiJobOnHost } from '@/lib/comfyui/job-cancel';
import { markJobCancelled, requeuedJobOf } from '@/lib/sqlite/run-watch-jobs';
import { readSubmittedGraph } from '@/lib/sqlite/submitted-graphs';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { comfyUrl?: string; promptId?: string; deleteHistory?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const promptId = body.promptId?.trim();
  if (!promptId) {
    return apiError('promptId is required.', 400);
  }

  const runtime = stripEmptyComfyUiRuntime({ apiUrl: body.comfyUrl });
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  // The run watch (server/run-watcher-server.ts) never queues a cancelled job again — noted
  // before ComfyUI is told, so a watch in between can't. A take the watch queued again is
  // cancelled as the job it is now, as well as by the id the page knows.
  const requeued = requeuedJobOf(promptId);
  markJobCancelled(promptId);
  if (requeued) {
    markJobCancelled(requeued);
    const url = readSubmittedGraph(requeued)?.comfyUrl;
    await cancelComfyUiJobOnHost({
      baseUrl: url ? getComfyUiBaseUrl({ apiUrl: url }) : baseUrl,
      promptId: requeued,
      deleteHistory: body.deleteHistory !== false,
    });
  }
  const result = await cancelComfyUiJobOnHost({
    baseUrl,
    promptId,
    deleteHistory: body.deleteHistory !== false,
  });
  if (!result.ok && !requeued) {
    return apiError(result.error ?? 'ComfyUI cancel failed.', 502);
  }
  return apiJson({ ok: true });
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/cancel');
}
