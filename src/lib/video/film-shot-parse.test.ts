import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFilmPlaylistShots } from './film-shot-parse';

describe('film encode request shots (M4 F5)', () => {
  it('keeps every edit the server encode uses', () => {
    const [clip, still] = parseFilmPlaylistShots([
      {
        url: '/a.mp4',
        title: 'Kitchen',
        kind: 'clip',
        trimStartSec: 0.5,
        trimEndSec: 3,
        speed: 0.5,
        reverse: true,
        soundLeadSec: 1,
        soundTailSec: 9,
        volume: 0,
        spoken: 'Coffee first.',
        lowerThird: 'Nora',
        lowerThirdSub: 'The kitchen',
        pipUrl: '/pip.png',
        pipCorner: 'tl',
        transitionIn: { kind: 'cut' },
      },
      {
        url: '/b.png',
        title: 'Rooftop',
        kind: 'still',
        holdSec: 3,
        motion: 'custom',
        moveFrom: 'whole',
        moveTo: 'tight',
        narrationText: 'Later that night.',
        reverse: true,
      },
    ]);
    assert.deepEqual(clip, {
      url: '/a.mp4',
      title: 'Kitchen',
      kind: 'clip',
      spoken: 'Coffee first.',
      volume: 0,
      transitionIn: { kind: 'cut', sec: 0 },
      trimStartSec: 0.5,
      trimEndSec: 3,
      speed: 0.5,
      reverse: true,
      soundLeadSec: 1,
      soundTailSec: 3,
      lowerThird: 'Nora',
      lowerThirdSub: 'The kitchen',
      pipUrl: '/pip.png',
      pipCorner: 'tl',
    });
    // A still: no clip-only fields; a custom move only with both framings.
    assert.equal(still!.reverse, undefined);
    assert.equal(still!.narrationText, 'Later that night.');
    assert.equal(still!.motion, 'custom');
    assert.equal(still!.moveTo, 'tight');
    assert.equal(
      parseFilmPlaylistShots([{ url: '/c.png', kind: 'still', motion: 'custom', moveFrom: 'bogus' }])[0]!
        .motion,
      undefined
    );
    assert.deepEqual(parseFilmPlaylistShots([{ url: '', kind: 'clip' }, null, 'x']), []);
  });
});
