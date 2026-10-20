import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_GALLERY_VIEW,
  GALLERY_PAGE_SIZE_ALL,
  clearComfyGallery,
  filterComfyGalleryEntries,
  formatGallerySlideshowInterval,
  galleryEntryMediaKinds,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryPlaybackIndex,
  galleryEntryRenderKey,
  isGalleryPageSize,
  isGallerySlideshowIntervalMs,
  isGallerySlideshowTransition,
  loadComfyGallery,
  loadGalleryViewPreferences,
  normalizeGallerySlideshowIntervalMs,
  paginateGalleryEntries,
  resolveGalleryPageSize,
  resolveGallerySlideshowTransition,
  resolveGallerySlideshowTransitionMs,
  saveComfyGallery,
  saveGalleryViewPreferences,
  sortGalleryEntries,
  uniqueGalleryModels,
  uniqueGalleryTools,
  uniqueGalleryUserTags,
  type ComfyGalleryEntry,
} from './comfyui-gallery';

function makeEntry(overrides: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id: 'entry-1',
    promptId: 'prompt-1',
    prompt: 'a cat in a garden',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: 1000,
    images: [{ filename: 'out.png', subfolder: '', type: 'output' }],
    ...overrides,
  };
}

describe('comfyui-gallery pure/self-contained helpers', () => {
  describe('galleryEntryRenderKey', () => {
    it('changes when a rendering-relevant field changes', () => {
      const base = makeEntry();
      const favorited = makeEntry({ favorite: true });
      assert.notEqual(galleryEntryRenderKey(base), galleryEntryRenderKey(favorited));
    });

    it('is stable for the same entry contents', () => {
      const a = makeEntry();
      const b = makeEntry();
      assert.equal(galleryEntryRenderKey(a), galleryEntryRenderKey(b));
    });

    it('includes progress fields only while queued/running', () => {
      const running = makeEntry({ status: 'running', queuePosition: 2, progressValue: 4 });
      const runningNoProgress = makeEntry({ status: 'running' });
      const completed = makeEntry({ status: 'completed', queuePosition: 2, progressValue: 4 });
      const completedNoProgress = makeEntry({ status: 'completed' });

      assert.notEqual(galleryEntryRenderKey(running), galleryEntryRenderKey(runningNoProgress));
      // Progress fields are irrelevant once completed — key ignores them.
      assert.equal(galleryEntryRenderKey(completed), galleryEntryRenderKey(completedNoProgress));
    });
  });

  describe('formatGallerySlideshowInterval', () => {
    it('formats sub-minute durations in seconds', () => {
      assert.equal(formatGallerySlideshowInterval(5000), '5s');
    });

    it('formats whole minutes without a seconds suffix', () => {
      assert.equal(formatGallerySlideshowInterval(120000), '2m');
    });

    it('formats minutes plus a remainder in seconds', () => {
      assert.equal(formatGallerySlideshowInterval(90000), '1m 30s');
    });
  });

  describe('normalizeGallerySlideshowIntervalMs', () => {
    it('passes an already-valid option through unchanged', () => {
      assert.equal(normalizeGallerySlideshowIntervalMs(10000), 10000);
    });

    it('snaps an arbitrary finite number to the nearest option', () => {
      assert.equal(normalizeGallerySlideshowIntervalMs(3700), 4000);
    });

    it('falls back to the default interval for non-numeric input', () => {
      assert.equal(normalizeGallerySlideshowIntervalMs('bogus'), DEFAULT_GALLERY_VIEW.slideshowIntervalMs);
      assert.equal(normalizeGallerySlideshowIntervalMs(undefined), DEFAULT_GALLERY_VIEW.slideshowIntervalMs);
    });
  });

  describe('slideshow transition helpers', () => {
    it('isGallerySlideshowTransition only accepts the known set', () => {
      assert.equal(isGallerySlideshowTransition('fade'), true);
      assert.equal(isGallerySlideshowTransition('bogus'), false);
    });

    it('resolveGallerySlideshowTransition falls back to the default on invalid input', () => {
      assert.equal(resolveGallerySlideshowTransition('zoom'), 'zoom');
      assert.equal(resolveGallerySlideshowTransition('bogus'), DEFAULT_GALLERY_VIEW.slideshowTransition);
    });

    it('resolveGallerySlideshowTransitionMs is 0 for "none" and the standard duration otherwise', () => {
      assert.equal(resolveGallerySlideshowTransitionMs('none'), 0);
      assert.equal(resolveGallerySlideshowTransitionMs('fade'), 520);
    });
  });

  describe('page-size helpers', () => {
    it('isGallerySlideshowIntervalMs / isGalleryPageSize validate against the known option sets', () => {
      assert.equal(isGallerySlideshowIntervalMs(5000), true);
      assert.equal(isGallerySlideshowIntervalMs(5001), false);
      assert.equal(isGalleryPageSize(24), true);
      assert.equal(isGalleryPageSize(GALLERY_PAGE_SIZE_ALL), true);
      assert.equal(isGalleryPageSize(13), false);
    });

    it('resolveGalleryPageSize expands "all" to the item count (min 1)', () => {
      assert.equal(resolveGalleryPageSize(GALLERY_PAGE_SIZE_ALL, 37), 37);
      assert.equal(resolveGalleryPageSize(GALLERY_PAGE_SIZE_ALL, 0), 1);
      assert.equal(resolveGalleryPageSize(24, 37), 24);
    });
  });

  describe('filterComfyGalleryEntries', () => {
    const entries: ComfyGalleryEntry[] = [
      makeEntry({ id: 'a', tool: 'refine', model: 'qwen-image-2512', favorite: true, reviewRating: 5 }),
      makeEntry({ id: 'b', tool: 'txt2img', model: 'flux-2-klein-9b', status: 'running' }),
      makeEntry({ id: 'c', tool: 'refine', model: 'qwen-image-2512', reviewRating: 2, userTags: ['keeper'] }),
    ];

    it('returns every entry when the filter is empty', () => {
      assert.deepEqual(filterComfyGalleryEntries(entries, {}).map(e => e.id), ['a', 'b', 'c']);
    });

    it('filters by favoritesOnly', () => {
      assert.deepEqual(filterComfyGalleryEntries(entries, { favoritesOnly: true }).map(e => e.id), ['a']);
    });

    it('filters by status, tool, and model', () => {
      assert.deepEqual(filterComfyGalleryEntries(entries, { status: 'running' }).map(e => e.id), ['b']);
      assert.deepEqual(filterComfyGalleryEntries(entries, { tool: 'refine' }).map(e => e.id), ['a', 'c']);
      assert.deepEqual(
        filterComfyGalleryEntries(entries, { model: 'flux-2-klein-9b' }).map(e => e.id),
        ['b']
      );
    });

    it('filters by minRating', () => {
      assert.deepEqual(filterComfyGalleryEntries(entries, { minRating: 4 }).map(e => e.id), ['a']);
    });

    it('atRiskOnly excludes favorites and rating>=4 keepers', () => {
      assert.deepEqual(filterComfyGalleryEntries(entries, { atRiskOnly: true }).map(e => e.id), ['b', 'c']);
    });

    it('unreviewedOnly excludes anything with a reviewRating set', () => {
      assert.deepEqual(filterComfyGalleryEntries(entries, { unreviewedOnly: true }).map(e => e.id), ['b']);
    });

    it('matches a free-text query against the prompt/tool/model haystack', () => {
      assert.deepEqual(
        filterComfyGalleryEntries(entries, { query: 'klein' }).map(e => e.id),
        ['b']
      );
    });

    it('matches an exact (case-insensitive) user tag', () => {
      assert.deepEqual(filterComfyGalleryEntries(entries, { userTag: 'KEEPER' }).map(e => e.id), ['c']);
    });
  });

  describe('paginateGalleryEntries', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);

    it('slices the requested page', () => {
      const result = paginateGalleryEntries(items, 2, 10);
      assert.deepEqual(result, { items: items.slice(10, 20), page: 2, totalPages: 3, totalItems: 25 });
    });

    it('clamps an out-of-range page to the last page', () => {
      const result = paginateGalleryEntries(items, 99, 10);
      assert.equal(result.page, 3);
      assert.deepEqual(result.items, items.slice(20, 25));
    });

    it('clamps a page below 1 up to 1', () => {
      const result = paginateGalleryEntries(items, 0, 10);
      assert.equal(result.page, 1);
    });
  });

  describe('sortGalleryEntries', () => {
    const a = makeEntry({ id: 'a', queuedAt: 100, tool: 'refine', favorite: false, reviewRating: 2 });
    const b = makeEntry({ id: 'b', queuedAt: 300, tool: '', favorite: true, reviewRating: 5 });
    const c = makeEntry({ id: 'c', queuedAt: 200, tool: 'alpha', favorite: false, reviewRating: undefined });
    const entries = [a, b, c];

    it('queued-desc (default) sorts newest first', () => {
      assert.deepEqual(sortGalleryEntries(entries).map(e => e.id), ['b', 'c', 'a']);
    });

    it('queued-asc sorts oldest first', () => {
      assert.deepEqual(sortGalleryEntries(entries, 'queued-asc').map(e => e.id), ['a', 'c', 'b']);
    });

    it('tool-asc sorts alphabetically with blanks last', () => {
      assert.deepEqual(sortGalleryEntries(entries, 'tool-asc').map(e => e.id), ['c', 'a', 'b']);
    });

    it('favorites-first puts favorites ahead, newest first within each group', () => {
      assert.deepEqual(sortGalleryEntries(entries, 'favorites-first').map(e => e.id), ['b', 'c', 'a']);
    });

    it('rating-desc sorts highest rating first', () => {
      assert.deepEqual(sortGalleryEntries(entries, 'rating-desc').map(e => e.id), ['b', 'a', 'c']);
    });

    it('eviction-risk-desc surfaces the least-protected entries first', () => {
      // keeper score = favorite*10 + rating: a=2, b=15, c=0 — lowest score (c) is highest risk.
      assert.deepEqual(sortGalleryEntries(entries, 'eviction-risk-desc').map(e => e.id), ['c', 'a', 'b']);
    });

    it('does not mutate the input array', () => {
      const copy = [...entries];
      sortGalleryEntries(entries, 'queued-asc');
      assert.deepEqual(entries, copy);
    });
  });

  describe('unique* helpers', () => {
    const entries: ComfyGalleryEntry[] = [
      makeEntry({ id: 'a', tool: 'refine', model: 'qwen-image-2512', userTags: ['keeper', ' Hero '] }),
      makeEntry({ id: 'b', tool: 'txt2img', model: 'qwen-image-2512', userTags: ['keeper'] }),
      makeEntry({ id: 'c', tool: undefined, model: undefined, userTags: [] }),
    ];

    it('uniqueGalleryTools / uniqueGalleryModels dedupe and sort, dropping blanks', () => {
      assert.deepEqual(uniqueGalleryTools(entries), ['refine', 'txt2img']);
      assert.deepEqual(uniqueGalleryModels(entries), ['qwen-image-2512']);
    });

    it('uniqueGalleryUserTags dedupes trimmed tags across entries', () => {
      assert.deepEqual(uniqueGalleryUserTags(entries), ['Hero', 'keeper']);
    });
  });

  describe('view/gallery storage in a window-less (SSR) environment', () => {
    it('loadGalleryViewPreferences returns the default view', () => {
      assert.deepEqual(loadGalleryViewPreferences(), DEFAULT_GALLERY_VIEW);
    });

    it('saveGalleryViewPreferences is a safe no-op', () => {
      assert.doesNotThrow(() => saveGalleryViewPreferences(DEFAULT_GALLERY_VIEW));
    });

    it('loadComfyGallery returns an empty array', () => {
      assert.deepEqual(loadComfyGallery(), []);
    });

    it('saveComfyGallery and clearComfyGallery are safe no-ops', () => {
      assert.doesNotThrow(() => saveComfyGallery([makeEntry()]));
      assert.doesNotThrow(() => clearComfyGallery());
    });
  });

  describe('media-kind helpers', () => {
    it('galleryEntryPrimaryPlaybackIndex is 0 when every output is a still image', () => {
      const entry = makeEntry({
        images: [
          { filename: 'a.png', subfolder: '', type: 'output' },
          { filename: 'b.png', subfolder: '', type: 'output' },
        ],
      });
      assert.equal(galleryEntryPrimaryPlaybackIndex(entry), 0);
      assert.deepEqual(galleryEntryMediaKinds(entry), ['image', 'image']);
      assert.equal(galleryEntryPrimaryMediaKind(entry), 'image');
    });

    it('galleryEntryPrimaryPlaybackIndex picks the first non-image output', () => {
      const entry = makeEntry({
        images: [
          { filename: 'a.png', subfolder: '', type: 'output' },
          { filename: 'b.mp4', subfolder: '', type: 'output' },
        ],
      });
      assert.equal(galleryEntryPrimaryPlaybackIndex(entry), 1);
      assert.deepEqual(galleryEntryMediaKinds(entry), ['image', 'video']);
      assert.equal(galleryEntryPrimaryMediaKind(entry), 'video');
    });
  });
});
