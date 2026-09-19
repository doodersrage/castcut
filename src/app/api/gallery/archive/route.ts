import { apiError, apiJson } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  cleanupStaleGalleryArchiveJobs,
  createGalleryArchiveJob,
  findResumableGalleryArchiveJob,
  runGalleryArchiveJob,
  type GalleryArchiveEntryDescriptor,
} from '@/lib/gallery-archive-job';

export const runtime = 'nodejs';
export const maxDuration = 300;

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

export async function POST(request: Request) {
  const ownerId = resolveArchiveOwnerId(request);
  if (!ownerId) {
    return apiError('Sign in required.', 401);
  }

  let body: { entries?: GalleryArchiveEntryDescriptor[]; downloadName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (entries.length === 0) {
    return apiError('entries array is required.', 400);
  }
  if (entries.length > 20_000) {
    return apiError('Too many entries (max 20000).', 400);
  }

  const normalized: GalleryArchiveEntryDescriptor[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const promptId = typeof raw.promptId === 'string' ? raw.promptId.trim() : '';
    if (!id || !promptId) {
      continue;
    }
    normalized.push({
      ...raw,
      id,
      promptId,
      comfyUrl: typeof raw.comfyUrl === 'string' ? raw.comfyUrl : '',
      status: raw.status ?? 'completed',
      images: Array.isArray(raw.images) ? raw.images : [],
    });
  }

  if (normalized.length === 0) {
    return apiError('No valid entries to archive.', 400);
  }

  cleanupStaleGalleryArchiveJobs();
  const job = createGalleryArchiveJob({
    ownerId,
    total: normalized.length,
    downloadName: body.downloadName,
    purgeEntryIds: normalized.map(entry => entry.id),
  });

  // Fire-and-forget — client polls GET /api/gallery/archive/[id].
  void runGalleryArchiveJob(job.id, normalized);

  return apiJson({
    jobId: job.id,
    status: job.status,
    total: job.total,
  });
}

export async function GET(request: Request) {
  const ownerId = resolveArchiveOwnerId(request);
  if (!ownerId) {
    return apiError('Sign in required.', 401);
  }
  const job = findResumableGalleryArchiveJob(ownerId);
  if (!job) {
    return apiJson({ pending: null });
  }
  return apiJson({
    pending: {
      jobId: job.id,
      status: job.status,
      phase: job.phase,
      imageCount: job.imageCount,
      downloadName: job.downloadName,
      purgeIds: job.purgeEntryIds ?? [],
      message: job.message,
      updatedAt: job.updatedAt,
    },
  });
}
