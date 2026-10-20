import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHistogramSampleUrl } from './lightbox-histogram';

test('resolveHistogramSampleUrl keeps and sizes same-origin proxy URLs', () => {
  const input = '/api/comfyui/view?filename=a.png&subfolder=&type=output&comfyUrl=http://127.0.0.1:8188';
  const resolved = resolveHistogramSampleUrl(input);
  assert.match(resolved, /^\/api\/comfyui\/view\?/);
  assert.match(resolved, /[?&]w=160(?:&|$)/);
});

test('resolveHistogramSampleUrl rewrites absolute Comfy /view URLs through the proxy', () => {
  const input =
    'http://127.0.0.1:8188/view?filename=out.png&subfolder=batch&type=output';
  const resolved = resolveHistogramSampleUrl(input);
  assert.equal(
    resolved,
    '/api/comfyui/view?filename=out.png&subfolder=batch&type=output&comfyUrl=http%3A%2F%2F127.0.0.1%3A8188&w=160'
  );
});
