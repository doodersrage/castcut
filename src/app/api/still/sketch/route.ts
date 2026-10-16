import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { RelightUnavailableError } from '@/lib/relight-server';
import { renderSketch } from '@/lib/sketch-server';

export const runtime = 'nodejs';
export const maxDuration = 320;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/still/sketch');
}

/** POST multipart { image (PNG), words, overStill ('true'), comfyUrl? } → { url }. */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('Expected a multipart form with the drawing.', 400);
  }
  const image = form.get('image');
  if (!(image instanceof Blob) || image.size === 0) return apiError('image is required.', 400);
  if (image.size > MAX_IMAGE_BYTES) return apiError('That drawing is too large.', 413);
  const words =
    typeof form.get('words') === 'string' ? String(form.get('words')).slice(0, 300) : '';
  const comfyUrl = form.get('comfyUrl');
  try {
    const url = await renderSketch({
      image: new Uint8Array(await image.arrayBuffer()),
      words,
      overStill: form.get('overStill') === 'true',
      comfyUrl:
        typeof comfyUrl === 'string' ? comfyUrl.trim().slice(0, 300) || undefined : undefined,
    });
    return apiJson({ url });
  } catch (error) {
    if (error instanceof RelightUnavailableError) return apiError(error.message, 409);
    return apiError(error instanceof Error ? error.message : 'Sketch failed.', 502);
  }
}
