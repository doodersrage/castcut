import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cuesToSrt, speechSpanFromSilence, subtitleChunks, subtitleCues } from './cut-subtitles';

describe('cut subtitles', () => {
  it('splits a line into short phrases', () => {
    assert.deepEqual(subtitleChunks('Morning! Did you sleep well?'), ['Morning!', 'Did you sleep well?']);
    const long = subtitleChunks(
      'I was thinking we could walk down to the harbour, get coffee at the little place by the boats, and just sit for a while.'
    );
    assert.ok(long.length >= 3);
    assert.ok(long.every(chunk => chunk.length <= 42), JSON.stringify(long));
    assert.equal(long.join(' '), 'I was thinking we could walk down to the harbour, get coffee at the little place by the boats, and just sit for a while.');
  });

  it('spreads phrases over the speech, joining them when time is short', () => {
    const cues = subtitleCues('Morning! Did you sleep well?', { from: 0.5, to: 3.5 });
    assert.equal(cues.length, 2);
    assert.equal(cues[0]!.from, 0.5);
    assert.equal(cues[1]!.to, 3.5);
    assert.ok(cues[0]!.to < cues[1]!.to && cues[0]!.to === cues[1]!.from);
    assert.equal(subtitleCues('One. Two. Three. Four.', { from: 0, to: 1.5 }).length, 1);
  });

  it('finds the speech between leading and trailing silence', () => {
    const log =
      '[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 0.62 | silence_duration: 0.62\n' +
      '[silencedetect @ 0x1] silence_start: 1.9\n[silencedetect @ 0x1] silence_end: 2.2 | silence_duration: 0.3\n' +
      '[silencedetect @ 0x1] silence_start: 4.31\n';
    assert.deepEqual(speechSpanFromSilence(log, 5), { from: 0.62, to: 4.31 });
    assert.deepEqual(speechSpanFromSilence('', 5), { from: 0, to: 5 });
    assert.equal(speechSpanFromSilence('silence_start: 0\nsilence_end: 5', 5), null);
  });

  it('writes srt', () => {
    assert.equal(
      cuesToSrt([
        { text: 'Hello.', from: 1.5, to: 2.25 },
        { text: 'Bye.', from: 62, to: 63.1 },
      ]),
      '1\n00:00:01,500 --> 00:00:02,250\nHello.\n\n2\n00:01:02,000 --> 00:01:03,100\nBye.\n'
    );
  });
});
