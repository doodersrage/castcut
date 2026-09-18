import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isSimpleSettingsTab,
  normalizeSettingsTab,
  settingsViewFromSearchParams,
} from './settings-nav';

describe('settings-nav', () => {
  it('defaults unknown tabs to overview essentials', () => {
    const view = settingsViewFromSearchParams('nope', 'workflow-patching');
    assert.equal(view.tab, 'overview');
    assert.equal(view.section, null);
    assert.equal(view.showAll, false);
    assert.equal(normalizeSettingsTab('comfyui'), 'comfyui');
  });

  it('expands essentials for advanced ComfyUI deep links', () => {
    const view = settingsViewFromSearchParams('comfyui', 'workflow-patching');
    assert.equal(view.tab, 'comfyui');
    assert.equal(view.section, 'workflow-patching');
    assert.equal(view.showAll, true);
  });

  it('keeps essentials for connection deep links', () => {
    const view = settingsViewFromSearchParams('comfyui', 'connection');
    assert.equal(view.section, 'connection');
    assert.equal(view.showAll, false);
    assert.equal(isSimpleSettingsTab('comfyui'), true);
    assert.equal(isSimpleSettingsTab('llm'), true);
    assert.equal(isSimpleSettingsTab('data'), true);
    assert.equal(isSimpleSettingsTab('automation'), false);
  });

  it('expands essentials for non-simple tabs', () => {
    const view = settingsViewFromSearchParams('automation', null);
    assert.equal(view.tab, 'automation');
    assert.equal(view.showAll, true);
  });
});
