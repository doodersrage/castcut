import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
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

describe('archiveThenPurgeGalleryEntries', () => {
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

  it('refuses purge when zip has sidecars but zero images', async () => {
    const removeEntries = mock.fn();
    const downloadZip = mock.fn(async () => ({ entryCount: 2, imageCount: 0 }));
    const result = await archiveThenPurgeGalleryEntries(
      [entry('a'), entry('b')],
      {
        removeEntries,
        characters: [],
        downloadZip,
      }
    );
    assert.equal(result.skipped, true);
    assert.equal(result.purged, 0);
    assert.match(result.message, /no images/i);
    assert.equal(removeEntries.mock.callCount(), 0);
    assert.equal(downloadZip.mock.callCount(), 1);
  });

  it('archives in batches then purges once all ZIPs succeed', async () => {
    const removeEntries = mock.fn();
    const downloadZip = mock.fn(async (batch: ComfyGalleryEntry[]) => ({
      entryCount: batch.length,
      imageCount: batch.length,
    }));
    const progress: Array<{ phase: string; batchIndex: number; batchCount: number }> = [];
    const result = await archiveThenPurgeGalleryEntries(
      [entry('a'), entry('b'), entry('c'), entry('d'), entry('e')],
      {
        removeEntries,
        characters: [],
        downloadZip,
        batchSize: 2,
        onProgress: event => {
          progress.push({
            phase: event.phase,
            batchIndex: event.batchIndex,
            batchCount: event.batchCount,
          });
        },
      }
    );
    assert.equal(result.skipped, false);
    assert.equal(result.purged, 5);
    assert.equal(result.archived, 5);
    assert.equal(result.zipCount, 3);
    assert.equal(downloadZip.mock.callCount(), 3);
    assert.equal(removeEntries.mock.callCount(), 1);
    assert.deepEqual(removeEntries.mock.calls[0]?.arguments[0], ['a', 'b', 'c', 'd', 'e']);
    assert.equal(progress.at(-1)?.phase, 'purge');
    assert.match(result.message, /3 ZIPs/i);
  });

  it('does not purge when a later batch ZIP fails', async () => {
    const removeEntries = mock.fn();
    let calls = 0;
    const downloadZip = mock.fn(async (batch: ComfyGalleryEntry[]) => {
      calls += 1;
      if (calls === 2) {
        return { entryCount: batch.length, imageCount: 0 };
      }
      return { entryCount: batch.length, imageCount: batch.length };
    });
    const result = await archiveThenPurgeGalleryEntries([entry('a'), entry('b'), entry('c')], {
      removeEntries,
      characters: [],
      downloadZip,
      batchSize: 2,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.purged, 0);
    assert.equal(result.archived, 2);
    assert.equal(removeEntries.mock.callCount(), 0);
    assert.match(result.message, /stopped after/i);
  });
});
