import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  extractVoiceSample,
  shiftVoiceSample,
  VOICE_UPLOAD_MAX_BYTES,
  voiceSampleFromUpload,
} from '@/lib/cast/voice-server';
import { shiftVoiceAnchor, voiceAnchorFromClipUrl } from '@/lib/cast/voice-anchor-server';
import { uploadComfyInputContent } from '@/lib/comfyui/comfy-input-upload-server';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/cast-voice');
}

/**
 * POST { clipUrl, comfyUrl? } → { sample }, or { sample, shift: 'deeper' | 'higher' } → the kept
 * sample pitched about two semitones: a ~5 s voice sample cut from a talking clip, uploaded
 * to ComfyUI's input folder for LTXVReferenceAudio (cast-voice.ts). Multipart `file` (+ `comfyUrl`)
 * → { sample }: the player's own recording, first ~5 s of speech.
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) {
    return apiError('Authentication required.', 401);
  }
  let body: Record<string, unknown>;
  let upload: Uint8Array | null = null;
  if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError('Invalid upload.', 400);
    }
    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) return apiError('file is required.', 400);
    if (file.size > VOICE_UPLOAD_MAX_BYTES) {
      return apiError('That file is too big — 40 MB at most (a short clip is enough).', 413);
    }
    upload = new Uint8Array(await file.arrayBuffer());
    body = { comfyUrl: form.get('comfyUrl') ?? undefined };
  } else {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return apiError('Invalid JSON body.', 400);
    }
  }
  const clipUrl = typeof body.clipUrl === 'string' ? body.clipUrl.trim() : '';
  const shift = body.shift === 'deeper' || body.shift === 'higher' ? body.shift : null;
  const sample = typeof body.sample === 'string' ? body.sample.trim() : '';
  // The kept voice's clip for MiniMax-H3 (cast/voice-anchor-server.ts), pitched with its sample.
  const voiceClip = typeof body.clip === 'string' ? body.clip.trim() : '';
  if (!upload && !clipUrl && !(shift && sample)) return apiError('clipUrl is required.', 400);

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

  // Only the voice clip, for a voice kept before it was cut too.
  if (body.clipOnly === true && clipUrl) {
    try {
      const clip = await voiceAnchorFromClipUrl({
        clipUrl,
        baseUrl: comfyUrl,
        requestOrigin: new URL(request.url).origin,
        userId: user?.id ?? null,
      });
      return apiJson({ ...(clip ? { clip } : {}) });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Could not read that clip.', 422);
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = upload
      ? await voiceSampleFromUpload(upload)
      : shift
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
      keepCopy: true,
    });
    // Its voice clip beside the sample: cut from the clip, or pitched as the sample was.
    const clip = clipUrl
      ? await voiceAnchorFromClipUrl({
          clipUrl,
          baseUrl: comfyUrl,
          requestOrigin: new URL(request.url).origin,
          userId: user?.id ?? null,
        }).catch(() => null)
      : shift && voiceClip
        ? await shiftVoiceAnchor({ baseUrl: comfyUrl, clip: voiceClip, direction: shift }).catch(
            () => null
          )
        : null;
    return apiJson({ sample: uploaded.name, ...(clip ? { clip } : {}) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ComfyUI upload failed.', 502);
  }
}
