import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  GALLERY_THUMB_WIDTH,
  contentTypeForViewBytes,
  isAnimatedImageBytes,
  resolveComfyOutputMediaKind,
} from '@/lib/comfyui-outputs';
import { durableGalleryOriginalUrl, durableGalleryThumbUrl } from '@/lib/gallery-media-client';
import {
  persistGalleryThumbFile,
  persistIdentityFile,
  persistGalleryOriginalFile,
} from '@/lib/gallery-media-store';
import { isServerStorageEnabled } from '@/lib/server-storage';
import { fetchEngineOutputBuffer } from '@/lib/engine-output-fetch';
import {
  normalizeComfyViewType,
  sanitizeComfyViewFilename,
  sanitizeComfyViewSubfolder,
} from '@/lib/url-safety';

export const runtime = 'nodejs';
export const maxDuration = 60;

function resolveMediaUserId(request: Request): string | null {
  if (!isAuthEnabled()) {
    return null;
  }
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return null;
  }
  return user.id;
}

async function encodeThumbWebp(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(buffer)
    .rotate()
    .resize({
      width: GALLERY_THUMB_WIDTH,
      height: GALLERY_THUMB_WIDTH,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 72 })
    .toBuffer();
}

type PersistJsonBody = {
  kind?: string;
  galleryEntryId?: string;
  /** Which output within a multi-image batch entry this call is for. Defaults to 0. */
  index?: number;
  comfyUrl?: string;
  promptId?: string;
  filename?: string;
  subfolder?: string;
  type?: string;
  format?: string;
  engineId?: string;
};

function safeBodyIndex(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 63 ? raw : 0;
}

const MAX_GALLERY_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_GALLERY_FILM_BYTES = 80 * 1024 * 1024;
/** Same ceiling as a manual film upload — bounds worst-case disk use for one auto-persisted asset. */
const MAX_AUTO_PERSIST_BYTES = MAX_GALLERY_FILM_BYTES;

