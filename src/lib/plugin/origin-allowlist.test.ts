import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

type Store = Record<string, unknown>;
let store: Store = {};
const readBrowserValue = mock.fn(<T,>(key: string) => (key in store ? (store[key] as T) : undefined));
const writeBrowserValue = mock.fn((key: string, value: unknown) => {
  store[key] = value;
});
mock.module('../storage/browser-storage', { namedExports: { readBrowserValue, writeBrowserValue } });

describe('plugin-origin-allowlist', async () => {
  const {
    PLUGIN_ORIGIN_ALLOWLIST_KEY,
    normalizePluginOrigin,
    loadPluginOriginAllowlist,
    savePluginOriginAllowlist,
    isOriginInPluginAllowlist,
  } = await import('./origin-allowlist');

  describe('normalizePluginOrigin (no window)', () => {
    it('returns null for a blank value', () => {
      assert.equal(normalizePluginOrigin('   '), null);
    });

    it('returns null for a relative path when there is no window', () => {
      assert.equal(normalizePluginOrigin('/local-plugin'), null);
    });

    it('extracts the origin from a full URL, dropping path/query', () => {
      assert.equal(normalizePluginOrigin('https://example.com:8080/plugin?x=1'), 'https://example.com:8080');
    });

    it('returns null for an unparseable value', () => {
      assert.equal(normalizePluginOrigin('not a url'), null);
    });
  });

  describe('with a stubbed window', () => {
    beforeEach(() => {
      store = {};
      readBrowserValue.mock.resetCalls();
      writeBrowserValue.mock.resetCalls();
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { location: { origin: 'https://app.example.com' } },
      });
    });

    afterEach(() => {
      delete (globalThis as { window?: unknown }).window;
    });

    it('normalizePluginOrigin resolves a relative path to window.location.origin', () => {
      assert.equal(normalizePluginOrigin('/local-plugin'), 'https://app.example.com');
    });

    it('loadPluginOriginAllowlist returns [] when nothing is stored or the stored value is not an array', () => {
      assert.deepEqual(loadPluginOriginAllowlist(), []);
      store[PLUGIN_ORIGIN_ALLOWLIST_KEY] = 'not-an-array';
      assert.deepEqual(loadPluginOriginAllowlist(), []);
    });

    it('loadPluginOriginAllowlist normalizes, dedupes, drops invalid entries, and sorts', () => {
      store[PLUGIN_ORIGIN_ALLOWLIST_KEY] = [
        'https://z.example.com',
        'https://a.example.com/some/path',
        'https://a.example.com',
        123,
        'not a url',
      ];
      assert.deepEqual(loadPluginOriginAllowlist(), ['https://a.example.com', 'https://z.example.com']);
    });

    it('savePluginOriginAllowlist normalizes, dedupes, sorts, and persists via writeBrowserValue', () => {
      const result = savePluginOriginAllowlist([
        'https://b.example.com',
        'https://a.example.com',
        'https://a.example.com/x',
        'garbage',
      ]);
      assert.deepEqual(result, ['https://a.example.com', 'https://b.example.com']);
      assert.equal(writeBrowserValue.mock.calls.length, 1);
      assert.deepEqual(writeBrowserValue.mock.calls[0]!.arguments, [
        PLUGIN_ORIGIN_ALLOWLIST_KEY,
        ['https://a.example.com', 'https://b.example.com'],
      ]);
    });

    it('isOriginInPluginAllowlist checks membership using the default loaded allowlist', () => {
      store[PLUGIN_ORIGIN_ALLOWLIST_KEY] = ['https://a.example.com'];
      assert.equal(isOriginInPluginAllowlist('https://a.example.com/whatever'), true);
      assert.equal(isOriginInPluginAllowlist('https://b.example.com'), false);
    });

    it('isOriginInPluginAllowlist returns false for an unparseable origin', () => {
      assert.equal(isOriginInPluginAllowlist('not a url', ['https://a.example.com']), false);
    });

    it('isOriginInPluginAllowlist accepts an explicit allowlist override', () => {
      assert.equal(isOriginInPluginAllowlist('https://c.example.com', ['https://c.example.com']), true);
    });
  });
});
