import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { prefetchGalleryPage } from './warmup';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('gallery-warmup', () => {
  describe('prefetchGalleryPage', () => {
    it('is a complete no-op when window is undefined (SSR guard)', () => {
      // The "window defined" branch fires three real, unmockable call-time
      // dynamic imports (`@/components/GalleryTool`,
      // `@/components/ComfyUiGalleryPanel`, and `@/lib/gallery/db-store`'s
      // warmGalleryStore chain). node:test's mock.module() only intercepts
      // specifiers reached via a static top-level `import`, never a
      // call-time `import(...)` expression — confirmed here via a throwaway
      // probe that tried to mock all three specifiers and still hit the
      // REAL gallery-db-store module, which crashed on
      // `window.localStorage.getItem` because the probe's minimal window
      // stub had no `localStorage`. Safely exercising the "window defined"
      // branch would require a full DOM + localStorage environment for
      // heavy UI component modules, which isn't worth the fragility for
      // this 17-line prefetch helper. So only the SSR guard — the one
      // branch reachable with zero dynamic imports — is covered here.
      assert.equal(typeof window, 'undefined');
      assert.doesNotThrow(() => {
        prefetchGalleryPage();
      });
    });

    it('does not throw when called multiple times with no window', () => {
      prefetchGalleryPage();
      prefetchGalleryPage();
      prefetchGalleryPage();
    });
  });
});
