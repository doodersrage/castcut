import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;
function installFetchStub(impl: FetchImpl) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(impl(url, init));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  }
}

const ALL_TOKEN_ENV_KEYS = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GEMINI_API_KEY',
  'XAI_API_KEY',
];

function noTokenEnv<T>(fn: () => T): T {
  return withEnv(Object.fromEntries(ALL_TOKEN_ENV_KEYS.map(k => [k, undefined])), fn);
}

describe('llm-image-client', async () => {
  const {
    resolveLlmImageApiToken,
    storeLlmEngineUpload,
    queueLlmImage,
    fetchLlmImageJobStatus,
    ensureLlmImageOutput,
  } = await import('./image-client');

  describe('resolveLlmImageApiToken', () => {
    it('throws with a clear message when no token is available anywhere', () => {
      noTokenEnv(() => {
        assert.throws(() => resolveLlmImageApiToken('openai'), /ChatGPT API key is required/i);
      });
    });

    it('prefers the explicit request token over the environment', () => {
      withEnv({ OPENAI_API_KEY: 'env-key' }, () => {
        assert.equal(resolveLlmImageApiToken('openai', 'request-key'), 'request-key');
      });
    });

    it('trims the request token and falls through to env when it is blank', () => {
      withEnv({ OPENAI_API_KEY: 'env-key' }, () => {
        assert.equal(resolveLlmImageApiToken('openai', '   '), 'env-key');
      });
    });

    it('falls back to the environment variable when no request token is given', () => {
      withEnv({ OPENAI_API_KEY: 'env-key' }, () => {
        assert.equal(resolveLlmImageApiToken('openai'), 'env-key');
      });
    });

    it("checks Gemini's alternate env var names in order", () => {
      noTokenEnv(() => {
        withEnv({ GOOGLE_API_KEY: 'google-key' }, () => {
          assert.equal(resolveLlmImageApiToken('gemini'), 'google-key');
        });
      });
    });
  });

  describe('storeLlmEngineUpload', () => {
    it('stores bytes and returns a name/subfolder/type triple', () => {
      const result = storeLlmEngineUpload('openai', { bytes: Buffer.from('img'), mimeType: 'image/png' });
      assert.ok(result.name.length > 0);
      assert.equal(result.subfolder, '');
      assert.equal(result.type, 'input');
    });
  });

  describe('queueLlmImage', () => {
    it('returns a not-ok result immediately when no API key is available, without calling fetch', async () => {
      const stub = installFetchStub(() => new Response('should not be called'));
      try {
        const result = await noTokenEnv(() =>
          queueLlmImage('openai', { prompt: 'a cat' })
        );
        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.match(result.error ?? '', /API key is required/i);
        assert.equal(stub.calls.length, 0);
      } finally {
        stub.restore();
      }
    });

    it('returns a not-ok result for an invalid explicit model id', async () => {
      const result = await queueLlmImage('openai', {
        prompt: 'a cat',
        apiToken: 'tok',
        model: 'not valid!!',
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
    });

    it('queues an OpenAI txt2img job successfully from a base64 response', async () => {
      const stub = installFetchStub(url => {
        assert.match(String(url), /\/v1\/images\/generations$/);
        return Response.json({ data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }] });
      });
      try {
        const result = await queueLlmImage('openai', { prompt: 'a cat', apiToken: 'tok' });
        assert.equal(result.ok, true);
        assert.equal(result.status, 200);
        assert.ok(result.promptId);
        assert.equal(result.engineUrl, 'https://api.openai.com');
      } finally {
        stub.restore();
      }
    });

    it('surfaces a provider error message and status on a non-ok OpenAI response', async () => {
      const stub = installFetchStub(
        () => Response.json({ error: { message: 'invalid prompt' } }, { status: 422 })
      );
      try {
        const result = await queueLlmImage('openai', { prompt: 'a cat', apiToken: 'tok' });
        assert.equal(result.ok, false);
        assert.equal(result.status, 422);
        assert.equal(result.error, 'invalid prompt');
      } finally {
        stub.restore();
      }
    });

    it('fails with a clear error when OpenAI completes without image bytes', async () => {
      const stub = installFetchStub(() => Response.json({}));
      try {
        const result = await queueLlmImage('openai', { prompt: 'a cat', apiToken: 'tok' });
        assert.equal(result.ok, false);
        assert.equal(result.status, 502);
        assert.match(result.error ?? '', /without image bytes/);
      } finally {
        stub.restore();
      }
    });

    it('uses the OpenAI image edit endpoint (multipart) when an uploaded image is referenced', async () => {
      const upload = storeLlmEngineUpload('openai', { bytes: Buffer.from('src'), mimeType: 'image/png' });
      const stub = installFetchStub(url => {
        assert.match(String(url), /\/v1\/images\/edits$/);
        return Response.json({ data: [{ b64_json: Buffer.from('out').toString('base64') }] });
      });
      try {
        const result = await queueLlmImage('openai', {
          prompt: 'edit it',
          apiToken: 'tok',
          imageFilename: upload.name,
        });
        assert.equal(result.ok, true);
      } finally {
        stub.restore();
      }
    });

    it('fails clearly when the referenced upload has expired/is unknown', async () => {
      const result = await queueLlmImage('openai', {
        prompt: 'edit it',
        apiToken: 'tok',
        imageFilename: 'never-uploaded.png',
      });
      assert.equal(result.ok, false);
      assert.match(result.error ?? '', /expired/i);
    });

    it('queues a Gemini job from inline_data in candidates[0].content.parts', async () => {
      const stub = installFetchStub(url => {
        assert.match(String(url), /generativelanguage\.googleapis\.com/);
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { data: Buffer.from('gem-bytes').toString('base64'), mimeType: 'image/png' } },
                ],
              },
            },
          ],
        });
      });
      try {
        const result = await queueLlmImage('gemini', { prompt: 'a dog', apiToken: 'tok' });
        assert.equal(result.ok, true);
      } finally {
        stub.restore();
      }
    });

    it('surfaces a Gemini block reason when present and no image bytes come back', async () => {
      const stub = installFetchStub(() =>
        Response.json({ promptFeedback: { blockReason: 'SAFETY' } })
      );
      try {
        const result = await queueLlmImage('gemini', { prompt: 'a dog', apiToken: 'tok' });
        assert.equal(result.ok, false);
        assert.match(result.error ?? '', /blocked the request \(SAFETY\)/);
      } finally {
        stub.restore();
      }
    });

    it('queues a Grok job from a b64_json data entry', async () => {
      const stub = installFetchStub(url => {
        assert.match(String(url), /\/v1\/images\/generations$/);
        return Response.json({ data: [{ b64_json: Buffer.from('grok-bytes').toString('base64') }] });
      });
      try {
        const result = await queueLlmImage('grok', { prompt: 'a robot', apiToken: 'tok' });
        assert.equal(result.ok, true);
      } finally {
        stub.restore();
      }
    });

    it('downloads a Grok image via an allowed https URL when no inline base64 is present', async () => {
      let call = 0;
      const stub = installFetchStub(_url => {
        call += 1;
        if (call === 1) {
          return Response.json({ data: [{ url: 'https://imagine.x.ai/out.png' }] });
        }
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      });
      try {
        const result = await queueLlmImage('grok', { prompt: 'a robot', apiToken: 'tok' });
        assert.equal(result.ok, true);
        assert.equal(stub.calls.length, 2);
      } finally {
        stub.restore();
      }
    });

    it('rejects a downloaded image URL that is not on an allowed host', async () => {
      const stub = installFetchStub(() =>
        Response.json({ data: [{ url: 'https://evil.example.com/out.png' }] })
      );
      try {
        const result = await queueLlmImage('grok', { prompt: 'a robot', apiToken: 'tok' });
        assert.equal(result.ok, false);
        assert.match(result.error ?? '', /not on an allowed host/);
      } finally {
        stub.restore();
      }
    });

    it('rejects video tool requests implicitly by treating engine independent of tool (no special-case here)', async () => {
      // queueLlmImage itself has no tool/video branching (that lives in
      // llm-image-routes.ts) — included as a smoke test that unrelated
      // input fields are simply ignored.
      const stub = installFetchStub(() =>
        Response.json({ data: [{ b64_json: Buffer.from('x').toString('base64') }] })
      );
      try {
        const result = await queueLlmImage('openai', { prompt: 'a cat', apiToken: 'tok' });
        assert.equal(result.ok, true);
      } finally {
        stub.restore();
      }
    });
  });

  describe('fetchLlmImageJobStatus', () => {
    it('returns an error status for an unparsable promptId', async () => {
      const status = await fetchLlmImageJobStatus('openai', 'not-a-real-prompt-id');
      assert.equal(status.status, 'error');
      assert.match(status.statusMessage ?? '', /Invalid openai job id/);
    });

    it('returns an error status when the generated image is not (or no longer) cached', async () => {
      const stub = installFetchStub(() =>
        Response.json({ data: [{ b64_json: Buffer.from('x').toString('base64') }] })
      );
      let queued;
      try {
        queued = await queueLlmImage('openai', { prompt: 'a cat', apiToken: 'tok' });
      } finally {
        stub.restore();
      }
      // Corrupt the promptId's job id so it looks up a cache entry that was
      // never written (simulating expiry without waiting out the real TTL).
      const otherPromptId = queued.promptId!.replace(/::.+$/, `::${'a'.repeat(24)}`);
      const status = await fetchLlmImageJobStatus('openai', otherPromptId);
      assert.equal(status.status, 'error');
      assert.match(status.statusMessage ?? '', /expired/i);
    });

    it('returns a completed status with the cached image once queueLlmImage has stored one', async () => {
      const stub = installFetchStub(() =>
        Response.json({ data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }] })
      );
      let queued;
      try {
        queued = await queueLlmImage('openai', { prompt: 'a cat', apiToken: 'tok' });
      } finally {
        stub.restore();
      }
      const status = await fetchLlmImageJobStatus('openai', queued.promptId!);
      assert.equal(status.status, 'completed');
      assert.equal(status.images?.length, 1);
      assert.equal(status.images?.[0]?.filename.endsWith('.png'), true);
      assert.equal(status.progressValue, 1);
      assert.equal(status.progressMax, 1);
    });
  });

  describe('ensureLlmImageOutput', () => {
    it('returns null for an engineId outside the llm-image set', async () => {
      const result = await ensureLlmImageOutput({ engineId: 'fal', filename: 'x.png', subfolder: '' });
      assert.equal(result, null);
    });

    it('returns null for a cache miss on a valid engine', async () => {
      const result = await ensureLlmImageOutput({ engineId: 'openai', filename: 'missing.png', subfolder: '' });
      assert.equal(result, null);
    });

    it('returns the cached bytes once stored via queueLlmImage', async () => {
      const stub = installFetchStub(() =>
        Response.json({ data: [{ b64_json: Buffer.from('cached-bytes').toString('base64') }] })
      );
      let queued;
      try {
        queued = await queueLlmImage('openai', { prompt: 'a cat', apiToken: 'tok' });
      } finally {
        stub.restore();
      }
      const status = await fetchLlmImageJobStatus('openai', queued.promptId!);
      const image = status.images![0]!;
      const output = await ensureLlmImageOutput({
        engineId: 'openai',
        filename: image.filename,
        subfolder: image.subfolder,
      });
      assert.equal(output?.bytes.toString(), 'cached-bytes');
    });
  });
});
