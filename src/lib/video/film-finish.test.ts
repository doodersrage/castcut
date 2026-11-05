import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chapterListText,
  chaptersFfmetadata,
  chaptersForFile,
  loudnormFilters,
  normalizeFilmChapters,
  normalizeFilmLoudnessTarget,
  parseLoudnormMeasure,
  normalizeFilmRange,
  srtForRange,
  srtToVtt,
} from './film-finish';

describe('film finish', () => {
  it('reads a range, refusing reversed or tiny ones', () => {
    assert.deepEqual(normalizeFilmRange({ fromSec: 2, toSec: 7.5 }), { fromSec: 2, toSec: 7.5 });
    assert.equal(normalizeFilmRange({ fromSec: 5, toSec: 3 }), null);
    assert.equal(normalizeFilmRange({ fromSec: 1, toSec: 1.2 }), null);
    assert.equal(normalizeFilmRange({ fromSec: -1, toSec: 4 }), null);
    assert.equal(normalizeFilmRange(null), null);
  });

  it('keeps titled chapters, sorted, one per moment', () => {
    assert.deepEqual(
      normalizeFilmChapters([
        { atSec: 10, title: ' The beach ' },
        { atSec: 0, title: 'Morning' },
        { atSec: 10.2, title: 'Too close' },
        { atSec: 4, title: '' },
      ]),
      [
        { atSec: 0, title: 'Morning' },
        { atSec: 10, title: 'The beach' },
      ]
    );
  });

  it('places chapters in the file: an opening at 0, the recap first, the range cut', () => {
    const chapters = [
      { atSec: 5, title: 'Beach' },
      { atSec: 20, title: 'Night' },
    ];
    assert.deepEqual(chaptersForFile({ chapters }), [
      { atSec: 0, title: 'Opening' },
      { atSec: 5, title: 'Beach' },
      { atSec: 20, title: 'Night' },
    ]);
    assert.deepEqual(chaptersForFile({ chapters, offsetSec: 8 }), [
      { atSec: 0, title: 'Previously' },
      { atSec: 13, title: 'Beach' },
      { atSec: 28, title: 'Night' },
    ]);
    assert.deepEqual(chaptersForFile({ chapters, range: { fromSec: 10, toSec: 30 } }), [
      { atSec: 0, title: 'Beach' },
      { atSec: 10, title: 'Night' },
    ]);
    assert.deepEqual(chaptersForFile({ chapters: [] }), []);
  });

  it('writes ffmetadata and a description list', () => {
    const list = [
      { atSec: 0, title: 'Opening' },
      { atSec: 65, title: 'A=B; #1' },
    ];
    const meta = chaptersFfmetadata(list, 90);
    assert.match(meta, /^;FFMETADATA1\n\[CHAPTER\]\nTIMEBASE=1\/1000\nSTART=0\nEND=65000\ntitle=Opening/);
    assert.ok(meta.includes('START=65000\nEND=90000\ntitle=A\\=B\\; \\#1'));
    assert.equal(chapterListText(list), '0:00 Opening\n1:05 A=B; #1');
    assert.equal(chapterListText([{ atSec: 3725, title: 'Late' }]), '1:02:05 Late');
  });

  it('cuts an .srt to the range', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nHello\n\n2\n00:00:09,500 --> 00:00:12,000\nThere\n\n3\n00:00:20,000 --> 00:00:21,000\nGone\n';
    assert.equal(
      srtForRange(srt, { fromSec: 2, toSec: 11 }),
      '1\n00:00:00,000 --> 00:00:01,000\nHello\n\n2\n00:00:07,500 --> 00:00:09,000\nThere\n'
    );
  });

  it('reads a loudnorm measure and builds both passes', () => {
    const stderr = `[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-27.61",\n\t"input_tp" : "-9.80",\n\t"input_lra" : "3.10",\n\t"input_thresh" : "-37.95",\n\t"output_i" : "-14.2",\n\t"target_offset" : "0.21"\n}\n`;
    const measured = parseLoudnormMeasure(stderr);
    assert.deepEqual(measured, {
      inputI: -27.61,
      inputTp: -9.8,
      inputLra: 3.1,
      inputThresh: -37.95,
      targetOffset: 0.21,
    });
    assert.equal(parseLoudnormMeasure('{"input_i":"-inf","input_tp":"-inf","input_lra":"0","input_thresh":"-70","target_offset":"0"}'), null);
    assert.equal(parseLoudnormMeasure('no json'), null);
    const target = { lufs: -14, peakDbtp: -1 };
    assert.equal(loudnormFilters(target), 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json');
    assert.match(
      loudnormFilters(target, measured),
      /^loudnorm=I=-14:TP=-1:LRA=11:measured_I=-27.61:measured_TP=-9.8:measured_LRA=3.1:measured_thresh=-37.95:offset=0.21:linear=true/
    );
    assert.deepEqual(normalizeFilmLoudnessTarget({ lufs: -23, peakDbtp: -1 }), { lufs: -23, peakDbtp: -1 });
    assert.equal(normalizeFilmLoudnessTarget({ lufs: 3, peakDbtp: -1 }), null);
  });

  it('turns an .srt into WebVTT', () => {
    assert.equal(
      srtToVtt('1\n00:00:01,000 --> 00:00:03,250\nHello\nthere\n\n2\n00:01:02,500 --> 00:01:04,000\nBye\n'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:03.250\nHello\nthere\n\n00:01:02.500 --> 00:01:04.000\nBye\n'
    );
  });
});
