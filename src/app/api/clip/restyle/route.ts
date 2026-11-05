import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { describeClipJobError, runningClipJob, startClipJob } from '@/lib/clip/clip-jobs-server';
import { cleanClipLook, normalizeClipStyle } from '@/lib/clip/vace';
import { restyleClip } from '@/lib/clip/vace-server';
import { parseLlmRequestOptions } from '@/lib/llm/request-options';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/restyle');
}

/**
 * POST { clipUrl, entryId?, style | look, comfyUrl? } → { job }: repaints the clip in a preset look
 * (`style`) or your own words for one (`look`) on WAN VACE
 * (its depth keeps the scene and the motion); follow it at /api/clip/jobs?jobId=. 409 { running }
 * while another clip job runs.
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const clipUrl = typeof body.clipUrl === 'string' ? body.clipUrl.trim().slice(0, 2000) : '';
  if (!clipUrl) return apiError('clipUrl is required.', 400);
  const style = normalizeClipStyle(body.style);
  const look = style ? '' : cleanClipLook(body.look);
  if (!style && !look) return apiError('style or look is required.', 400);
  const running = runningClipJob();
  if (running) return apiError(new ClipJobBusyError(running).message, 409, { running });
  const job = startClipJob(
    'restyle',
    context =>
      restyleClip({
        clipUrl,
        ...(style ? { style } : { look }),
        llm: parseLlmRequestOptions(body as Parameters<typeof parseLlmRequestOptions>[0]),
        entryId: typeof body.entryId === 'string' ? body.entryId.trim().slice(0, 200) : undefined,
        comfyUrl:
          typeof body.comfyUrl === 'string' ? body.comfyUrl.trim().slice(0, 300) : undefined,
        requestOrigin: new URL(request.url).origin,
        userId: user?.id ?? null,
        job: context,
      }),
    { describeError: describeClipJobError }
  );
  return job
    ? apiJson({ job })
    : apiError(new ClipJobBusyError().message, 409, { running: runningClipJob() });
}
