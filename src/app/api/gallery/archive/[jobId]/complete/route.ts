import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  isValidGalleryArchiveJobId,
  markGalleryArchivePurgeComplete,
  readGalleryArchiveJob,
} from '@/lib/gallery-archive-job';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = { params: Promise<{ jobId: string }> };

function resolveArchiveOwnerId(request: Request): string | null {
  if (!isAuthEnabled()) {
    return '_global';
  }
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return null;
  }
  return user.id;
}

export async function POST(request: Request, context: RouteContext) {
  const ownerId = resolveArchiveOwnerId(request);
  if (!ownerId) {
    return apiError('Sign in required.', 401);
  }

  const { jobId: rawId } = await context.params;
  const jobId = rawId?.trim() ?? '';
  if (!isValidGalleryArchiveJobId(jobId)) {
    return apiError('Invalid job id.', 400);
  }

  const job = readGalleryArchiveJob(jobId);
  if (!job || job.ownerId !== ownerId) {
    return apiError('Archive job not found.', 404);
  }

  markGalleryArchivePurgeComplete(jobId);
  return apiJson({ jobId, ok: true });
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/gallery/archive/[jobId]/complete');
}
