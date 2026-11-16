import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

mock.module('./score', {
  namedExports: {
    requestFilmScore: async () => ({ url: '/api/comfyui/view?filename=cue.mp3' }),
  },
});

describe('Music by scene made again replaces its cues (the flagship, 2026-11-15)', () => {
  // Made three times, the cues stacked: three tracks over each other.
  it('takes the earlier cues off once, before the first new one goes on', async () => {
    const { makeTempMusic, TEMP_MUSIC_CUE_PREFIX } = await import('./temp-music-client');
    const calls: string[] = [];
    const result = await makeTempMusic(
      [
        { tone: 'everyday', atSec: 0, seconds: 20, shots: ['1A'] },
        { tone: 'cozy', atSec: 20, seconds: 15, shots: ['2A'] },
      ],
      id => calls.push(`add ${id.startsWith(TEMP_MUSIC_CUE_PREFIX)}`),
      undefined,
      () => calls.push('replace')
    );
    assert.equal(result.made, 2);
    assert.deepEqual(calls, ['replace', 'add true', 'add true']);
  });
});
