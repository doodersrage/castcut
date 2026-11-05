import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageShortcuts } from './page-shortcuts';

test('each page with its own keys is found by its path', () => {
  assert.equal(pageShortcuts('/cut')?.page, 'Cut');
  assert.equal(pageShortcuts('/day')?.page, 'Day');
  assert.equal(pageShortcuts('/fitting')?.page, 'Outfit');
  assert.equal(pageShortcuts('/story')?.page, 'Story');
  assert.equal(pageShortcuts('/gallery')?.page, 'Gallery');
  assert.equal(pageShortcuts('/scene')?.page, 'Scene');
});

test('no keys elsewhere, and no prefix false-match', () => {
  assert.equal(pageShortcuts('/play'), null);
  assert.equal(pageShortcuts('/cutter'), null);
  assert.equal(pageShortcuts(null), null);
});
