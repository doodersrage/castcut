import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import sharp from 'sharp';

mock.module('server-only', { defaultExport: {}, namedExports: {} });
// Never a real LLM: a dead port, answered by the fake fetch below.
process.env.LLM_API_BASE_URL = 'http://127.0.0.1:9/v1';

const still = () =>
  sharp({ create: { width: 64, height: 128, channels: 3, background: '#ccc' } }).png().toBuffer();

describe('the shoe check on the server (Phase 3)', () => {
  it('no LLM: null (the plate keeps its unchecked rule), never a throw', async () => {
    const { checkStillFootwearOnServer } = await import('./footwear-check-server');
    const png = await still();
    const verdict = await checkStillFootwearOnServer(
      {
        imageUrl: '/api/comfyui/view?filename=p.png&type=output',
        shoeWords: 'black heels',
        shared: { sessionLlmEnabled: false } as never,
      },
      { loadBlob: async () => new Blob([new Uint8Array(png)], { type: 'image/png' }) }
    );
    assert.equal(verdict, null);
  });

  it('the still read with the run’s steps and judged by the vision model', async () => {
    const { checkStillFootwearOnServer } = await import('./footwear-check-server');
    const png = await still();
    const asked: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      asked.push(url);
      if (url.endsWith('/chat/completions')) {
        const body = JSON.parse(String(init?.body)) as { messages: unknown[] };
        assert.match(JSON.stringify(body.messages), /data:image\//, 'the feet sent as a picture');
        return Response.json({
          choices: [
            {
              message: {
                content:
                  '{"feetVisible": true, "shoesOnFeet": 0, "heel": "none", "kind": "bare feet", "shoesBesideHer": false, "deformed": false}',
              },
            },
          ],
        });
      }
      return Response.json({ data: [{ id: 'vl-test' }] });
    }) as typeof fetch;
    try {
      const loaded: string[][] = [];
      const verdict = await checkStillFootwearOnServer(
        {
          imageUrl: '/api/comfyui/view?filename=p.png&type=output',
          shoeWords: 'black strappy heels',
          shared: { sessionLlmEnabled: true, sessionLlmVisionModel: 'vl-test' } as never,
        },
        {
          loadBlob: async urls => {
            loaded.push(urls);
            return new Blob([new Uint8Array(png)], { type: 'image/png' });
          },
        }
      );
      assert.deepEqual(loaded, [['/api/comfyui/view?filename=p.png&type=output']]);
      assert.ok(asked.some(url => url.endsWith('/chat/completions')), `asked ${asked.join(', ')}`);
      assert.equal(verdict?.ok, false, 'bare feet are not the picked heels');
    } finally {
      globalThis.fetch = original;
    }
  });
});
