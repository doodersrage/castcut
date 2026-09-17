import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clarifyIntimateImageLanguage,
  promptHasIntimateEuphemisms,
} from './intimate-prompt-clarify';

describe('intimate-prompt-clarify', () => {
  it('covers core / folds / entrance variants across adjectives and acts', () => {
    const cases: Array<[string, RegExp]> = [
      ['fingers into her slick core', /fingers penetrating her vagina/i],
      ['fingers into her wet core', /fingers penetrating her vagina/i],
      ['fingers inside their dripping core', /fingers penetrating their vagina/i],
      ['fingers into her slick wet core', /fingers penetrating her vagina/i],
      ['buried in her warm core', /penetrating her vagina/i],
      ['plunged into her needy core', /penetrating her vagina/i],
      ['cock into her molten core', /cock penetrating her vagina/i],
      ['tongue into her slick folds', /tongue on her vagina/i],
      ['filling her tight channel', /filling her vagina/i],
      ['her wet core', /her vagina/i],
      ['her slick wet core', /her vagina/i],
      ['her quivering folds', /her vagina/i],
      ['her honey pot', /her vagina/i],
      ['her love canal', /her vagina/i],
      ['her womanhood', /her vagina/i],
      ['her center', /her vagina/i],
      ['her depths', /her vagina/i],
      ['the slick core', /the vagina/i],
      ['that molten core', /the vagina/i],
      ['a dripping entrance', /the vagina/i],
      ['wet core', /wet vagina/i],
      ['slick folds', /wet vagina/i],
      ['hot wet channel', /wet vagina/i],
      ['rain-slick asphalt', /rain-slick asphalt/i],
    ];
    for (const [input, expect] of cases) {
      const out = clarifyIntimateImageLanguage(input);
      assert.match(out, expect, `${input} → ${out}`);
      if (!/rain-slick/i.test(input)) {
        assert.doesNotMatch(
          out,
          /\b(?:wet|slick|molten|dripping|needy|warm|quivering|hot)\s+(?:wet\s+)?core\b/i,
          input
        );
      }
    }
  });

  it('covers manhood, breasts, clit, ass, nipples, balls, cum', () => {
    const out = clarifyIntimateImageLanguage(
      [
        'His manhood pressed against her mounds;',
        'he rubbed her pearl and sucked her peaked buds;',
        'hands on her rear and his heavy balls;',
        'spilling his seed — his release on skin.',
        'Rain-slick asphalt gleamed.',
      ].join(' ')
    );
    assert.match(out, /erect penis/i);
    assert.match(out, /breasts/i);
    assert.match(out, /clit/i);
    assert.match(out, /nipples/i);
    assert.match(out, /ass/i);
    assert.match(out, /balls/i);
    assert.match(out, /cum/i);
    assert.match(out, /rain-slick asphalt/i);
  });

  it('covers oral, lovemaking, straddle, and finish euphemisms', () => {
    const out = clarifyIntimateImageLanguage(
      'He was tasting her while they were making love; she straddled him and finished inside her.'
    );
    assert.match(out, /oral sex/i);
    assert.match(out, /having sex/i);
    assert.match(out, /straddling him in sex/i);
    assert.match(out, /cumming inside her/i);
  });

  it('is idempotent on already-direct language', () => {
    const direct =
      'Fingers penetrating her vagina, erect penis, breasts, ass, cum on skin.';
    assert.equal(clarifyIntimateImageLanguage(direct), direct);
    assert.equal(promptHasIntimateEuphemisms(direct), false);
  });

  it('detects euphemisms before clarify', () => {
    assert.equal(promptHasIntimateEuphemisms('fingers into her slick core'), true);
    assert.equal(promptHasIntimateEuphemisms('her wet core'), true);
    assert.equal(promptHasIntimateEuphemisms('standing in a doorway'), false);
  });
});
