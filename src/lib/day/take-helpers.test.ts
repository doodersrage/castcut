import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { locationPictureGraph, locationPicturePrompt } from '@/lib/location/picture';
import { placeShotJob, placeShotStill, takeSceneRoom } from './take-helpers';
import type { DaySlot } from './planner';

describe('a place-only shot (take-helpers.ts)', () => {
  it('the empty place from the shot’s words, indoors unless it says outdoors', () => {
    const job = placeShotJob(
      { location: 'rooftop bar', sceneHints: 'string lights, empty stools' },
      { character: null, leadNoun: 'woman' }
    );
    assert.equal(
      job.prompt,
      locationPicturePrompt({ name: 'rooftop bar', look: 'string lights, empty stools', setting: 'INT' })
    );
    const outdoors = placeShotJob(
      { location: 'a park, outdoors', sceneHints: '' },
      { character: null, leadNoun: 'woman' }
    );
    assert.match(outdoors.prompt, /park/);
    const graph = JSON.parse(job.workflowJson) as Record<string, { class_type: string }>;
    assert.deepEqual(
      Object.values(graph).map(node => node.class_type),
      Object.values(locationPictureGraph({ name: 'x', look: '', setting: 'INT' }, 1)).map(
        node => node.class_type
      )
    );
    assert.equal(placeShotJob({}, { character: null, leadNoun: 'woman' }).prompt.includes('the place'), true);
  });

  it('its still: queued with its job, or an error when it did not queue', () => {
    assert.deepEqual(
      [placeShotStill({ id: 'evening' }, 'p1').status, placeShotStill({ id: 'evening' }, 'p1').promptId],
      ['queued', 'p1']
    );
    assert.equal(placeShotStill({ id: 'evening' }, '').status, 'error');
  });
});

describe('one room a scene (takeSceneRoom)', () => {
  // s22 (2026-11-14): the quiet street's room was made from its words alone — a daylit street —
  // and the scene's night shots dropped it for the plate's studio wall.
  it('makes the room at its shots’ time of day, once a scene', async () => {
    const made: Array<{ name: string; look: string; setting: string }> = [];
    let kept: Record<string, string> = {};
    const input = (rooms: Record<string, string>) => ({
      oneRoom: true,
      rooms,
      link: { scriptId: 's1', sceneId: 'ext-quiet-city-street-night' },
      character: null,
      leadNoun: 'woman' as const,
      render: async (place: { name: string; look: string; setting: string }) => {
        made.push(place);
        return 'scene-room-street.png';
      },
      keep: (next: Record<string, string>) => {
        kept = next;
      },
    });
    const night: DaySlot = { id: 'night', label: '9C', location: 'quiet city street, outdoors' };
    assert.equal(await takeSceneRoom(night, input({})), 'scene-room-street.png');
    assert.equal(made[0]!.setting, 'EXT');
    assert.match(made[0]!.look, /at night.*street lamps/);
    assert.deepEqual(kept, { 's1|ext-quiet-city-street-night': 'scene-room-street.png' });
    // The scene's next shot: the same room, not made again.
    assert.equal(await takeSceneRoom(night, input(kept)), 'scene-room-street.png');
    assert.equal(made.length, 1);
    // A chosen time of day wins; the afternoon keeps the picture's own light.
    await takeSceneRoom({ id: 'morning', label: '1C', timeOfDay: 'evening', location: 'a kitchen' }, input({}));
    assert.match(made[1]!.look, /evening/);
    assert.equal(made[1]!.setting, 'INT');
    await takeSceneRoom({ id: 'afternoon', label: '4B', location: 'a park, outdoors' }, input({}));
    assert.equal(made[2]!.look, '');
    // Off: nothing made.
    assert.equal(await takeSceneRoom(night, { ...input({}), oneRoom: false }), null);
    assert.equal(made.length, 3);
  });
});
