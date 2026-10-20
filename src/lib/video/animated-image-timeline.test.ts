import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAnimatedImageShotUrl,
  readGifLoopDurationMs,
  readWebpLoopDurationMs,
  sniffAnimatedImageMime,
} from './animated-image-timeline';

function gifWithDelays(delays: number[]): Uint8Array {
  const chunks: number[] = [];
  const push = (...values: number[]) => {
    chunks.push(...values);
  };
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
  push(0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00);
  for (const delay of delays) {
    push(0x21, 0xf9, 0x04, 0x00, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00);
    push(0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00);
    push(0x08, 0x00);
  }
  push(0x3b);
  return Uint8Array.from(chunks);
}

function webpWithAnmf(durations: number[]): Uint8Array {
  const chunks: number[] = [];
  const push = (...values: number[]) => {
    chunks.push(...values);
  };
  push(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00);
  push(0x57, 0x45, 0x42, 0x50);
  for (const duration of durations) {
    const payload = 16;
    push(0x41, 0x4e, 0x4d, 0x46);
    push(payload, 0x00, 0x00, 0x00);
    push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    push(duration & 0xff, (duration >> 8) & 0xff, (duration >> 16) & 0xff, 0);
  }
  const bytes = Uint8Array.from(chunks);
  const size = bytes.length - 8;
  bytes[4] = size & 0xff;
  bytes[5] = (size >> 8) & 0xff;
  bytes[6] = (size >> 16) & 0xff;
  bytes[7] = (size >> 24) & 0xff;
  return bytes;
}

describe('animated-image-timeline', () => {
  it('treats gif/webp view URLs as animated image shots, not html video', () => {
    assert.equal(isAnimatedImageShotUrl('http://local/clip.webp'), true);
    assert.equal(isAnimatedImageShotUrl('/api/comfyui/view?filename=clip.gif&type=output'), true);
    assert.equal(isAnimatedImageShotUrl('http://local/clip.mp4'), false);
    assert.equal(isAnimatedImageShotUrl('http://local/still.png'), false);
  });

  it('sums GIF graphic-control delays (0/1 become 100ms)', () => {
    assert.equal(readGifLoopDurationMs(gifWithDelays([10, 20])), 300);
    assert.equal(readGifLoopDurationMs(gifWithDelays([0, 1])), 200);
    assert.equal(readGifLoopDurationMs(Uint8Array.from([0x00])), null);
  });

  it('sums WebP ANMF durations and sniffs mime from bytes', () => {
    const bytes = webpWithAnmf([40, 80]);
    assert.equal(readWebpLoopDurationMs(bytes), 120);
    assert.equal(sniffAnimatedImageMime(bytes), 'image/webp');
    assert.equal(sniffAnimatedImageMime(gifWithDelays([10])), 'image/gif');
    assert.equal(readWebpLoopDurationMs(webpWithAnmf([0])), 100);
  });
});
