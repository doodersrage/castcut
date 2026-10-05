import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS,
  daySlotMatchesAdultMix,
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

  it('a solo beat moved to any slot still fits the mood (Queue does not reroll it)', () => {
    // 2.3 regression sweep: the rewritten windowsill sit lost "lingerie", so outside the morning
    // pool the cue words no longer vouched for it and Queue swapped the slot for another beat.
    const solo = allSuggestiveBeats().filter(({ pool }) => !pool.startsWith('couple'));
    const rerolled: string[] = [];
    for (const { pool, beat } of solo) {
      for (const id of ['morning', 'afternoon-2', 'evening', 'night-2'] as const) {
        const fits = daySlotMatchesAdultMix({
          slot: { id, label: id, location: 'boutique hotel room with soft lamp light', sceneHints: beat },
          dayMood: 'suggestive',
          intimateMix: 'solo',
          allowCompanions: false,
        });
        if (!fits) rerolled.push(`${pool} in ${id}: ${beat}`);
      }
    }
    assert.deepEqual(rerolled, []);
  });

  it('a couple beat still needs companions on, in any slot', () => {
    const beat = DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS.morning[0]!;
    const slot = { id: 'night' as const, label: 'Night', location: 'boutique hotel room', sceneHints: beat };
    assert.equal(
      daySlotMatchesAdultMix({ slot, dayMood: 'suggestive', intimateMix: 'solo', allowCompanions: false }),
      false
    );
  });
});
