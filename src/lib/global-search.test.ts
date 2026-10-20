import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { ComfyGalleryEntry } from './gallery/comfyui-gallery';
import type { ScenePreset } from './scene-presets';
import type { NsfwGeneratorPreset } from './nsfw-generator-presets';
import type { GlobalSearchResult } from './global-search';

let historyEntries: PromptHistoryEntry[] = [];
const loadPromptHistoryStore = mock.fn(() => historyEntries);
mock.module('./prompt-history', { namedExports: { loadPromptHistoryStore } });

let galleryEntries: ComfyGalleryEntry[] = [];
const loadComfyGallery = mock.fn(() => galleryEntries);
mock.module('./gallery/comfyui-gallery', { namedExports: { loadComfyGallery } });

let scenePresets: ScenePreset[] = [];
const loadScenePresets = mock.fn(() => scenePresets);
mock.module('./scene-presets', { namedExports: { loadScenePresets } });

let userNsfwPresets: NsfwGeneratorPreset[] = [];
const loadUserNsfwGeneratorPresets = mock.fn(() => userNsfwPresets);
mock.module('./user-nsfw-generator-presets', {
  namedExports: { loadUserNsfwGeneratorPresets },
});

let builtinNsfwPresets: NsfwGeneratorPreset[] = [];
const mergeNsfwPresetCatalog = mock.fn((user: NsfwGeneratorPreset[]) => [
  ...user,
  ...builtinNsfwPresets,
]);
mock.module('./nsfw-generator-presets', { namedExports: { mergeNsfwPresetCatalog } });

let pluginResults: GlobalSearchResult[] = [];
const searchPluginPresetCache = mock.fn((_q: string, _limit?: number) => pluginResults);
mock.module('./plugin-preset-catalog', { namedExports: { searchPluginPresetCache } });

afterEach(() => {
  historyEntries = [];
  galleryEntries = [];
  scenePresets = [];
  userNsfwPresets = [];
  builtinNsfwPresets = [];
  pluginResults = [];
  loadPromptHistoryStore.mock.resetCalls();
  loadComfyGallery.mock.resetCalls();
  loadScenePresets.mock.resetCalls();
  loadUserNsfwGeneratorPresets.mock.resetCalls();
  mergeNsfwPresetCatalog.mock.resetCalls();
  searchPluginPresetCache.mock.resetCalls();
});

