import fs from 'node:fs';
import { Readable } from 'node:stream';
import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { packCutProject, type ProjectExportShot } from '@/lib/video/cut-project-export-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/cut/export-project');
}

const num = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

/**
 * POST { name, width, height, shots: [{ url, title, kind, entryId?, fromSec, durSec }], music?:
 * { url, fromSec }, srt? } → a .zip: media/, timeline.fcpxml, timeline.edl, subtitles.srt — the
 * cut for another editor (cut-project-export-server.ts).
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const shots: ProjectExportShot[] = (Array.isArray(body.shots) ? body.shots : [])
    .slice(0, 300)
    .flatMap(raw => {
      const shot = raw as Record<string, unknown>;
      const url = typeof shot.url === 'string' ? shot.url.trim() : '';
      const kind = shot.kind === 'clip' ? 'clip' : shot.kind === 'still' ? 'still' : null;
      if (!url || !kind) return [];
      return [
        {
          url,
          kind,
          title: typeof shot.title === 'string' ? shot.title.slice(0, 80) : '',
          entryId: typeof shot.entryId === 'string' ? shot.entryId : undefined,
          fromSec: num(shot.fromSec, 0, 36_000, 0),
          durSec: num(shot.durSec, 0.1, 36_000, 3),
        },
      ];
    });
  if (shots.length === 0) return apiError('No shots to export.', 400);
  const name =
    (typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '') || 'Castcut film';
  const music =
    body.music && typeof (body.music as { url?: unknown }).url === 'string'
      ? {
          url: String((body.music as { url: string }).url),
          fromSec: num((body.music as { fromSec?: unknown }).fromSec, 0, 36_000, 0),
        }
      : null;
  try {
    const packed = await packCutProject({
      name,
      width: num(body.width, 16, 8192, 1280),
      height: num(body.height, 16, 8192, 720),
      shots,
      music,
      srt: typeof body.srt === 'string' ? body.srt.slice(0, 2_000_000) : null,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    const stat = await fs.promises.stat(packed.zipPath);
    const stream = fs.createReadStream(packed.zipPath);
    stream.on('close', () => void packed.cleanup());
    const filename = `${
      name
        .replace(/[^a-zA-Z0-9 _-]+/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'castcut-film'
    }-project.zip`;
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(stat.size),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not export the project.', 502);
  }
}
