import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mixLevelsSummary, normalizeMusicLevel, normalizeVoiceLevel } from './mix-levels';

describe('audio mix levels', () => {
  it('defaults to as-recorded and clamps', () => {
    assert.equal(normalizeMusicLevel(undefined), 1);
    assert.equal(normalizeMusicLevel(3), 1.5);
    assert.equal(normalizeMusicLevel(-1), 0);
    assert.equal(normalizeVoiceLevel(0.1), 0.5);
    assert.equal(normalizeVoiceLevel('1.25'), 1.25);
    assert.equal(normalizeVoiceLevel('loud'), 1);
  });

  it('summarises only what moved', () => {
    assert.equal(mixLevelsSummary(), '');
    assert.equal(mixLevelsSummary(0.6, 1.5), 'music 60% · lines 150%');
  });
});
