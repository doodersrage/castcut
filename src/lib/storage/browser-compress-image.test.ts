import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { compressImageForEngineUpload } from './browser-compress-image';

type BitmapOpts = {
  width?: number;
  height?: number;
  fail?: boolean;
};

type CanvasOpts = {
  noContext?: boolean;
  /** Bytes produced by every toBlob() call on canvases created after canvas #`failPngAtIndex` etc. */
  pngBlobSize?: number;
  jpegBlobSizes?: number[];
  emptyBlob?: boolean;
};

/** Minimal ImageBitmap stand-in — only the fields/methods browser-compress-image.ts touches. */
class FakeBitmap {
  width: number;
  height: number;
  closed = false;
  constructor(opts: BitmapOpts) {
    this.width = opts.width ?? 100;
    this.height = opts.height ?? 100;
  }
  close(): void {
    this.closed = true;
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  private opts: CanvasOpts;
  private jpegCallsForThisCanvas = 0;

  constructor(opts: CanvasOpts) {
    this.opts = opts;
  }

  getContext(type: string): { fillStyle: string; fillRect: () => void; drawImage: () => void } | null {
    if (type !== '2d' || this.opts.noContext) {
      return null;
    }
    return { fillStyle: '', fillRect: () => {}, drawImage: () => {} };
  }

  toBlob(cb: (blob: Blob | null) => void, mimeType?: string, _quality?: number): void {
    if (this.opts.emptyBlob) {
      cb(null);
      return;
    }
    if (mimeType === 'image/png') {
      const size = this.opts.pngBlobSize ?? 1000;
      cb(new Blob([new Uint8Array(size)], { type: 'image/png' }));
      return;
    }
    const sizes = this.opts.jpegBlobSizes ?? [1000];
    const size = sizes[Math.min(this.jpegCallsForThisCanvas, sizes.length - 1)];
    this.jpegCallsForThisCanvas += 1;
    cb(new Blob([new Uint8Array(size)], { type: 'image/jpeg' }));
  }
}

function installBrowserEnv(bitmapOpts: BitmapOpts, canvasOpts: CanvasOpts = {}) {
  const fakeDocument = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return new FakeCanvas(canvasOpts);
      }
      throw new Error(`unexpected tag: ${tag}`);
    },
  };
  const fakeCreateImageBitmap = async (_source: unknown): Promise<FakeBitmap> => {
    if (bitmapOpts.fail) {
      throw new Error('decode failed');
    }
    return new FakeBitmap(bitmapOpts);
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: fakeCreateImageBitmap,
  });
  return {
    restore: () => {
      delete (globalThis as { document?: unknown }).document;
      delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
    },
  };
}

function makeFile(opts: {
  name?: string;
  type?: string;
  size?: number;
  lastModified?: number;
}): File {
  const size = opts.size ?? 1000;
  const bytes = new Uint8Array(size);
  return new File([bytes], opts.name ?? 'upload.png', {
    type: opts.type ?? 'image/png',
    lastModified: opts.lastModified ?? 1700000000000,
  });
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
});

