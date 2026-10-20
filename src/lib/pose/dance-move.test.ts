import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DANCE_MOVE_LIMBS, DANCE_MOVE_WORDS, danceMoveFor, type DanceMove } from './dance-move';
import { DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS, DAY_LATE_SLOT_BEAT_PRESETS } from '../day/planner';

describe('dance moves', () => {
  it('keep a move the beat names', () => {
    assert.equal(danceMoveFor('dancing barefoot at the shoreline — both arms out mid-spin'), 'spin');
    assert.equal(danceMoveFor('dancing in the kitchen, hands in her hair'), 'hair');
    assert.equal(danceMoveFor('DANCING on the terrace — one arm raised high'), 'one_up');
    assert.equal(danceMoveFor('dancing with both arms up under club lights'), 'overhead');
  });

  it('give different dances different moves, not one for all', () => {
    const beats = [
      'dancing alone in the kitchen, singing along to the radio',
      'DANCING alone on the patio in evening wear — hips mid-sway, three-quarter turn',
      'DANCING under rooftop string lights — hips mid-sway, evening wear',
      'DANCING on a rooftop bar terrace at dusk — dress swinging',
      'DANCING alone on a terrace at blue hour — hips mid-sway, evening wear',
      'dancing under colored club lights, hips mid-sway',
      'dancing at a wedding reception',
      'dancing in the living room to an old record',
    ];
    const moves = new Set(beats.map(beat => danceMoveFor(beat)));
    assert.ok(moves.size >= 3, `only ${[...moves].join(', ')}`);
  });

  it('are the same move for the beat, the guide text and the finished prompt', () => {
    for (const beat of [
      'dancing alone in the kitchen, singing along to the radio',
      'DANCING alone on the patio in evening wear — hips mid-sway, three-quarter turn',
      'dancing at a wedding reception',
    ]) {
      const move = danceMoveFor(beat);
      // The guide reads the beat with a stance directive after it.
      assert.equal(danceMoveFor(`${beat} · nuclear Image 3 silhouette — never planted fashion stand`), move);
      // The prompt carries the recipe's sentence, built from the beat, before the Moment.
      const prompt = `Edit Image 1: Day photo: One woman alone. She dances, ${DANCE_MOVE_WORDS[move]}. Moment: ${beat}. Place: x.`;
      assert.equal(danceMoveFor(prompt), move, beat);
    }
  });

  it('every move is drawn off her sides, feet on or near the floor', () => {
    for (const move of Object.keys(DANCE_MOVE_LIMBS) as DanceMove[]) {
      const limbs = DANCE_MOVE_LIMBS[move];
      // Hips are drawn at y 0.5: hands above the waist, no foot above the hip.
      assert.ok(Math.max(limbs.lWrist.y, limbs.rWrist.y) < 0.4, move);
      assert.ok(Math.min(limbs.lAnkle.y, limbs.rAnkle.y) > 0.5, move);
    }
  });

  it('the planner beats no longer spell out arms overhead', () => {
    const dances = [
      ...Object.values(DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS).flat(),
      ...Object.values(DAY_LATE_SLOT_BEAT_PRESETS).flat(),
    ].filter(beat => /\bdanc/i.test(beat) && !/\b(?:partner|friend|with\s+(?:him|her))\b/i.test(beat));
    assert.ok(dances.length > 0);
    for (const beat of dances) assert.doesNotMatch(beat, /arms?\s+(?:raised|up|overhead)/i, beat);
  });
});
