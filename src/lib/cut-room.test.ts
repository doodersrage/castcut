import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeCutSources,
  cutCopyKey,
  cutExtraShots,
  cutRoomRecipeSource,
  cutRoomShots,
  cutRoomSourceShots,
  splitCutRoomKey,
} from './cut-room';
import type { DaySlot, DaySlotStill } from './day/planner';
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

describe('Cut room: added shots', () => {
  const originals = [
    { key: 'day:afternoon', title: 'Afternoon', url: '/a.mp4', kind: 'clip' as const },
  ];
  it('turns media, text cards and copies into shots (a copy of a gone shot is dropped)', () => {
    const shots = cutExtraShots(
      [
        { key: 'x:1', kind: 'media', title: 'Gallery still', url: '/g.png', shotKind: 'still' },
        { key: 'x:2', kind: 'text', text: 'Three weeks later' },
        { key: 'day:afternoon~2', kind: 'copy', of: 'day:afternoon' },
        { key: 'day:gone~2', kind: 'copy', of: 'day:gone' },
      ],
      originals,
      extra => `data:text/${extra.text}`
    );
    assert.deepEqual(
      shots.map(shot => [shot.key, shot.kind, shot.title]),
      [
        ['x:1', 'still', 'Gallery still'],
        ['x:2', 'still', 'Three weeks later'],
        ['day:afternoon~2', 'clip', 'Afternoon (copy)'],
      ]
    );
    assert.equal(shots[1]?.url, 'data:text/Three weeks later');
  });

  it('copy keys never clash; added keys are their own source', () => {
    assert.equal(cutCopyKey('day:a', new Set(['day:a', 'day:a~2'])), 'day:a~3');
    assert.equal(cutCopyKey('day:a~2', new Set(['day:a~2'])), 'day:a~3');
    assert.deepEqual(splitCutRoomKey('x:abc'), { source: 'added', key: 'x:abc' });
    assert.deepEqual(splitCutRoomKey('day:morning~2'), { source: 'day', key: 'morning~2' });
  });
});

describe('Cut room: generated shots', () => {
  it('join the film only once rendered, as the kind asked for', () => {
    const shots = cutExtraShots(
      [
        { key: 'x:a', kind: 'generated', prompt: 'harbour at dawn', shotKind: 'still', status: 'rendering', promptId: 'p1' },
        {
          key: 'x:b',
          kind: 'generated',
          prompt: 'waves on a beach',
          shotKind: 'clip',
          status: 'ready',
          stage: 'clip',
          stillUrl: '/still.png',
          url: '/clip.mp4',
        },
        { key: 'x:c', kind: 'generated', prompt: 'rain', shotKind: 'still', status: 'failed' },
      ],
      [],
      () => ''
    );
    assert.deepEqual(shots, [
      { key: 'x:b', title: 'waves on a beach', url: '/clip.mp4', kind: 'clip', thumbUrl: '/still.png' },
    ]);
  });
});

describe('Cut room: longer clips', () => {
  it('stand in for their clip once ready, keeping its settings', () => {
    const original = { key: 'day:a', title: 'morning', url: '/a.mp4', kind: 'clip' as const, caption: 'c' };
    const extras = [
      { key: 'x:l', kind: 'extended' as const, of: 'day:a', bySec: 4, status: 'ready' as const, url: '/a-long.mp4' },
      { key: 'x:m', kind: 'extended' as const, of: 'day:a', bySec: 8, status: 'rendering' as const, jobId: 'j' },
      { key: 'x:n', kind: 'extended' as const, of: 'day:gone', bySec: 4, status: 'ready' as const, url: '/n.mp4' },
    ];
    assert.deepEqual(cutExtraShots(extras, [original], () => ''), [
      { key: 'x:l', title: 'morning (longer)', url: '/a-long.mp4', kind: 'clip', caption: 'c' },
    ]);
  });
});
