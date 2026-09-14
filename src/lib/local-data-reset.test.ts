import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { DEFAULT_SHARED_SETTINGS as REAL_DEFAULT_SHARED_SETTINGS } from './settings-cache';

const saveLocationBlocklist = mock.fn((_: string[]) => {});
mock.module('@/lib/prompt-history', {
  namedExports: {
    saveLocationBlocklist,
    PROMPT_HISTORY_KEY: 'comfy-prompt-tool-history-v1',
    LOCATION_BLOCKLIST_KEY: 'comfy-prompt-location-blocklist-v1',
  },
});

const saveSettingsCache = mock.fn((_: unknown) => {});
mock.module('./settings-cache', {
  namedExports: {
    saveSettingsCache,
    DEFAULT_SHARED_SETTINGS: REAL_DEFAULT_SHARED_SETTINGS,
    SETTINGS_CACHE_KEY: 'comfy-prompt-tool-settings-v1',
  },
});

const resetComfyUiSettings = mock.fn(() => {});
mock.module('./comfyui-settings', {
  namedExports: { resetComfyUiSettings, COMFYUI_SETTINGS_KEY: 'comfyui-settings-v4' },
});

const clearComfyGallery = mock.fn(() => {});
mock.module('./comfyui-gallery', {
  namedExports: { clearComfyGallery, COMFYUI_GALLERY_KEY: 'comfyui-gallery-v1' },
});

const saveComfyWorkflowFiles = mock.fn((_: unknown[]) => {});
mock.module('./comfyui-workflow-files', {
  namedExports: { saveComfyWorkflowFiles, COMFY_WORKFLOW_FILES_KEY: 'comfyui-workflow-files-v1' },
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  saveLocationBlocklist.mock.resetCalls();
  saveSettingsCache.mock.resetCalls();
  resetComfyUiSettings.mock.resetCalls();
  clearComfyGallery.mock.resetCalls();
  saveComfyWorkflowFiles.mock.resetCalls();
});

describe('local-data-reset', async () => {
  const { clearAllLocalPromptData, LOCAL_DATA_KEYS } = await import('./local-data-reset');

  describe('clearAllLocalPromptData', () => {
    it('is a no-op when window is undefined (SSR guard)', () => {
      clearAllLocalPromptData();
      assert.equal(saveLocationBlocklist.mock.calls.length, 0);
      assert.equal(saveSettingsCache.mock.calls.length, 0);
      assert.equal(resetComfyUiSettings.mock.calls.length, 0);
      assert.equal(clearComfyGallery.mock.calls.length, 0);
      assert.equal(saveComfyWorkflowFiles.mock.calls.length, 0);
    });

    it('clears the location blocklist, settings cache, comfy settings, gallery, and workflow files', () => {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
          sessionStorage: {
            removeItem() {},
            setItem() {},
            getItem() {
              return null;
            },
          },
          dispatchEvent() {
            return true;
          },
        },
      });
      clearAllLocalPromptData();
      assert.deepEqual(saveLocationBlocklist.mock.calls[0]!.arguments, [[]]);
      assert.deepEqual(saveSettingsCache.mock.calls[0]!.arguments, [
        { shared: REAL_DEFAULT_SHARED_SETTINGS, tools: {} },
      ]);
      assert.equal(resetComfyUiSettings.mock.calls.length, 1);
      assert.equal(clearComfyGallery.mock.calls.length, 1);
      assert.deepEqual(saveComfyWorkflowFiles.mock.calls[0]!.arguments, [[]]);
    });
  });

  describe('LOCAL_DATA_KEYS', () => {
    it('lists every legacy localStorage key used for diagnostics/reset copy', () => {
      assert.deepEqual(LOCAL_DATA_KEYS, [
        'comfy-prompt-tool-history-v1',
        'comfy-prompt-tool-settings-v1',
        'comfy-prompt-scene-presets-v1',
        'comfy-prompt-user-templates-v1',
        'comfy-prompt-location-blocklist-v1',
        'comfyui-settings-v4',
        'comfyui-gallery-v1',
        'comfyui-workflow-files-v1',
        'comfyui-workflow-presets-v1',
        'comfy-prompt-avoided-tokens-v1',
        'comfy-prompt-webhook-log-v1',
        'play-campaign-v1',
        'comfy-play-metrics-v1',
        'moodboard-look-pack-v1',
      ]);
    });

    it('has no duplicate keys', () => {
      assert.equal(new Set(LOCAL_DATA_KEYS).size, LOCAL_DATA_KEYS.length);
    });
  });
});
