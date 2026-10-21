import { apiError, apiJson } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { cancelClipJob, getClipJob, listClipJobs } from '@/lib/clip/clip-jobs-server';

export const runtime = 'nodejs';

function denied(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  return isAuthEnabled() && !user?.enabled ? apiError('Authentication required.', 401) : null;
}

/** GET ?jobId= → { job }: how far a clip job (Sharpen & smooth, Make more realistic) is; no id → { jobs }. */
export async function GET(request: Request) {
  const blocked = denied(request);
  if (blocked) return blocked;
  const jobId = new URL(request.url).searchParams.get('jobId')?.trim();
  if (!jobId) return apiJson({ jobs: listClipJobs() });
  const job = getClipJob(jobId);
  return job ? apiJson({ job }) : apiError('Clip job not found.', 404);
}

/** DELETE ?jobId= → { job }: cancel a running clip job (its ComfyUI prompt is stopped too). */
export async function DELETE(request: Request) {
  const blocked = denied(request);
  if (blocked) return blocked;
  const jobId = new URL(request.url).searchParams.get('jobId')?.trim();
  const job = jobId ? cancelClipJob(jobId) : null;
  return job ? apiJson({ job }) : apiError('Clip job not found.', 404);
}
