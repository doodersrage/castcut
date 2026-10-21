import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { transferMotion } from '@/lib/video/motion-transfer-server';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { describeClipJobError, runningClipJob, startClipJob } from '@/lib/clip/clip-jobs-server';

export const runtime = 'nodejs';

/** Under the app's 80 MB request cap (next.config proxyClientMaxBodySize). */
const MAX_VIDEO_BYTES = 78 * 1024 * 1024;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/moves');
}

const text = (value: FormDataEntryValue | null, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * POST multipart { video (file), stillUrl, look, place?, motion?, keepSound?, comfyUrl? } →
 * { url }: the still's person doing the video's moves (Wan Animate 2).
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('Expected a multipart form with a video.', 400);
  }
  const video = form.get('video');
  if (!(video instanceof Blob) || video.size === 0) return apiError('video is required.', 400);
  if (video.size > MAX_VIDEO_BYTES)
    return apiError('That video is too large (80 MB at most) — trim it, or record at 1080p.', 413);
  const stillUrl = text(form.get('stillUrl'), 2000);
  if (!stillUrl) return apiError('stillUrl is required.', 400);
  const videoBytes = new Uint8Array(await video.arrayBuffer());
  const running = runningClipJob();
  if (running) return apiError(new ClipJobBusyError(running).message, 409, { running });
  const job = startClipJob(
    'moves',
    context =>
      transferMotion({
        video: videoBytes,
        stillUrl,
        look: text(form.get('look'), 600),
        place: text(form.get('place'), 300) || undefined,
        motion: text(form.get('motion'), 300) || undefined,
        keepSound: text(form.get('keepSound'), 8) === 'true',
        comfyUrl: text(form.get('comfyUrl'), 300) || undefined,
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
