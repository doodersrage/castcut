import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiError, apiErrorFrom, apiJson, apiMethodNotAllowed, apiOptions, requestBaseUrl } from './response';

describe('api/response', () => {
  describe('apiJson', () => {
    it('returns a NextResponse with the given data and CORS headers, defaulting to status 200', async () => {
      const res = apiJson({ ok: true });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
      assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
      const body = (await res.json()) as { ok: boolean };
      assert.deepEqual(body, { ok: true });
    });

    it('uses the given status and merges extra headers on top of the CORS defaults', async () => {
      const res = apiJson({ id: 1 }, { status: 201, headers: { 'X-Custom': 'yes' } });
      assert.equal(res.status, 201);
      assert.equal(res.headers.get('X-Custom'), 'yes');
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    });

    it('allows an init header to override a CORS default header', async () => {
      const res = apiJson({}, { headers: { 'Access-Control-Allow-Origin': 'https://example.com' } });
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
    });
  });

  describe('apiError', () => {
    it('returns an error payload with the given status', async () => {
      const res = apiError('Not found', 404);
      assert.equal(res.status, 404);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, 'Not found');
    });

    it('merges extra fields into the error payload', async () => {
      const res = apiError('Bad request', 400, { field: 'email' });
      const body = (await res.json()) as { error: string; field: string };
      assert.equal(body.error, 'Bad request');
      assert.equal(body.field, 'email');
    });

    it('turns a bare "fetch failed" into a plain sentence and caps long text', async () => {
      const res = apiError('fetch failed', 500);
      const body = (await res.json()) as { error: string };
      assert.match(body.error, /^Can't reach ComfyUI or the language model/);
      const long = (await apiError('y'.repeat(1000), 500).json()) as { error: string };
      assert.ok(long.error.length <= 300);
    });

    it('apiErrorFrom answers 503 with the service named when it was unreachable', async () => {
      const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      const res = apiErrorFrom(new TypeError('fetch failed', { cause }), 500, {
        service: 'llm',
        url: 'http://localhost:1234/v1',
        extra: { stage: 'x' },
      });
      assert.equal(res.status, 503);
      const body = (await res.json()) as { error: string; unreachable: string; stage: string };
      assert.match(body.error, /LM Studio at http:\/\/localhost:1234\/v1/);
      assert.equal(body.unreachable, 'llm');
      assert.equal(body.stage, 'x');
      const plain = apiErrorFrom(new Error('Bad prompt'), 500);
      assert.equal(plain.status, 500);
    });

    it('passes through custom headers', () => {
      const res = apiError('Nope', 403, undefined, { 'X-Reason': 'blocked' });
      assert.equal(res.headers.get('X-Reason'), 'blocked');
    });
  });

  describe('apiMethodNotAllowed', () => {
    it('returns a 405 with a message listing the allowed methods and the path', async () => {
      const res = apiMethodNotAllowed(['GET', 'POST'], '/api/thing');
      assert.equal(res.status, 405);
      const body = (await res.json()) as { error: string; allowedMethods: string[]; path: string };
      assert.equal(body.error, 'Method not allowed. Use GET or POST on /api/thing.');
      assert.deepEqual(body.allowedMethods, ['GET', 'POST']);
      assert.equal(body.path, '/api/thing');
    });
  });

  describe('apiOptions', () => {
    it('returns a 204 response with CORS headers using the default methods/headers', () => {
      const res = apiOptions();
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
      assert.equal(res.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
    });

    it('uses the given methods and allowHeaders when provided', () => {
      const res = apiOptions('GET, OPTIONS', 'X-Api-Key');
      assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
      assert.equal(res.headers.get('Access-Control-Allow-Headers'), 'X-Api-Key');
    });
  });

  describe('requestBaseUrl', () => {
    it('returns the origin of the request URL, dropping path/query', () => {
      const request = new Request('https://example.com/api/foo?bar=1');
      assert.equal(requestBaseUrl(request), 'https://example.com');
    });

    it('includes a non-default port in the origin', () => {
      const request = new Request('http://localhost:3000/api/foo');
      assert.equal(requestBaseUrl(request), 'http://localhost:3000');
    });
  });
});
