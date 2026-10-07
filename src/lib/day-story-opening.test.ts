import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { storyScenesFromDay } from './day-story-seed';
import type { DayToolCache } from './settings-cache';

const day: DayToolCache = {
  stillsCharacterId: 'cast-a',
  slots: [
    { id: 'morning', label: 'Morning', sceneHints: 'sitting by the window with coffee — Cast alone' },
    { id: 'afternoon', label: 'Afternoon', sceneHints: 'walking through the gallery' },
    { id: 'evening', label: 'Evening', sceneHints: 'standing at the bar with a glass' },
    { id: 'night', label: 'Night', sceneHints: 'lying in bed — both adults fully visible' },
  ],
  stills: [
    { slotId: 'morning', status: 'completed', promptId: 'p1', imageUrl: '/m.png' },
    { slotId: 'afternoon', status: 'queued', promptId: 'p2' },
    { slotId: 'evening', status: 'completed', promptId: 'p3', imageUrl: '/e.png', adultHold: 'withheld' },
    {
      slotId: 'night',
      status: 'completed',
      promptId: 'p4',
      imageUrl: '/n.png',
      finishedUrl: '/n-face.png',
      finishedFor: 'p4',
    },
  ],
};

describe('Day → Story opening scenes', () => {
  it('turns finished, shown stills into scenes in Day order', () => {
    const scenes = storyScenesFromDay({ day, characterId: 'cast-a', now: 1000 });
    assert.deepEqual(
      scenes.map(scene => [scene.title, scene.blurb, scene.imageUrl, scene.stillStatus]),
      [
        ['Morning', 'sitting by the window with coffee', '/m.png', 'completed'],
        ['Night', 'lying in bed', '/n-face.png', 'completed'],
      ]
    );
    assert.equal(scenes[0]!.castId, 'cast-a');
    assert.equal(scenes[1]!.promptId, 'p4');
  });

  it("another Cast's Day gives nothing unless it is parked under them", () => {
    assert.deepEqual(storyScenesFromDay({ day, characterId: 'cast-b' }), []);
    const parked = { ...day, stillsCharacterId: 'cast-b', parkedDays: { 'cast-a': { ...day, at: 1 } } };
    assert.equal(storyScenesFromDay({ day: parked as DayToolCache, characterId: 'cast-a' }).length, 2);
  });
});