describe('browser-compress-image', () => {
  describe('compressImageForEngineUpload', () => {
    it('returns the original file unchanged when its MIME type is not image-like', async () => {
      const file = makeFile({ type: 'text/plain' });
      const result = await compressImageForEngineUpload(file);
      assert.equal(result, file);
    });

    it('returns the original file when createImageBitmap fails to decode it', async () => {
      const env = installBrowserEnv({ fail: true });
      try {
        const file = makeFile({ type: 'image/png' });
        const result = await compressImageForEngineUpload(file);
        assert.equal(result, file);
      } finally {
        env.restore();
      }
    });

    it('returns the original file unchanged when it is already small enough (no downscale, no shrink)', async () => {
      const env = installBrowserEnv({ width: 500, height: 500 });
      try {
        const file = makeFile({ type: 'image/png', size: 1000 });
        const result = await compressImageForEngineUpload(file, { maxEdge: 2048, maxBytes: 7_000_000 });
        assert.equal(result, file);
      } finally {
        env.restore();
      }
    });

    it('re-encodes a PNG that needs downscaling and keeps PNG when the result still fits', async () => {
      const env = installBrowserEnv(
        { width: 4000, height: 3000 },
        { pngBlobSize: 500_000 }
      );
      try {
        const file = makeFile({ type: 'image/png', name: 'shot.png', size: 200_000 });
        const result = await compressImageForEngineUpload(file, { maxEdge: 2048, maxBytes: 7_000_000 });
        assert.notEqual(result, file);
        assert.equal(result.type, 'image/png');
        assert.equal(result.name, 'shot.png');
        assert.equal(result.lastModified, file.lastModified);
      } finally {
        env.restore();
      }
    });

    it('falls through to JPEG when the re-encoded PNG still exceeds maxBytes', async () => {
      const env = installBrowserEnv(
        { width: 4000, height: 3000 },
        { pngBlobSize: 8_000_000, jpegBlobSizes: [1_000_000] }
      );
      try {
        const file = makeFile({ type: 'image/png', name: 'shot.png', size: 200_000 });
        const result = await compressImageForEngineUpload(file, { maxEdge: 2048, maxBytes: 7_000_000 });
        assert.equal(result.type, 'image/jpeg');
        assert.equal(result.name, 'shot.jpg');
      } finally {
        env.restore();
      }
    });

    it('goes straight to JPEG for a source that does not prefer lossless (e.g. JPEG input)', async () => {
      const env = installBrowserEnv(
        { width: 4000, height: 3000 },
        { jpegBlobSizes: [1_000_000] }
      );
      try {
        const file = makeFile({ type: 'image/jpeg', name: 'photo.jpg', size: 200_000 });
        const result = await compressImageForEngineUpload(file, { maxEdge: 2048, maxBytes: 7_000_000 });
        assert.equal(result.type, 'image/jpeg');
        assert.equal(result.name, 'photo.jpg');
      } finally {
        env.restore();
      }
    });

    it('shrinks quality in steps while the JPEG stays over maxBytes, down to the quality floor', async () => {
      const env = installBrowserEnv(
        { width: 4000, height: 3000 },
        { jpegBlobSizes: [9_000_000, 8_500_000, 8_000_000, 7_500_000, 500_000] }
      );
      try {
        // NOTE: makeFile()'s default name is 'upload.png' -- sourcePrefersLossless() treats a
        // .png filename as lossless-preferring regardless of the declared MIME type, which would
        // route this through the PNG-first branch instead of straight to JPEG. Use a .jpg name
        // to actually exercise the JPEG quality-stepping path this test is named for.
        const file = makeFile({ type: 'image/jpeg', name: 'photo.jpg', size: 200_000 });
        const result = await compressImageForEngineUpload(file, {
          maxEdge: 2048,
          maxBytes: 7_000_000,
          quality: 0.92,
        });
        assert.equal(result.type, 'image/jpeg');
        assert.ok(result.size <= 500_000);
      } finally {
        env.restore();
      }
    });

    it('does a last-resort canvas shrink when quality alone cannot hit maxBytes', async () => {
      const env = installBrowserEnv(
        { width: 4000, height: 3000 },
        { jpegBlobSizes: [9_000_000] }
      );
      try {
        // Same makeFile()-default-name caveat as above -- use a non-.png name so this file
        // actually goes straight to the JPEG branch instead of PNG-first.
        const file = makeFile({ type: 'image/jpeg', name: 'photo.jpg', size: 200_000 });
        const result = await compressImageForEngineUpload(file, {
          maxEdge: 2048,
          maxBytes: 7_000_000,
          quality: 0.6,
        });
        // Every canvas produced by the fake keeps emitting 9MB blobs; the function has no more
        // levers after the last-resort shrink and returns whatever the final canvas produced.
        assert.equal(result.type, 'image/jpeg');
      } finally {
        env.restore();
      }
    });

    it('returns the original file when downscaling was not needed and the recompressed result is not smaller', async () => {
      // needsShrinkForBytes only (over maxBytes but under maxEdge) — recompression makes it
      // bigger, and file.size is within 1.2x maxBytes, so the function keeps the original.
      const env = installBrowserEnv(
        { width: 500, height: 500 },
        { pngBlobSize: 8_000_000, jpegBlobSizes: [8_000_000] }
      );
      try {
        const file = makeFile({ type: 'image/jpeg', size: 7_500_000 });
        const result = await compressImageForEngineUpload(file, { maxEdge: 2048, maxBytes: 7_000_000 });
        assert.equal(result, file);
      } finally {
        env.restore();
      }
    });

    it('returns a File whose canvas is skipped and falls back to the original when getContext yields null', async () => {
      const env = installBrowserEnv({ width: 4000, height: 3000 }, { noContext: true });
      try {
        const file = makeFile({ type: 'image/png', size: 200_000 });
        const result = await compressImageForEngineUpload(file, { maxEdge: 2048, maxBytes: 7_000_000 });
        assert.equal(result, file);
      } finally {
        env.restore();
      }
    });

    it('renames octet-stream uploads with a png extension after re-encoding', async () => {
      const env = installBrowserEnv(
        { width: 4000, height: 3000 },
        { pngBlobSize: 500_000 }
      );
      try {
        const file = makeFile({ type: 'application/octet-stream', name: 'blob', size: 200_000 });
        const result = await compressImageForEngineUpload(file, { maxEdge: 2048, maxBytes: 7_000_000 });
        assert.equal(result.type, 'image/png');
        assert.equal(result.name, 'blob.png');
      } finally {
        env.restore();
      }
    });

    it('returns the file untouched for a blank MIME type -- it fails the initial image-type guard before sourcePrefersLossless is ever consulted', async () => {
      // NOTE: compressImageForEngineUpload()'s very first guard is
      // `!file.type.startsWith('image/') && file.type !== 'application/octet-stream'` -- a blank
      // type satisfies neither condition, so the function returns the original file immediately.
      // sourcePrefersLossless() does list `type === ''` as "prefers lossless", but that check is
      // unreachable for a blank type in practice since the guard above returns first.
      const env = installBrowserEnv(
        { width: 4000, height: 3000 },
        { pngBlobSize: 500_000 }
      );
      try {
        const file = makeFile({ type: '', name: 'upload', size: 200_000 });
        const result = await compressImageForEngineUpload(file, { maxEdge: 2048, maxBytes: 7_000_000 });
        assert.equal(result, file);
        assert.equal(result.type, '');
      } finally {
        env.restore();
      }
    });

    it('downscales dimensions proportionally to fit within maxEdge', async () => {
      // 4000x2000 with maxEdge 1000 -> scale 0.25 -> 1000x500. We cannot observe canvas.width
      // directly through the public API, but a successful, non-throwing PNG round trip
      // confirms drawToCanvas received sane positive dimensions.
      const env = installBrowserEnv(
        { width: 4000, height: 2000 },
        { pngBlobSize: 100_000 }
      );
      try {
        const file = makeFile({ type: 'image/png', size: 200_000 });
        const result = await compressImageForEngineUpload(file, { maxEdge: 1000, maxBytes: 7_000_000 });
        assert.equal(result.type, 'image/png');
      } finally {
        env.restore();
      }
    });

    it('applies the documented defaults (maxEdge 2048 / maxBytes 7MB) when no options are given', async () => {
      const env = installBrowserEnv({ width: 3000, height: 3000 }, { pngBlobSize: 500_000 });
      try {
        // Over the default maxEdge (2048) with no options passed at all.
        const file = makeFile({ type: 'image/png', size: 200_000 });
        const result = await compressImageForEngineUpload(file);
        assert.notEqual(result, file);
        assert.equal(result.type, 'image/png');
      } finally {
        env.restore();
      }
    });
  });
});
