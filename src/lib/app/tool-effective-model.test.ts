import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toolEffectiveModel, toolKeyForPageKey } from './tool-effective-model';

describe('toolEffectiveModel', () => {
  it('never shows a 3D / video model on a still-image tool', () => {
    assert.equal(toolEffectiveModel('hunyuan-3d', 'fitting'), 'qwen-image-2512');
    assert.equal(toolEffectiveModel('wan-video-rapid-aio', 'roleplay'), 'qwen-image-2512');
    assert.equal(toolEffectiveModel('hunyuan-3d', 'image-prompt'), 'qwen-image-2512');
  });

  it('keeps media models on media tools and image models everywhere', () => {
    assert.equal(toolEffectiveModel('hunyuan-3d', 'mesh'), 'hunyuan-3d');
    assert.equal(toolEffectiveModel('flux-inpaint', 'compose'), 'flux-inpaint');
    assert.equal(toolEffectiveModel(undefined, 'fitting'), undefined);
  });

  it('maps kebab page keys to settings tool keys', () => {
    assert.equal(toolKeyForPageKey('compose'), 'imageCompose');
    assert.equal(toolKeyForPageKey('prompt-editor'), 'promptEditor');
    assert.equal(toolKeyForPageKey('day'), 'day');
  });
});
