import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cutBridgeEngine, cutBridgeJoinEdits, nextIncludedShot, placeCutBridge } from './cut-bridge';
import { cutExtraShots } from './cut-room';

describe('cut bridges', () => {
  it('sits right after its first shot, with hard cuts into and out of it', () => {
    const placed = placeCutBridge({
      order: ['day:a', 'day:b', 'day:c'],
      shots: { 'day:b': { transition: 'fade', holdSec: 3 } },
      fromKey: 'day:a',
      toKey: 'day:b',
      bridgeKey: 'x:br',
    });
    assert.deepEqual(placed.order, ['day:a', 'x:br', 'day:b', 'day:c']);
    assert.deepEqual(placed.shots['x:br'], { transition: 'cut' });
    // The join into the next shot stays as it was until the bridge has rendered.
    assert.deepEqual(placed.shots['day:b'], { transition: 'fade', holdSec: 3 });
  });

  it('ready: a hard cut out of the bridge; removed: the old join back', () => {
    const shots = { 'day:b': { transition: 'fade', holdSec: 3 } };
    const ready = cutBridgeJoinEdits(shots, 'day:b', { ready: true });
    assert.deepEqual(ready['day:b'], { transition: 'cut', holdSec: 3 });
    assert.deepEqual(cutBridgeJoinEdits(ready, 'day:b', { ready: false, toWas: 'fade' })['day:b'], {
      transition: 'fade',
      holdSec: 3,
    });
    assert.deepEqual(cutBridgeJoinEdits(ready, 'day:b', { ready: false })['day:b'], { holdSec: 3 });
  });

  it('the next shot skips ones left out of the film', () => {
    const shots = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    assert.equal(nextIncludedShot(shots, 'a', shot => shot.key !== 'b')?.key, 'c');
    assert.equal(nextIncludedShot(shots, 'c', () => true), null);
  });

  it('H3 when installed, else LTX-2.5', () => {
    assert.equal(cutBridgeEngine(new Set(['MiniMaxH3ImageToVideo']), 'MiniMaxH3ImageToVideo'), 'minimax-h3');
    assert.equal(cutBridgeEngine(new Set(), 'MiniMaxH3ImageToVideo'), 'ltx-video-2.5');
    assert.equal(cutBridgeEngine(null, 'MiniMaxH3ImageToVideo'), 'ltx-video-2.5');
  });

  it('only a rendered bridge is a shot (a clip)', () => {
    const shots = cutExtraShots(
      [
        { key: 'x:1', kind: 'bridge', from: 'a', to: 'b', status: 'rendering', promptId: 'p' },
        { key: 'x:2', kind: 'bridge', from: 'b', to: 'c', status: 'ready', url: '/clip.mp4' },
        { key: 'x:3', kind: 'bridge', from: 'c', to: 'd', status: 'failed' },
      ],
      [],
      () => ''
    );
    assert.deepEqual(
      shots.map(shot => [shot.key, shot.kind, shot.url]),
      [['x:2', 'clip', '/clip.mp4']]
    );
  });
});
