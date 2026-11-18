import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  JOIN_CROSSFADE_SEC,
  joinCrossfadeFilters,
  planJoinCrossfades,
  type JoinCrossfadeInput,
} from './join-crossfade';

const base = (extra: Partial<JoinCrossfadeInput> = {}): JoinCrossfadeInput => ({
  kinds: ['clip', 'clip', 'clip'],
  holdSecs: [3, 4, 2.5],
  trimStarts: [null, 0.5, null],
  soundLeads: [0, 0, 0],
  soundTails: [0, 0, 0],
  voiced: [true, true, true],
  overlaps: [0, 0, 0],
  fps: 24,
  ...extra,
});

describe('a hard cut’s sound crossfaded (2026-11-18)', () => {
  it('cuts each picture two frames inside its clip; the sound plays on through them', () => {
    const plan = planJoinCrossfades(base());
    const shave = Math.round((2 / 24) * 1000) / 1000;
    assert.deepEqual(plan.crossfades, [false, true, true]);
    // The middle clip loses two frames at each end; the outer ones at their cut only.
    assert.deepEqual(plan.holdSecs, [3 - shave, 4 - 2 * shave, 2.5 - shave].map(v => Math.round(v * 1000) / 1000));
    assert.deepEqual(plan.trimStarts, [null, 0.5 + shave, shave]);
    assert.deepEqual(plan.soundTails, [shave, shave, 0]);
    assert.deepEqual(plan.soundLeads, [0, shave, shave]);
  });

  it('leaves a join that dissolves, a still, a silent or paced clip, a set J/L cut and a continuous take', () => {
    const cases: Array<Partial<JoinCrossfadeInput>> = [
      { overlaps: [0, 0.5, 0] },
      { kinds: ['clip', 'still', 'clip'] },
      { voiced: [true, false, true] },
      { speeds: [1, 0.5, 1] },
      { reverses: [false, true, false] },
      { soundLeads: [0, 0.4, 0], soundTails: [0, 0, 0] },
      { chainOuts: [true, undefined, undefined], chainIns: [undefined, undefined, true] },
    ];
    for (const extra of cases) {
      const plan = planJoinCrossfades(base(extra));
      assert.equal(plan.crossfades[1], false, JSON.stringify(extra));
    }
    // A clip too short to lose its frames keeps them.
    assert.deepEqual(planJoinCrossfades(base({ holdSecs: [3, 1.05, 3] })).crossfades, [false, false, false]);
  });

  it('fades the two sides across the cut, centred on it, equal power', () => {
    const shave = 2 / 24;
    // The shot after: its sound starts `shave` before its picture.
    const after = joinCrossfadeFilters({ pieceSec: 4, lead: shave, tail: 0, fadeIn: true, fadeOut: false });
    assert.equal(after.in, `afade=t=in:st=${(shave - JOIN_CROSSFADE_SEC / 2).toFixed(3)}:d=${JOIN_CROSSFADE_SEC}:curve=qsin`);
    assert.equal(after.out, '');
    // The shot before: its sound runs on `shave` past its picture; faded from 50 ms before the cut.
    const before = joinCrossfadeFilters({ pieceSec: 3, lead: 0, tail: shave, fadeIn: false, fadeOut: true });
    assert.equal(before.out, `afade=t=out:st=${(3 - shave - JOIN_CROSSFADE_SEC / 2).toFixed(3)}:d=${JOIN_CROSSFADE_SEC}:curve=qsin`);
  });
});
