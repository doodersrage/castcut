import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countComfyExtensionPacks,
  parseComfyUiFeatures,
  readStringNameList,
} from './features';

describe('parseComfyUiFeatures', () => {
  it('collects interesting true flags and preview metadata', () => {
    const parsed = parseComfyUiFeatures({
      supports_preview_metadata: true,
      supports_manager: true,
      supports_asset_api: false,
      something_else: true,
    });
    assert.equal(parsed.previewMetadata, true);
    assert.deepEqual(parsed.labels, ['preview metadata', 'manager']);
  });

  it('returns empty flags for garbage', () => {
    assert.deepEqual(parseComfyUiFeatures(null), { previewMetadata: false, labels: [] });
    assert.deepEqual(parseComfyUiFeatures([]), { previewMetadata: false, labels: [] });
  });
});

describe('countComfyExtensionPacks', () => {
  it('counts unique /extensions/{pack}/ prefixes', () => {
    assert.equal(
      countComfyExtensionPacks([
        '/extensions/ComfyUI-Manager/js/index.js',
        '/extensions/ComfyUI-Manager/js/queue.js',
        '/extensions/rgthree%20comfy/js/foo.js',
      ]),
      2
    );
  });

  it('returns 0 for non-arrays', () => {
    assert.equal(countComfyExtensionPacks(null), 0);
    assert.equal(countComfyExtensionPacks({}), 0);
  });
});

describe('readStringNameList', () => {
  it('trims, drops empties, and de-duplicates', () => {
    assert.deepEqual(readStringNameList([' lora.safetensors ', '', 'lora.safetensors', 'b.pt']), [
      'lora.safetensors',
      'b.pt',
    ]);
  });

  it('returns an empty list for garbage', () => {
    assert.deepEqual(readStringNameList(null), []);
    assert.deepEqual(readStringNameList('nope'), []);
  });
});
