import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

import type { CharacterRecord } from './character-os';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { archiveThenPurgeGalleryEntries } from './gallery-archive-purge';

function entry(id: string, favorite = false): ComfyGalleryEntry {
  return {
    id,
    queuedAt: 1,
    favorite,
    promptId: `p-${id}`,
    prompt: 'test',
    status: 'completed',
    comfyUrl: 'http://127.0.0.1:8188',
    images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }],
  };
}

describe('archiveThenPurgeGalleryEntries (server job client)', () => {
  it('skips when only protected entries remain', async () => {
    const characters: CharacterRecord[] = [
      {
        id: 'char-1',
        name: 'Rin',
        version: 1,
        updatedAt: 1,
        activeLookId: 'look-1',
        looks: [{ id: 'look-1', name: 'Main', createdAt: 1 }],
      },
    ];
    const removeEntries = mock.fn();
    const result = await archiveThenPurgeGalleryEntries([entry('fav', true)], {
      removeEntries,
      characters,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.purged, 0);
    assert.equal(result.kept, 1);
    assert.equal(removeEntries.mock.callCount(), 0);
  });

  it('refuses purge when archive reports zero images', async () => {
    const removeEntries = mock.fn();
    const result = await archiveThenPurgeGalleryEntries([entry('a'), entry('b')], {
      removeEntries,
      characters: [],
      startArchive: async () => ({ jobId: 'job1' }),
      pollArchive: async () => ({
        jobId: 'job1',
        status: 'ready',
        phase: 'ready',
        progress: 1,
        processed: 2,
        total: 2,
        imageCount: 0,
        message: 'Ready',
      }),
      downloadArchive: async () => {
        throw new Error('should not download');
      },
    });
    assert.equal(result.skipped, true);
    assert.equal(result.purged, 0);
    assert.match(result.message, /no images/i);
    assert.equal(removeEntries.mock.callCount(), 0);
  });

  it('downloads then purges after a successful server archive', async () => {
    const removeEntries = mock.fn();
    const downloaded = mock.fn(async () => undefined);
    const result = await archiveThenPurgeGalleryEntries(
      [entry('a'), entry('b'), entry('fav', true)],
      {
        removeEntries,
        characters: [],
        startArchive: async descriptors => {
          assert.equal(descriptors.length, 2);
          return { jobId: 'abc123' };
        },
        pollArchive: async () => ({
          jobId: 'abc123',
          status: 'ready',
          phase: 'ready',
          progress: 1,
          processed: 2,
          total: 2,
          imageCount: 2,
          message: 'Ready',
          downloadName: 'test-archive',
        }),
        downloadArchive: downloaded,
      }
    );
    assert.equal(result.skipped, false);
    assert.equal(result.purged, 2);
    assert.equal(result.zipCount, 1);
    assert.equal(downloaded.mock.callCount(), 1);
    assert.equal(removeEntries.mock.callCount(), 1);
    assert.deepEqual(removeEntries.mock.calls[0]?.arguments[0], ['a', 'b']);
  });

  it('does not purge when the archive job errors', async () => {
    const removeEntries = mock.fn();
    await assert.rejects(
      () =>
        archiveThenPurgeGalleryEntries([entry('a')], {
          removeEntries,
          characters: [],
          startArchive: async () => ({ jobId: 'err1' }),
          pollArchive: async () => {
            throw new Error('Archive failed (no images fetched)');
          },
        }),
      /no images fetched/i
    );
    assert.equal(removeEntries.mock.callCount(), 0);
  });

  it('purges without archiving via purgeGalleryRestOnly', async () => {
    const removeEntries = mock.fn();
    const { purgeGalleryRestOnly } = await import('./gallery-archive-purge');
    const result = purgeGalleryRestOnly([entry('a'), entry('b'), entry('fav', true)], {
      removeEntries,
      characters: [],
    });
    assert.equal(result.skipped, false);
    assert.equal(result.purged, 2);
    assert.equal(result.zipCount, 0);
    assert.deepEqual(removeEntries.mock.calls[0]?.arguments[0], ['a', 'b']);
  });

  it('resumes download + purge from a pending job', async () => {
    const storage = new Map<string, string>();
    const sessionStorageMock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    };
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: sessionStorageMock,
      configurable: true,
    });

    const {
      writePendingArchivePurge,
      resumePendingArchivePurge,
      readPendingArchivePurge,
      PENDING_ARCHIVE_PURGE_KEY,
    } = await import('./gallery-archive-purge');

    writePendingArchivePurge({
      jobId: 'resume1',
      purgeIds: ['a', 'b'],
      keptCount: 1,
      downloadName: 'resume-archive',
      startedAt: Date.now(),
    });
    assert.ok(readPendingArchivePurge());

    const removeEntries = mock.fn();
    const downloaded = mock.fn(async () => undefined);
    const result = await resumePendingArchivePurge({
      removeEntries,
      remainingEntryIds: ['a', 'b', 'fav'],
      pollArchive: async () => ({
        jobId: 'resume1',
        status: 'downloaded',
        phase: 'downloaded',
        progress: 1,
        processed: 2,
        total: 2,
        imageCount: 2,
        message: 'Downloaded',
        downloadName: 'resume-archive',
      }),
      downloadArchive: downloaded,
    });
    assert.ok(result);
    assert.equal(result.purged, 2);
    assert.match(result.message, /Resumed/i);
    assert.equal(downloaded.mock.callCount(), 1);
    assert.deepEqual(removeEntries.mock.calls[0]?.arguments[0], ['a', 'b']);
    assert.equal(sessionStorageMock.getItem(PENDING_ARCHIVE_PURGE_KEY), null);
  });
});

describe('gallery-archive-job disk staging', () => {
  let previousDataDir: string | undefined;
  let tempDir: string;

  before(() => {
    previousDataDir = process.env.PROMPT_DATA_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-job-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });

  after(() => {
    if (previousDataDir === undefined) {
      delete process.env.PROMPT_DATA_DIR;
    } else {
      process.env.PROMPT_DATA_DIR = previousDataDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates job json and runs to ready for sidecar-only entries', async () => {
    const { createGalleryArchiveJob, runGalleryArchiveJob, readGalleryArchiveJob } =
      await import('./gallery-archive-job');

    const job = createGalleryArchiveJob({ ownerId: '_global', total: 1 });
    assert.equal(job.status, 'queued');
    assert.ok(fs.existsSync(path.join(tempDir, 'gallery-archive-jobs', job.id, 'job.json')));

    await runGalleryArchiveJob(job.id, [
      {
        id: 'e1',
        promptId: 'prompt1',
        status: 'pending',
        comfyUrl: 'http://127.0.0.1:8188',
        images: [],
      },
    ]);

    const done = readGalleryArchiveJob(job.id);
    assert.ok(done);
    assert.equal(done.status, 'ready');
    assert.ok(fs.existsSync(path.join(tempDir, 'gallery-archive-jobs', job.id, 'archive.zip')));
  });
});
