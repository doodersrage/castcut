import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery';

let galleryEntries: ComfyGalleryEntry[] = [];
const loadComfyGallery = mock.fn(() => galleryEntries);
mock.module('./comfyui-gallery', { namedExports: { loadComfyGallery } });

type AutoTagImpl = (entry: ComfyGalleryEntry) => Promise<void>;
let autoTagImpl: AutoTagImpl = async () => {};
const autoTagGalleryEntry = mock.fn((entry: ComfyGalleryEntry) => autoTagImpl(entry));
mock.module('./auto-vision-tags', { namedExports: { autoTagGalleryEntry } });

afterEach(() => {
  galleryEntries = [];
  autoTagImpl = async () => {};
  loadComfyGallery.mock.resetCalls();
  autoTagGalleryEntry.mock.resetCalls();
});

describe('gallery-vision-backfill', async () => {
  const { listUntaggedCompletedEntries, backfillVisionTags } = await import(
    './vision-backfill'
  );

  function entry(overrides?: Partial<ComfyGalleryEntry>): ComfyGalleryEntry {
    return {
      id: 'e1',
      prompt: 'a prompt',
      status: 'completed',
      images: [{ url: '/img.png' }],
      ...overrides,
    } as unknown as ComfyGalleryEntry;
  }

  describe('listUntaggedCompletedEntries', () => {
    it('keeps only completed entries with images and no vision tags', () => {
      galleryEntries = [
        entry({ id: 'a' }),
        entry({ id: 'b', status: 'pending' }),
        entry({ id: 'c', visionTags: ['tag'] }),
        entry({ id: 'd', images: [] }),
        entry({ id: 'e' }),
      ];
      const result = listUntaggedCompletedEntries();
      assert.deepEqual(
        result.map(e => e.id),
        ['a', 'e']
      );
    });

    it('respects the limit parameter', () => {
      galleryEntries = [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })];
      const result = listUntaggedCompletedEntries(2);
      assert.equal(result.length, 2);
      assert.deepEqual(
        result.map(e => e.id),
        ['a', 'b']
      );
    });

    it('defaults to a limit of 200', () => {
      galleryEntries = Array.from({ length: 205 }, (_, i) => entry({ id: `id-${i}` }));
      assert.equal(listUntaggedCompletedEntries().length, 200);
    });
  });

  describe('backfillVisionTags', () => {
    it('returns zeroed progress for an empty entry list', async () => {
      const progress = await backfillVisionTags([]);
      assert.deepEqual(progress, { total: 0, completed: 0, tagged: 0, skipped: 0, failed: 0 });
    });

    it('counts an entry as tagged when visionTags grew after auto-tagging', async () => {
      const target = entry({ id: 'grow' });
      galleryEntries = [target];
      autoTagImpl = async () => {
        galleryEntries = [{ ...target, visionTags: ['new-tag'] }];
      };
      const progress = await backfillVisionTags([target]);
      assert.equal(progress.tagged, 1);
      assert.equal(progress.skipped, 0);
      assert.equal(progress.failed, 0);
      assert.equal(progress.completed, 1);
    });

    it('counts an entry as skipped when visionTags did not grow', async () => {
      const target = entry({ id: 'no-grow' });
      galleryEntries = [target];
      autoTagImpl = async () => {};
      const progress = await backfillVisionTags([target]);
      assert.equal(progress.skipped, 1);
      assert.equal(progress.tagged, 0);
    });

    it('counts an entry as failed when auto-tagging throws, and still marks completed', async () => {
      const target = entry({ id: 'boom' });
      galleryEntries = [target];
      autoTagImpl = async () => {
        throw new Error('vision service down');
      };
      const progress = await backfillVisionTags([target]);
      assert.equal(progress.failed, 1);
      assert.equal(progress.completed, 1);
    });

    it('reports progress via onProgress for each completed entry', async () => {
      const entries = [entry({ id: 'p1' }), entry({ id: 'p2' }), entry({ id: 'p3' })];
      galleryEntries = entries;
      const snapshots: number[] = [];
      await backfillVisionTags(entries, {
        concurrency: 1,
        onProgress: progress => snapshots.push(progress.completed),
      });
      assert.deepEqual(snapshots, [1, 2, 3]);
    });

    it('processes with the requested concurrency, calling autoTagGalleryEntry once per entry', async () => {
      const entries = Array.from({ length: 6 }, (_, i) => entry({ id: `c-${i}` }));
      galleryEntries = entries;
      const progress = await backfillVisionTags(entries, { concurrency: 3 });
      assert.equal(progress.total, 6);
      assert.equal(progress.completed, 6);
      assert.equal(autoTagGalleryEntry.mock.calls.length, 6);
    });

    it('clamps concurrency to a minimum of 1', async () => {
      const entries = [entry({ id: 'only' })];
      galleryEntries = entries;
      const progress = await backfillVisionTags(entries, { concurrency: 0 });
      assert.equal(progress.completed, 1);
    });
  });
});
