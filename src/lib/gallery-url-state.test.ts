import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyGalleryUrlState, parseGalleryUrlState } from './gallery-url-state';

const DEFAULT_PAGE_STATE = {
  sort: 'queued-desc' as const,
  projectFilterId: '',
  page: 1,
};

describe('gallery-url-state', () => {
  it('round-trips filter and sort params', () => {
    const params = new URLSearchParams();
    applyGalleryUrlState(params, {
      filter: {
        status: 'completed',
        model: 'flux.safetensors',
        minRating: 4,
        favoritesOnly: true,
        atRiskOnly: true,
        query: 'portrait',
      },
      sort: 'rating-desc',
      projectFilterId: 'proj-1',
      page: 1,
    });

    const parsed = parseGalleryUrlState(params);
    assert.equal(parsed.filter.status, 'completed');
    assert.equal(parsed.filter.model, 'flux.safetensors');
    assert.equal(parsed.filter.minRating, 4);
    assert.equal(parsed.filter.favoritesOnly, true);
    assert.equal(parsed.filter.atRiskOnly, true);
    assert.equal(parsed.filter.query, 'portrait');
    assert.equal(parsed.sort, 'rating-desc');
    assert.equal(parsed.projectFilterId, 'proj-1');
  });

  it('round-trips page param when greater than 1', () => {
    const params = new URLSearchParams();
    applyGalleryUrlState(params, {
      filter: { status: 'all' },
      sort: 'queued-desc',
      projectFilterId: '',
      page: 4,
    });
    assert.equal(params.get('page'), '4');
    assert.equal(parseGalleryUrlState(params).page, 4);
    applyGalleryUrlState(params, {
      filter: { status: 'all' },
      sort: 'queued-desc',
      projectFilterId: '',
      page: 1,
    });
    assert.equal(params.get('page'), null);
  });

  it('round-trips similar, duplicates, vision inbox, user tag, and custom group params', () => {
    const params = new URLSearchParams();
    applyGalleryUrlState(params, {
      filter: {
        semanticSearch: true,
        similarToEntryId: 'entry-9',
        similarMode: 'visual',
        duplicatesOnly: true,
        needsVisionReview: true,
        userTag: 'keeper',
        customGroup: 'Look A',
        derivedKind: 'film',
        characterId: 'char-rin',
        visionTagsOnly: true,
      },
      sort: 'eviction-risk-desc',
      projectFilterId: '',
      page: 1,
    });
    const parsed = parseGalleryUrlState(params);
    assert.equal(parsed.filter.semanticSearch, true);
    assert.equal(parsed.filter.similarToEntryId, 'entry-9');
    assert.equal(parsed.filter.similarMode, 'visual');
    assert.equal(parsed.filter.duplicatesOnly, true);
    assert.equal(parsed.filter.needsVisionReview, true);
    assert.equal(parsed.filter.userTag, 'keeper');
    assert.equal(parsed.filter.customGroup, 'Look A');
    assert.equal(parsed.filter.derivedKind, 'film');
    assert.equal(parsed.filter.characterId, 'char-rin');
    assert.equal(parsed.filter.visionTagsOnly, true);
    assert.equal(parsed.sort, 'eviction-risk-desc');
  });

  it('round-trips a look only with its Cast', () => {
    const params = new URLSearchParams();
    applyGalleryUrlState(params, {
      filter: { characterId: 'char-rin', lookId: 'look-beach' },
      ...DEFAULT_PAGE_STATE,
    });
    assert.equal(params.get('look'), 'look-beach');
    assert.equal(parseGalleryUrlState(params).filter.lookId, 'look-beach');

    const orphan = new URLSearchParams();
    applyGalleryUrlState(orphan, { filter: { lookId: 'look-beach' }, ...DEFAULT_PAGE_STATE });
    assert.equal(orphan.get('look'), null);
    assert.equal(
      parseGalleryUrlState(new URLSearchParams('look=look-beach')).filter.lookId,
      undefined
    );
  });

  it('round-trips audio and mesh media filters', () => {
    const params = new URLSearchParams();
    applyGalleryUrlState(params, {
      filter: { mediaKind: 'audio' },
      ...DEFAULT_PAGE_STATE,
    });
    assert.equal(parseGalleryUrlState(params).filter.mediaKind, 'audio');
    applyGalleryUrlState(params, {
      filter: { mediaKind: 'mesh' },
      ...DEFAULT_PAGE_STATE,
    });
    assert.equal(parseGalleryUrlState(params).filter.mediaKind, 'mesh');
  });

  it('preserves unrelated params when applying state', () => {
    const params = new URLSearchParams('lightbox=abc&pickFor=compose');
    applyGalleryUrlState(params, {
      filter: { status: 'error' },
      ...DEFAULT_PAGE_STATE,
    });
    assert.equal(params.get('lightbox'), 'abc');
    assert.equal(params.get('pickFor'), 'compose');
    assert.equal(params.get('status'), 'error');
    assert.equal(params.get('sort'), null);
  });
});
