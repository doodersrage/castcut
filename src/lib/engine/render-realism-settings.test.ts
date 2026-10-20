import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

type SharedShape = { renderRealismMode?: string };
let sharedSettings: SharedShape = {};
const loadSettingsCache = mock.fn(() => ({ shared: sharedSettings }));
mock.module('../settings/cache', { namedExports: { loadSettingsCache } });

afterEach(() => {
  sharedSettings = {};
  loadSettingsCache.mock.resetCalls();
  delete (globalThis as { window?: unknown }).window;
});

describe('loadRenderRealismMode', async () => {
  const { loadRenderRealismMode } = await import('./render-realism-settings');

  it('returns the default mode without window, without touching settings cache', () => {
    assert.equal(loadRenderRealismMode(), 'realistic');
    assert.equal(loadSettingsCache.mock.calls.length, 0);
  });

  it('returns the normalized shared setting when window is present', () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    sharedSettings = { renderRealismMode: 'anime' };
    assert.equal(loadRenderRealismMode(), 'anime');
  });

  it('normalizes an unknown stored value to the default', () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    sharedSettings = { renderRealismMode: 'not-a-real-mode' };
    assert.equal(loadRenderRealismMode(), 'realistic');
  });

  it('maps the legacy "animation" value to "anime"', () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    sharedSettings = { renderRealismMode: 'animation' };
    assert.equal(loadRenderRealismMode(), 'anime');
  });
});
