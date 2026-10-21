import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { upscaleStill } from '@/lib/still/upscale-server';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { describeClipJobError, runningClipJob, startClipJob } from '@/lib/clip/clip-jobs-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/still/upscale');
}

/** POST { stillUrl, target: '2x' | '4k', comfyUrl? } → { job } at once (a background job — follow it at /api/clip/jobs?jobId=): the still upscaled (SeedVR2). */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const stillUrl = typeof body.stillUrl === 'string' ? body.stillUrl.trim().slice(0, 2000) : '';
  if (!stillUrl) return apiError('stillUrl is required.', 400);
  const running = runningClipJob();
  if (running) return apiError(new ClipJobBusyError(running).message, 409, { running });
  const job = startClipJob(
    'upscale',
    context =>
      upscaleStill({
        stillUrl,
        target: body.target === '2x' ? '2x' : '4k',
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
