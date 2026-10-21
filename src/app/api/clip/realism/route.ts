import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { normalizeClipRealismStrength } from '@/lib/clip/realism';
import { makeClipRealistic } from '@/lib/clip/realism-server';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { describeClipJobError, runningClipJob, startClipJob } from '@/lib/clip/clip-jobs-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/realism');
}

/**
 * POST { clipUrl, entryId?, strength?: 'light' | 'medium' | 'strong', comfyUrl? } → { job }: starts
 * re-rendering the clip at low strength on WAN 2.2 low-noise (real skin, water and detail) in the
 * background; follow it at /api/clip/jobs?jobId=. 409 { running } while another clip job runs.
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
  const running = runningClipJob();
  if (running) return apiError(new ClipJobBusyError(running).message, 409, { running });
  const job = startClipJob(
    'realism',
    context =>
      makeClipRealistic({
        clipUrl,
        entryId: typeof body.entryId === 'string' ? body.entryId.trim().slice(0, 200) : undefined,
        strength: normalizeClipRealismStrength(body.strength),
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
