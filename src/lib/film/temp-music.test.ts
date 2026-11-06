import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { feelingTone, MAX_CUE_SEC, tempMusicCues } from './temp-music';

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

  it('cuts a long stretch into cues a score can make, so a half hour of one feeling has music', () => {
    const shots = Array.from({ length: 300 }, (_, i) => ({
      key: `k${i}`,
      title: `S${i}`,
      feeling: 'a calm, cozy evening',
      startSec: i * 6,
      durSec: 6,
    }));
    const cues = tempMusicCues(shots);
    assert.equal(cues.length, 15);
    assert.ok(cues.every(cue => cue.tone === 'cozy' && cue.seconds <= MAX_CUE_SEC));
    assert.deepEqual([cues[1]!.atSec, cues[1]!.shots], [120, []]);
    assert.equal(cues.reduce((sum, cue) => sum + cue.seconds, 0), 1800);
    // One feeling over a short film: Score this film is the tool.
    assert.deepEqual(tempMusicCues(shots.slice(0, 10)), []);
  });
});
