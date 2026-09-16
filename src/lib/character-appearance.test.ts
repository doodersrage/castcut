import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHARACTER_APPEARANCE_RANDOM,
  characterAppearanceHints,
  composeCharacterAppearanceDescriptor,
  defaultCharacterAppearanceForm,
  resolveCharacterAppearance,
  rollCharacterAppearance,
  summarizeCharacterAppearance,
  summarizeCharacterAppearanceForm,
} from './character-appearance';

describe('character-appearance', () => {
  it('defaults the create form to Random on every trait', () => {
    const form = defaultCharacterAppearanceForm();
    assert.equal(form.sex, CHARACTER_APPEARANCE_RANDOM);
    assert.equal(form.ethnicity, CHARACTER_APPEARANCE_RANDOM);
    assert.equal(form.height, CHARACTER_APPEARANCE_RANDOM);
    assert.equal(form.bodyBuild, CHARACTER_APPEARANCE_RANDOM);
    assert.equal(form.ageBand, CHARACTER_APPEARANCE_RANDOM);
    assert.match(summarizeCharacterAppearanceForm(form), /Random · Random/);
  });

  it('resolves Random picks into concrete traits at create time', () => {
    const draft = resolveCharacterAppearance(defaultCharacterAppearanceForm());
    assert.notEqual(draft.sex, CHARACTER_APPEARANCE_RANDOM);
    assert.ok(['woman', 'man', 'nonbinary'].includes(draft.sex));
    assert.ok(draft.ethnicity);
    assert.ok(draft.height);
    assert.ok(draft.bodyBuild);
    assert.ok(draft.ageBand);
  });

  it('keeps locked traits while resolving only Random ones', () => {
    const draft = resolveCharacterAppearance({
      sex: 'woman',
      ethnicity: CHARACTER_APPEARANCE_RANDOM,
      height: 'tall',
      bodyBuild: CHARACTER_APPEARANCE_RANDOM,
      ageBand: '30s',
    });
    assert.equal(draft.sex, 'woman');
    assert.equal(draft.height, 'tall');
    assert.equal(draft.ageBand, '30s');
    assert.notEqual(draft.ethnicity, CHARACTER_APPEARANCE_RANDOM);
    assert.notEqual(draft.bodyBuild, CHARACTER_APPEARANCE_RANDOM);
  });

  it('rolls a complete appearance draft', () => {
    const draft = rollCharacterAppearance();
    assert.ok(draft.sex);
    assert.ok(draft.ethnicity);
    assert.ok(draft.height);
    assert.ok(draft.bodyBuild);
    assert.ok(draft.ageBand);
  });

  it('respects partial overrides when rolling', () => {
    const draft = rollCharacterAppearance({ sex: 'woman', ethnicity: 'east-asian' });
    assert.equal(draft.sex, 'woman');
    assert.equal(draft.ethnicity, 'east-asian');
  });

  it('composes a descriptor that includes sex, ethnicity, age, height, and body', () => {
    const draft = resolveCharacterAppearance({
      sex: 'man',
      ethnicity: 'south-asian',
      ageBand: '40s',
      height: 'tall',
      bodyBuild: 'athletic',
    });
    const descriptor = composeCharacterAppearanceDescriptor(draft);
    assert.match(descriptor, /South Asian/);
    assert.match(descriptor, /\bman\b/);
    assert.match(descriptor, /forties/);
    assert.match(descriptor, /tall/);
    assert.match(descriptor, /athletic/);
  });

  it('maps Latina/Latino ancestry by sex and Latine for nonbinary', () => {
    assert.match(
      composeCharacterAppearanceDescriptor(
        resolveCharacterAppearance({ sex: 'woman', ethnicity: 'latina-latino' })
      ),
      /Latina woman/
    );
    assert.match(
      composeCharacterAppearanceDescriptor(
        resolveCharacterAppearance({ sex: 'man', ethnicity: 'latina-latino' })
      ),
      /Latino man/
    );
    assert.match(
      composeCharacterAppearanceDescriptor(
        resolveCharacterAppearance({ sex: 'nonbinary', ethnicity: 'latina-latino' })
      ),
      /Latine person/
    );
  });

  it('builds hints and summary for UI / wardrobe helpers', () => {
    const draft = resolveCharacterAppearance({
      sex: 'woman',
      ethnicity: 'nordic',
      ageBand: '30s',
      height: 'average',
      bodyBuild: 'slender',
    });
    assert.match(characterAppearanceHints(draft), /woman/);
    assert.match(characterAppearanceHints(draft), /Nordic/);
    assert.match(summarizeCharacterAppearance(draft), /Woman/);
    assert.match(summarizeCharacterAppearance(draft), /Nordic/);
  });
});
