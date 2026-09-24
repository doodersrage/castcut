import { NextResponse } from 'next/server';
import { normalizeFilmTitleCard } from '@/lib/film-polish';
import { apiError, apiJson, apiMethodNotAllowed, apiOptions } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import type { FilmPlaylistShot } from '@/lib/character-film';
import {
  getFilmAssembleJob,
  readFilmAssembleOutput,
  startFilmAssembleJob,
} from '@/lib/film-assemble-jobs';
import { isServerFilmEncodeAvailable } from '@/lib/film-server-encode';

export const runtime = 'nodejs';
export const maxDuration = 300;

function requireUser(request: Request): Response | null {
  if (!isAuthEnabled()) {
    return null;
  }
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return apiError('Authentication required.', 401);
  }
  return null;
}

function parseShots(raw: unknown): FilmPlaylistShot[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const shots: FilmPlaylistShot[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const url = typeof record.url === 'string' ? record.url.trim() : '';
    const title = typeof record.title === 'string' ? record.title.trim() : 'shot';
    const kind = record.kind === 'still' ? 'still' : record.kind === 'clip' ? 'clip' : null;
    if (!url || !kind) continue;
    const holdSec =
      typeof record.holdSec === 'number' && Number.isFinite(record.holdSec)
        ? record.holdSec
        : undefined;
    const entryId = typeof record.entryId === 'string' ? record.entryId.trim() : undefined;
    shots.push({
      url,
      title: title || 'shot',
      kind,
      ...(holdSec != null ? { holdSec } : {}),
      ...(entryId ? { entryId } : {}),
    });
  }
  return shots;
}

export async function OPTIONS() {
  return apiOptions('GET, POST, OPTIONS');
}

export async function GET(request: Request) {
  const denied = requireUser(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId')?.trim();
  if (jobId) {
    const job = getFilmAssembleJob(jobId);
    if (!job) {
      return apiError('Film job not found.', 404);
    }
    if (url.searchParams.get('download') === '1') {
      if (job.status !== 'completed') {
        return apiError('Film is not ready.', 409, { job });
      }
      const buffer = await readFilmAssembleOutput(jobId);
      if (!buffer) {
        return apiError('Film output missing.', 404);
      }
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': job.mimeType || 'video/mp4',
          'Content-Length': String(buffer.byteLength),
          'Content-Disposition': `attachment; filename="film-${jobId.slice(0, 8)}.mp4"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    return apiJson({ ok: true, job });
  }

  const available = await isServerFilmEncodeAvailable();
  return apiJson({ ok: true, available, encoder: available ? 'ffmpeg' : null });
}

export async function POST(request: Request) {
  const denied = requireUser(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  const shots = parseShots(body.shots);
  if (shots.length === 0) {
    return apiError('Include at least one shot with url and kind.', 400);
  }

  try {
    const job = await startFilmAssembleJob({
      shots,
      resolution: typeof body.resolution === 'string' ? body.resolution : undefined,
      crossfadeSec: typeof body.crossfadeSec === 'number' ? body.crossfadeSec : undefined,
      audioBedUrl: typeof body.audioBedUrl === 'string' ? body.audioBedUrl : undefined,
      stillMotion: body.stillMotion === true,
      captions: body.captions === true,
      titleCard: normalizeFilmTitleCard(body.titleCard),
      requestOrigin: new URL(request.url).origin,
      userId: isAuthEnabled() ? (resolveRequestUser(request)?.id ?? null) : null,
    });
    return apiJson({ ok: true, job }, { status: 202 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not start film encode.', 503);
  }
}

export function PUT() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/film/assemble');
}
