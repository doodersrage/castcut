import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const buildClothingPickFilters = mock.fn((input: unknown) => ({ built: true, ...(input as object) }));
const hintsFantasyWardrobe = mock.fn((_corpus: string) => false);
mock.module('./clothing-tags', {
  namedExports: { buildClothingPickFilters, hintsFantasyWardrobe },
});

type OutfitPick = {
  summary: string;
  wardrobeId: string | null;
  filters: { gender: 'women' | 'men' };
};

let pickRandomCharacterOutfitImpl = (_filters: unknown): OutfitPick => ({
  summary: 'red silk blouse',
  wardrobeId: 'wardrobe-1',
  filters: { gender: 'women' },
});
const pickRandomCharacterOutfit = mock.fn((filters: unknown) =>
  pickRandomCharacterOutfitImpl(filters)
);
mock.module('./clothing-catalog', { namedExports: { pickRandomCharacterOutfit } });

const compactClothingScript = mock.fn((value: string) => `compact:${value}`);
mock.module('./clothing-quality', { namedExports: { compactClothingScript } });

const parseSettingHint = mock.fn((_corpus: string) => ({ location: 'rooftop bar' }));
mock.module('../prompt/hint-location', { namedExports: { parseSettingHint } });

const inferSubjectGenderFromHints = mock.fn((_corpus: string) => 'women' as const);
mock.module('../checks/distinct-people', { namedExports: { inferSubjectGenderFromHints } });

describe('clothing-mutations', async () => {
  const {
    resolveCatalogWardrobeMutation,
    buildCatalogAwareWardrobeMutationClause,
  } = await import('./clothing-mutations');

  afterEach(() => {
    pickRandomCharacterOutfitImpl = () => ({
      summary: 'red silk blouse',
      wardrobeId: 'wardrobe-1',
      filters: { gender: 'women' },
    });
    buildClothingPickFilters.mock.resetCalls();
    hintsFantasyWardrobe.mock.resetCalls();
    pickRandomCharacterOutfit.mock.resetCalls();
    compactClothingScript.mock.resetCalls();
    parseSettingHint.mock.resetCalls();
    inferSubjectGenderFromHints.mock.resetCalls();
  });

  describe('resolveCatalogWardrobeMutation', () => {
    it('returns null when both prompt and hints are blank', () => {
      assert.equal(resolveCatalogWardrobeMutation({ prompt: '', hints: '  ' }), null);
      assert.equal(pickRandomCharacterOutfit.mock.callCount(), 0);
    });

    it('builds filters from the corpus and returns the catalog outfit', () => {
      const result = resolveCatalogWardrobeMutation({
        prompt: 'a woman on a rooftop',
        hints: 'evening shoot',
        recentClothing: ['old-id'],
        avoidedTokens: ['neon'],
      });
      assert.deepEqual(result, {
        summary: 'red silk blouse',
        wardrobeId: 'wardrobe-1',
        filters: { gender: 'women' },
      });
      assert.equal(parseSettingHint.mock.callCount(), 1);
      assert.equal(inferSubjectGenderFromHints.mock.callCount(), 1);
      const filterArg = buildClothingPickFilters.mock.calls[0].arguments[0] as Record<string, unknown>;
      assert.equal(filterArg.gender, 'women');
      assert.equal(filterArg.sceneLocation, 'rooftop bar');
      assert.deepEqual(filterArg.excludeIds, ['old-id']);
      assert.deepEqual(filterArg.avoidedTokens, ['neon']);
    });

    it('returns null when the catalog outfit has a blank summary', () => {
      pickRandomCharacterOutfitImpl = () => ({
        summary: '   ',
        wardrobeId: null,
        filters: { gender: 'women' },
      });
      assert.equal(resolveCatalogWardrobeMutation({ prompt: 'someone standing' }), null);
    });

    it('uses an explicit gender and skips inference when provided', () => {
      resolveCatalogWardrobeMutation({ prompt: 'subject', gender: 'men' });
      assert.equal(inferSubjectGenderFromHints.mock.callCount(), 0);
      const filterArg = buildClothingPickFilters.mock.calls[0].arguments[0] as Record<string, unknown>;
      assert.equal(filterArg.gender, 'men');
    });
  });

  describe('buildCatalogAwareWardrobeMutationClause', () => {
    it('uses the explicit value when provided (compacted) and skips catalog pick', () => {
      const result = buildCatalogAwareWardrobeMutationClause('base prompt', ' leather jacket ');
      assert.equal(
        result.clause,
        'Change outfit to compact:leather jacket while keeping pose and scene.'
      );
      assert.equal(result.summary, 'leather jacket');
      assert.equal(pickRandomCharacterOutfit.mock.callCount(), 0);
    });

    it('uses a catalog outfit when no explicit value is given', () => {
      const result = buildCatalogAwareWardrobeMutationClause('a woman outdoors', undefined, {
        hints: 'daylight',
        recentClothing: ['x'],
      });
      assert.match(result.clause, /Change outfit to red silk blouse while keeping pose/);
      assert.equal(result.summary, 'red silk blouse');
      assert.equal(result.wardrobeId, 'wardrobe-1');
    });

    it('falls back to a generic refresh clause when the catalog pick is empty', () => {
      pickRandomCharacterOutfitImpl = () => ({
        summary: '',
        wardrobeId: null,
        filters: { gender: 'women' },
      });
      const result = buildCatalogAwareWardrobeMutationClause('someone');
      assert.match(result.clause, /Refresh wardrobe with a contrasting/);
      assert.equal(result.summary, undefined);
      assert.equal(result.wardrobeId, undefined);
    });
  });
});
