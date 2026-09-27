import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAY_CAST_PLATE_MIN_LONG_EDGE,
  enlargePlayCastPlateLatent,
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
