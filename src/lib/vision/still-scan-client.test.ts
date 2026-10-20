import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const sharedLlmRequestBody = mock.fn((_shared: unknown) => ({ sessionLlmModel: 'shared-model' }));
mock.module('../llm/request-options', { namedExports: { sharedLlmRequestBody } });

let resolvedFile = new File(['still-bytes'], 'still.png', { type: 'image/png' });
const resolveStillFileForVisionScan = mock.fn((_input: unknown) => Promise.resolve(resolvedFile));

let preparedPayload = { image: 'base64data', mimeType: 'image/png' };
const prepareVisionScanImagePayload = mock.fn((_file: unknown) => Promise.resolve(preparedPayload));

let parsedResponse: { prompt?: string; error?: string } = { prompt: 'a described scene' };
const parseVisionScanApiResponse = mock.fn((_response: unknown) => Promise.resolve(parsedResponse));

mock.module('./scan-still', {
  namedExports: {
    resolveStillFileForVisionScan,
    prepareVisionScanImagePayload,
    parseVisionScanApiResponse,
  },
});

function installFetchStub(ok = true) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return { ok } as Response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

afterEach(() => {
  resolvedFile = new File(['still-bytes'], 'still.png', { type: 'image/png' });
  preparedPayload = { image: 'base64data', mimeType: 'image/png' };
  parsedResponse = { prompt: 'a described scene' };
  sharedLlmRequestBody.mock.resetCalls();
  resolveStillFileForVisionScan.mock.resetCalls();
  prepareVisionScanImagePayload.mock.resetCalls();
  parseVisionScanApiResponse.mock.resetCalls();
});

describe('vision-still-scan-client', async () => {
  const { resolveLocalImageFile, scanStillWithVision } = await import('./still-scan-client');

  describe('resolveLocalImageFile', () => {
    it('delegates to resolveStillFileForVisionScan with file/urls/fallbackName', async () => {
      const file = new File(['x'], 'a.png');
      const result = await resolveLocalImageFile(file, 'blob:preview-url', 'fallback.png');
      assert.equal(result, resolvedFile);
      assert.deepEqual(resolveStillFileForVisionScan.mock.calls[0]!.arguments[0], {
        file,
        urls: ['blob:preview-url'],
        fallbackName: 'fallback.png',
      });
    });

    it('passes a null previewUrl through as a single-element urls array', async () => {
      await resolveLocalImageFile(null, null, 'fallback.png');
      assert.deepEqual(resolveStillFileForVisionScan.mock.calls[0]!.arguments[0], {
        file: null,
        urls: [null],
        fallbackName: 'fallback.png',
      });
    });
  });

  describe('scanStillWithVision', () => {
    it('POSTs the prepared image payload and returns the trimmed prompt on success', async () => {
      parsedResponse = { prompt: '  a lovely scene  ' };
      const stub = installFetchStub(true);
      try {
        const image = new File(['x'], 'a.png');
        const result = await scanStillWithVision({ image, purpose: 'describe' as never });
        assert.equal(result, 'a lovely scene');
        assert.equal(stub.calls.length, 1);
        assert.equal(stub.calls[0]!.url, '/api/vision-scan');
        assert.equal(stub.calls[0]!.init?.method, 'POST');
        assert.equal(stub.calls[0]!.init?.credentials, 'same-origin');
        const body = JSON.parse(stub.calls[0]!.init?.body as string) as Record<string, unknown>;
        assert.equal(body.image, 'base64data');
        assert.equal(body.mimeType, 'image/png');
        assert.equal(body.purpose, 'describe');
      } finally {
        stub.restore();
      }
    });

    it('merges sharedLlmRequestBody fields into the POST body when shared is given', async () => {
      const stub = installFetchStub(true);
      try {
        await scanStillWithVision({
          image: new File(['x'], 'a.png'),
          purpose: 'describe' as never,
          shared: { sessionLlmEnabled: true } as never,
        });
        const body = JSON.parse(stub.calls[0]!.init?.body as string) as Record<string, unknown>;
        assert.equal(body.sessionLlmModel, 'shared-model');
        assert.equal(sharedLlmRequestBody.mock.calls.length, 1);
      } finally {
        stub.restore();
      }
    });

    it('does not call sharedLlmRequestBody when shared is not given', async () => {
      const stub = installFetchStub(true);
      try {
        await scanStillWithVision({ image: new File(['x'], 'a.png'), purpose: 'describe' as never });
        assert.equal(sharedLlmRequestBody.mock.calls.length, 0);
      } finally {
        stub.restore();
      }
    });

    it('throws the API error message when the response is not ok', async () => {
      parsedResponse = { error: 'vision backend down' };
      const stub = installFetchStub(false);
      try {
        await assert.rejects(
          scanStillWithVision({ image: new File(['x'], 'a.png'), purpose: 'describe' as never }),
          /vision backend down/
        );
      } finally {
        stub.restore();
      }
    });

    it('throws a generic "Vision scan failed." when not ok and no error message is given', async () => {
      parsedResponse = {};
      const stub = installFetchStub(false);
      try {
        await assert.rejects(
          scanStillWithVision({ image: new File(['x'], 'a.png'), purpose: 'describe' as never }),
          /Vision scan failed\./
        );
      } finally {
        stub.restore();
      }
    });

    it('throws when the response is ok but the prompt is blank', async () => {
      parsedResponse = { prompt: '   ' };
      const stub = installFetchStub(true);
      try {
        await assert.rejects(
          scanStillWithVision({ image: new File(['x'], 'a.png'), purpose: 'describe' as never }),
          /Vision scan failed\./
        );
      } finally {
        stub.restore();
      }
    });
  });
});
