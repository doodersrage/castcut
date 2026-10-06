import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readImageSize } from './image-size';

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number, exifBytes = 0): Uint8Array {
  const exif = exifBytes > 0 ? [0xff, 0xe1, (exifBytes + 2) >> 8, (exifBytes + 2) & 0xff, ...new Array(exifBytes).fill(0)] : [];
  const sof = [0xff, 0xc0, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array(14).fill(0), ...exif, ...sof, ...new Array(8).fill(0)]);
}

describe('readImageSize', () => {
  it('reads a PNG IHDR', () => {
    assert.deepEqual(readImageSize(png(1408, 1408)), { width: 1408, height: 1408 });
    assert.deepEqual(readImageSize(png(1104, 1472)), { width: 1104, height: 1472 });
  });

  it('reads a JPEG frame header, past an APP1 block', () => {
    assert.deepEqual(readImageSize(jpeg(1024, 768)), { width: 1024, height: 768 });
    assert.deepEqual(readImageSize(jpeg(640, 480, 300)), { width: 640, height: 480 });
  });

  it('reads GIF and WebP headers', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02]);
    assert.deepEqual(readImageSize(gif), { width: 800, height: 600 });
    const webp = new Uint8Array(30);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    // VP8X: width − 1 and height − 1 as 24-bit little-endian at 24 / 27.
    webp.set([0xff, 0x03, 0x00, 0xff, 0x01, 0x00], 24);
    assert.deepEqual(readImageSize(webp), { width: 1024, height: 512 });
  });

  it('answers null for unknown or truncated bytes', () => {
    assert.equal(readImageSize(new Uint8Array([1, 2, 3])), null);
    assert.equal(readImageSize(png(10, 10).slice(0, 20)), null);
    assert.equal(readImageSize(jpeg(10, 10).slice(0, 6)), null);
  });
});
