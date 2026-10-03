import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import sharp from 'sharp';
import {
  compositeRgbaOnFill as realCompositeRgbaOnFill,
  cutoutLooksIsolated as realCutoutLooksIsolated,
} from './isolate-subject';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

// cutoutLooksIsolated is reached via a static top-level import in
// isolate-subject-server.ts, so it CAN be mocked with mock.module — but
// doing that would also affect the "real end-to-end" tests below, since
// node:test caches a module the first time any dynamic `await import()`
// resolves it, and a later mock.module() call can't retroactively change
// an already-loaded module's bindings. So instead of replacing the export
// outright, this wraps the REAL implementation (imported for real, above,
// before mock.module ever runs) and only forces a failure when
// `forceCutoutFailure` is flipped on for one test.
// null = call the real implementation; true/false = force a result.
// A forced override is used for BOTH directions rather than relying only
// on the real MODNet output, because a trivial synthetic (solid-color)
// test image has no real foreground/background separation — verified by
// running the "success" test against the real implementation first: the
// actual model legitimately reported it as not-isolated (a correct result
// for a flat color swatch, not a bug), which would make the success-path
// test flaky/content-dependent. Forcing the result keeps the test focused
// on isolateSubjectOnWhiteBuffer's own plumbing (segmenter -> composite ->
// sharp encode) rather than on what the real model decides for made-up
// pixels.
let cutoutOverride: boolean | null = null;
const cutoutLooksIsolated = mock.fn((data: Uint8ClampedArray) =>
  cutoutOverride === null ? realCutoutLooksIsolated(data) : cutoutOverride
);
mock.module('./isolate-subject', {
  namedExports: { cutoutLooksIsolated, compositeRgbaOnFill: realCompositeRgbaOnFill },
});

afterEach(() => {
  cutoutOverride = null;
});

// isolateSubjectOnWhiteBuffer's model loading goes through a call-time
// `await import('@huggingface/transformers')` inside a module-private
// getSegmenter() helper — per the established mock.module() limitation,
// dynamic imports reached at call time cannot be intercepted, so the real
// @huggingface/transformers pipeline always runs for every test here. This
// is safe and deterministic in THIS environment because the `Xenova/modnet`
// weights are already present in the package's local .cache/ directory
// (verified via a throwaway probe before writing this file, which resolved
// in well under a second with no network round trip observed). If that
// cache is ever absent, these tests would need network access to
// huggingface.co and would be slower/flakier — there is no way to avoid
// that given the unmockable dynamic import.
async function makeSolidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 140, b: 220 } },
  })
    .png()
    .toBuffer();
}

// MODNet only: never reach for a real ComfyUI from unit tests.
const LOCAL = { matte: 'local' } as const;

describe('isolate-subject-server', async () => {
  const { isolateSubjectOnWhiteBuffer, isolateSubjectOnFillDetailed } = await import(
    './isolate-subject-server'
  );

  it('keeps a photo that already sits on white as it is (no second matte)', async () => {
    const width = 24;
    const height = 24;
    const pixels = Buffer.alloc(width * height * 3, 255);
    for (let y = 4; y < height; y++) {
      for (let x = 8; x < 16; x++) {
        const o = (y * width + x) * 3;
        pixels[o] = 30;
        pixels[o + 1] = 20;
        pixels[o + 2] = 10;
      }
    }
    const bytes = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'image/png' });
    const result = await isolateSubjectOnFillDetailed(blob, { r: 255, g: 255, b: 255 }, LOCAL);
    assert.equal(result.matte, 'already-on-fill');
    const out = await sharp(result.png).removeAlpha().raw().toBuffer();
    assert.deepEqual([...out], [...pixels]);
  });

  it('returns a decodable PNG buffer when the (forced-isolated) cutout succeeds', async () => {
    cutoutOverride = true;
    const bytes = await makeSolidPng(8, 8);
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'image/png' });
    const result = await isolateSubjectOnWhiteBuffer(blob, LOCAL);
    assert.ok(Buffer.isBuffer(result));
    const meta = await sharp(result).metadata();
    assert.equal(meta.format, 'png');
    assert.ok((meta.width ?? 0) > 0);
    assert.ok((meta.height ?? 0) > 0);
  });

  it('rejects when the input blob is not a decodable image', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await assert.rejects(() => isolateSubjectOnWhiteBuffer(blob, LOCAL));
  });

  it('throws a clear error when cutoutLooksIsolated reports the background was not removed', async () => {
    cutoutOverride = false;
    const bytes = await makeSolidPng(8, 8);
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'image/png' });
    await assert.rejects(
      () => isolateSubjectOnWhiteBuffer(blob, LOCAL),
      /Could not cut the subject out of that photo\./
    );
  });
});
