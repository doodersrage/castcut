import { apiError, apiJson } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { getVideoPoseJob, startVideoPoseJob } from '@/lib/director/video-pose-server';

export const runtime = 'nodejs';

/** Under the app's 80 MB request cap (next.config proxyClientMaxBodySize), as Copy moves. */
const MAX_VIDEO_BYTES = 78 * 1024 * 1024;

const text = (value: FormDataEntryValue | null, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

function allowed(request: Request): boolean {
  if (!isAuthEnabled()) return true;
  return Boolean(resolveRequestUser(request)?.enabled);
}

/** GET ?jobId= → { job }: how far a video's read is, and the read once done. */
export async function GET(request: Request) {
  if (!allowed(request)) return apiError('Authentication required.', 401);
  const jobId = new URL(request.url).searchParams.get('jobId')?.trim();
  const job = jobId ? getVideoPoseJob(jobId) : null;
  return job ? apiJson({ job }) : apiError('Video read not found.', 404);
}

/**
 * POST multipart { video (file), comfyUrl? } → { job }: the body in every frame of the video
 * (DWPose), for the Director's "From a video…". Poll GET for the read.
 */
export async function POST(request: Request) {
  if (!allowed(request)) return apiError('Authentication required.', 401);
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
  const job = startVideoPoseJob({
    video: new Uint8Array(await video.arrayBuffer()),
    comfyUrl: text(form.get('comfyUrl'), 300) || undefined,
  });
  return apiJson({ job });
}
