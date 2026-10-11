import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { castChecklist, countCastDayStills, type CastChecklistFacts } from './cast-checklist';

const NOTHING: CastChecklistFacts = {
  characterId: 'char-nora',
  plateReady: false,
  traitsSet: false,
  bibleWritten: false,
  keeperCount: 0,
  dayStillCount: 0,
  filmCount: 0,
  storyBeatCount: 0,
};

describe('castChecklist', () => {
  it('lists every step in order, Next on the plate for a fresh Cast', () => {
    const list = castChecklist(NOTHING);
    assert.deepEqual(
      list.items.map(item => item.id),
      ['plate', 'traits', 'bible', 'outfit', 'day', 'film', 'story']
    );
    assert.equal(list.nextId, 'plate');
    assert.equal(list.doneCount, 0);
    assert.equal(list.allDone, false);
  });

  it('Next is the first film step not done — optional rows (bible, outfit, Story) never are', () => {
    const list = castChecklist({
      ...NOTHING,
      plateReady: true,
      traitsSet: true,
      storyBeatCount: 3,
    });
    assert.equal(list.nextId, 'day');
    assert.deepEqual(
      list.items.filter(item => item.optional).map(item => item.id),
      ['traits', 'bible', 'outfit', 'story']
    );
    // A film cut with no outfit kept: nothing is Next (it pointed at Outfit).
    assert.equal(
      castChecklist({ ...NOTHING, plateReady: true, dayStillCount: 4, filmCount: 1 }).nextId,
      null
    );
    assert.equal(list.doneCount, 3);
    assert.equal(list.items.find(item => item.id === 'story')?.detail, '3 beats');
  });

  it('says prepared only when the plate records it', () => {
    assert.equal(castChecklist({ ...NOTHING, plateReady: true }).items[0]?.detail, 'ready');
    assert.equal(
      castChecklist({ ...NOTHING, plateReady: true, platePrepared: true }).items[0]?.detail,
      'ready · prepared'
    );
  });

  it('links each step to its tab or page for this Cast', () => {
    const list = castChecklist({ ...NOTHING, characterId: 'char a' });
    const target = (id: string) => list.items.find(item => item.id === id)?.target;
    assert.deepEqual(target('plate'), { kind: 'tab', tab: 'overview' });
    assert.deepEqual(target('bible'), { kind: 'tab', tab: 'bible' });
    assert.deepEqual(target('outfit'), { kind: 'href', href: '/fitting?character=char%20a' });
    assert.deepEqual(target('day'), { kind: 'href', href: '/day?character=char%20a' });
    assert.deepEqual(target('film'), { kind: 'tab', tab: 'film' });
    assert.deepEqual(target('story'), { kind: 'href', href: '/story?character=char%20a' });
  });

  it('a cut list without an assembled film is not done but says so', () => {
    const film = castChecklist({ ...NOTHING, cutShotCount: 4 }).items.find(
      item => item.id === 'film'
    );
    assert.equal(film?.done, false);
    assert.match(film?.detail ?? '', /4 shots in the cut/);
  });

  it('all done has no Next', () => {
    const list = castChecklist({
      characterId: 'char-nora',
      plateReady: true,
      traitsSet: true,
      bibleWritten: true,
      keeperCount: 1,
      dayStillCount: 6,
      filmCount: 1,
      storyBeatCount: 2,
    });
    assert.equal(list.allDone, true);
    assert.equal(list.nextId, null);
    assert.equal(list.doneCount, 7);
    assert.equal(list.items.find(item => item.id === 'outfit')?.detail, '1 keeper');
  });
});

describe('countCastDayStills', () => {
  const done = { slotId: 'morning', status: 'completed', imageUrl: '/a.png' } as const;
  const queued = { slotId: 'evening', status: 'queued' } as const;

  it('counts the Day board when this Cast owns it', () => {
    assert.equal(
      countCastDayStills({
        characterId: 'nora',
        day: { stills: [done, done, queued], stillsCharacterId: 'nora' },
      }),
      2
    );
  });

  it("does not count another Cast's board; counts this Cast's parked Day", () => {
    assert.equal(
      countCastDayStills({
        characterId: 'nora',
        activeCharacterId: 'nora',
        day: {
          stills: [done],
          stillsCharacterId: 'tomas',
          parkedDays: { nora: { at: 1, stills: [done, done, done] } },
        },
      }),
      3
    );
  });

  it('an unowned board belongs to the active Cast', () => {
    assert.equal(
      countCastDayStills({ characterId: 'nora', activeCharacterId: 'nora', day: { stills: [done] } }),
      1
    );
    assert.equal(
      countCastDayStills({ characterId: 'nora', activeCharacterId: 'sam', day: { stills: [done] } }),
      0
    );
  });

  it('falls back to Gallery Day stills when the board was cleared', () => {
    assert.equal(
      countCastDayStills({ characterId: 'nora', day: { stills: [] }, galleryDayStillCount: 5 }),
      5
    );
  });
});
