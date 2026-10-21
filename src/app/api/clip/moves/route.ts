import { apiError, apiErrorFrom, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { transferMotion } from '@/lib/video/motion-transfer-server';

export const runtime = 'nodejs';
export const maxDuration = 1900;

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
  try {
    const url = await transferMotion({
      video: new Uint8Array(await video.arrayBuffer()),
      stillUrl,
      look: text(form.get('look'), 600),
      place: text(form.get('place'), 300) || undefined,
      motion: text(form.get('motion'), 300) || undefined,
      keepSound: text(form.get('keepSound'), 8) === 'true',
      comfyUrl: text(form.get('comfyUrl'), 300) || undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ url });
  } catch (error) {
    // Missing models → 424 with the files and a Settings link; ComfyUI down → 503.
    return apiErrorFrom(error, 502, { service: 'comfyui', fallback: 'Copy moves failed.' });
  }
}