describe('global-search', async () => {
  const { searchGlobal } = await import('./global-search');

  function historyEntry(overrides: Partial<PromptHistoryEntry> & { id: string }): PromptHistoryEntry {
    return { tool: 'generate', prompt: 'a prompt', model: 'flux', timestamp: 0, ...overrides };
  }

  function galleryEntry(overrides: Partial<ComfyGalleryEntry> & { id: string }): ComfyGalleryEntry {
    return { prompt: 'a prompt', status: 'completed', ...overrides } as unknown as ComfyGalleryEntry;
  }

  describe('query length guard', () => {
    it('returns [] for an empty query', () => {
      assert.deepEqual(searchGlobal(''), []);
    });

    it('returns [] for a single-character query', () => {
      assert.deepEqual(searchGlobal('a'), []);
    });

    it('trims whitespace before checking length', () => {
      assert.deepEqual(searchGlobal('  a  '), []);
    });
  });

  describe('history results', () => {
    it('matches on prompt, hints, or tool and builds a history result', () => {
      historyEntries = [
        historyEntry({ id: 'h1', prompt: 'a red sports car', tool: 'generate', model: 'flux' }),
      ];
      const results = searchGlobal('sports car');
      assert.equal(results.length, 1);
      assert.deepEqual(results[0], {
        id: 'history-h1',
        label: 'a red sports car',
        subtitle: 'generate · flux',
        href: '/studio?history=h1',
        group: 'History',
        score: 50,
      });
    });

    it('matches via hints even when the prompt does not match', () => {
      historyEntries = [
        historyEntry({ id: 'h1', prompt: 'unrelated', hints: 'special hint text' }),
      ];
      const results = searchGlobal('hint text');
      assert.equal(results.length, 1);
    });

    it('only scans the first 80 history entries', () => {
      historyEntries = Array.from({ length: 100 }, (_, i) =>
        historyEntry({ id: `h${i}`, prompt: i === 90 ? 'findme' : 'other' })
      );
      assert.deepEqual(searchGlobal('findme'), []);
    });
  });

  describe('gallery results', () => {
    it('matches on prompt only', () => {
      galleryEntries = [galleryEntry({ id: 'g1', prompt: 'a mountain landscape', model: 'flux' })];
      const results = searchGlobal('mountain');
      assert.equal(results.length, 1);
      assert.deepEqual(results[0], {
        id: 'gallery-g1',
        label: 'a mountain landscape',
        subtitle: 'flux',
        href: '/gallery',
        group: 'Gallery',
        score: 50,
      });
    });

    it('falls back to "gallery" as subtitle when model is missing', () => {
      galleryEntries = [galleryEntry({ id: 'g1', prompt: 'a mountain landscape', model: undefined })];
      const results = searchGlobal('mountain');
      assert.equal(results[0]?.subtitle, 'gallery');
    });
  });

  describe('scene preset results', () => {
    it('matches on name or hints and builds a preset result', () => {
      scenePresets = [
        { id: 'p1', name: 'Sunset Beach', createdAt: 0, hints: 'golden hour lighting' },
      ];
      const results = searchGlobal('sunset');
      assert.equal(results.length, 1);
      assert.deepEqual(results[0], {
        id: 'preset-p1',
        label: 'Sunset Beach',
        subtitle: 'golden hour lighting',
        href: '/?scene=p1',
        group: 'Presets',
        score: 80,
      });
    });
  });

  describe('nsfw preset results', () => {
    it('merges user presets into the builtin catalog and matches on label/hints/category/mood', () => {
      builtinNsfwPresets = [
        { id: 'b1', label: 'Builtin Preset', hints: 'builtin hints', category: 'mood' },
      ];
      userNsfwPresets = [
        { id: 'u1', label: 'User Preset', hints: 'special mood board', category: 'mood', mood: 'moody' },
      ];
      const results = searchGlobal('moody');
      assert.equal(results.length, 1);
      assert.equal(results[0]?.id, 'nsfw-preset-u1');
      assert.equal(results[0]?.group, 'Adult presets');
      assert.equal(results[0]?.href, '/plugins/nsfw-generator?nsfwPresetId=u1');
    });
  });

  describe('plugin preset results', () => {
    it('includes results from searchPluginPresetCache verbatim', () => {
      pluginResults = [
        {
          id: 'plugin-1',
          label: 'Plugin result',
          subtitle: 'from a plugin',
          href: '/plugins/x',
          group: 'Presets',
          score: 90,
        },
      ];
      const results = searchGlobal('anything');
      assert.deepEqual(results, pluginResults);
      assert.equal(searchPluginPresetCache.mock.calls.length, 1);
      assert.deepEqual(searchPluginPresetCache.mock.calls[0]!.arguments, ['anything', 12]);
    });
  });

  describe('ranking and limit', () => {
    it('sorts combined results by descending score', () => {
      historyEntries = [historyEntry({ id: 'h1', prompt: 'a cat photo', tool: 'x', model: 'x' })]; // includes -> 50
      galleryEntries = [galleryEntry({ id: 'g1', prompt: 'a cat photo' })]; // includes -> 50
      scenePresets = [{ id: 'p1', name: 'cat', createdAt: 0 }]; // exact -> 100
      const results = searchGlobal('cat');
      assert.equal(results[0]?.id, 'preset-p1');
      assert.equal(results[0]?.score, 100);
      assert.ok(results.slice(1).every(r => r.score <= 50));
    });

    it('respects the limit parameter (default 12)', () => {
      historyEntries = Array.from({ length: 20 }, (_, i) =>
        historyEntry({ id: `h${i}`, prompt: `matching prompt ${i}` })
      );
      assert.equal(searchGlobal('matching').length, 12);
      assert.equal(searchGlobal('matching', 3).length, 3);
    });
  });
});