async function persistUploadedOriginal(request: Request, form: FormData): Promise<NextResponse> {
  const userId = resolveMediaUserId(request);
  if (isAuthEnabled() && !userId) {
    return apiError('Sign in required.', 401);
  }
  const entryId = String(form.get('galleryEntryId') ?? '').trim();
  if (!entryId) {
    return apiError('galleryEntryId is required.', 400);
  }
  const file = form.get('file');
  if (!(file instanceof Blob) || file.size === 0) {
    return apiError('File is required.', 400);
  }
  const filename =
    (typeof form.get('filename') === 'string' && form.get('filename')?.toString().trim()) ||
    (file instanceof File ? file.name : 'upload.png');
  const contentType = file.type || 'application/octet-stream';
  const mediaKind = resolveComfyOutputMediaKind({ filename, format: contentType });
  const isImage = mediaKind === 'image' && contentType !== 'image/svg+xml';
  if (!isImage && mediaKind !== 'video' && mediaKind !== 'audio' && mediaKind !== 'mesh') {
    return apiError('Only image, video, audio, or 3D mesh files can be added to the gallery.', 400);
  }
  const maxBytes = isImage ? MAX_GALLERY_UPLOAD_BYTES : MAX_GALLERY_FILM_BYTES;
  if (file.size > maxBytes) {
    return apiError(
      isImage ? 'Image is too large (max 25MB).' : 'File is too large (max 80MB).',
      413
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const original = persistGalleryOriginalFile({
    userId,
    entryId,
    buffer,
    contentType: contentTypeForViewBytes(filename, contentType, buffer),
    filename,
  });
  if (!isImage) {
    return apiJson({
      url: `/api/gallery/media/${encodeURIComponent(entryId)}?variant=original`,
      originalUrl: `/api/gallery/media/${encodeURIComponent(entryId)}?variant=original`,
      originalPath: original.relativePath,
    });
  }
  const thumb = await encodeThumbWebp(buffer);
  const storedThumb = persistGalleryThumbFile({ userId, entryId, buffer: thumb });
  return apiJson({
    url: `/api/gallery/media/${encodeURIComponent(entryId)}`,
    originalUrl: `/api/gallery/media/${encodeURIComponent(entryId)}?variant=original`,
    path: storedThumb.relativePath,
    originalPath: original.relativePath,
  });
}

/**
 * Auto-persist path: called best-effort right after a job completes, for any
 * engine. Always stores the full-resolution original (image or video/audio/
 * mesh); additionally encodes a small webp thumb for stills, since sharp
 * can't resize motion content.
 */
async function persistAutoFromViewParams(
  request: Request,
  body: PersistJsonBody
): Promise<NextResponse> {
  const userId = resolveMediaUserId(request);
  if (isAuthEnabled() && !userId) {
    return apiError('Sign in required.', 401);
  }
  const entryId = body.galleryEntryId?.trim();
  if (!entryId) {
    return apiError('galleryEntryId is required.', 400);
  }
  const index = safeBodyIndex(body.index);
  const filename = sanitizeComfyViewFilename(body.filename ?? '');
  const subfolder = sanitizeComfyViewSubfolder(body.subfolder ?? '');
  const type = normalizeComfyViewType(body.type?.trim() || 'output');

  const fetched = await fetchEngineOutputBuffer({
    engineId: body.engineId,
    engineUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl : undefined,
    promptId: body.promptId,
    filename,
    subfolder,
    type,
  });
  if (!fetched) {
    return apiJson({ skipped: true, reason: 'not-available' });
  }
  if (fetched.buffer.byteLength > MAX_AUTO_PERSIST_BYTES) {
    return apiJson({ skipped: true, reason: 'too-large' });
  }

  const contentType = contentTypeForViewBytes(filename, fetched.contentType, fetched.buffer);
  const original = persistGalleryOriginalFile({
    userId,
    entryId,
    index,
    buffer: fetched.buffer,
    contentType,
    filename,
  });

  const mediaKind = resolveComfyOutputMediaKind({ filename, format: body.format });
  let thumbPath: string | undefined;
  if (mediaKind === 'image' && !isAnimatedImageBytes(filename, fetched.buffer)) {
    try {
      const thumb = await encodeThumbWebp(fetched.buffer);
      const storedThumb = persistGalleryThumbFile({ userId, entryId, index, buffer: thumb });
      thumbPath = storedThumb.relativePath;
    } catch {
      // Best-effort — the full original above is still persisted even if the
      // thumb encode fails (e.g. an unusual/corrupt still).
    }
  }

  return apiJson({
    url: thumbPath ? durableGalleryThumbUrl(entryId, index) : undefined,
    originalUrl: durableGalleryOriginalUrl(entryId, index),
    path: thumbPath,
    originalPath: original.relativePath,
  });
}

async function persistIdentityFromViewParams(
  request: Request,
  body: PersistJsonBody
): Promise<NextResponse> {
  const userId = resolveMediaUserId(request);
  if (isAuthEnabled() && !userId) {
    return apiError('Sign in required.', 401);
  }
  const filename = sanitizeComfyViewFilename(body.filename ?? '');
  const subfolder = sanitizeComfyViewSubfolder(body.subfolder ?? '');
  const type = normalizeComfyViewType(body.type?.trim() || 'output');
  const fetched = await fetchEngineOutputBuffer({
    engineId: body.engineId,
    engineUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl : undefined,
    promptId: body.promptId,
    filename,
    subfolder,
    type,
  });
  if (!fetched) {
    return apiJson({ skipped: true, reason: 'not-available' });
  }
  persistIdentityFile({
    userId,
    buffer: fetched.buffer,
    contentType: fetched.contentType,
    filename,
  });
  return apiJson({
    url: '/api/gallery/media/identity',
    path: `identity/${userId || '_global'}/lock`,
  });
}

export async function POST(request: Request) {
  if (!isServerStorageEnabled()) {
    return apiJson({ skipped: true, reason: 'storage-disabled' });
  }

  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const userId = resolveMediaUserId(request);
      if (isAuthEnabled() && !userId) {
        return apiError('Sign in required.', 401);
      }
      const form = await request.formData();
      const kind = String(form.get('kind') ?? 'identity');
      if (kind === 'original') {
        return await persistUploadedOriginal(request, form);
      }
      if (kind !== 'identity') {
        return apiError('Multipart persist only supports identity or original.', 400);
      }
      const file = form.get('file');
      if (!(file instanceof Blob) || file.size === 0) {
        return apiError('Identity file is required.', 400);
      }
      const filename =
        (typeof form.get('filename') === 'string' && form.get('filename')?.toString().trim()) ||
        (file instanceof File ? file.name : 'identity.png');
      const buffer = Buffer.from(await file.arrayBuffer());
      persistIdentityFile({
        userId,
        buffer,
        contentType: file.type || 'application/octet-stream',
        filename,
      });
      return apiJson({
        url: '/api/gallery/media/identity',
        path: `identity/${userId || '_global'}/lock`,
      });
    }

    const body = (await request.json()) as PersistJsonBody;
    if (body.kind === 'identity') {
      return await persistIdentityFromViewParams(request, body);
    }
    return await persistAutoFromViewParams(request, body);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Persist failed.', 502);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/gallery/media/persist');
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
