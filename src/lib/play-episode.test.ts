import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  castDayPlan,
  continueDayAsStoryHref,
  lastDaySlot,
  storySeedFromDay,
  storySettingFromDaySlot,
} from './day-story-seed';
import {
  castEpisodeSources,
  episodeCutShots,
  episodePartCounts,
  episodePlaylist,
  episodeShotPart,
  episodeTitleCard,
} from './play-episode';
import type { DaySlot, DaySlotStill } from './day-planner';
import type { RoleplayStoryBeat } from './roleplay';
import type { RoleplayLibrarySession } from './roleplay-library';
import type { DayToolCache } from './play-settings';

const png = (name: string) => `/view?filename=${name}.png`;

const slots: DaySlot[] = [
  { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'makes coffee' },
  { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads on a bench' },
  {
    id: 'evening',
    label: 'Evening',
    location: 'rooftop bar',
    sceneHints: 'laughs',
    wardrobeId: 'w-slip',
  },
  { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'sleeps' },
];

const stills: DaySlotStill[] = [
  // Out of slot order on purpose — the episode follows the slots.
  { slotId: 'evening', status: 'completed', imageUrl: png('evening'), promptId: 'p-e' },
  { slotId: 'morning', status: 'completed', imageUrl: png('morning'), promptId: 'p-m' },
  { slotId: 'afternoon', status: 'queued', promptId: 'p-a' },
];

const beat = (id: string, at: number, extra: Partial<RoleplayStoryBeat> = {}): RoleplayStoryBeat =>
  ({
    id,
    at,
    kind: 'plot',
    title: `Beat ${id}`,
    blurb: '',
    stillStatus: 'completed',
    imageUrl: png(id),
    ...extra,
  }) as RoleplayStoryBeat;

const story: RoleplayStoryBeat[] = [
  beat('b2', 20),
  beat('b1', 10),
  beat('b3', 30, { stillStatus: 'queued', imageUrl: undefined }),
];

describe('episodePlaylist', () => {
  it('puts Day shots in slot order, then Story shots in reel order', () => {
    const shots = episodePlaylist({ daySlots: slots, dayStills: stills, story });
    assert.deepEqual(
      shots.map(shot => shot.key),
      ['day:morning', 'day:evening', 'story:b2@20', 'story:b1@10']
    );
    assert.deepEqual(
      shots.map(shot => episodeShotPart(shot.key)),
      ['day', 'day', 'story', 'story']
    );
    assert.equal(shots[0]!.title, 'Day · Morning');
    assert.equal(shots[2]!.title, 'Story · Beat b2');
    // Captions keep the beat's words, not the part label.
    assert.equal(shots[0]!.caption, 'makes coffee');
    assert.equal(shots[2]!.caption, 'Beat b2');
    assert.deepEqual(episodePartCounts(shots), { day: 2, story: 2 });
  });

  it('prefers a finished Day clip over its still', () => {
    const shots = episodePlaylist({
      daySlots: slots,
      dayStills: [
        {
          slotId: 'morning',
          status: 'completed',
          imageUrl: png('m'),
          clipStatus: 'completed',
          clipUrl: '/view?filename=m.mp4',
        },
      ],
      story: [],
    });
    assert.equal(shots.length, 1);
    assert.equal(shots[0]!.kind, 'clip');
  });

  it('is empty with no finished stills', () => {
    assert.deepEqual(episodePlaylist({ dayStills: [], story: [] }), []);
  });
});

describe('episodeCutShots', () => {
  const shots = episodePlaylist({ daySlots: slots, dayStills: stills, story });

  it('applies the shot list: leave-outs and order across parts', () => {
    const cut = episodeCutShots(shots, {
      order: ['story:b1@10', 'day:morning', 'day:evening', 'story:b2@20'],
      shots: { 'day:evening': { include: false } },
    });
    assert.deepEqual(
      cut.map(shot => shot.key),
      ['story:b1@10', 'day:morning', 'story:b2@20']
    );
  });

  it('leaves out excluded keys on top of the edits', () => {
    const cut = episodeCutShots(shots, { shots: { 'story:b2@20': { caption: 'Later' } } }, [
      'day:morning',
      'story:b2@20',
    ]);
    assert.deepEqual(
      cut.map(shot => shot.key),
      ['day:evening', 'story:b1@10']
    );
  });

  it('opens on the Cast name', () => {
    assert.deepEqual(episodeTitleCard(' Nora '), { title: 'Nora', subtitle: 'Day, then Story' });
  });
});

describe('castEpisodeSources', () => {
  const library: RoleplayLibrarySession[] = [
    {
      id: 'cast-nora',
      createdAt: 1,
      updatedAt: 1,
      title: 'Nora',
      beatCount: 1,
      snapshot: { story: [beat('lib', 5)] },
    },
  ];

  it('reads the live Day and live Story when they belong to the Cast', () => {
    const sources = castEpisodeSources({
      characterId: 'nora',
      day: { stillsCharacterId: 'nora', slots, stills },
      roleplay: { activeSessionId: 'cast-nora', story },
      storySessionId: 'cast-nora',
      library,
    });
    assert.equal(sources.dayStills.length, 3);
    assert.equal(sources.story.length, 3);
  });

  it('falls back to the parked Day and the library session', () => {
    const sources = castEpisodeSources({
      characterId: 'nora',
      day: {
        stillsCharacterId: 'tomas',
        stills: [{ slotId: 'night', status: 'completed', imageUrl: png('t') }],
        parkedDays: { nora: { at: 1, slots, stills } },
      },
      roleplay: { activeSessionId: 'cast-tomas', story: [beat('t', 1)] },
      storySessionId: 'cast-nora',
      library,
    });
    assert.equal(sources.dayStills, stills);
    assert.deepEqual(
      sources.story.map(entry => entry.id),
      ['lib']
    );
  });

  it('is empty for a Cast with no Day or Story', () => {
    const sources = castEpisodeSources({
      characterId: 'sam',
      day: { stillsCharacterId: 'nora', stills },
      roleplay: {},
      storySessionId: 'cast-sam',
      library,
    });
    assert.deepEqual(sources, { dayStills: [], story: [] });
  });
});

describe('Day → Story seed', () => {
  it('finds the Cast Day by owner, else the active Cast, else parked', () => {
    assert.equal(castDayPlan({ stills }, 'nora', 'nora')?.live, true);
    assert.equal(castDayPlan({ stills, stillsCharacterId: 'tomas' }, 'nora', 'nora'), null);
    assert.equal(
      castDayPlan({ stillsCharacterId: 'tomas', parkedDays: { nora: { at: 1 } } }, 'nora')?.live,
      false
    );
  });

  it('ends the Day on the last slot with a finished still', () => {
    assert.equal(lastDaySlot(slots, stills)?.id, 'evening');
    assert.equal(lastDaySlot(slots, [])?.id, 'night');
    assert.equal(lastDaySlot([], stills), null);
  });

  it('writes the setting as that place, later that night, with the weather', () => {
    assert.equal(
      storySettingFromDaySlot({ location: 'rooftop bar.' }, 'rain'),
      'rooftop bar, later that night, rain against the windows'
    );
    assert.equal(storySettingFromDaySlot({ location: '  ' }), '');
  });

  it('seeds setting, mood and the active outfit from the Cast Day', () => {
    const day: DayToolCache = {
      stillsCharacterId: 'nora',
      slots,
      stills,
      dayMood: 'suggestive',
      footwear: 'white sneakers',
      customGarmentImageUrl: '/view?filename=dress.png',
      customGarmentImageFilename: 'dress.png',
    };
    assert.deepEqual(
      storySeedFromDay({ day, characterId: 'nora', lockedWardrobeId: 'w-locked' }),
      {
        setting: 'rooftop bar, later that night',
        tone: 'romantic',
        content: 'suggestive',
        wardrobeId: 'w-locked',
        customGarmentImageUrl: '/view?filename=dress.png',
        customGarmentImageFilename: 'dress.png',
        customGarmentDescription: undefined,
        footwear: 'white sneakers',
      }
    );
    // No locked outfit: the last slot's kit. A clothing-photo id is not a kit.
    assert.equal(
      storySeedFromDay({ day, characterId: 'nora', lockedWardrobeId: 'custom-garment' })
        ?.wardrobeId,
      'w-slip'
    );
  });

  it('keeps a parked Day to its plan (no live clothing photo) and maps themes', () => {
    const seed = storySeedFromDay({
      day: {
        stillsCharacterId: 'tomas',
        customGarmentImageUrl: '/view?filename=tomas.png',
        parkedDays: { nora: { at: 1, slots, stills, dayMood: 'date-night' } },
      },
      characterId: 'nora',
    });
    assert.equal(seed?.customGarmentImageUrl, undefined);
    assert.equal(seed?.tone, 'romantic');
    assert.equal(seed?.wardrobeId, 'w-slip');
  });

  it('is null when the Cast has no Day', () => {
    assert.equal(storySeedFromDay({ day: {}, characterId: 'sam', activeCharacterId: 'nora' }), null);
  });

  it('links Story with from=day', () => {
    assert.equal(continueDayAsStoryHref('char 1'), '/story?character=char%201&from=day');
  });
});
