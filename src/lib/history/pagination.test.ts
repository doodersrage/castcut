import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  paginateItems,
  pageForIndex,
  PROMPT_HISTORY_LIMIT,
} from './pagination';

describe('history-pagination', () => {
  it('keeps a generous history cap', () => {
    assert.ok(PROMPT_HISTORY_LIMIT > 100);
  });

  it('paginates items with safe page bounds', () => {
    const items = Array.from({ length: 30 }, (_, index) => index);
    const first = paginateItems(items, 1, 10);
    assert.deepEqual(first.items, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(first.totalPages, 3);
    assert.equal(first.rangeStart, 1);
    assert.equal(first.rangeEnd, 10);

    const last = paginateItems(items, 99, 10);
    assert.equal(last.page, 3);
    assert.deepEqual(last.items, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  });

  it('maps item index to page number', () => {
    assert.equal(pageForIndex(0, 25), 1);
    assert.equal(pageForIndex(24, 25), 1);
    assert.equal(pageForIndex(25, 25), 2);
  });
});
