import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

let stored: unknown = null;
const readBrowserValue = mock.fn(<T>(): T | null => stored as T | null);
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  stored = value;
});
mock.module('../storage/browser-storage', { namedExports: { readBrowserValue, writeBrowserValue } });

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
});
afterEach(() => {
  stored = null;
  delete (globalThis as { window?: unknown }).window;
});

describe('nav-expanded-groups', async () => {
  const { loadExpandedNavGroups, saveExpandedNavGroups, toggleExpandedNavGroup } = await import(
    './nav-expanded-groups'
  );

  describe('loadExpandedNavGroups', () => {
    it('returns null when window is undefined (SSR guard)', () => {
      delete (globalThis as { window?: unknown }).window;
      assert.equal(loadExpandedNavGroups(), null);
    });

    it('returns null when nothing is stored', () => {
      stored = null;
      assert.equal(loadExpandedNavGroups(), null);
    });

    it('returns null when the stored value is not an array', () => {
      stored = { not: 'an array' };
      assert.equal(loadExpandedNavGroups(), null);
    });

    it('filters out non-string and blank entries', () => {
      stored = ['a', '', '  ', 42, null, 'b'];
      assert.deepEqual(loadExpandedNavGroups(), ['a', 'b']);
    });
  });

  describe('saveExpandedNavGroups', () => {
    it('is a no-op when window is undefined (SSR guard)', () => {
      delete (globalThis as { window?: unknown }).window;
      saveExpandedNavGroups(['a']);
      assert.equal(writeBrowserValue.mock.calls.length, 0);
    });

    it('trims, dedupes, and drops blank entries', () => {
      saveExpandedNavGroups([' a ', 'a', 'b', '', '  ']);
      assert.deepEqual(loadExpandedNavGroups(), ['a', 'b']);
    });
  });

  describe('toggleExpandedNavGroup', () => {
    it('adds a group not currently in the list, and persists it', () => {
      const next = toggleExpandedNavGroup('c', ['a', 'b']);
      assert.deepEqual(next, ['a', 'b', 'c']);
      assert.deepEqual(loadExpandedNavGroups(), ['a', 'b', 'c']);
    });

    it('removes a group already in the list, and persists it', () => {
      const next = toggleExpandedNavGroup('b', ['a', 'b', 'c']);
      assert.deepEqual(next, ['a', 'c']);
      assert.deepEqual(loadExpandedNavGroups(), ['a', 'c']);
    });
  });
});
