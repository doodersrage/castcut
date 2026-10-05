import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { locateFaceInComfy } from '@/lib/face-locate-server';

export const runtime = 'nodejs';

const MAX_PLATE_BYTES = 24 * 1024 * 1024;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/face-locate');
}

function readSize(value: FormDataEntryValue | null): number {
  const number = Number(typeof value === 'string' ? value : NaN);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

/**
 * Where the face is on a Cast plate (ComfyUI FaceAnalysis). Multipart: `image` (the plate),
 * `width` / `height` (its pixel size), optional `comfyUrl`. `face: null` = no face found;
 * `available: false` + reason when the node pack or ComfyUI is missing.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('Multipart body with the plate image is required.', 400);
  }
  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) {
    return apiError('image is required.', 400);
  }
  if (file.size > MAX_PLATE_BYTES) {
    return apiError('The plate image is too large.', 413);
  }
  if (file.type && !file.type.startsWith('image/') && file.type !== 'application/octet-stream') {
    return apiError('image must be an image file.', 400);
  }
  const width = readSize(form.get('width'));
  const height = readSize(form.get('height'));
  if (!width || !height) {
    return apiError('width and height are required.', 400);
  }
  const comfyUrl = form.get('comfyUrl');
  try {
    return apiJson(
      await locateFaceInComfy({
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || undefined,
        width,
        height,
        comfyUrl: typeof comfyUrl === 'string' && comfyUrl.trim() ? comfyUrl.trim() : undefined,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Finding the face failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}
