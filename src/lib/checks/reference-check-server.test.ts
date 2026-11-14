import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

describe('checkReferenceOnServer (Phase 3)', () => {
  it('no picture: unknown, nothing asked', async () => {
    const { checkReferenceOnServer } = await import('./reference-check-server');
    const verdict = await checkReferenceOnServer({ role: 'face', filename: ' ', imageUrl: null });
    assert.equal(verdict.status, 'unknown');
  });

  it('a Cast plate as a face is refused by its name, without asking ComfyUI', async () => {
    const original = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched += 1;
      return new Response(null, { status: 500 });
    }) as typeof fetch;
    try {
      const { checkReferenceOnServer } = await import('./reference-check-server');
      const verdict = await checkReferenceOnServer({
        role: 'face',
        filename: 'cast-plate-abc123.png',
        subject: 'Mara',
        comfyUrl: 'http://127.0.0.1:9',
      });
      assert.equal(verdict.status, 'mismatch');
      assert.equal(fetched, 0);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('ComfyUI unreachable: unknown (callers fail open, as the page’s do)', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch;
    try {
      const { checkReferenceOnServer } = await import('./reference-check-server');
      const verdict = await checkReferenceOnServer({
        role: 'face',
        filename: 'day-nude-face-1.png',
        comfyUrl: 'http://127.0.0.1:9',
      });
      assert.equal(verdict.status, 'unknown');
    } finally {
      globalThis.fetch = original;
    }
  });
});
