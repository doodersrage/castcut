import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { feelingTone, tempMusicCues } from './temp-music';

const shot = (title: string, feeling: string, startSec: number, durSec: number) => ({
  key: title,
  title,
  feeling,
  startSec,
  durSec,
});

describe('temp music by scene', () => {
  it('reads a feeling as a score style', () => {
    assert.equal(feelingTone('she cries alone on the stairs'), 'melancholy');
    assert.equal(feelingTone('a first kiss on the balcony'), 'romantic');
    assert.equal(feelingTone('relaxed, cozy'), 'cozy');
    assert.equal(feelingTone('walks to work'), '');
  });

  it('makes one cue per run of shots that feel the same; short runs join', () => {
    const cues = tempMusicCues([
      shot('a', 'happy morning', 0, 5),
      shot('b', 'walks to work', 5, 5),
      shot('c', 'they argue and she storms off', 10, 3),
      shot('d', 'she cries alone', 13, 6),
      shot('e', 'sad, looking out the window', 19, 6),
    ]);
    assert.deepEqual(
      cues.map(c => [c.tone, c.atSec, c.seconds]),
      [
        ['everyday', 0, 13],
        ['melancholy', 13, 12],
      ]
    );
    assert.deepEqual(cues[0]!.shots, ['a', 'b', 'c']);
  });

  it('one feeling for the whole film: no cues (Score this film does that)', () => {
    assert.deepEqual(tempMusicCues([shot('a', 'happy', 0, 10), shot('b', 'smiling', 10, 10)]), []);
  });
});
