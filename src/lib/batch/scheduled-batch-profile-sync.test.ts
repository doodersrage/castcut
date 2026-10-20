import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  fetchScheduledBatchServerStatus,
  pushScheduledBatchProfile,
} from './scheduled-batch-profile-sync';

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
  return {
    ok,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  // no shared state to reset beyond the fetch stub, which each test restores itself
});

describe('scheduled-batch-profile-sync', () => {
  describe('fetchScheduledBatchServerStatus', () => {
    it('returns the parsed status on a successful GET', async () => {
      const status = { profile: { id: 'p1' }, persisted: true, enabled: true };
      const stub = installFetchStub(() => jsonResponse(status));
      try {
        const result = await fetchScheduledBatchServerStatus();
        assert.deepEqual(result, status);
        assert.equal(stub.calls.length, 1);
        assert.equal(stub.calls[0]!.url, '/api/scheduled-batch/profile');
      } finally {
        stub.restore();
      }
    });

    it('returns null when the response is not ok', async () => {
      const stub = installFetchStub(() => jsonResponse({}, false));
      try {
        const result = await fetchScheduledBatchServerStatus();
        assert.equal(result, null);
      } finally {
        stub.restore();
      }
    });

    it('returns null when fetch throws', async () => {
      const stub = installFetchStub(() => {
        throw new Error('network down');
      });
      try {
        const result = await fetchScheduledBatchServerStatus();
        assert.equal(result, null);
      } finally {
        stub.restore();
      }
    });
  });

  describe('pushScheduledBatchProfile', () => {
    it('POSTs the profile as JSON and returns the parsed result', async () => {
      const pushResult = { profile: { id: 'p1' }, persisted: true };
      const stub = installFetchStub(() => jsonResponse(pushResult));
      try {
        const result = await pushScheduledBatchProfile({ id: 'p1' } as never);
        assert.deepEqual(result, pushResult);
        assert.equal(stub.calls.length, 1);
        assert.equal(stub.calls[0]!.url, '/api/scheduled-batch/profile');
        assert.equal(stub.calls[0]!.init?.method, 'POST');
        assert.equal(
          (stub.calls[0]!.init?.headers as Record<string, string>)['Content-Type'],
          'application/json'
        );
        assert.equal(stub.calls[0]!.init?.body, JSON.stringify({ id: 'p1' }));
      } finally {
        stub.restore();
      }
    });

    it('returns null when the response is not ok', async () => {
      const stub = installFetchStub(() => jsonResponse({}, false));
      try {
        const result = await pushScheduledBatchProfile({});
        assert.equal(result, null);
      } finally {
        stub.restore();
      }
    });

    it('returns null when fetch throws', async () => {
      const stub = installFetchStub(() => {
        throw new Error('network down');
      });
      try {
        const result = await pushScheduledBatchProfile({});
        assert.equal(result, null);
      } finally {
        stub.restore();
      }
    });
  });
});
