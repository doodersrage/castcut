import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { levelsOf, meterFraction, METER_FLOOR_DB } from './cut-meter';

describe('cut meter maths', () => {
  it('reads peak and RMS in dBFS', () => {
    const full = levelsOf([1, -1, 1, -1]);
    assert.equal(full.peakDb, 0);
    assert.equal(full.rmsDb, 0);
    const half = levelsOf([0.5, -0.5]);
    assert.ok(Math.abs(half.peakDb - -6.0206) < 1e-3);
    assert.equal(levelsOf([0, 0]).peakDb, -Infinity);
    assert.equal(levelsOf([]).rmsDb, -Infinity);
  });

  it('fills the bar linearly in dB from the floor', () => {
    assert.equal(meterFraction(-Infinity), 0);
    assert.equal(meterFraction(METER_FLOOR_DB - 5), 0);
    assert.equal(meterFraction(0), 1);
    assert.equal(meterFraction(3), 1);
    assert.equal(meterFraction(METER_FLOOR_DB / 2), 0.5);
  });
});
