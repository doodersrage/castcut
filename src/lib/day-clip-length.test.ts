import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayClipFrames,
  dayClipSeconds,
  normalizeDayClipExtraSeconds,
} from './day-clip-length';
import { H3_MODEL_ID } from './h3-renderer';
import { LTX25_MODEL_ID } from './ltx25-renderer';

describe('day clip length', () => {
  it('keeps the old defaults with no extra seconds', () => {
    assert.equal(dayClipFrames({ speaking: false, conversation: false }), 64);
    assert.equal(dayClipFrames({ speaking: true, conversation: false }), 80);
    assert.equal(dayClipFrames({ speaking: true, conversation: true }), 96);
  });

  it('adds the picked seconds at 16 fps', () => {
    assert.equal(dayClipFrames({ speaking: false, conversation: false, extraSeconds: 4 }), 128);
    assert.equal(dayClipFrames({ speaking: true, conversation: true, extraSeconds: 6 }), 192);
  });

  it('ignores lengths that are not offered', () => {
    assert.equal(normalizeDayClipExtraSeconds(3), 0);
    assert.equal(normalizeDayClipExtraSeconds('abc'), 0);
    assert.equal(normalizeDayClipExtraSeconds('6'), 6);
  });

  it('reports seconds per engine', () => {
    assert.equal(dayClipSeconds(128, 'wan-video'), 8);
    assert.ok(Math.abs(dayClipSeconds(128, LTX25_MODEL_ID) - 8) < 0.1);
    // H3's shortest trained length is ~5 s, so the 4 s default comes out longer there.
    assert.ok(dayClipSeconds(64, H3_MODEL_ID) >= 5);
  });
});
