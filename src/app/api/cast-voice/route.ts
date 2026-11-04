import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  extractVoiceSample,
  shiftVoiceSample,
  VOICE_UPLOAD_MAX_BYTES,
  voiceSampleFromUpload,
} from '@/lib/cast/voice-server';
import {
  shiftVoiceAnchor,
  voiceAnchorFromClipUrl,
  voiceAnchorWords,
  type VoiceAnchor,
} from '@/lib/cast/voice-anchor-server';
import { uploadComfyInputContent } from '@/lib/comfyui/comfy-input-upload-server';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** A voice clip and its words as the client keeps them (CastVoice.clip / clipWords). */
function anchorJson(anchor: VoiceAnchor | null): { clip?: string; clipWords?: string } {
  if (!anchor) return {};
  return { clip: anchor.clip, ...(anchor.words !== undefined ? { clipWords: anchor.words } : {}) };
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/cast-voice');
}

/**
 * POST { clipUrl, comfyUrl? } → { sample }, or { sample, shift: 'deeper' | 'higher' } → the kept
 * sample pitched about two semitones: a ~5 s voice sample cut from a talking clip, uploaded
 * to ComfyUI's input folder for LTXVReferenceAudio (cast-voice.ts). Multipart `file` (+ `comfyUrl`)
 * → { sample }: the player's own recording, first ~5 s of speech. A voice clip comes back with
 * what it says (`clipWords`); { clip, wordsOnly: true } → { clipWords } for one kept before.
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
  const wordsOnly = body.wordsOnly === true && Boolean(voiceClip);
  if (!upload && !clipUrl && !(shift && sample) && !wordsOnly) {
    return apiError('clipUrl is required.', 400);
  }

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

  // What a kept voice clip says, for a voice kept before its words were (H3 never says them).
  if (wordsOnly) {
    if (!/^[\w.-]{1,200}$/.test(voiceClip))
      return apiError('clip must be a ComfyUI input name.', 400);
    const words = await voiceAnchorWords(comfyUrl, voiceClip).catch(() => undefined);
    return apiJson({ ...(words !== undefined ? { clipWords: words } : {}) });
  }

  // Only the voice clip, for a voice kept before it was cut too.
  if (body.clipOnly === true && clipUrl) {
    try {
      const anchor = await voiceAnchorFromClipUrl({
        clipUrl,
        baseUrl: comfyUrl,
        requestOrigin: new URL(request.url).origin,
        userId: user?.id ?? null,
      });
      return apiJson(anchorJson(anchor));
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
    const anchor = clipUrl
      ? await voiceAnchorFromClipUrl({
          clipUrl,
          baseUrl: comfyUrl,
          requestOrigin: new URL(request.url).origin,
          userId: user?.id ?? null,
        }).catch(() => null)
      : shift && voiceClip
        ? await shiftVoiceAnchor({ baseUrl: comfyUrl, clip: voiceClip, direction: shift })
            .then(clip => ({ clip }))
            .catch(() => null)
        : null;
    return apiJson({ sample: uploaded.name, ...anchorJson(anchor) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ComfyUI upload failed.', 502);
  }
}
