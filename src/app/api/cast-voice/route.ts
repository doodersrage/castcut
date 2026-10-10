import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { extractVoiceSample, shiftVoiceSample } from '@/lib/cast-voice-server';
import { uploadComfyInputContent } from '@/lib/comfy-input-upload-server';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/cast-voice');
}

/**
 * POST { clipUrl, comfyUrl? } → { sample }, or { sample, shift: 'deeper' | 'higher' } → the kept
 * sample pitched about two semitones: a ~5 s voice sample cut from a talking clip, uploaded
 * to ComfyUI's input folder for LTXVReferenceAudio (cast-voice.ts).
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) {
    return apiError('Authentication required.', 401);
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const clipUrl = typeof body.clipUrl === 'string' ? body.clipUrl.trim() : '';
  const shift = body.shift === 'deeper' || body.shift === 'higher' ? body.shift : null;
  const sample = typeof body.sample === 'string' ? body.sample.trim() : '';
  if (!clipUrl && !(shift && sample)) return apiError('clipUrl is required.', 400);

  let comfyUrl: string;
  try {
    comfyUrl = getComfyUiBaseUrl(
      stripEmptyComfyUiRuntime({
        apiUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl : undefined,
      })
    ).replace(/\/+$/, '');
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  let bytes: Uint8Array;
  try {
    bytes = shift
      ? await shiftVoiceSample({ baseUrl: comfyUrl, sample, direction: shift })
      : await extractVoiceSample({
          clipUrl,
          requestOrigin: new URL(request.url).origin,
          userId: user?.id ?? null,
        });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not read that clip.', 422);
  }
  try {
    const uploaded = await uploadComfyInputContent({
      baseUrl: comfyUrl,
      bytes,
      filename: 'castcut-voice.wav',
      mimeType: 'audio/wav',
    });
    return apiJson({ sample: uploaded.name });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ComfyUI upload failed.', 502);
  }
}
