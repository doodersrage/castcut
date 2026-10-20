import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const readBrowserValue = mock.fn((_key: string): unknown => null);
const writeBrowserValue = mock.fn((_key: string, _value: unknown) => undefined);
mock.module('../storage/browser-storage', { namedExports: { readBrowserValue, writeBrowserValue } });

function installWindow(): void {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  readBrowserValue.mock.resetCalls();
  writeBrowserValue.mock.resetCalls();
  readBrowserValue.mock.mockImplementation(() => null);
});

describe('tool-plugin-registry', async () => {
  const { loadToolPlugins, saveCustomToolPlugins, BUILTIN_TOOL_PLUGINS, TOOL_PLUGIN_REGISTRY_KEY } =
    await import('./tool-plugin-registry');

  describe('loadToolPlugins', () => {
    it('returns only the built-ins without a window (SSR)', () => {
      const result = loadToolPlugins();
      assert.deepEqual(result, BUILTIN_TOOL_PLUGINS);
      assert.equal(readBrowserValue.mock.calls.length, 0);
    });

    it('returns only the built-ins when there is no stored custom list', () => {
      installWindow();
      readBrowserValue.mock.mockImplementation(() => null);
      const result = loadToolPlugins();
      assert.deepEqual(result, BUILTIN_TOOL_PLUGINS);
      assert.equal(readBrowserValue.mock.calls[0]!.arguments[0], TOOL_PLUGIN_REGISTRY_KEY);
    });

    it('appends enabled custom plugins after the built-ins', () => {
      installWindow();
      const custom = [
        {
          id: 'custom-1',
          label: 'Custom',
          description: 'desc',
          href: '/custom',
          category: 'plugin' as const,
        },
      ];
      readBrowserValue.mock.mockImplementation(() => custom);
      const result = loadToolPlugins();
      assert.deepEqual(result, [...BUILTIN_TOOL_PLUGINS, ...custom]);
    });

    it('filters out custom plugins explicitly disabled (enabled: false)', () => {
      installWindow();
      const custom = [
        {
          id: 'on',
          label: 'On',
          description: 'd',
          href: '/on',
          category: 'plugin' as const,
          enabled: true,
        },
        {
          id: 'off',
          label: 'Off',
          description: 'd',
          href: '/off',
          category: 'plugin' as const,
          enabled: false,
        },
      ];
      readBrowserValue.mock.mockImplementation(() => custom);
      const result = loadToolPlugins();
      assert.deepEqual(
        result.map(p => p.id),
        [...BUILTIN_TOOL_PLUGINS.map(p => p.id), 'on']
      );
    });

    it('falls back to built-ins when reading throws', () => {
      installWindow();
      readBrowserValue.mock.mockImplementation(() => {
        throw new Error('corrupt storage');
      });
      const result = loadToolPlugins();
      assert.deepEqual(result, BUILTIN_TOOL_PLUGINS);
    });
  });

  describe('saveCustomToolPlugins', () => {
    it('does nothing without a window (SSR)', () => {
      saveCustomToolPlugins([]);
      assert.equal(writeBrowserValue.mock.calls.length, 0);
    });

    it('writes the plugin list under the registry key, capped to 32 entries', () => {
      installWindow();
      const plugins = Array.from({ length: 40 }, (_, i) => ({
        id: `p${i}`,
        label: `P${i}`,
        description: 'd',
        href: `/p${i}`,
        category: 'plugin' as const,
      }));
      saveCustomToolPlugins(plugins);
      assert.equal(writeBrowserValue.mock.calls.length, 1);
      const [key, value] = writeBrowserValue.mock.calls[0]!.arguments as [string, unknown[]];
      assert.equal(key, TOOL_PLUGIN_REGISTRY_KEY);
      assert.equal(value.length, 32);
    });
  });
});
