import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeWideStills, withWideStill } from './wide-stills';

describe('widened stills, remembered', () => {
  it('keeps the newest, moves a re-widened still to the end, drops the oldest past the limit', () => {
    let list = withWideStill({}, '/a.png', '/a-wide.png', 2);
    list = withWideStill(list, '/b.png', '/b-wide.png', 2);
    list = withWideStill(list, '/a.png', '/a-wide2.png', 2);
    assert.deepEqual(list, { '/b.png': '/b-wide.png', '/a.png': '/a-wide2.png' });
    list = withWideStill(list, '/c.png', '/c-wide.png', 2);
    assert.deepEqual(Object.keys(list), ['/a.png', '/c.png']);
  });

  it('reads only addresses from what was stored', () => {
    assert.deepEqual(normalizeWideStills(null), {});
    assert.deepEqual(normalizeWideStills({ '/a.png': '/w.png', '/b.png': 4, '': '/x.png' }), {
      '/a.png': '/w.png',
    });
  });
});
