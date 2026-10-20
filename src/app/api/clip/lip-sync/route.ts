import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { lipSyncStill } from '@/lib/audio/lip-sync-server';

export const runtime = 'nodejs';
export const maxDuration = 1900;

/** The recording upload cap. */
const MAX_AUDIO_BYTES = 60 * 1024 * 1024;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/lip-sync');
}

const text = (value: FormDataEntryValue | null, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * POST multipart { audio (file), audio2? (file: the right-hand person, after the left), stillUrl,
 * prompt?, comfyUrl? } → { url }: the still speaking it.
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('Expected a multipart form with a recording.', 400);
  }
  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) return apiError('audio is required.', 400);
  if (audio.size > MAX_AUDIO_BYTES)
    return apiError('That recording is too large (60 MB at most).', 413);
  const audio2 = form.get('audio2');
  const second = audio2 instanceof Blob && audio2.size > 0 ? audio2 : null;
  if (second && audio.size + second.size > MAX_AUDIO_BYTES)
    return apiError('Those recordings are too large (60 MB at most).', 413);
  const stillUrl = text(form.get('stillUrl'), 2000);
  if (!stillUrl) return apiError('stillUrl is required.', 400);
  try {
    const url = await lipSyncStill({
      audio: new Uint8Array(await audio.arrayBuffer()),
      ...(second ? { secondAudio: new Uint8Array(await second.arrayBuffer()) } : {}),
      stillUrl,
      prompt:
        text(form.get('prompt'), 600) ||
        'A person talking to the camera, natural expressions and small head movements.',
      comfyUrl: text(form.get('comfyUrl'), 300) || undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ url });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Lip-sync failed.', 502);
  }
}
