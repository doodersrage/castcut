import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roomToneBeds, roomTonePlace, roomToneWords } from './room-tone';

// "It should come out like a TV show short rather than glued together short videos" (2026-11-16).
describe('room tone by scene', () => {
  it('names the place from a shot title, possessives dropped', () => {
    assert.equal(roomTonePlace("1C SLYNE'S KITCHEN · Dialogue"), 'kitchen');
    assert.equal(roomTonePlace('2A CITY STREET · Establishing'), 'city street');
    assert.equal(roomTonePlace("9B JASON'S APARTMENT · Dialogue"), 'apartment');
  });

  it("each place's own sound, never voices or music", () => {
    assert.match(roomToneWords('city street'), /traffic/);
    assert.match(roomToneWords('corner cafe'), /café/);
    assert.match(roomToneWords('kitchen'), /quiet room tone of a kitchen/);
    assert.match(roomToneWords('kitchen'), /no voices, no speech, no music/);
  });

  it('one bed per run of a script scene, under all of it; no scene, no bed', () => {
    const beds = roomToneBeds([
      { title: "1A SLYNE'S KITCHEN · Establishing", sceneGroup: 's|kitchen', startSec: 0, durSec: 5 },
      { title: "1B SLYNE'S KITCHEN · Dialogue", sceneGroup: 's|kitchen', startSec: 5, durSec: 4 },
      { title: '2A CITY STREET · Establishing', sceneGroup: 's|street', startSec: 9, durSec: 6 },
      { title: 'A card', startSec: 15, durSec: 3 },
    ]);
    assert.deepEqual(
      beds.map(bed => [bed.place, bed.atSec, bed.seconds]),
      [
        ['kitchen', 0, 9],
        ['city street', 9, 6],
      ]
    );
  });
});

describe('a placed sound that loops (a room tone bed)', () => {
  it('kept looped only with a length to stop at', async () => {
    const { normalizeCutEffects } = await import('../video/cut-sound');
    const [bed, bare] = normalizeCutEffects([
      { id: 'fx-room-1', url: '/a.wav', atSec: 0, lengthSec: 22.5, loop: true },
      { id: 'fx-room-2', url: '/b.wav', atSec: 30, loop: true },
    ]);
    assert.equal(bed!.loop, true);
    assert.equal(bare!.loop, undefined, 'no length: it would never stop');
  });
});
