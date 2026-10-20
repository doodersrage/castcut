import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

// NOTE: `appendServerGalleryEntries`/`removeServerGalleryEntriesByPromptIds` read
// `isServerStorageEnabled` via a call-time `await import('../server-storage')` rather than a
// static top-level import. Verified via real execution: this test runtime's `mock.module()` does
// not reliably intercept a specifier reached only through such a dynamic import — a mocked
// `isServerStorageEnabled` here was silently ignored and the REAL (env-based) one ran instead. So
// this suite controls the enabled/disabled branch via the real `PROMPT_DATA_DIR` env var (exactly
// what the real `isServerStorageEnabled()` checks) instead of mocking it, while `../sqlite/gallery`
// (statically imported by the source) is still safely and reliably mocked below.

function withEnv(key: string, value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  return fn().finally(() => {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  });
}

const upsertGalleryEntries = mock.fn((_owner: string, _entries: unknown) => undefined);
const removeGalleryEntriesByPromptIds = mock.fn((_owner: string, _ids: string[]) => 0);
mock.module('../sqlite/gallery', {
  namedExports: { upsertGalleryEntries, removeGalleryEntriesByPromptIds },
});

afterEach(() => {
  upsertGalleryEntries.mock.resetCalls();
  removeGalleryEntriesByPromptIds.mock.resetCalls();
});

describe('server-gallery-storage', async () => {
  const { appendServerGalleryEntries, removeServerGalleryEntriesByPromptIds } = await import(
    './server-gallery-storage'
  );

  describe('appendServerGalleryEntries', () => {
    it('no-ops for an empty entries array regardless of server storage state', async () => {
      await withEnv('PROMPT_DATA_DIR', undefined, async () => {
        await appendServerGalleryEntries([]);
        assert.equal(upsertGalleryEntries.mock.calls.length, 0);
      });
    });

    it('no-ops when server storage is disabled', async () => {
      await withEnv('PROMPT_DATA_DIR', undefined, async () => {
        await appendServerGalleryEntries([{ promptId: 'p1' } as never]);
        assert.equal(upsertGalleryEntries.mock.calls.length, 0);
      });
    });

    it('upserts entries under the shared owner namespace when enabled', async () => {
      await withEnv('PROMPT_DATA_DIR', '/tmp/prompt-studio-data', async () => {
        const entries = [{ promptId: 'p1' }, { promptId: 'p2' }] as never[];
        await appendServerGalleryEntries(entries);
        assert.equal(upsertGalleryEntries.mock.calls.length, 1);
        const [owner, passedEntries] = upsertGalleryEntries.mock.calls[0]!.arguments as [
          string,
          unknown,
        ];
        assert.equal(owner, '');
        assert.deepEqual(passedEntries, entries);
      });
    });
  });

  describe('removeServerGalleryEntriesByPromptIds', () => {
    it('returns 0 for an empty id list regardless of server storage state', async () => {
      await withEnv('PROMPT_DATA_DIR', undefined, async () => {
        const result = await removeServerGalleryEntriesByPromptIds([]);
        assert.equal(result, 0);
        assert.equal(removeGalleryEntriesByPromptIds.mock.calls.length, 0);
      });
    });

    it('returns 0 when server storage is disabled', async () => {
      await withEnv('PROMPT_DATA_DIR', undefined, async () => {
        const result = await removeServerGalleryEntriesByPromptIds(['p1']);
        assert.equal(result, 0);
        assert.equal(removeGalleryEntriesByPromptIds.mock.calls.length, 0);
      });
    });

    it('removes entries under the shared owner namespace and returns the count', async () => {
      await withEnv('PROMPT_DATA_DIR', '/tmp/prompt-studio-data', async () => {
        removeGalleryEntriesByPromptIds.mock.mockImplementationOnce(() => 2);
        const result = await removeServerGalleryEntriesByPromptIds(['p1', 'p2']);
        assert.equal(result, 2);
        const [owner, ids] = removeGalleryEntriesByPromptIds.mock.calls[0]!.arguments as [
          string,
          string[],
        ];
        assert.equal(owner, '');
        assert.deepEqual(ids, ['p1', 'p2']);
      });
    });
  });
});
