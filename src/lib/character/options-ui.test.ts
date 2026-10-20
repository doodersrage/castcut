import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPoseAnchorClause,
  buildPoseAnchorLine,
  buildPoseAnchorUserDirective,
  CHARACTER_PRESET_FIELD_KEYS,
  clearCharacterPresetPatch,
  countCharacterPresetSectionSelections,
  countCharacterPresetSelections,
  getSelectOptionsForPresetKey,
  hasCharacterPresetOptions,
  hasPoseAnchor,
  integratePoseAnchorIntoPrompt,
  isDuoHeadcount,
  normalizeCharacterPresetOptionsClient,
  poseAnchorPresent,
  presetOptionsFromCache,
  shouldShowPresetField,
  type CharacterPresetOptions,
} from './options-ui';

const PERCHED_ANCHOR: CharacterPresetOptions = {
  poseAction: 'perched',
  poseTarget: 'weathered stone wall',
};

describe('character-options-ui presets', () => {
  it('normalizeCharacterPresetOptionsClient keeps valid select values and blanks invalid ones', () => {
    const normalized = normalizeCharacterPresetOptionsClient({
      headcount: 'duo',
      shotFraming: 'not-a-real-option',
      hairColor: '  auburn  ',
      wardrobeCatalog: '  denim jacket  ',
    });

    assert.equal(normalized.headcount, 'duo');
    assert.equal(normalized.shotFraming, '');
    assert.equal(normalized.hairColor, 'auburn');
    assert.equal(normalized.wardrobeCatalog, 'denim jacket');
  });

  it('normalizeCharacterPresetOptionsClient defaults every field on empty input', () => {
    const normalized = normalizeCharacterPresetOptionsClient();
    for (const key of CHARACTER_PRESET_FIELD_KEYS) {
      assert.equal(normalized[key as keyof CharacterPresetOptions], '');
    }
  });

  it('presetOptionsFromCache normalizes cached values the same way', () => {
    const fromCache = presetOptionsFromCache({ headcount: 'solo', hints: 'unused' });
    assert.equal(fromCache.headcount, 'solo');
  });

  it('clearCharacterPresetPatch resets every known field to an empty string', () => {
    const patch = clearCharacterPresetPatch();
    for (const key of CHARACTER_PRESET_FIELD_KEYS) {
      assert.equal(patch[key as keyof CharacterPresetOptions], '');
    }
  });

  it('countCharacterPresetSelections counts set select/text/clothing fields but not a lone poseAction', () => {
    assert.equal(countCharacterPresetSelections({}), 0);
    assert.equal(countCharacterPresetSelections({ headcount: 'duo' }), 1);
    assert.equal(
      countCharacterPresetSelections({ headcount: 'duo', wardrobeCatalog: 'suit' }),
      2
    );
    // poseAction alone (no poseTarget) never counts.
    assert.equal(countCharacterPresetSelections({ poseAction: 'perched' }), 0);
    // A complete pose anchor counts once at the top level.
    assert.equal(countCharacterPresetSelections(PERCHED_ANCHOR), 1);
  });

  it('countCharacterPresetSectionSelections scopes the count to one UI section', () => {
    const options: CharacterPresetOptions = { headcount: 'duo', bodyType: 'athletic' };
    assert.equal(countCharacterPresetSectionSelections('camera', options), 1);
    assert.equal(countCharacterPresetSectionSelections('look', options), 1);
    assert.equal(countCharacterPresetSectionSelections('pose', options), 0);
    // The pose section counts the filled poseTarget field and the completed-anchor
    // bonus separately, so a full anchor scores 2 here (unlike the top-level count).
    assert.equal(countCharacterPresetSectionSelections('pose', PERCHED_ANCHOR), 2);
  });

  it('countCharacterPresetSectionSelections returns 0 for an unknown section id', () => {
    assert.equal(countCharacterPresetSectionSelections('does-not-exist', { headcount: 'duo' }), 0);
  });

  it('hasCharacterPresetOptions reflects whether any selection is active', () => {
    assert.equal(hasCharacterPresetOptions({}), false);
    assert.equal(hasCharacterPresetOptions({ headcount: 'solo' }), true);
  });

  it('getSelectOptionsForPresetKey returns the registered options, or a default fallback', () => {
    const headcountOptions = getSelectOptionsForPresetKey('headcount');
    assert.ok(headcountOptions.some(option => option.value === 'duo'));

    const unknown = getSelectOptionsForPresetKey('wardrobe' as keyof CharacterPresetOptions);
    assert.deepEqual(unknown, [{ value: '', label: 'Default' }]);
  });

  it('hasPoseAnchor requires both a pose action and a non-blank pose target', () => {
    assert.equal(hasPoseAnchor({}), false);
    assert.equal(hasPoseAnchor({ poseAction: 'perched' }), false);
    assert.equal(hasPoseAnchor({ poseTarget: 'stone wall' }), false);
    assert.equal(hasPoseAnchor({ poseAction: 'perched', poseTarget: '   ' }), false);
    assert.equal(hasPoseAnchor(PERCHED_ANCHOR), true);
  });

  it('buildPoseAnchorLine combines the pose action script with an enriched target', () => {
    assert.equal(buildPoseAnchorLine({}), null);

    const line = buildPoseAnchorLine(PERCHED_ANCHOR);
    assert.ok(line);
    assert.match(line!, /^is perched casually on the exact edge of a weathered stone wall/);
    assert.match(line!, /,$/);
  });

  it('buildPoseAnchorClause is the same line without the trailing comma', () => {
    assert.equal(buildPoseAnchorClause({}), null);
    const clause = buildPoseAnchorClause(PERCHED_ANCHOR);
    assert.ok(clause);
    assert.ok(!clause!.endsWith(','));
    assert.equal(clause, buildPoseAnchorLine(PERCHED_ANCHOR)!.replace(/,\s*$/, ''));
  });

  it('poseAnchorPresent is false with no anchor configured', () => {
    assert.equal(poseAnchorPresent('anything goes here', {}), false);
  });

  it('poseAnchorPresent detects when the prompt already covers the anchor', () => {
    const prompt =
      'A woman is perched casually on the exact edge of a weathered stone wall, smiling softly.';
    assert.equal(poseAnchorPresent(prompt, PERCHED_ANCHOR), true);
  });

  it('poseAnchorPresent is false when the prompt has neither the target nor the action keyword', () => {
    const prompt = 'A woman stands in a sunlit meadow, smiling softly.';
    assert.equal(poseAnchorPresent(prompt, PERCHED_ANCHOR), false);
  });

  it('integratePoseAnchorIntoPrompt returns the prompt unchanged with no anchor configured', () => {
    const prompt = 'A woman stands in a sunlit meadow.';
    assert.equal(integratePoseAnchorIntoPrompt(prompt, {}), prompt);
  });

  it('integratePoseAnchorIntoPrompt leaves an already-anchored prompt untouched', () => {
    const prompt =
      'A woman is perched casually on the exact edge of a weathered stone wall, smiling softly.';
    assert.equal(integratePoseAnchorIntoPrompt(prompt, PERCHED_ANCHOR), prompt);
  });

  it('integratePoseAnchorIntoPrompt splices the pose clause in after the subject', () => {
    const prompt = 'A woman stands in a sunlit meadow, smiling softly.';
    const result = integratePoseAnchorIntoPrompt(prompt, PERCHED_ANCHOR);

    assert.ok(result.startsWith('A woman is perched casually on the exact edge of'));
    assert.ok(poseAnchorPresent(result, PERCHED_ANCHOR));
    // The conflicting "stands" framing language should not survive.
    assert.ok(!/\bstands\b/i.test(result));
    assert.ok(result.includes('smiling softly.'));
  });

  it('integratePoseAnchorIntoPrompt prefixes the clause when no subject clause is found', () => {
    const prompt = 'smiling softly in warm light.';
    const result = integratePoseAnchorIntoPrompt(prompt, PERCHED_ANCHOR);
    const clause = buildPoseAnchorClause(PERCHED_ANCHOR)!;

    assert.ok(result.startsWith(clause));
    assert.ok(result.includes('smiling softly in warm light.'));
  });

  it('buildPoseAnchorUserDirective returns null with no anchor and a mandatory directive otherwise', () => {
    assert.equal(buildPoseAnchorUserDirective({}), null);

    const directive = buildPoseAnchorUserDirective(PERCHED_ANCHOR);
    assert.ok(directive);
    assert.match(directive!, /^POSE ANCHOR \(mandatory/);
    assert.ok(
      directive!.includes('is perched casually on the exact edge of a weathered stone wall')
    );
  });

  it('isDuoHeadcount only matches the "duo" headcount', () => {
    assert.equal(isDuoHeadcount({}), false);
    assert.equal(isDuoHeadcount({ headcount: 'solo' }), false);
    assert.equal(isDuoHeadcount({ headcount: 'duo' }), true);
  });

  it('shouldShowPresetField gates poseTarget on poseAction and duoDynamic on headcount', () => {
    const poseTargetField = {
      kind: 'text' as const,
      key: 'poseTarget' as const,
      label: 'Pose target',
      requires: 'poseAction' as const,
    };
    assert.equal(shouldShowPresetField(poseTargetField, {}), false);
    assert.equal(shouldShowPresetField(poseTargetField, { poseAction: 'perched' }), true);

    const duoDynamicField = {
      kind: 'select' as const,
      key: 'duoDynamic' as const,
      label: 'Duo dynamic',
    };
    assert.equal(shouldShowPresetField(duoDynamicField, { headcount: 'solo' }), false);
    assert.equal(shouldShowPresetField(duoDynamicField, { headcount: 'duo' }), true);

    const unrelatedField = {
      kind: 'select' as const,
      key: 'lighting' as const,
      label: 'Lighting',
    };
    assert.equal(shouldShowPresetField(unrelatedField, {}), true);
  });
});
