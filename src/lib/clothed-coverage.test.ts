import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayMoodMustStayClothed,
  hasStrongCoverageLine,
  softenBareSkinWords,
  STRONG_COVERAGE_LINE,
  SUGGESTIVE_COVERAGE_LINE,
  withStrongCoverageLine,
} from './clothed-coverage';
import { dayStillAgeFacts, finishDayStillPrompt } from './day-still-prompt';
import { buildRapidSuggestiveRecipe } from './rapid-duo-recipe';

describe('clothed coverage (Suggestive stays clothed)', () => {
  it('only Suggestive must stay clothed', () => {
    assert.equal(dayMoodMustStayClothed('suggestive'), true);
    assert.equal(dayMoodMustStayClothed('Suggestive'), true);
    for (const mood of ['intimate', 'raunchy', 'everyday', 'vacation', 'sport', '', null, undefined]) {
      assert.equal(dayMoodMustStayClothed(mood), false, String(mood));
    }
  });

  it('every Suggestive solo recipe carries the coverage line after the clothes, before the Moment', () => {
    const recipe = buildRapidSuggestiveRecipe({
      beat: 'sitting on the windowsill in a short robe over a bra and panties, one foot planted on the sill',
      faceOnly: true,
    })!;
    assert.match(
      recipe,
      /She wears a short robe over a bra and panties\. Her clothes stay on, covering her chest and hips\. Moment:/
    );
    // Positive wording only (Rapid runs at CFG 1 — a negative would do nothing).
    assert.doesNotMatch(SUGGESTIVE_COVERAGE_LINE, /\b(?:no|never|not|without)\b/i);
    assert.doesNotMatch(STRONG_COVERAGE_LINE, /\b(?:no|never|not|without)\b/i);
    // The age sentence still lands right before the Moment, after the coverage line.
    const finished = finishDayStillPrompt(recipe, {
      adultMood: true,
      adult: false,
      swapLead: false,
      ages: dayStillAgeFacts({ playedMood: 'suggestive', leadNoun: 'woman', figures: 1 }),
    });
    assert.match(
      finished,
      /covering her chest and hips\. She is an adult woman in her thirties, with a mature adult face and body\. Moment:/
    );
  });

  it('the requeue after bare skin leads with the strong line, once', () => {
    const once = withStrongCoverageLine('Suggestive photo: One woman alone, clothed.');
    assert.equal(once, `${STRONG_COVERAGE_LINE}\nSuggestive photo: One woman alone, clothed.`);
    assert.equal(withStrongCoverageLine(once), once);
    assert.ok(hasStrongCoverageLine(once));
    assert.equal(hasStrongCoverageLine('Suggestive photo: …'), false);
    assert.equal(withStrongCoverageLine(''), STRONG_COVERAGE_LINE);
  });

  it('says the bare-skin words clothed on the requeue (the line alone did nothing live)', () => {
    assert.equal(
      softenBareSkinWords('pouring coffee barefoot in a silk robe loosely tied — leaning on the counter, cleavage and skin, charged quiet'),
      'pouring coffee barefoot in a silk robe belted at the waist over a camisole — leaning on the counter, a hint of neckline, charged quiet'
    );
    assert.equal(
      softenBareSkinWords('sitting on the windowsill in a short robe, one foot planted on the sill, robe falling open over lingerie, eyes half-lidded'),
      'sitting on the windowsill in a short robe, one foot planted on the sill, robe over a bra and panties, eyes half-lidded'
    );
    assert.equal(
      softenBareSkinWords('stretching in thin sleepwear by the window — one arm overhead, hip cocked, fabric catching light on bare thighs, looking back over a shoulder'),
      'stretching in a camisole and sleep shorts by the window — one arm overhead, hip cocked, looking back over a shoulder'
    );
    assert.equal(softenBareSkinWords('in a towel wrap and lingerie, topless by the pool'), 'in a short robe over lingerie and lingerie, dressed by the pool');
    // Clothed wording is left alone.
    const fine = 'lying on her side on the hotel bed in lingerie — propped on one elbow, knees drawn up';
    assert.equal(softenBareSkinWords(fine), fine);
    // The requeue applies it to the whole prompt, then leads with the strong line.
    const recipe = buildRapidSuggestiveRecipe({ beat: 'leaning in a doorway in a robe loosely tied, bare legs' })!;
    const ages = dayStillAgeFacts({ playedMood: 'suggestive', leadNoun: 'woman', figures: 1 });
    const covered = finishDayStillPrompt(recipe, { adultMood: true, adult: false, swapLead: false, ages, coverage: true });
    assert.match(covered, /Moment: leaning in a doorway in a robe belted at the waist over a camisole\./);
    assert.doesNotMatch(covered, /bare legs|loosely tied/);
  });

  it('finishDayStillPrompt adds the strong line only on a clothed mood, and only when asked', () => {
    const recipe = buildRapidSuggestiveRecipe({ beat: 'leaning in a doorway in lingerie and an open robe' })!;
    const ages = dayStillAgeFacts({ playedMood: 'suggestive', leadNoun: 'woman', figures: 1 });
    const base = { adultMood: true, adult: false, swapLead: false };
    const covered = finishDayStillPrompt(recipe, { ...base, ages, coverage: true });
    assert.ok(covered.startsWith(STRONG_COVERAGE_LINE + '\n'), covered.slice(0, 80));
    // The age sentence is still on the recipe line (it finds the mark on its own line).
    assert.match(covered, /\nSuggestive photo: One woman alone, clothed\. .*She is an adult woman/);
    assert.equal(finishDayStillPrompt(recipe, { ...base, ages }).includes('COVERED'), false);
    // Intimate / Raunchy (nude moods) never get it, even on a requeue.
    const nude = dayStillAgeFacts({ playedMood: 'intimate', leadNoun: 'woman', figures: 1 });
    assert.equal(
      finishDayStillPrompt('Explicit solo photo: One woman alone, nude.', { ...base, adult: true, ages: nude, coverage: true }).includes('COVERED'),
      false
    );
  });
});
