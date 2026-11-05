import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { describeClipJobError, runningClipJob, startClipJob } from '@/lib/clip/clip-jobs-server';
import { cleanMotionStrokes } from '@/lib/clip/motion-brush';
import { makeMotionBrushClip } from '@/lib/clip/motion-brush-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/motion');
}

/**
 * POST { stillUrl, entryId?, strokes: [[{x, y}…]…] (fractions of the picture), prompt?, comfyUrl? }
 * → { job }: the still animated along the drawn paths on WAN-Move; follow it at
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
  const stillUrl = typeof body.stillUrl === 'string' ? body.stillUrl.trim().slice(0, 2000) : '';
  if (!stillUrl) return apiError('stillUrl is required.', 400);
  const strokes = cleanMotionStrokes(body.strokes);
  if (!strokes.length) return apiError('strokes are required.', 400);
  const running = runningClipJob();
  if (running) return apiError(new ClipJobBusyError(running).message, 409, { running });
  const job = startClipJob(
    'motion',
    context =>
      makeMotionBrushClip({
        stillUrl,
        strokes,
        entryId: typeof body.entryId === 'string' ? body.entryId.trim().slice(0, 200) : undefined,
        prompt: typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 300) : undefined,
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
