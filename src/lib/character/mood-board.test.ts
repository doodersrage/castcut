import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MOOD_BOARD_MAX,
  noteMoodBoardPin,
  normalizeMoodBoard,
  pinToMoodBoard,
  unpinFromMoodBoard,
} from './mood-board';

describe('Cast mood board', () => {
  it('keeps Gallery links, one per picture, no data pictures', () => {
    assert.deepEqual(
      normalizeMoodBoard([
        { id: 'a', url: '/api/gallery/media/1', note: '  warm  light ' },
        { id: 'b', url: '/api/gallery/media/1' },
        { id: 'c', url: 'data:image/png;base64,AA' },
        { id: '', url: '/x' },
        'junk',
      ]),
      [{ id: 'a', url: '/api/gallery/media/1', note: 'warm light' }]
    );
  });

  it('pins, notes and unpins; a full board drops the oldest', () => {
    let board = pinToMoodBoard([], { id: 'a', url: '/1' });
    board = pinToMoodBoard(board, { id: 'b', url: '/1' });
    assert.equal(board.length, 1, 'already pinned');
    board = noteMoodBoardPin(board, 'a', 'the café');
    assert.equal(board[0]!.note, 'the café');
    assert.deepEqual(unpinFromMoodBoard(board, 'a'), []);
    const full = Array.from({ length: MOOD_BOARD_MAX }, (_, i) => ({ id: `p${i}`, url: `/${i}` }));
    const next = pinToMoodBoard(full, { id: 'new', url: '/new' });
    assert.equal(next.length, MOOD_BOARD_MAX);
    assert.equal(next[0]!.id, 'p1');
    assert.equal(next[next.length - 1]!.id, 'new');
  });
});
