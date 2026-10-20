import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prefetchGalleryImageUrl, prefetchGalleryImageUrls } from './image-prefetch';

function withStubbedBrowserGlobals(constructedSrcs: string[], run: () => void): void {
  const originalWindow = globalThis.window;
  const originalImage = globalThis.Image;

  class FakeImage {
    decoding = '';
    set src(value: string) {
      constructedSrcs.push(value);
    }
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    value: FakeImage,
  });

  try {
    run();
  } finally {
    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
    if (originalImage === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.Image;
    } else {
      Object.defineProperty(globalThis, 'Image', { configurable: true, value: originalImage });
    }
  }
}

describe('gallery-image-prefetch', () => {
  it('dedupes repeated URLs and evicts only the oldest entry once the cache is full', () => {
    const constructedSrcs: string[] = [];
    withStubbedBrowserGlobals(constructedSrcs, () => {
      // Fill the cache to its cap (500) with distinct URLs.
      for (let i = 0; i < 500; i += 1) {
        prefetchGalleryImageUrl(`https://example.test/cap-img-${i}.png`);
      }
      assert.equal(constructedSrcs.length, 500);

      // Still within the cap -- re-prefetching the very first URL must be a
      // no-op (deduped, no new Image() constructed).
      prefetchGalleryImageUrl('https://example.test/cap-img-0.png');
      assert.equal(constructedSrcs.length, 500);

      // One more distinct URL pushes past the cap. This must evict a single
      // oldest entry rather than letting the cache grow unbounded.
      prefetchGalleryImageUrl('https://example.test/cap-img-500.png');
      assert.equal(constructedSrcs.length, 501);

      // The evicted URL ("cap-img-0") should trigger a fresh Image() load
      // when requested again, instead of being deduped forever.
      prefetchGalleryImageUrl('https://example.test/cap-img-0.png');
      assert.equal(constructedSrcs.length, 502);

      // A URL that's still within the cache window must still dedupe.
      prefetchGalleryImageUrl('https://example.test/cap-img-250.png');
      assert.equal(constructedSrcs.length, 502);
    });
  });

  it('ignores null/undefined/blank URLs', () => {
    const constructedSrcs: string[] = [];
    withStubbedBrowserGlobals(constructedSrcs, () => {
      prefetchGalleryImageUrl(null);
      prefetchGalleryImageUrl(undefined);
      prefetchGalleryImageUrl('   ');
      assert.equal(constructedSrcs.length, 0);
    });
  });

  it('prefetchGalleryImageUrls dedupes within a single batch', () => {
    const constructedSrcs: string[] = [];
    withStubbedBrowserGlobals(constructedSrcs, () => {
      prefetchGalleryImageUrls([
        'https://example.test/batch-a.png',
        'https://example.test/batch-b.png',
        'https://example.test/batch-a.png',
      ]);
      assert.deepEqual(constructedSrcs, [
        'https://example.test/batch-a.png',
        'https://example.test/batch-b.png',
      ]);
    });
  });

  it('is a no-op outside a browser environment (no window)', () => {
    const originalWindow = globalThis.window;
    if (originalWindow !== undefined) {
      // @ts-expect-error test setup
      delete globalThis.window;
    }
    try {
      // Should not throw even though `Image` is unavailable in this environment.
      prefetchGalleryImageUrl('https://example.test/no-window.png');
    } finally {
      if (originalWindow !== undefined) {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: originalWindow,
        });
      }
    }
  });
});
