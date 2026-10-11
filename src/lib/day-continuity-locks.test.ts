import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayContinuityLocks } from './day-continuity-locks';

describe('day continuity locks', () => {
  const base = {
    cast: { id: 'nora-1', name: 'Nora' },
    hasPlate: true,
    faceFinish: true,
    clothing: { summary: 'Sage slip dress', set: true },
    differingSlots: 1,
    slots: [{ location: 'kitchen' }, { location: 'park' }, { location: 'bedroom' }],
    weather: 'rain',
  };

  it('says what is held across the Day', () => {
    const locks = dayContinuityLocks(base);
    assert.deepEqual(
      locks.map(lock => [lock.id, lock.held]),
      [
        ['face', true],
        ['clothes', true],
        ['place', true],
        ['style', true],
      ]
    );
    assert.equal(locks[0]!.label, 'Face · plate + face finish');
    assert.equal(locks[1]!.label, 'Clothes · Sage slip dress (1 slot differ)');
    assert.match(locks[2]!.label, /^Place · .+ home \(2\)$/);
    assert.equal(locks[3]!.label, 'Weather · rain');
  });

  it('and what each still is free to change', () => {
    const locks = dayContinuityLocks({
      ...base,
      hasPlate: false,
      clothing: { summary: 'No kit — Day picks one per slot', set: false },
      slots: [{ location: 'park' }],
      weather: '',
      cast: { id: 'nora-1', name: 'Nora', places: { home: { off: true } } },
    });
    assert.ok(locks.every(lock => !lock.held));
    assert.equal(locks[2]!.label, 'Place · each setting its own');
    const off = dayContinuityLocks({
      ...base,
      cast: { id: 'nora-1', places: { home: { off: true } } },
    });
    assert.equal(off[2]!.label, 'Place · places off');
  });
});
