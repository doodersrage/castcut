import { test } from 'node:test';
import assert from 'node:assert/strict';
import { galleryNeighbour } from './useGalleryGridKeys';

// Two rows of three, 100 wide, 120 tall.
const grid = [0, 1, 2, 3, 4, 5].map(index => ({
  top: Math.floor(index / 3) * 120,
  left: (index % 3) * 100,
  width: 100,
}));

test('left and right step through the cards in order, within the ends', () => {
  assert.equal(galleryNeighbour(grid, 1, 'ArrowRight'), 2);
  assert.equal(galleryNeighbour(grid, 3, 'ArrowLeft'), 2);
  assert.equal(galleryNeighbour(grid, 0, 'ArrowLeft'), 0);
  assert.equal(galleryNeighbour(grid, 5, 'ArrowRight'), 5);
});

test('up and down go to the nearest card in the next row', () => {
  assert.equal(galleryNeighbour(grid, 1, 'ArrowDown'), 4);
  assert.equal(galleryNeighbour(grid, 5, 'ArrowUp'), 2);
  // No row below: stays.
  assert.equal(galleryNeighbour(grid, 4, 'ArrowDown'), 4);
});
