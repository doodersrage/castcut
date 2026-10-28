import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCutShotEdits, withShotSubtitle, type KeyedShot } from './cut-plan';
import { filmShotSubtitle } from '../media/kind';
import { cuesToSrt } from '../video/cut-subtitles';
import {
  cleanSubtitleCues,
  filmSubtitleCues,
  joinSubtitleCues,
  matchSrtToShots,
  parseSrt,
  shotSubtitleWindow,
  splitShotSubtitle,
  splitSubtitleCue,
  subtitleIssues,
} from '../video/cut-subtitle-track';
import { parseFilmPlaylistShots } from '../video/film-shot-parse';

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

  // M10 T3: a shot's subtitle as your own timed cues.
  it('splits a shot into timed cues at its sentences, else its middle word, and joins them back', () => {
    const shot = { key: 'a', startSec: 10, durSec: 6, text: 'Coffee first. You always say that.' };
    const cues = splitShotSubtitle(shot);
    assert.deepEqual(
      cues.map(cue => cue.text),
      ['Coffee first.', 'You always say that.']
    );
    assert.equal(cues[0]!.fromSec, 0.2);
    assert.equal(cues[1]!.toSec, 5.8);
    assert.equal(cues[0]!.toSec, cues[1]!.fromSec);

    const one = splitShotSubtitle({ key: 'b', startSec: 0, durSec: 4, text: 'Then we walk home' });
    assert.deepEqual(
      one.map(cue => cue.text),
      ['Then we', 'walk home']
    );
    assert.deepEqual(splitShotSubtitle({ key: 'c', startSec: 0, durSec: 4, text: 'Hi.' }), []);

    const three = splitSubtitleCue(cues, 1);
    assert.deepEqual(
      three.map(cue => cue.text),
      ['Coffee first.', 'You always', 'say that.']
    );
    assert.equal(three[1]!.fromSec, cues[1]!.fromSec);
    assert.equal(three[2]!.toSec, cues[1]!.toSec);
    assert.deepEqual(joinSubtitleCues(three, 1), cues);
    assert.deepEqual(joinSubtitleCues(three, 2), three);
  });

  it('your cues play at their times in the film, kept inside the shot; and go out in the .srt', () => {
    const cues = filmSubtitleCues([
      {
        key: 'a',
        startSec: 10,
        durSec: 4,
        text: 'Coffee first. You always say that.',
        cues: [
          { text: 'Coffee first.', fromSec: 0.5, toSec: 1.5 },
          { text: 'You always say that.', fromSec: 2, toSec: 9 },
        ],
      },
    ]);
    assert.deepEqual(cues, [
      { key: 'a', text: 'Coffee first.', from: 10.5, to: 11.5 },
      { key: 'a', text: 'You always say that.', from: 12, to: 14 },
    ]);
    assert.match(cuesToSrt(cues), /00:00:12,000 --> 00:00:14,000\nYou always say that\./);
  });

  it('keeps cleaned cues through the edit, the plan and the encode payload', () => {
    assert.deepEqual(
      cleanSubtitleCues([
        { text: ' B ', fromSec: 3, toSec: 4 },
        { text: 'A', fromSec: 1, toSec: 2 },
        { text: '', fromSec: 0, toSec: 1 },
        { text: 'backwards', fromSec: 5, toSec: 4 },
        'junk',
      ]),
      [
        { text: 'A', fromSec: 1, toSec: 2 },
        { text: 'B', fromSec: 3, toSec: 4 },
      ]
    );
    const shot: KeyedShot = { key: 'day:a', title: 'A', url: '/a.mp4', kind: 'clip', spoken: 'Hello. Bye.' };
    const set = [
      { text: 'Hello.', fromSec: 0.2, toSec: 1 },
      { text: 'Bye.', fromSec: 1.2, toSec: 2 },
    ];
    const edits = withShotSubtitle(undefined, 'day:a', { text: 'Hello. Bye.', cues: set });
    const [out] = applyCutShotEdits([shot], edits);
    assert.deepEqual(out!.subtitleCues, set);
    const [parsed] = parseFilmPlaylistShots([{ ...out!, url: '/api/comfyui/view?filename=a.mp4' }]);
    assert.deepEqual(parsed?.subtitleCues, set);
    // Back to one subtitle: the cues go.
    const [back] = applyCutShotEdits([shot], withShotSubtitle(edits, 'day:a', { text: 'Hello. Bye.' }));
    assert.equal(back!.subtitleCues, undefined);
  });

  it('an .srt with two cues on a shot keeps both at their times', () => {
    const { matches } = matchSrtToShots(
      [
        { text: 'Coffee first.', from: 0.5, to: 2 },
        { text: 'You always\nsay that.', from: 2.5, to: 3.5 },
      ],
      [{ key: 'a', startSec: 0, durSec: 4 }]
    );
    assert.deepEqual(matches[0]?.cues, [
      { text: 'Coffee first.', fromSec: 0.5, toSec: 2 },
      { text: 'You always\nsay that.', fromSec: 2.5, toSec: 3.5 },
    ]);
  });
});
