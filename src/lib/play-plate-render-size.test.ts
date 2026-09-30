import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAY_CAST_PLATE_MIN_LONG_EDGE,
  enlargePlayCastPlateLatent,
  fitPlayCastPlateLatent,
  PLAY_FACE_CROP_CANVAS,
} from './play-plate-render-size';

test('enlargePlayCastPlateLatent steps a 1328 square plate up to 1536', () => {
  const next = enlargePlayCastPlateLatent({ width: 1328, height: 1328 }, 'qwen-rapid-aio-edit');
  assert.deepEqual(next, { width: 1536, height: 1536 });
  assert.ok(Math.max(next!.width, next!.height) >= PLAY_CAST_PLATE_MIN_LONG_EDGE);
});

test('enlargePlayCastPlateLatent keeps aspect and snaps to 8px', () => {
  const next = enlargePlayCastPlateLatent(
    { width: 1104, height: 1472 },
    'qwen-rapid-aio-edit-nsfw'
  );
  assert.ok(next);
  assert.equal(next.height, 1536);
  assert.equal(next.width % 8, 0);
  assert.equal(next.height % 8, 0);
});

test('enlargePlayCastPlateLatent leaves an already-large plate alone', () => {
  assert.equal(
    enlargePlayCastPlateLatent({ width: 928, height: 1664 }, 'qwen-image-edit-2511'),
    null
  );
});

test('enlargePlayCastPlateLatent does not leave the Lightning ladder', () => {
  assert.equal(
    enlargePlayCastPlateLatent({ width: 1328, height: 1328 }, 'qwen-image-edit-2511-lightning-8'),
    null
  );
});

test('fitPlayCastPlateLatent keeps a 1104×1472 plate at its own size', () => {
  assert.deepEqual(fitPlayCastPlateLatent({ width: 1104, height: 1472 }, 'qwen-rapid-aio-edit'), {
    width: 1104,
    height: 1472,
  });
});

test('fitPlayCastPlateLatent raises a small plate to 1328 and caps a big one at 1536', () => {
  const small = fitPlayCastPlateLatent({ width: 600, height: 800 }, 'qwen-rapid-aio-edit');
  assert.equal(Math.max(small!.width, small!.height), 1328);
  const big = fitPlayCastPlateLatent({ width: 1536, height: 2048 }, 'qwen-rapid-aio-edit');
  assert.deepEqual(big, { width: 1152, height: 1536 });
});

test('fitPlayCastPlateLatent leaves Lightning to its ladder', () => {
  assert.equal(
    fitPlayCastPlateLatent({ width: 1104, height: 1472 }, 'qwen-image-edit-2511-lightning-8'),
    null
  );
});

test('face-crop Play stills get the 3:4 portrait canvas, not the square sidebar', () => {
  assert.deepEqual(fitPlayCastPlateLatent(PLAY_FACE_CROP_CANVAS, 'qwen-rapid-aio-edit'), {
    width: 1104,
    height: 1472,
  });
});
