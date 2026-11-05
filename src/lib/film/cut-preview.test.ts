import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CREDITS_SHOT,
  formatCutTimecode,
  previewFrameAt,
  previewTimeline,
} from './cut-preview';
import { creditsDurationSec, creditsRollTop, normalizeFilmCredits } from '../video/polish';

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

describe('formatCutTimecode', () => {
  it('reads hours:minutes:seconds:frames at 30 fps', () => {
    assert.equal(formatCutTimecode(0), '00:00:00:00');
    assert.equal(formatCutTimecode(1), '00:00:01:00');
    assert.equal(formatCutTimecode(83.4), '00:01:23:12');
    assert.equal(formatCutTimecode(3725.5), '01:02:05:15');
    assert.equal(formatCutTimecode(1 / 30), '00:00:00:01');
    assert.equal(formatCutTimecode(-2), '00:00:00:00');
  });
});

describe('end credits', () => {
  it('reads the lines, times the roll and puts it last on the timeline', () => {
    const lines = normalizeFilmCredits('\n Starring \nRae\n\nMade with Castcut\n\n');
    assert.deepEqual(lines, ['Starring', 'Rae', '', 'Made with Castcut']);
    assert.equal(creditsDurationSec([]), 0);
    assert.equal(creditsDurationSec(lines), 5.8);
    assert.equal(creditsDurationSec(Array(60).fill('x')), 30);
    assert.equal(creditsRollTop(0, 6, 720, 200), 720);
    assert.equal(creditsRollTop(6, 6, 720, 200), -200);
    const timeline = previewTimeline({
      shots,
      clipSecs: [null, 4, null],
      crossfadeSec: 0,
      titleCard: false,
      captions: false,
      creditsSec: 6,
    });
    const last = timeline.items[timeline.items.length - 1]!;
    assert.equal(last.shot, CREDITS_SHOT);
    assert.equal(last.kind, 'title');
    assert.equal(last.durSec, 6);
    assert.equal(timeline.totalSec, last.startSec + 6);
  });
});
