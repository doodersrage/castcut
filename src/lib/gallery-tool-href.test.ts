import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { galleryToolHref, galleryToolHrefForEntry, galleryToolLabel } from './gallery-tool-href';

describe('galleryToolHref', () => {
  it('maps known tools, including Character modes', () => {
    assert.equal(galleryToolHref('character'), '/character');
    assert.equal(galleryToolHref('duo'), '/character?mode=duo');
    assert.equal(galleryToolHref('scene-compose'), '/character?mode=compose');
    assert.equal(galleryToolHref('compose'), '/compose');
    // Prompt Studio's tools: not in Castcut, so their entries open the Gallery.
    assert.equal(galleryToolHref('imagePrompt'), '/gallery');
    assert.equal(galleryToolHref('nsfw-generator'), '/gallery');
    assert.equal(galleryToolHref('roleplay'), '/story');
    assert.equal(galleryToolLabel('roleplay'), 'Story');
    assert.equal(galleryToolHref('upload'), '/gallery');
    assert.equal(galleryToolLabel('upload'), 'Upload');
    assert.equal(galleryToolHref('variations'), '/gallery');
    assert.equal(galleryToolHref('generate'), '/gallery');
    assert.equal(galleryToolHref('randomScene'), '/gallery');
  });

  it('falls back to the Gallery for missing or unknown tools (Castcut has no Generate)', () => {
    assert.equal(galleryToolHref(), '/gallery');
    assert.equal(galleryToolHref(''), '/gallery');
    assert.equal(galleryToolHref('not-a-tool'), '/gallery');
    assert.equal(galleryToolHrefForEntry({}), '/gallery');
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
