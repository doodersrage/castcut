import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { looksLikeVideoFile, resolveStillFileForVisionScan } from './vision-scan-still';

describe('looksLikeVideoFile', () => {
  it('detects video mime types', () => {
    assert.equal(looksLikeVideoFile(new File(['x'], 'clip.bin', { type: 'video/mp4' })), true);
  });

  it('detects video extensions on octet-stream uploads', () => {
    assert.equal(
      looksLikeVideoFile(new File(['x'], 'output.mp4', { type: 'application/octet-stream' })),
      true
    );
  });

  it('treats png uploads as stills', () => {
    assert.equal(looksLikeVideoFile(new File(['x'], 'still.png', { type: 'image/png' })), false);
  });
});

describe('resolveStillFileForVisionScan', () => {
  it('accepts same-origin relative Comfy view URLs', async () => {
    // 1×1 PNG
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      ),
      c => c.charCodeAt(0)
    );
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(png, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })) as typeof fetch;
    try {
      const file = await resolveStillFileForVisionScan({
        urls: ['/api/comfyui/view?filename=garment.png&type=input'],
        fallbackName: 'garment.png',
      });
      assert.equal(file.name, 'garment.png');
      assert.match(file.type, /^image\//);
    } finally {
      globalThis.fetch = original;
    }
  });
});
