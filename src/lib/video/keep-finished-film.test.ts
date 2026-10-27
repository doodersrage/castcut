import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

// M6 D16: a long film the server encoded is kept from the server's own copy — the upload path's
// 80 MB cap refused any film past it, so a 10-minute cut was never kept on the Cast.
describe('keeping a finished server encode', () => {
  const previous = process.env.PROMPT_DATA_DIR;
  let dir = '';
  let keepFinishedFilm: typeof import('./assemble-jobs').keepFinishedFilm;
  const jobs = ((globalThis as { __castcutFilmJobs?: Map<string, unknown> }).__castcutFilmJobs ??=
    new Map());
  const job = (id: string, bytes: number) =>
    jobs.set(id, {
      id,
      status: 'completed',
      progress: 1,
      label: 'done',
      createdAt: 1,
      updatedAt: 1,
      mimeType: 'video/mp4',
      extension: 'mp4',
      buffer: Buffer.alloc(bytes, 1),
    });

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'castcut-keep-film-'));
    process.env.PROMPT_DATA_DIR = dir;
    ({ keepFinishedFilm } = await import('./assemble-jobs'));
  });
  after(() => {
    jobs.delete('long');
    jobs.delete('huge');
    if (previous === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps a film past the 80 MB upload cap from the server’s copy', async () => {
    job('long', 100 * 1024 * 1024);
    const kept = await keepFinishedFilm({ jobId: 'long', entryId: 'film-1', userId: null });
    assert.equal(kept.ok, true);
    if (!kept.ok) return;
    assert.equal(fs.statSync(path.join(dir, kept.originalPath)).size, 100 * 1024 * 1024);
  });

  it('says when the encode is gone (the browser uploads instead), or too large to keep', async () => {
    assert.deepEqual(await keepFinishedFilm({ jobId: 'nope', entryId: 'film-2', userId: null }), {
      ok: false,
      status: 404,
      error: 'That encode is not here any more.',
    });
    job('huge', 221 * 1024 * 1024);
    const huge = await keepFinishedFilm({ jobId: 'huge', entryId: 'film-3', userId: null });
    assert.equal(huge.ok ? 0 : huge.status, 413);
  });
});
