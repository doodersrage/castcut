import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCutShotEdits, withShotSubtitle, type KeyedShot } from './cut-plan';
import { filmShotSubtitle } from '../media/kind';
import { cuesToSrt } from '../video/cut-subtitles';
import {
  filmSubtitleCues,
  matchSrtToShots,
  parseSrt,
  shotSubtitleWindow,
  subtitleIssues,
} from '../video/cut-subtitle-track';

const SRT = `﻿1
00:00:00,500 --> 00:00:02,000
<i>Coffee first.</i>

2
00:00:04,200 --> 00:00:06,000
You always say that.

3
broken block

4
00:00:30,000 --> 00:00:31,000
After the end.
`;

describe('the cut’s subtitle track (M4 F5)', () => {
  it('reads an .srt, tags and BOM aside, and counts what it can’t read', () => {
    const { cues, unread } = parseSrt(SRT);
    assert.equal(unread, 1);
    assert.deepEqual(cues[0], { text: 'Coffee first.', from: 0.5, to: 2 });
    assert.equal(cues.length, 3);
  });

  it('matches cues to the shots their middle falls in, with the window in shot seconds', () => {
    const { cues } = parseSrt(SRT);
    const { matches, outside } = matchSrtToShots(cues, [
      { key: 'day:morning', startSec: 0, durSec: 3 },
      { key: 'day:afternoon', startSec: 3, durSec: 4 },
    ]);
    assert.equal(outside, 1);
    assert.deepEqual(matches, [
      { key: 'day:morning', text: 'Coffee first.', fromSec: 0.5, toSec: 2 },
      { key: 'day:afternoon', text: 'You always say that.', fromSec: 1.2, toSec: 3 },
    ]);
  });

  it('places each shot’s subtitle at film time, inside its window, and round-trips as .srt', () => {
    const cues = filmSubtitleCues([
      { key: 'a', startSec: 0, durSec: 3, text: 'Coffee first.' },
      { key: 'b', startSec: 3, durSec: 4, text: 'You always say that.', fromSec: 1.2, toSec: 3 },
      { key: 'c', startSec: 7, durSec: 2, text: '' },
    ]);
    assert.deepEqual(
      cues.map(cue => [cue.key, cue.from, cue.to]),
      [
        ['a', 0.2, 2.8],
        ['b', 4.2, 6],
      ]
    );
    const back = parseSrt(cuesToSrt(cues)).cues;
    assert.deepEqual(
      back.map(cue => [cue.text, cue.from, cue.to]),
      [
        ['Coffee first.', 0.2, 2.8],
        ['You always say that.', 4.2, 6],
      ]
    );
    assert.deepEqual(shotSubtitleWindow({ durSec: 2, fromSec: 5 }), { from: 2, to: 2 });
  });

  it('flags overlaps, cues too short or long, too many rows and characters an .srt can’t carry', () => {
    const kinds = subtitleIssues([
      { text: 'Hi.', from: 0, to: 0.5 },
      { text: 'A'.repeat(130), from: 0.4, to: 9 },
      { text: 'bell \u0007', from: 10, to: 12 },
    ]).map(issue => `${issue.index}:${issue.kind}`);
    assert.deepEqual(kinds, ['0:overlap', '0:too-short', '1:too-long', '1:rows', '2:characters']);
    assert.deepEqual(subtitleIssues([{ text: 'Fine.', from: 1, to: 3 }]), []);
  });

  it('a subtitle set in Cut wins over the line, and None means none', () => {
    const shot: KeyedShot = { key: 'day:a', title: 'A', url: '/a.mp4', kind: 'clip', spoken: 'Hello.' };
    let edits = withShotSubtitle(undefined, 'day:a', { text: 'Hi there.', fromSec: 0.5, toSec: 2 });
    let [out] = applyCutShotEdits([shot], edits);
    assert.equal(filmShotSubtitle(out!), 'Hi there.');
    assert.equal(out!.subtitleFromSec, 0.5);
    edits = withShotSubtitle(edits, 'day:a', { text: '' });
    [out] = applyCutShotEdits([shot], edits);
    assert.equal(filmShotSubtitle(out!), '');
    assert.equal(out!.subtitleFromSec, undefined);
    edits = withShotSubtitle(edits, 'day:a', {});
    [out] = applyCutShotEdits([shot], edits);
    assert.equal(filmShotSubtitle(out!), 'Hello.');
  });
});
