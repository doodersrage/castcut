import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectDiskCacheEvictions, type DiskCacheFileInfo } from './view-cache';

function entry(key: string, bytes: number, mtimeMs: number): DiskCacheFileInfo {
  return { key, bytes, mtimeMs };
}

test('selectDiskCacheEvictions: returns nothing when under budget', () => {
  const entries = [entry('a', 100, 1), entry('b', 100, 2)];
  const evicted = selectDiskCacheEvictions(entries, 1000);
  assert.equal(evicted.size, 0);
});

test('selectDiskCacheEvictions: returns nothing for an empty list', () => {
  const evicted = selectDiskCacheEvictions([], 1000);
  assert.equal(evicted.size, 0);
});

test('selectDiskCacheEvictions: evicts oldest entries first until under budget', () => {
  const entries = [
    entry('oldest', 400, 1),
    entry('middle', 400, 2),
    entry('newest', 400, 3),
  ];
  // Total is 1200; budget 1000 means we need to shed at least 200 bytes,
  // which only requires evicting the oldest entry (400 bytes freed).
  const evicted = selectDiskCacheEvictions(entries, 1000);
  assert.deepEqual([...evicted], ['oldest']);
});

test('selectDiskCacheEvictions: keeps evicting until the budget is met', () => {
  const entries = [
    entry('oldest', 100, 1),
    entry('second', 100, 2),
    entry('third', 100, 3),
    entry('newest', 100, 4),
  ];
  // Total 400, budget 150 — must evict oldest three (300 bytes) to reach 100 <= 150.
  const evicted = selectDiskCacheEvictions(entries, 150);
  assert.deepEqual([...evicted].sort(), ['oldest', 'second', 'third'].sort());
});

test('selectDiskCacheEvictions: exactly at budget evicts nothing', () => {
  const entries = [entry('a', 500, 1), entry('b', 500, 2)];
  const evicted = selectDiskCacheEvictions(entries, 1000);
  assert.equal(evicted.size, 0);
});
