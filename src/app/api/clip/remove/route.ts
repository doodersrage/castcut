import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { ClipJobBusyError } from '@/lib/clip/clip-jobs';
import { describeClipJobError, runningClipJob, startClipJob } from '@/lib/clip/clip-jobs-server';
import { removeFromClip } from '@/lib/clip/vace-server';

export const runtime = 'nodejs';

const MAX_MASK_BYTES = 8 * 1024 * 1024;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/remove');
}

const text = (value: FormDataEntryValue | null, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * POST multipart { mask (PNG: white where something goes), clipUrl, entryId?, words?, track?,
 * comfyUrl? } → { job }: fills the painted area from the scene on WAN VACE — or with `words`
 * (Replace) — followed through the clip by SAM 3 unless `track` is "false".
 * 409 { running } while another clip job runs.
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('Expected a multipart form with a mask.', 400);
  }
  const mask = form.get('mask');
  if (!(mask instanceof Blob) || mask.size === 0) return apiError('mask is required.', 400);
  if (mask.size > MAX_MASK_BYTES) return apiError('That mask is too large.', 413);
  const clipUrl = text(form.get('clipUrl'), 2000);
  if (!clipUrl) return apiError('clipUrl is required.', 400);
  const maskBytes = new Uint8Array(await mask.arrayBuffer());
  const running = runningClipJob();
  if (running) return apiError(new ClipJobBusyError(running).message, 409, { running });
  const job = startClipJob(
    'remove',
    context =>
      removeFromClip({
        clipUrl,
        mask: maskBytes,
        words: text(form.get('words'), 200) || undefined,
        track: text(form.get('track'), 8) !== 'false',
        entryId: text(form.get('entryId'), 200) || undefined,
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
