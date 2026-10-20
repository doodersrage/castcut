import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roleplayWatchPlaylist } from '../film/character-film';
import type { FilmPlaylistShot } from '../media-kind';
import type { RoleplayStoryBeat } from './roleplay';
import { holdForNarration, storyNarrationLine, storyPreviouslyOnShots } from './film';

const beat = (id: string, extra: Partial<RoleplayStoryBeat> = {}): RoleplayStoryBeat =>
  ({
    id,
    at: 1,
    title: `Scene ${id}`,
    blurb: 'She steps off the night train into the rain. The platform is empty.',
    stillStatus: 'completed',
    imageUrl: `/${id}.png`,
    castId: 'cast-1',
    ...extra,
  }) as RoleplayStoryBeat;

describe('Story film', () => {
  it('narrates a scene with its first sentence, not a talking scene', () => {
    assert.equal(storyNarrationLine(beat('a')), 'She steps off the night train into the rain.');
    assert.equal(storyNarrationLine(beat('a', { line: 'Hi there.' })), '');
    const long = storyNarrationLine(
      beat('b', {
        blurb:
          'She threads through the crowded night market, past steaming dumpling stalls and lantern-lit fortune tellers, toward the old pier where the ferry waits, its horn sounding twice.',
      })
    );
    assert.ok(long.length <= 140 && long.endsWith('.'));
  });
  it('holds a narrated still for its line, fixed when the cut is fitted', () => {
    const still: FilmPlaylistShot = { key: 'k', title: 'K', url: '/k.png', kind: 'still', holdSec: 3 };
    const shot = holdForNarration(
      still,
      'She steps off the night train into the rain and looks around.'
    );
    assert.ok((shot.holdSec ?? 0) > 3);
    assert.equal(shot.holdFixed, true);
  });
  it('cuts a scene\'s close-ups in after it while they match its still', () => {
    const shots = roleplayWatchPlaylist([
      beat('a', {
        angles: [
          { kind: 'face', imageUrl: '/a-face.png', for: '/a.png' },
          { kind: 'detail', imageUrl: '/old.png', for: '/older.png' },
        ],
      }),
      beat('b'),
    ]);
    assert.deepEqual(
      shots.map(shot => shot.url),
      ['/a.png', '/a-face.png', '/b.png']
    );
    assert.equal(shots[1]!.captionless, true);
  });
  it('opens with three shots of the Cast\'s last Story, not this one', () => {
    const sessions = [
      { id: 'now', updatedAt: 9, snapshot: { story: [beat('n')] } },
      { id: 'old', updatedAt: 5, snapshot: { story: [beat('x'), beat('y'), beat('z')] } },
      { id: 'other', updatedAt: 7, snapshot: { story: [beat('o', { castId: 'cast-2' })] } },
    ];
    const recap = storyPreviouslyOnShots(sessions, { castId: 'cast-1', currentSessionId: 'now', name: 'Nora' });
    assert.deepEqual(
      recap.map(shot => shot.url),
      ['/x.png', '/y.png', '/z.png']
    );
    assert.equal(recap[0]!.caption, 'Previously on Nora…');
    assert.equal(recap[1]!.captionless, true);
  });
});

describe('a scene’s own narration', () => {
  it('is said as written; a talking scene still has none', () => {
    assert.equal(
      storyNarrationLine({ blurb: 'She opens the door. Rain pours in.', narration: 'I never should have answered.' }),
      'I never should have answered.'
    );
    assert.equal(storyNarrationLine({ blurb: 'She opens the door.', narration: 'x y z', line: 'Hello?' }), '');
    assert.equal(storyNarrationLine({ blurb: 'She opens the door. Rain pours in.' }), 'She opens the door.');
  });
});
