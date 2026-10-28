import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

// IndexedDB as db-store uses it: the rows each save puts.
const puts: string[][] = [];
const appDb = {
  galleryEntries: {
    bulkPut: async (rows: Array<{ id: string }>) => void puts.push(rows.map(row => row.id)),
    bulkDelete: async () => undefined,
  },
  transaction: async (_mode: string, _table: unknown, run: () => Promise<void>) => run(),
};
mock.module('../app/db', { namedExports: { appDb } });
mock.module('../storage/browser-storage', {
  namedExports: {
    readBrowserValue: () => null,
    writeBrowserValue: () => {},
    removeBrowserKey: () => {},
  },
});
mock.module('../user/scope', {
  namedExports: { getActiveUserId: () => null, isUserScoped: () => false },
});
(globalThis as unknown as { window: unknown }).window = { dispatchEvent: () => true };

describe('incremental IndexedDB saves (M6 D21)', async () => {
  const { persistGalleryCache, setGalleryCache } = await import('./db-store');
  const base: ComfyGalleryEntry = {
    id: 'take',
    promptId: 'take',
    prompt: 'she reads by the window',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: 1,
    completedAt: 2,
    images: [{ filename: 'take.png', subfolder: '', type: 'output' }],
    playChecks: { pose: 0.4, face: 0.8, at: 1 },
  };
  let current = base;
  async function save(change: Partial<ComfyGalleryEntry>): Promise<boolean> {
    const before = puts.length;
    current = { ...current, ...change };
    setGalleryCache([current]);
    await persistGalleryCache();
    return puts.length > before;
  }

  it('writes an entry once, then not again while nothing changed', async () => {
    assert.equal(await save({}), true);
    assert.equal(await save({}), false);
  });

  // Each of these alone used to leave IndexedDB as it was: gone after a reload.
  const changes: Array<[string, Partial<ComfyGalleryEntry>]> = [
    ['a review note', { reviewNote: 'keep for the bar scene' }],
    ['the marks check', { playChecks: { ...base.playChecks!, marksMissing: 'tattoo', at: 2 } }],
    ['a silent clip', { playChecks: { ...base.playChecks!, clipSilent: true, at: 3 } }],
    ['a pose miss on the same score', { playChecks: { ...base.playChecks!, poseMiss: true, at: 4 } }],
    ['the adult check', { adultCheck: { state: 'withheld', at: 5 } as ComfyGalleryEntry['adultCheck'] }],
    ['a stored original', { durableOriginalPath: 'gallery-media/_global/take/original' }],
  ];
  for (const [what, change] of changes) {
    it(`writes ${what}`, async () => {
      assert.equal(await save(change), true);
      assert.equal(await save({}), false, 'and only once');
    });
  }

  it('a new graph is a change; the search corpus is not', async () => {
    assert.equal(await save({ workflowJson: '{"1":{"class_type":"KSampler"}}' }), true);
    (current as { _corpus?: string })._corpus = 'derived search text';
    assert.equal(await save({}), false);
  });
});
