import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { describeClipJobError, runningClipJob, startClipJob } from '@/lib/clip/clip-jobs-server';
import { cleanClipLook } from '@/lib/clip/vace';
import { changeClipBackground } from '@/lib/clip/vace-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/background');
}

/**
 * POST { clipUrl, entryId?, words, comfyUrl? } → { job }: the people in the clip kept, the place
 * behind them redrawn as `words` (SAM 3 finds them, WAN VACE paints the rest); follow it at
 * /api/clip/jobs?jobId=. 409 { running } while another clip job runs.
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
  const words = cleanClipLook(body.words);
  if (!words) return apiError('Say what the new background is.', 400);
  const running = runningClipJob();
  if (running) return apiError(new ClipJobBusyError(running).message, 409, { running });
  const job = startClipJob(
    'background',
    context =>
      changeClipBackground({
        clipUrl,
        words,
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
