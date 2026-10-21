import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAnimatedImageClip } from './clip-source-server';

const bytes = (...parts: Array<string | number[]>) =>
  Uint8Array.from(
    parts.flatMap(part => (typeof part === 'string' ? [...part].map(c => c.charCodeAt(0)) : part))
  );

describe('clip source', () => {
  it('spots an animated WebP (WAN) and a GIF; an MP4 or a still WebP goes as it came', () => {
    // RIFF size WEBP VP8X size flags(animation bit 0x02)
    const vp8x = (flags: number) =>
      bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [flags, 0, 0, 0], [0, 0, 0, 0, 0, 0]);
    assert.equal(isAnimatedImageClip(vp8x(0x02)), true);
    assert.equal(isAnimatedImageClip(vp8x(0x10)), false);
    assert.equal(isAnimatedImageClip(bytes('GIF89a', [0, 0])), true);
    assert.equal(isAnimatedImageClip(bytes([0, 0, 0, 0x20], 'ftypisom', [0, 0, 0, 0, 0, 0, 0, 0, 0])), false);
    assert.equal(isAnimatedImageClip(bytes('RIFF')), false);
  });
});
