import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { resolvePromptDataDir } from '@/lib/prompt/data-paths';
import { normalizeOverlayCorner } from '@/lib/video/cut-overlay';
import { normalizeCutSound } from '@/lib/video/cut-sound';
import { normalizeFilmTitleCard } from '@/lib/video/polish';
import { normalizeMusicLevel, normalizeVoiceLevel } from '@/lib/audio/mix-levels';
import { apiError, apiJson, apiMethodNotAllowed, apiOptions } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { parseFilmPlaylistShots } from '@/lib/video/film-shot-parse';
import {
  getFilmAssembleJob,
  readFilmAssembleOutput,
  startFilmAssembleJob,
} from '@/lib/video/assemble-jobs';
import { isServerFilmEncodeAvailable } from '@/lib/video/server-encode';

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
  // Room for the film where it's written (M4 F6 preflight); null when it can't be read.
  const freeBytes = await fs
    .statfs(resolvePromptDataDir())
    .then(stats => Number(stats.bavail) * Number(stats.bsize))
    .catch(() => null);
  return apiJson({ ok: true, available, encoder: available ? 'ffmpeg' : null, freeBytes });
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

  const shots = parseFilmPlaylistShots(body.shots);
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
      subtitles: body.subtitles === true,
      titleCard: normalizeFilmTitleCard(body.titleCard),
      musicLevel: normalizeMusicLevel(body.musicLevel),
      voiceLevel: normalizeVoiceLevel(body.voiceLevel),
      look: typeof body.look === 'string' ? body.look : undefined,
      lookStrength: typeof body.lookStrength === 'number' ? body.lookStrength : undefined,
      matchShots: body.matchShots === true,
      followFaces: body.followFaces !== false,
      smoothMotion: body.smoothMotion === true,
      sharpen: body.sharpen === true,
      logo:
        body.logo &&
        typeof body.logo === 'object' &&
        typeof (body.logo as { url?: unknown }).url === 'string'
          ? {
              url: String((body.logo as { url: string }).url)
                .trim()
                .slice(0, 4_000_000),
              corner: normalizeOverlayCorner((body.logo as { corner?: unknown }).corner, 'br'),
            }
          : null,
      sound: normalizeCutSound(body.sound),
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
