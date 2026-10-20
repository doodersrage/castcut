import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GALLERY_DERIVED_KIND_FILTERS,
  galleryDerivedKindChipLabel,
  galleryDerivedKindLabel,
} from './derived-kind';

describe('gallery-derived-kind', () => {
  it('labels ControlNet and face-detail derivatives', () => {
    assert.match(galleryDerivedKindLabel('controlnet') ?? '', /ControlNet/i);
    assert.match(galleryDerivedKindLabel('face-detail') ?? '', /face/i);
    assert.match(galleryDerivedKindChipLabel('soft-pass'), /Soft/i);
  });

  it('exposes the full filter set', () => {
    assert.ok(GALLERY_DERIVED_KIND_FILTERS.includes('controlnet'));
    assert.ok(GALLERY_DERIVED_KIND_FILTERS.includes('face-detail'));
    assert.ok(GALLERY_DERIVED_KIND_FILTERS.includes('i2v'));
    assert.ok(GALLERY_DERIVED_KIND_FILTERS.includes('t2v'));
    assert.ok(GALLERY_DERIVED_KIND_FILTERS.includes('extend'));
    assert.ok(GALLERY_DERIVED_KIND_FILTERS.includes('film'));
    assert.match(galleryDerivedKindLabel('i2v') ?? '', /animated/i);
    assert.match(galleryDerivedKindLabel('extend') ?? '', /extend/i);
    assert.match(galleryDerivedKindLabel('film') ?? '', /assembled film/i);
    assert.equal(galleryDerivedKindChipLabel('i2v'), 'I2V');
    assert.equal(galleryDerivedKindChipLabel('t2v'), 'T2V');
    assert.equal(galleryDerivedKindChipLabel('extend'), 'Extend');
    assert.equal(galleryDerivedKindChipLabel('film'), 'Film');
  });
});
