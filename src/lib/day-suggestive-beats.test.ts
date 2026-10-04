import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS,
} from './day-planner';
import { stripNegatedClauses } from './negated-clauses';
import { suggestiveBeatClothes } from './rapid-duo-recipe';

/**
 * Suggestive is a clothed mood. The pose report card (2026-10-03) drew a bare bottom or chest from
 * beat words that invited it — a robe "loosely tied" or "falling open", "cleavage and skin",
 * "bare thighs", a "towel wrap" — so no Suggestive beat may say them, and a robe or shirt
 * always has something named under it.
 */
const INVITES_NUDITY_RE =
  /\b(?:loosely tied|fall(?:s|ing)? open|cleavage and skin|bare (?:thighs?|chest|breasts?|bottom|skin)|towel(?: wrap)?|topless|bottomless|(?:dress|robe|shirt|slip|top) slipping off|sheer|see-through|nothing (?:else|under|underneath))\b/i;

const allSuggestiveBeats = (): Array<{ pool: string; beat: string }> => [
  ...Object.entries(DAY_SLOT_SUGGESTIVE_BEAT_PRESETS).flatMap(([part, beats]) =>
    beats.map(beat => ({ pool: `solo ${part}`, beat }))
  ),
  ...Object.entries(DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS).flatMap(([part, beats]) =>
    beats.map(beat => ({ pool: `late ${part}`, beat }))
  ),
  ...Object.entries(DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS).flatMap(([part, beats]) =>
    beats.map(beat => ({ pool: `couple ${part}`, beat }))
  ),
];

describe('Suggestive beats stay clothed', () => {
  it('no beat invites nudity', () => {
    const bad = allSuggestiveBeats()
      .filter(({ beat }) => INVITES_NUDITY_RE.test(stripNegatedClauses(beat)))
      .map(({ pool, beat }) => `${pool}: ${beat}`);
    assert.deepEqual(bad, []);
  });

  it('a robe always has a garment named under it', () => {
    const bare = allSuggestiveBeats()
      .filter(({ beat }) => /\brobe\b/i.test(beat))
      .filter(
        ({ beat }) =>
          !/\b(?:lingerie|bra|panties|camisole|slip|underwear|sleepwear)\b/i.test(beat)
      )
      .map(({ pool, beat }) => `${pool}: ${beat}`);
    assert.deepEqual(bare, []);
  });

  it('the rewritten beats name their clothes for the recipe', () => {
    assert.equal(
      suggestiveBeatClothes('pouring coffee barefoot in a silk robe over a camisole, belted at the waist — leaning on the counter'),
      'a silk robe over a camisole'
    );
    assert.equal(
      suggestiveBeatClothes('sitting on the windowsill in a short robe over a bra and panties, one foot planted on the sill'),
      'a short robe over a bra and panties'
    );
    assert.equal(
      suggestiveBeatClothes('stretching in a camisole and sleep shorts by the window — one arm overhead'),
      'a camisole and sleep shorts'
    );
    assert.equal(
      suggestiveBeatClothes('leaning in the bathroom doorway in a short robe over lingerie, hip against the frame'),
      'a short robe over lingerie'
    );
  });
});
