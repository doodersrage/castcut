import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  syncNamespaceToServer,
  pullNamespaceFromServer,
  pullNamespaceFromServerResult,
  resetServerStorageFingerprints,
  serverStorageStatus,
  storageFingerprint,
} from './storage-sync';
import { SYNC_STORAGE_NAMESPACES } from './storage-namespaces';

type FetchCall = { url: string; init?: RequestInit };

function installFetchStub(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return impl(url, init);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('storage-sync', () => {
  beforeEach(() => resetServerStorageFingerprints());

  describe('upload dedupe', () => {
    it('skips pushing back what was just pulled', async () => {
      const gallery = [{ id: 'g1', prompt: 'a' }];
      const stub = installFetchStub((_url, init) =>
        init?.method === 'PUT' ? jsonResponse({ data: gallery }) : jsonResponse({})
      );
      try {
        await pullNamespaceFromServer('comfy-gallery');
        assert.equal(await syncNamespaceToServer('comfy-gallery', [{ id: 'g1', prompt: 'a' }]), true);
        assert.equal(stub.calls.filter(call => call.init?.method === 'POST').length, 0);
        await syncNamespaceToServer('comfy-gallery', [{ id: 'g1', prompt: 'b' }]);
        assert.equal(stub.calls.filter(call => call.init?.method === 'POST').length, 1);
      } finally {
        stub.restore();
      }
    });

    it('ignores gallery order and a bare updatedAt re-stamp', () => {
      assert.equal(
        storageFingerprint('comfy-gallery', [{ id: 'a' }, { id: 'b' }]),
        storageFingerprint('comfy-gallery', [{ id: 'b' }, { id: 'a' }])
      );
      assert.notEqual(
        storageFingerprint('prompt-history', [{ id: 'a' }, { id: 'b' }]),
        storageFingerprint('prompt-history', [{ id: 'b' }, { id: 'a' }])
      );
      assert.equal(
        storageFingerprint('studio-extras', { updatedAt: 1, characters: [] }),
        storageFingerprint('studio-extras', { updatedAt: 2, characters: [] })
      );
      assert.notEqual(
        storageFingerprint('studio-extras', { updatedAt: 1, characters: [] }),
        storageFingerprint('studio-extras', { updatedAt: 1, characters: [{ id: 'c' }] })
      );
    });

    it('skips a repeat push, but not after a failed one', async () => {
      let ok = false;
      const stub = installFetchStub(() => jsonResponse({}, ok));
      try {
        await syncNamespaceToServer('settings-cache', { a: 1 });
        ok = true;
        await syncNamespaceToServer('settings-cache', { a: 1 });
        await syncNamespaceToServer('settings-cache', { a: 1 });
        assert.equal(stub.calls.length, 2);
      } finally {
        stub.restore();
      }
    });

    it('an empty server namespace does not count as matching', async () => {
      const stub = installFetchStub((_url, init) =>
        init?.method === 'PUT' ? jsonResponse({ data: null }) : jsonResponse({})
      );
      try {
        await pullNamespaceFromServerResult('studio-extras');
        await syncNamespaceToServer('studio-extras', null);
        assert.equal(stub.calls.filter(call => call.init?.method === 'POST').length, 1);
      } finally {
        stub.restore();
      }
    });
  });

  describe('syncNamespaceToServer', () => {
    it('POSTs the namespace and data, returning true when ok', async () => {
      const stub = installFetchStub(() => jsonResponse({}));
      try {
        const result = await syncNamespaceToServer('prompt-history', { a: 1 });
        assert.equal(result, true);
        assert.equal(stub.calls.length, 1);
        assert.equal(stub.calls[0]!.url, '/api/storage');
        assert.equal(stub.calls[0]!.init?.method, 'POST');
        assert.equal(
          stub.calls[0]!.init?.body,
          JSON.stringify({ namespace: 'prompt-history', data: { a: 1 } })
        );
      } finally {
        stub.restore();
      }
    });

    it('returns false when the response is not ok', async () => {
      const stub = installFetchStub(() => jsonResponse({}, false));
      try {
        const result = await syncNamespaceToServer('prompt-history', {});
        assert.equal(result, false);
      } finally {
        stub.restore();
      }
    });

    it('returns false when fetch throws', async () => {
      const stub = installFetchStub(() => {
        throw new Error('offline');
      });
      try {
        const result = await syncNamespaceToServer('prompt-history', {});
        assert.equal(result, false);
      } finally {
        stub.restore();
      }
    });
  });

  describe('pullNamespaceFromServer', () => {
    it('PUTs to the namespace query param and returns the parsed data', async () => {
      const stub = installFetchStub(() => jsonResponse({ data: { hello: 'world' } }));
      try {
        const result = await pullNamespaceFromServer('comfy-gallery');
        assert.deepEqual(result, { hello: 'world' });
        assert.equal(stub.calls[0]!.url, '/api/storage?namespace=comfy-gallery');
        assert.equal(stub.calls[0]!.init?.method, 'PUT');
      } finally {
        stub.restore();
      }
    });

    it('returns null when the response is not ok', async () => {
      const stub = installFetchStub(() => jsonResponse({}, false));
      try {
        const result = await pullNamespaceFromServer('comfy-gallery');
        assert.equal(result, null);
      } finally {
        stub.restore();
      }
    });

    it('returns null when the payload has no data field', async () => {
      const stub = installFetchStub(() => jsonResponse({}));
      try {
        const result = await pullNamespaceFromServer('comfy-gallery');
        assert.equal(result, null);
      } finally {
        stub.restore();
      }
    });

    it('returns null when fetch throws', async () => {
      const stub = installFetchStub(() => {
        throw new Error('offline');
      });
      try {
        const result = await pullNamespaceFromServer('comfy-gallery');
        assert.equal(result, null);
      } finally {
        stub.restore();
      }
    });

    it('URL-encodes the namespace in the query string', async () => {
      const stub = installFetchStub(() => jsonResponse({ data: null }));
      try {
        await pullNamespaceFromServer('gallery-deleted-ids');
        assert.equal(stub.calls[0]!.url, '/api/storage?namespace=gallery-deleted-ids');
      } finally {
        stub.restore();
      }
    });
  });

  describe('serverStorageStatus', () => {
    it('always reports disabled with the full sync namespace list', () => {
      const status = serverStorageStatus();
      assert.equal(status.enabled, false);
      assert.deepEqual(status.namespaces, [...SYNC_STORAGE_NAMESPACES]);
    });
  });
});
