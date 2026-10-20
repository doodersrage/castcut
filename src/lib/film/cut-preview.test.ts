import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { previewFrameAt, previewTimeline } from './cut-preview';

const shots = [
  { title: 'Morning', url: '/m.png', kind: 'still' as const, holdSec: 3 },
  { title: 'Noon', url: '/n.mp4', kind: 'clip' as const, trimStartSec: 1, trimEndSec: 3 },
  { title: 'Night', url: '/x.png', kind: 'still' as const, holdSec: 2 },
];

describe('cut preview timeline', () => {
  it('lays shots end to end with trims and the title card', () => {
    const timeline = previewTimeline({
      shots,
      clipSecs: [null, 6, null],
      crossfadeSec: 0,
      titleCard: true,
      captions: true,
    });
    assert.deepEqual(
      timeline.items.map(item => [item.kind, item.startSec, item.durSec, item.fromSec]),
      [
        ['title', 0, 2.4, 0],
        ['still', 2.4, 3, 0],
        ['clip', 5.4, 2, 1],
        ['still', 7.4, 2, 0],
      ]
    );
    assert.equal(timeline.totalSec, 9.4);
    assert.equal(timeline.items[1]!.caption, 'Morning');
    // Zoom direction follows the server graph's position (title and clips count).
    assert.deepEqual(
      timeline.items.filter(item => item.kind === 'still').map(item => item.stillIndex),
      [1, 3]
    );
  });

  it('overlaps shots by the crossfade and fades the next one in', () => {
    const timeline = previewTimeline({
      shots,
      clipSecs: [null, 6, null],
      crossfadeSec: 0.5,
      titleCard: false,
      captions: false,
    });
    assert.deepEqual(
      timeline.items.map(item => item.startSec),
      [0, 2.5, 4]
    );
    assert.equal(timeline.totalSec, 6);
    const fading = previewFrameAt(timeline, 2.75);
    assert.equal(fading.length, 2);
    assert.equal(fading[0]!.item.kind, 'still');
    assert.equal(fading[1]!.alpha, 0.5);
    assert.equal(previewFrameAt(timeline, 1)[0]!.local, 1);
    // Past the end: the last frame stays.
    assert.equal(previewFrameAt(timeline, 99)[0]!.item.shot, 2);
  });
});

describe('preview timeline with clip speed', () => {
  it('a clip at 2× holds half as long and plays its file at 2×', async () => {
    const { previewTimeline } = await import('./cut-preview');
    const timeline = previewTimeline({
      shots: [{ title: 'c', url: '/c.mp4', kind: 'clip', speed: 2 }],
      clipSecs: [6],
      crossfadeSec: 0,
      titleCard: false,
      captions: false,
    });
    assert.equal(timeline.items[0]?.durSec, 3);
    assert.equal(timeline.items[0]?.speed, 2);
  });
});
