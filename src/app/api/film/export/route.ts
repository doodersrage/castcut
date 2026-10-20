import fs from 'node:fs';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { apiError, apiJson, apiOptions } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { isCutRecipe } from '@/lib/cut-recipe';
import { buildFilmNleExport } from '@/lib/film/nle-export-server';

export const runtime = 'nodejs';
export const maxDuration = 600;

type Ready = { zipPath: string; dir: string; filename: string; owner: string; expires: number };
const ready = new Map<string, Ready>();

function owner(request: Request): string | null {
  if (!isAuthEnabled()) return '_global';
  const user = resolveRequestUser(request);
  return user?.enabled ? user.id : null;
}

function drop(id: string): void {
  const entry = ready.get(id);
  ready.delete(id);
  if (entry) void fs.promises.rm(entry.dir, { recursive: true, force: true }).catch(() => {});
}

export async function OPTIONS() {
  return apiOptions('GET, POST, OPTIONS');
}

/** POST { recipe, name } → { url }: a film's cut as an editor package (FCPXML, EDL, SRT, media). */
export async function POST(request: Request) {
  const who = owner(request);
  if (!who) return apiError('Sign in required.', 401);
  let body: { recipe?: unknown; name?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  if (!isCutRecipe(body.recipe) || body.recipe.shots.length === 0) {
    return apiError('This film has no cut recipe to export (cut before 2.6).', 400);
  }
  if (body.recipe.shots.length > 120) return apiError('Too many shots.', 400);
  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : 'Castcut film';
  const now = Date.now();
  for (const [id, entry] of ready) if (entry.expires < now) drop(id);
  try {
    const built = await buildFilmNleExport({
      recipe: body.recipe,
      name,
      userId: isAuthEnabled() ? who : null,
      requestOrigin: new URL(request.url).origin,
    });
    const id = randomUUID();
    ready.set(id, {
      zipPath: built.zipPath,
      dir: built.dir,
      filename: built.zipPath.split('/').pop() || 'castcut-film.zip',
      owner: who,
      expires: now + 30 * 60_000,
    });
    return apiJson({
      url: `/api/film/export?id=${id}`,
      shots: built.shots,
      skipped: built.skipped,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not export the film.', 500);
  }
}

/** GET ?id=… → the zip, once. */
export async function GET(request: Request) {
  const who = owner(request);
  if (!who) return apiError('Sign in required.', 401);
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const entry = ready.get(id);
  if (!entry || entry.owner !== who) return apiError('This export link has expired.', 410);
  ready.delete(id);
  const stat = await fs.promises.stat(entry.zipPath);
  const stream = fs.createReadStream(entry.zipPath);
  stream.on(
    'close',
    () => void fs.promises.rm(entry.dir, { recursive: true, force: true }).catch(() => {})
  );
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${entry.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
