import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  getGalleryArchiveZipPath,
  isValidGalleryArchiveJobId,
  markGalleryArchiveDownloaded,
  readGalleryArchiveJob,
} from '@/lib/gallery-archive-job';

export const runtime = 'nodejs';
export const maxDuration = 300;

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

export async function GET(request: Request, context: RouteContext) {
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

  const zipPath = getGalleryArchiveZipPath(jobId);
  if (!zipPath) {
    if (job.status === 'error') {
      return apiError(job.error || 'Archive failed.', 409);
    }
    return apiError('Archive not ready yet.', 409);
  }

  const stat = fs.statSync(zipPath);
  const nodeStream = fs.createReadStream(zipPath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  const filename = `${job.downloadName || `gallery-archive-${jobId}`}.zip`;

  markGalleryArchiveDownloaded(jobId);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/gallery/archive/[jobId]/download');
}
