import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const countNamespaceGallery = mock.fn(() => 7);
const listSqliteStorageNamespaces = mock.fn(() => ['prompt-history', 'comfy-gallery']);
const readNamespaceStorage = mock.fn((_namespace: string) => ({ read: true }));
const writeNamespaceStorage = mock.fn((_namespace: string, _data: unknown) => undefined);
mock.module('../sqlite/namespace-storage', {
  namedExports: {
    countNamespaceGallery,
    listSqliteStorageNamespaces,
    readNamespaceStorage,
    writeNamespaceStorage,
  },
});

function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

afterEach(() => {
  countNamespaceGallery.mock.resetCalls();
  listSqliteStorageNamespaces.mock.resetCalls();
  readNamespaceStorage.mock.resetCalls();
  writeNamespaceStorage.mock.resetCalls();
});

describe('server-storage', async () => {
  const {
    isServerStorageEnabled,
    readServerStorage,
    writeServerStorage,
    listServerStorageNamespaces,
    countServerGalleryEntries,
  } = await import('./server-storage');

  describe('isServerStorageEnabled', () => {
    it('is false when PROMPT_DATA_DIR is unset or blank', () => {
      withEnv('PROMPT_DATA_DIR', undefined, () => {
        assert.equal(isServerStorageEnabled(), false);
      });
      withEnv('PROMPT_DATA_DIR', '   ', () => {
        assert.equal(isServerStorageEnabled(), false);
      });
    });

    it('is true when PROMPT_DATA_DIR is set to a non-blank value', () => {
      withEnv('PROMPT_DATA_DIR', '/data', () => {
        assert.equal(isServerStorageEnabled(), true);
      });
    });
  });

  describe('readServerStorage', () => {
    it('returns null without reading when storage is disabled', () => {
      withEnv('PROMPT_DATA_DIR', undefined, () => {
        const result = readServerStorage('prompt-history' as never);
        assert.equal(result, null);
        assert.equal(readNamespaceStorage.mock.calls.length, 0);
      });
    });

    it('delegates to readNamespaceStorage when enabled', () => {
      withEnv('PROMPT_DATA_DIR', '/data', () => {
        const result = readServerStorage('prompt-history' as never);
        assert.deepEqual(result, { read: true });
        assert.equal(readNamespaceStorage.mock.calls[0]!.arguments[0], 'prompt-history');
      });
    });
  });

  describe('writeServerStorage', () => {
    it('throws when storage is disabled', () => {
      withEnv('PROMPT_DATA_DIR', undefined, () => {
        assert.throws(
          () => writeServerStorage('prompt-history' as never, { a: 1 }),
          /Server storage is disabled/
        );
      });
      assert.equal(writeNamespaceStorage.mock.calls.length, 0);
    });

    it('delegates to writeNamespaceStorage when enabled', () => {
      withEnv('PROMPT_DATA_DIR', '/data', () => {
        writeServerStorage('prompt-history' as never, { a: 1 });
      });
      assert.equal(writeNamespaceStorage.mock.calls.length, 1);
      const [namespace, data] = writeNamespaceStorage.mock.calls[0]!.arguments as [string, unknown];
      assert.equal(namespace, 'prompt-history');
      assert.deepEqual(data, { a: 1 });
    });
  });

  describe('listServerStorageNamespaces', () => {
    it('always delegates to listSqliteStorageNamespaces regardless of env', () => {
      withEnv('PROMPT_DATA_DIR', undefined, () => {
        const result = listServerStorageNamespaces();
        assert.deepEqual(result, ['prompt-history', 'comfy-gallery']);
      });
    });
  });

  describe('countServerGalleryEntries', () => {
    it('returns 0 without counting when storage is disabled', () => {
      withEnv('PROMPT_DATA_DIR', undefined, () => {
        const result = countServerGalleryEntries();
        assert.equal(result, 0);
        assert.equal(countNamespaceGallery.mock.calls.length, 0);
      });
    });

    it('delegates to countNamespaceGallery when enabled', () => {
      withEnv('PROMPT_DATA_DIR', '/data', () => {
        const result = countServerGalleryEntries();
        assert.equal(result, 7);
      });
    });
  });
});
