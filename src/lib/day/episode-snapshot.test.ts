import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bringBackSetAsideDayPatch,
  dayEpisodeSnapshot,
  episodeDayRows,
  normalizeEpisodeDay,
  reopenEpisodeDayPatch,
} from './episode-snapshot';
import type { DayToolCache } from '../play/settings';

const slots = [
  { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
  { id: 'night', label: 'Night', location: 'park', sceneHints: 'reads', line: 'Hi.' },
] as DayToolCache['slots'];

const cutDay: DayToolCache = {
  slots,
  dayMood: 'everyday',
  dayLength: 2,
  stills: [
    {
      slotId: 'morning',
      status: 'completed',
      imageUrl: '/m.png',
      promptId: 'p-m',
      promptCheck: { fixed: ['x'] } as never,
    },
    {
      slotId: 'night',
      status: 'completed',
      imageUrl: 'data:image/png;base64,AAAA',
      clipStatus: 'completed',
      clipUrl: '/a.mp4',
    },
  ],
};

describe('episode Day snapshot', () => {
  it('keeps the plan and slim, server-side stills', () => {
    const snapshot = dayEpisodeSnapshot(cutDay)!;
    assert.equal(snapshot.slots?.length, 2);
    assert.equal(snapshot.dayMood, 'everyday');
    assert.deepEqual(snapshot.stills?.[0], {
      slotId: 'morning',
      promptId: 'p-m',
      imageUrl: '/m.png',
      status: 'completed',
    });
    // A data: URL is dropped; the clip stays.
    assert.equal(snapshot.stills?.[1]?.imageUrl, undefined);
    assert.equal(snapshot.stills?.[1]?.clipUrl, '/a.mp4');
    assert.equal(dayEpisodeSnapshot({ slots }), undefined);
    assert.deepEqual(normalizeEpisodeDay(snapshot), snapshot);
    assert.equal(normalizeEpisodeDay({ slots: 'x' }), undefined);
  });

  it('lists what went into it', () => {
    const rows = episodeDayRows(dayEpisodeSnapshot(cutDay)!);
    assert.deepEqual(
      rows.map(row => [row.label, row.kind, row.place, row.line]),
      [
        ['Morning', 'still', 'kitchen', ''],
        ['Night', 'clip', 'park', 'Hi.'],
      ]
    );
  });
});

describe('opening an episode Day again', () => {
  const snapshot = dayEpisodeSnapshot(cutDay)!;
  const liveDay: DayToolCache = {
    slots: [{ id: 'morning', label: 'Morning', location: 'gym' }] as DayToolCache['slots'],
    stills: [{ slotId: 'morning', status: 'completed', imageUrl: '/now.png' }],
    stillsCharacterId: 'nora',
  };

  it('puts it on the board for the live Cast and sets the current Day aside', () => {
    const patch = reopenEpisodeDayPatch({
      day: liveDay,
      castId: 'nora',
      activeCastId: 'nora',
      snapshot,
      label: 'Season 1, episode 2',
      now: 5,
    });
    assert.equal(patch.stillsCharacterId, 'nora');
    assert.equal(patch.stills?.[0]?.imageUrl, '/m.png');
    assert.equal(patch.setAsideDay?.castId, 'nora');
    assert.equal(patch.setAsideDay?.stills?.[0]?.imageUrl, '/now.png');
    assert.equal(patch.setAsideDay?.reason, 'Season 1, episode 2');
    // Bring it back: the reopened Day is set aside in turn.
    const back = bringBackSetAsideDayPatch({ ...liveDay, ...patch }, 6)!;
    assert.equal(back.stills?.[0]?.imageUrl, '/now.png');
    assert.equal(back.setAsideDay?.stills?.[0]?.imageUrl, '/m.png');
    assert.equal(bringBackSetAsideDayPatch(liveDay), null);
  });

  it('parks it for another Cast, keeping their parked Day aside', () => {
    const patch = reopenEpisodeDayPatch({
      day: {
        ...liveDay,
        parkedDays: {
          tomas: {
            at: 1,
            stills: [{ slotId: 'morning', status: 'completed', imageUrl: '/t.png' }],
          },
        },
      },
      castId: 'tomas',
      activeCastId: 'nora',
      snapshot,
      label: 'Season 2, episode 1',
      now: 9,
    });
    // The live Day (Nora's) is untouched.
    assert.equal(patch.stills, undefined);
    assert.equal(patch.parkedDays?.tomas?.stills?.[0]?.imageUrl, '/m.png');
    assert.equal(patch.setAsideDay?.castId, 'tomas');
    assert.equal(patch.setAsideDay?.stills?.[0]?.imageUrl, '/t.png');
  });
});
