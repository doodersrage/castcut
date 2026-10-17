import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeCutSources,
  cutRoomRecipeSource,
  cutRoomShots,
  cutRoomSourceShots,
  splitCutRoomKey,
} from './cut-room';
import type { DaySlot, DaySlotStill } from './day-planner';
import type { RoleplayStoryBeat } from './roleplay';

const slots = [
  { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'making coffee' },
  { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'a walk' },
] as DaySlot[];
const stills = [
  { slotId: 'morning', promptId: 'p1', imageUrl: '/m.png', status: 'completed' },
] as DaySlotStill[];
const story = [
  {
    id: 'b1',
    at: 5,
    title: 'The door',
    clipStatus: 'completed',
    clipUrl: '/b1.mp4',
    line: 'Who is there?',
  },
] as unknown as RoleplayStoryBeat[];

describe('Cut room', () => {
  it('keys each shot by its source, Day before Story', () => {
    const bySource = cutRoomSourceShots({ day: { slots, stills }, story });
    assert.deepEqual(
      bySource.day.map(shot => shot.key),
      ['day:morning']
    );
    assert.deepEqual(
      bySource.story.map(shot => shot.key),
      ['story:b1@5']
    );
    assert.equal(bySource.story[0]?.spoken, 'Who is there?');
    const all = cutRoomShots(bySource, ['story', 'day']);
    assert.deepEqual(
      all.map(shot => shot.key),
      ['day:morning', 'story:b1@5']
    );
  });

  it('picks the sources with shots; a picked source with none falls back to the rest', () => {
    const bySource = cutRoomSourceShots({ day: { slots, stills }, story: [] });
    assert.deepEqual(activeCutSources(undefined, bySource), ['day']);
    assert.deepEqual(activeCutSources(['story'], bySource), ['day']);
    const both = cutRoomSourceShots({ day: { slots, stills }, story });
    assert.deepEqual(activeCutSources(['story'], both), ['story']);
    assert.deepEqual(activeCutSources(undefined, both), ['day', 'story']);
  });

  it('splits keys back (a Story key keeps its @); older unprefixed keys are Day', () => {
    assert.deepEqual(splitCutRoomKey('story:b1@5'), { source: 'story', key: 'b1@5' });
    assert.deepEqual(splitCutRoomKey('day:morning#face'), { source: 'day', key: 'morning#face' });
    assert.deepEqual(splitCutRoomKey('night'), { source: 'day', key: 'night' });
    assert.equal(cutRoomRecipeSource(['day', 'story']), 'cast');
    assert.equal(cutRoomRecipeSource(['story']), 'story');
  });
});
