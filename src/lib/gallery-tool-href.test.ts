import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { galleryToolHref, galleryToolHrefForEntry, galleryToolLabel } from './gallery-tool-href';

describe('galleryToolHref', () => {
  it('maps known tools, including Character modes', () => {
    assert.equal(galleryToolHref('character'), '/character');
    assert.equal(galleryToolHref('duo'), '/character?mode=duo');
    assert.equal(galleryToolHref('scene-compose'), '/character?mode=compose');
    assert.equal(galleryToolHref('compose'), '/compose');
    assert.equal(galleryToolHref('imagePrompt'), '/image-prompt');
    assert.equal(galleryToolHref('nsfw-generator'), '/plugins/nsfw-generator');
    assert.equal(galleryToolHref('roleplay'), '/story');
    assert.equal(galleryToolLabel('roleplay'), 'Story');
    assert.equal(galleryToolHref('upload'), '/gallery');
    assert.equal(galleryToolLabel('upload'), 'Upload');
    assert.equal(galleryToolHref('variations'), '/variations');
    assert.equal(galleryToolHref('generate'), '/');
    assert.equal(galleryToolHref('randomScene'), '/');
  });

  it('falls back to Generate for missing or unknown tools', () => {
    assert.equal(galleryToolHref(), '/');
    assert.equal(galleryToolHref(''), '/');
    assert.equal(galleryToolHref('not-a-tool'), '/');
    assert.equal(galleryToolHrefForEntry({}), '/');
    assert.equal(galleryToolHrefForEntry({ tool: 'refine' }), '/refine');
  });
});

describe('galleryToolLabel', () => {
  it('names known tools and falls back to Generate', () => {
    assert.equal(galleryToolLabel('character'), 'Character');
    assert.equal(galleryToolLabel('scene-compose'), 'Character');
    assert.equal(galleryToolLabel(), 'Generate');
    assert.equal(galleryToolLabel('mystery'), 'Generate');
  });
});
