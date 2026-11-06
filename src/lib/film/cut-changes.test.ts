import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cutChangesSince } from './cut-changes';
import { DEFAULT_FILM_CUT_OPTIONS } from '@/components/FilmCutOptionsControls';

describe('changes since the last cut', () => {
  it('names what moved, in plain lines', () => {
    const before = {
      ...DEFAULT_FILM_CUT_OPTIONS,
      shotEdits: { order: ['a', 'b', 'c'], shots: { a: { trimStartSec: 1 }, c: { include: false } } },
    };
    const after = {
      ...before,
      look: 'warm',
      shotEdits: {
        order: ['b', 'a', 'c'],
        shots: { a: { trimStartSec: 2 }, b: { include: false, grade: { exposure: 0.2 } }, c: {} },
      },
    };
    assert.deepEqual(cutChangesSince(before as never, after as never, key => key.toUpperCase()), [
      '1 shot left out: B',
      '1 shot put back: C',
      'Shots moved',
      '1 clip trimmed: A',
      'Colour changed on 1 shot: B',
      'The film’s look changed',
    ]);
    assert.deepEqual(cutChangesSince(before as never, before as never), []);
  });
});
