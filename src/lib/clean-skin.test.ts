import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendCleanSkinPositive,
  appearanceAllowsTattoos,
  CLEAN_SKIN_NEGATIVE,
  mergeCleanSkinNegatives,
} from './clean-skin';

describe('clean-skin', () => {
  it('detects intentional tattoo wording', () => {
    assert.equal(appearanceAllowsTattoos('arm sleeve tattoo'), true);
    assert.equal(appearanceAllowsTattoos('inked forearms'), true);
    assert.equal(appearanceAllowsTattoos('sunlit kitchen morning'), false);
  });

  it('merges anti-tattoo negatives unless ink is intentional', () => {
    const merged = mergeCleanSkinNegatives('blurry');
    assert.match(merged ?? '', /tattoo/i);
    assert.match(merged ?? '', /blurry/i);
    assert.equal(
      mergeCleanSkinNegatives('blurry', 'a woman with traditional arm tattoos'),
      'blurry'
    );
  });

  it('appends clean-skin positive unless already present or intentional', () => {
    const next = appendCleanSkinPositive('Edit Image 1 into a café scene.');
    assert.match(next, /clean unmarked skin/i);
    assert.equal(
      appendCleanSkinPositive('Cast lead with tribal tattoos on both arms.'),
      'Cast lead with tribal tattoos on both arms.'
    );
  });

  it('exports a compact negative fragment', () => {
    assert.match(CLEAN_SKIN_NEGATIVE, /tattoo sleeve/i);
    assert.ok(CLEAN_SKIN_NEGATIVE.length < 120);
  });
});
