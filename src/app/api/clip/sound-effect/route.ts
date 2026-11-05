import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { describeClipJobError, runningClipJob, startClipJob } from '@/lib/clip/clip-jobs-server';
import { normalizeSoundEffectSeconds, SOUND_EFFECT_MAX_WORDS } from '@/lib/clip/sound-effect';
import { makeSoundEffect } from '@/lib/clip/sound-effect-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/sound-effect');
}

/**
 * POST { words, seconds?, comfyUrl? } → { job }: makes a sound effect from words on LTX-2.5 in
 * the background; follow it at /api/clip/jobs?jobId= (its `url` is the M4A when completed).
 * 409 { running } while another clip job runs.
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
  const words =
    typeof body.words === 'string' ? body.words.trim().slice(0, SOUND_EFFECT_MAX_WORDS) : '';
  if (!words) return apiError('words is required.', 400);
  const running = runningClipJob();
  if (running) return apiError(new ClipJobBusyError(running).message, 409, { running });
  const job = startClipJob(
    'sound-effect',
    context =>
      makeSoundEffect({
        words,
        seconds: normalizeSoundEffectSeconds(body.seconds),
        comfyUrl:
          typeof body.comfyUrl === 'string' ? body.comfyUrl.trim().slice(0, 300) : undefined,
        job: context,
      }),
    { describeError: describeClipJobError }
  );
  return job
    ? apiJson({ job })
    : apiError(new ClipJobBusyError().message, 409, { running: runningClipJob() });
}
