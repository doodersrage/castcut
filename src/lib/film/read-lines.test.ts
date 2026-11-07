import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeReadLines, withReadLine } from './read-lines';

describe('lines read aloud, remembered', () => {
  it('keeps the newest, moves a re-read line to the end, drops the oldest past the limit', () => {
    let list = withReadLine({}, 'line:a:Hi', '/a.wav', 2);
    list = withReadLine(list, 'line:b:Yes', '/b.wav', 2);
    list = withReadLine(list, 'line:a:Hi', '/a2.wav', 2);
    assert.deepEqual(list, { 'line:b:Yes': '/b.wav', 'line:a:Hi': '/a2.wav' });
    list = withReadLine(list, 'ad:Waves', '/c.wav', 2);
    assert.deepEqual(Object.keys(list), ['line:a:Hi', 'ad:Waves']);
  });

  it('reads only addresses from what was stored, past the stills’ limit', () => {
    assert.deepEqual(normalizeReadLines(null), {});
    assert.deepEqual(normalizeReadLines({ a: '/a.wav', b: 4, '': '/x.wav' }), { a: '/a.wav' });
    const many = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`k${i}`, `/${i}.wav`]));
    assert.equal(Object.keys(normalizeReadLines(many)).length, 3000);
  });
});
