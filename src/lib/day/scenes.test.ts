import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addScenePatch,
  castFileScenes,
  createScene,
  deleteScenePatch,
  keepSceneTake,
  normalizeSavedScenes,
  openScenePatch,
  parseCastFileScenes,
  placeImportedScenes,
  recordSceneFromWorking,
  recordSceneJobs,
  SCENE_JOB_LOG_LIMIT,
  removeSceneTake,
  resolveSceneChecks,
  SCENE_TAKE_LIMIT,
  sceneCardBusy,
  sceneCutShots,
  sceneFromDaySlot,
  sceneSlotAt,
  sceneSlotOf,
  sceneSlotsPatch,
  scenesForCast,
  sceneWorkingPatch,
  sendSceneToDayPatch,
  swapSceneForCast,
  takeAsStill,
  type SavedScene,
  type SceneToolCache,
} from './scenes';
import { activeCutSources, cutRoomShots, cutRoomSourceShots, splitCutRoomKey } from '../film/cut-room';
import { buildCastFile, parseCastFile } from '../cast/transfer';
import {
  alignDaySlotsToPeople,
  ensureDaySlotsMatchMood,
  type DaySlot,
  type DaySlotStill,
} from './planner';
import type { DayToolCache } from '../play/settings';

const kitchen = (overrides: Partial<Parameters<typeof createScene>[0]> = {}): SavedScene =>
  createScene({
    castId: 'nora',
    name: 'Scene 1',
    id: 'scene-a',
    slot: { id: 'evening', label: 'Evening', location: 'small kitchen', sceneHints: 'stirring risotto' },
    now: 10,
    ...overrides,
  });

const done = (promptId: string, extra: Partial<DaySlotStill> = {}): DaySlotStill => ({
  slotId: 'evening',
  promptId,
  imageUrl: `/view?filename=${promptId}.png`,
  status: 'completed',
  ...extra,
});

describe('scenes: stored and read back', () => {
  it('cleans what it reads: bad entries dropped, Raunchy opens as Intimate · Playful', () => {
    const scenes = normalizeSavedScenes([
      null,
      { id: 'x' },
      {
        id: 'old',
        castId: 'nora',
        name: 'Old',
        dayMood: 'raunchy',
        slot: { id: 'night', location: 'bar' },
        takes: [
          { id: 'p1', imageUrl: '/a.png', at: 1 },
          { id: 'p2', imageUrl: 'data:image/png;base64,AAA', at: 2 },
        ],
        keptTakeId: 'gone',
        createdAt: 5,
      },
    ]);
    assert.equal(scenes.length, 1);
    const [scene] = scenes;
    assert.equal(scene!.dayMood, 'intimate');
    assert.equal(scene!.intimatePlayful, true);
    assert.equal(scene!.slot.id, 'night');
    assert.equal(scene!.slot.label, 'Night');
    // An inline picture is not kept in settings; a kept id with no take is dropped.
    assert.deepEqual(
      scene!.takes.map(take => take.id),
      ['p1']
    );
    assert.equal(scene!.keptTakeId, undefined);
  });

  it('keeps a bounded number of takes, the kept one always', () => {
    const takes = Array.from({ length: SCENE_TAKE_LIMIT + 5 }, (_, at) => ({
      id: `p${at}`,
      imageUrl: `/p${at}.png`,
      at: at + 1,
    }));
    const [scene] = normalizeSavedScenes([
      { ...kitchen(), takes, keptTakeId: 'p0' },
    ]);
    assert.equal(scene!.takes.length, SCENE_TAKE_LIMIT);
    assert.equal(scene!.keptTakeId, 'p0');
    assert.ok(scene!.takes.some(take => take.id === 'p0'));
  });

  it('one slot from Day-shaped slots, and its time of day can move', () => {
    assert.equal(sceneSlotOf(undefined).id, 'afternoon');
    const slot = sceneSlotOf([{ id: 'morning-2', label: 'Late morning', location: 'gym' } as DaySlot]);
    assert.equal(slot.id, 'morning-2');
    assert.equal(slot.location, 'gym');
    const night = sceneSlotAt(sceneSlotOf([{ id: 'morning', label: 'Morning' } as DaySlot]), 'night');
    assert.equal(night.id, 'night');
    assert.equal(night.label, 'Night');
  });

  it('lists a Cast\'s scenes newest first', () => {
    const scenes = [
      kitchen(),
      createScene({ castId: 'nora', name: 'Scene 2', id: 'b', now: 20 }),
      createScene({ castId: 'tomas', name: 'Scene 1', id: 'c', now: 30 }),
    ];
    assert.deepEqual(
      scenesForCast(scenes, 'nora').map(scene => scene.id),
      ['b', 'scene-a']
    );
  });
});

describe('scenes: the open scene follows the engine', () => {
  it('records the shot as edited, a take that lands, its finish and its clip', () => {
    const scene = kitchen();
    const working: Partial<SceneToolCache> = {
      slots: [{ ...scene.slot, poseLayout: 'cook', poseCamera: { height: 'low' } } as DaySlot],
      stills: [done('p1', { finishedUrl: '/p1-finished.png', finishedFor: 'p1' })],
      dayMood: 'everyday',
    };
    const recorded = recordSceneFromWorking(scene, working, 50);
    assert.notEqual(recorded, scene);
    assert.equal(recorded.slot.poseLayout, 'cook');
    assert.deepEqual(recorded.takes, [
      { id: 'p1', promptId: 'p1', imageUrl: '/p1-finished.png', rawUrl: '/view?filename=p1.png', at: 50 },
    ]);
    // Nothing new: the same object (no write).
    assert.equal(recordSceneFromWorking(recorded, working, 60), recorded);
    // The clip lands on the take; a new take later keeps it there.
    const clipped = recordSceneFromWorking(
      recorded,
      {
        ...working,
        stills: [
          done('p1', {
            finishedUrl: '/p1-finished.png',
            finishedFor: 'p1',
            clipUrl: '/p1.mp4',
            clipStatus: 'completed',
            clipPromptId: 'c1',
          }),
        ],
      },
      70
    );
    assert.equal(clipped.takes[0]!.clipUrl, '/p1.mp4');
    assert.equal(clipped.takes[0]!.at, 50);
    const second = recordSceneFromWorking(clipped, { ...working, stills: [done('p2')] }, 80);
    assert.deepEqual(
      second.takes.map(take => [take.id, take.clipUrl]),
      [
        ['p1', '/p1.mp4'],
        ['p2', undefined],
      ]
    );
  });

  it('waits for a take still rendering or held by the adult check', () => {
    const scene = kitchen();
    const base = { slots: [scene.slot], dayMood: scene.dayMood };
    assert.equal(
      recordSceneFromWorking(scene, { ...base, stills: [{ slotId: 'evening', promptId: 'p', status: 'running' }] }),
      scene
    );
    assert.equal(
      recordSceneFromWorking(scene, { ...base, stills: [done('p', { adultHold: 'checking' })] }),
      scene
    );
  });

  it('keeps one take (again lets it go) and removes takes', () => {
    const scene = { ...kitchen(), takes: [{ id: 'p1', imageUrl: '/1.png', at: 1 }, { id: 'p2', imageUrl: '/2.png', at: 2 }] };
    const kept = keepSceneTake(scene, 'p2', 5);
    assert.equal(kept.keptTakeId, 'p2');
    assert.equal(keepSceneTake(kept, 'p2', 6).keptTakeId, undefined);
    assert.equal(keepSceneTake(scene, 'nope'), scene);
    const removed = removeSceneTake(kept, 'p2', 7);
    assert.equal(removed.keptTakeId, undefined);
    assert.deepEqual(
      removed.takes.map(take => take.id),
      ['p1']
    );
  });

  it('opens with the kept take on the card and its mood in the working fields', () => {
    const scene = {
      ...kitchen({ mood: { dayMood: 'intimate', intimatePlayful: true, intimateMix: 'duo' } }),
      takes: [
        { id: 'p1', promptId: 'p1', imageUrl: '/1-done.png', rawUrl: '/1.png', at: 1 },
        { id: 'p2', promptId: 'p2', imageUrl: '/2.png', at: 2 },
      ],
      keptTakeId: 'p1',
    };
    const patch = sceneWorkingPatch(scene);
    assert.equal(patch.activeSceneId, 'scene-a');
    assert.equal(patch.dayMood, 'intimate');
    assert.equal(patch.intimatePlayful, true);
    assert.equal(patch.intimateMix, 'duo');
    assert.deepEqual(patch.stills, [
      {
        slotId: 'evening',
        promptId: 'p1',
        imageUrl: '/1.png',
        status: 'completed',
        finishedUrl: '/1-done.png',
        finishedFor: 'p1',
      },
    ]);
  });

  it('new / open / delete save the open scene first', () => {
    const a = kitchen();
    const cache: SceneToolCache = {
      scenes: [a],
      ...sceneWorkingPatch(a),
      slots: [{ ...a.slot, sceneHints: 'tasting the risotto' }],
    };
    const b = createScene({ castId: 'nora', name: 'Scene 2', id: 'scene-b', now: 20 });
    const added = addScenePatch(cache, b, 30);
    assert.equal(added.activeSceneId, 'scene-b');
    assert.equal(
      added.scenes?.find(scene => scene.id === 'scene-a')?.slot.sceneHints,
      'tasting the risotto'
    );
    const back = openScenePatch({ ...cache, ...added }, 'scene-a', 40);
    assert.equal(back?.activeSceneId, 'scene-a');
    assert.equal(back?.slots?.[0]?.sceneHints, 'tasting the risotto');
    const removed = deleteScenePatch({ ...cache, ...added }, 'scene-b');
    assert.equal(removed.activeSceneId, 'scene-a');
    assert.deepEqual(
      removed.scenes?.map(scene => scene.id),
      ['scene-a']
    );
  });

  it('a Cast change saves the open scene and opens the next Cast\'s newest (or none)', () => {
    const a = kitchen();
    const t = createScene({ castId: 'tomas', name: 'Scene 1', id: 'scene-t', now: 5 });
    const cache: SceneToolCache = { scenes: [a, t], ...sceneWorkingPatch(a), stills: [done('p9')] };
    const toTomas = swapSceneForCast(cache, 'tomas', 50);
    assert.equal(toTomas.activeSceneId, 'scene-t');
    assert.deepEqual(
      toTomas.scenes?.find(scene => scene.id === 'scene-a')?.takes.map(take => take.id),
      ['p9']
    );
    const toNobody = swapSceneForCast({ ...cache, ...toTomas }, 'ines', 60);
    assert.equal(toNobody.activeSceneId, undefined);
    assert.deepEqual(toNobody.stills, []);
  });

  it('coming back to a Cast opens the scene they had open, not their newest', () => {
    const a = kitchen();
    const b = createScene({ castId: 'nora', name: 'Rooftop', id: 'scene-b', now: 20 });
    const t = createScene({ castId: 'tomas', name: 'Scene 1', id: 'scene-t', now: 5 });
    let cache: SceneToolCache = { scenes: [a, b, t], ...sceneWorkingPatch(b) };
    // Nora opens her first scene (Rooftop is the newer one), then the page goes to Tomas.
    cache = { ...cache, ...openScenePatch(cache, 'scene-a', 30) };
    assert.equal(cache.openByCast?.nora, 'scene-a');
    cache = { ...cache, ...swapSceneForCast(cache, 'tomas', 40) };
    assert.equal(cache.activeSceneId, 'scene-t');
    cache = { ...cache, ...swapSceneForCast(cache, 'nora', 50) };
    assert.equal(cache.activeSceneId, 'scene-a');
    // Deleted meanwhile: their newest instead.
    const gone = { ...cache, scenes: cache.scenes?.filter(scene => scene.id !== 'scene-a') };
    assert.equal(swapSceneForCast({ ...gone, activeSceneId: 'scene-t' }, 'nora', 60).activeSceneId, 'scene-b');
  });

  it('a take cut to its close shot goes back on the card as the cut (not the full frame)', () => {
    const cut = '/view?filename=reframe-1.png';
    const scene = recordSceneFromWorking(kitchen(), {
      slots: [kitchen().slot],
      stills: [done('p1', { imageUrl: cut, finishedUrl: cut, finishedFor: 'p1', framedUrl: cut })],
    });
    const take = scene.takes[0]!;
    assert.equal(take.framedUrl, cut);
    assert.deepEqual(normalizeSavedScenes([scene])[0]?.takes[0], take);
    const still = takeAsStill('evening', take);
    // Day's gallery sync keeps a still's own finish (else it puts the gallery's full frame back
    // and the reframe runs again); the reframe skips a still with its frame.
    assert.equal(still.imageUrl, cut);
    assert.equal(still.finishedUrl, cut);
    assert.equal(still.finishedFor, 'p1');
    assert.equal(still.framedUrl, cut);
    // Face-finished after the cut: the card shows the finish, over the cut.
    const finished = takeAsStill('evening', { ...take, imageUrl: '/view?filename=face.png' });
    assert.equal(finished.imageUrl, cut);
    assert.equal(finished.finishedUrl, '/view?filename=face.png');
    // A still keeps an older take's frame until the next cut: not this take's.
    const stale = recordSceneFromWorking(kitchen(), {
      slots: [kitchen().slot],
      stills: [done('p2', { framedUrl: cut, finishedUrl: cut, finishedFor: 'p1' })],
    });
    assert.equal(stale.takes[0]?.framedUrl, undefined);
  });

  it('the engine writes one slot: a Day helper\'s whole Day keeps only the scene\'s', () => {
    const scene: DaySlot = { id: 'night', label: 'Night', location: 'rooftop terrace' };
    // Day's mood fit normalizes a single slot to a whole Day (inferDayLength → four).
    const aligned = ensureDaySlotsMatchMood([scene], { dayMood: 'intimate', intimateMix: 'duo' });
    assert.equal(aligned.slots.length, 4);
    const kept = sceneSlotsPatch(aligned.slots, [scene]);
    assert.deepEqual(
      kept.map(slot => slot.id),
      ['night']
    );
    // A time-of-day move (one slot) goes through as it is.
    assert.deepEqual(sceneSlotsPatch([{ id: 'morning', label: 'Morning' }], [scene])[0]?.id, 'morning');
  });

  it('mood fit keeps the scene\'s own Setting: a blank beat is filled under it (Day rerolls both)', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const typed = 'my grandmother\'s sunlit attic studio';
    const blank: DaySlot = { id: 'night', label: 'Night', location: typed };
    const cases = [
      { dayMood: 'intimate', intimateMix: 'duo' as const },
      { dayMood: 'intimate', intimateMix: 'solo' as const },
      { dayMood: 'suggestive', intimateMix: 'solo' as const },
      { dayMood: 'date-night', intimateMix: 'solo' as const },
      { dayMood: 'cosplay', intimateMix: 'solo' as const },
    ];
    for (const options of cases) {
      const scene = sceneSlotsPatch(
        ensureDaySlotsMatchMood([blank], { ...options, keepSettings: true, random }).slots,
        [blank]
      )[0]!;
      assert.equal(scene.location, typed, `${options.dayMood}: the Setting stays`);
      assert.ok(scene.sceneHints?.trim(), `${options.dayMood}: the blank beat is filled`);
      // Settled: a second fit leaves it be (no beat rerolled on every Queue).
      const again = ensureDaySlotsMatchMood([scene], { ...options, keepSettings: true, random });
      assert.deepEqual(sceneSlotsPatch(again.slots, [scene])[0], scene, `${options.dayMood}: stable`);
      // Day unchanged: a stale slot draws a new Setting with its beat.
      const day = ensureDaySlotsMatchMood([blank], { ...options, random }).slots.find(
        slot => slot.id === 'night'
      )!;
      assert.notEqual(day.location, typed, `${options.dayMood}: Day rerolls the Setting`);
    }
    // A Setting Day would call a leftover (a Vacation pier under Suggestive) is still the scene's.
    const pier: DaySlot = {
      id: 'afternoon',
      label: 'Afternoon',
      location: 'old fishing pier',
      sceneHints: 'stirring risotto at the stove',
    };
    const fitted = ensureDaySlotsMatchMood([pier], {
      dayMood: 'suggestive',
      keepSettings: true,
      random,
    }).slots.find(slot => slot.id === 'afternoon')!;
    assert.equal(fitted.location, 'old fishing pier');
    assert.notEqual(fitted.sceneHints, pier.sceneHints);
    // People on a themed scene: the beat changes, the Setting stays.
    const duoBeat = ensureDaySlotsMatchMood([{ id: 'night', label: 'Night' }], {
      dayMood: 'date-night',
      intimateMix: 'duo',
      allowCompanions: true,
      random,
    }).slots.find(slot => slot.id === 'night')!;
    const themed = { ...duoBeat, location: typed };
    const solo = alignDaySlotsToPeople([themed], {
      dayMood: 'date-night',
      people: 'solo',
      keepSettings: true,
      random,
    }).slots.find(slot => slot.id === 'night')!;
    assert.equal(solo.location, typed);
  });

  it('a take at the adult check goes with its scene: switching is not blocked by it', () => {
    const a = kitchen();
    const b = createScene({ castId: 'nora', name: 'Scene 2', id: 'scene-b', now: 20 });
    const checking = done('p-check', {
      status: 'running',
      imageUrl: undefined,
      adultHold: 'checking',
    });
    assert.deepEqual(sceneCardBusy(checking), { rendering: false, checking: true });
    assert.deepEqual(sceneCardBusy({ ...checking, adultHold: undefined }), {
      rendering: true,
      checking: false,
    });
    // Its pair still rendering keeps the scene open.
    assert.equal(
      sceneCardBusy({ ...checking, twoTakes: { promptId: 'p-2', status: 'running' } }).rendering,
      true
    );
    const cache: SceneToolCache = { scenes: [a, b], ...sceneWorkingPatch(a), stills: [checking] };
    const toB = openScenePatch(cache, 'scene-b', 30)!;
    assert.equal(toB.activeSceneId, 'scene-b');
    assert.deepEqual(toB.stills, []);
    const savedA = toB.scenes!.find(scene => scene.id === 'scene-a')!;
    assert.deepEqual(savedA.checkingTakeIds, ['p-check']);
    assert.deepEqual(savedA.takes, []);
    assert.equal(toB.scenes!.find(scene => scene.id === 'scene-b')!.checkingTakeIds, undefined);
    // Stored and read back.
    assert.deepEqual(normalizeSavedScenes(toB.scenes)[0]?.checkingTakeIds, ['p-check']);

    // The verdict lands on its own scene by prompt id: a pass adds the take to A, never to B.
    const passed = resolveSceneChecks(savedA, [
      { promptId: 'p-other', status: 'completed', imageUrl: '/view?filename=other.png' },
      {
        promptId: 'p-check',
        status: 'completed',
        imageUrl: '/view?filename=p-check.png',
        adultCheck: { state: 'passed' },
      },
    ], 40);
    assert.deepEqual(passed.takes.map(take => take.id), ['p-check']);
    assert.equal(passed.checkingTakeIds, undefined);
    // Still waiting: unchanged (same object). Withheld or gone: dropped, no take.
    const pending = {
      promptId: 'p-check',
      status: 'completed',
      imageUrl: '/view?filename=p-check.png',
      adultCheck: { state: 'pending' },
    };
    assert.equal(resolveSceneChecks(savedA, [pending]), savedA);
    const withheld = resolveSceneChecks(savedA, [
      { ...pending, adultCheck: { state: 'withheld' } },
    ]);
    assert.deepEqual(withheld.takes, []);
    assert.equal(withheld.checkingTakeIds, undefined);
    assert.equal(resolveSceneChecks(savedA, []).checkingTakeIds, undefined);

    // Opened again before its verdict: the take is back on the card, held, and off the list.
    const backToA = openScenePatch({ ...cache, ...toB }, 'scene-a', 50)!;
    assert.deepEqual(backToA.stills, [
      { slotId: 'evening', promptId: 'p-check', status: 'running', adultHold: 'checking' },
    ]);
    assert.equal(
      backToA.scenes!.find(scene => scene.id === 'scene-a')!.checkingTakeIds,
      undefined
    );
  });

  it('logs the jobs it queues by id, once each, bounded', () => {
    const first = recordSceneJobs(undefined, { promptId: 'p1' }, 'Kitchen');
    assert.deepEqual(first, [{ promptId: 'p1', scene: 'Kitchen', kind: 'still' }]);
    const same = recordSceneJobs(first, { promptId: 'p1' }, 'Kitchen');
    assert.equal(same, first);
    const clip = recordSceneJobs(first, { promptId: 'p1', clipPromptId: 'c1' }, 'Kitchen');
    assert.deepEqual(clip.at(-1), { promptId: 'c1', scene: 'Kitchen', kind: 'clip' });
    let log = clip;
    for (let n = 0; n < SCENE_JOB_LOG_LIMIT + 5; n += 1) {
      log = recordSceneJobs(log, { promptId: `x${n}` }, 'Kitchen');
    }
    assert.equal(log.length, SCENE_JOB_LOG_LIMIT);
    assert.equal(log.at(-1)?.promptId, `x${SCENE_JOB_LOG_LIMIT + 4}`);
  });
});

describe('scenes and Day', () => {
  const day: DayToolCache = {
    stillsCharacterId: 'nora',
    dayLength: 4,
    dayMood: 'suggestive',
    intimateMix: 'solo',
    slots: [
      {
        id: 'evening',
        label: 'Evening',
        location: 'rooftop bar',
        sceneHints: 'laughing at the rail',
        poseLayout: 'lean',
        poseCamera: { shot: 'waist' },
        eventMove: 'turns to the city',
      } as DaySlot,
    ],
    stills: [done('d1')],
  };

  it('Open as Scene copies the slot, the mood and its finished still as the first take', () => {
    const scene = sceneFromDaySlot({ day, slotId: 'evening', castId: 'nora', name: 'Scene 1', now: 9, id: 's' });
    assert.ok(scene);
    assert.equal(scene.fromDaySlot, 'evening');
    assert.equal(scene.slot.location, 'rooftop bar');
    assert.equal(scene.slot.poseLayout, 'lean');
    assert.deepEqual(scene.slot.poseCamera, { shot: 'waist' });
    assert.equal(scene.slot.eventMove, undefined);
    assert.equal(scene.dayMood, 'suggestive');
    assert.equal(scene.intimateMix, 'solo');
    assert.deepEqual(
      scene.takes.map(take => take.id),
      ['d1']
    );
    assert.equal(scene.keptTakeId, undefined);
    // Another Cast's Day still is not theirs to take.
    const other = sceneFromDaySlot({ day, slotId: 'evening', castId: 'tomas', name: 'Scene 1' });
    assert.deepEqual(other?.takes, []);
    assert.equal(sceneFromDaySlot({ day, slotId: 'evening', castId: '', name: 'x' }), null);
  });

  it('Send to Day slot puts the shot and the kept take on the slot (old still kept beside it)', () => {
    const scene = {
      ...kitchen(),
      takes: [{ id: 'k1', promptId: 'k1', imageUrl: '/k1.png', at: 1 }],
      keptTakeId: 'k1',
    };
    const result = sendSceneToDayPatch(day, scene, 'evening', 'nora');
    assert.ok('patch' in result);
    const slot = result.patch.slots?.find(entry => entry.id === 'evening');
    assert.equal(slot?.location, 'small kitchen');
    assert.equal(slot?.label, 'Evening');
    assert.equal(slot?.poseLayout, undefined);
    const still = result.patch.stills?.find(entry => entry.slotId === 'evening');
    assert.equal(still?.promptId, 'k1');
    assert.equal(still?.previousTake?.promptId, 'd1');
  });

  it('Send to Day slot goes to the Cast\'s parked Day, and says so when there is none', () => {
    const scene = { ...kitchen(), castId: 'tomas' };
    assert.ok('error' in sendSceneToDayPatch(day, scene, 'evening', 'nora'));
    const parked: DayToolCache = {
      ...day,
      parkedDays: { tomas: { slots: day.slots, dayLength: 4, stills: [], at: 1 } },
    };
    const result = sendSceneToDayPatch(parked, scene, 'evening', 'nora', 99);
    assert.ok('patch' in result);
    assert.equal(result.patch.slots, undefined);
    assert.equal(
      result.patch.parkedDays?.tomas?.slots?.find(entry => entry.id === "evening")?.location,
      "small kitchen"
    );
    assert.equal(result.patch.parkedDays?.tomas?.at, 99);
  });
});

describe('scenes in Cut', () => {
  const scenes: SavedScene[] = [
    {
      ...kitchen(),
      takes: [{ id: 'k1', promptId: 'k1', imageUrl: '/k1.png', clipUrl: '/k1.mp4', clipPromptId: 'c1', at: 1 }],
      keptTakeId: 'k1',
    },
    { ...createScene({ castId: 'nora', name: 'Scene 2', id: 'scene-b', now: 20 }), takes: [{ id: 'x', imageUrl: '/x.png', at: 1 }] },
    {
      ...createScene({ castId: 'nora', name: 'Scene 3', id: 'scene-c', now: 30 }),
      takes: [{ id: 'k3', promptId: 'k3', imageUrl: '/k3.png', at: 1 }],
      keptTakeId: 'k3',
    },
    { ...createScene({ castId: 'tomas', name: 'Scene 1', id: 'scene-t', now: 5 }), takes: [{ id: 't', imageUrl: '/t.png', at: 1 }], keptTakeId: 't' },
  ];

  it('is each kept take of the Cast, its clip when it has one', () => {
    const shots = sceneCutShots(scenes, 'nora');
    assert.deepEqual(
      shots.map(shot => [shot.key, shot.kind, shot.url]),
      [
        ['scene-a', 'clip', '/k1.mp4'],
        ['scene-c', 'still', '/k3.png'],
      ]
    );
    assert.equal(shots[0]!.thumbUrl, '/k1.png');
  });

  it('is Cut\'s third source, keyed scenes:<id>, after Day and Story', () => {
    const slots = [{ id: 'morning', label: 'Morning' }] as DaySlot[];
    const stills = [{ slotId: 'morning', promptId: 'p', imageUrl: '/m.png', status: 'completed' }] as DaySlotStill[];
    const bySource = cutRoomSourceShots({ day: { slots, stills }, scenes: sceneCutShots(scenes, 'nora') });
    assert.deepEqual(
      bySource.scenes.map(shot => shot.key),
      ['scenes:scene-a', 'scenes:scene-c']
    );
    assert.deepEqual(activeCutSources(undefined, bySource), ['day', 'scenes']);
    assert.deepEqual(activeCutSources(['scenes'], bySource), ['scenes']);
    assert.deepEqual(
      cutRoomShots(bySource, ['scenes', 'day']).map(shot => shot.key),
      ['day:morning', 'scenes:scene-a', 'scenes:scene-c']
    );
    assert.deepEqual(splitCutRoomKey('scenes:scene-a'), { source: 'scenes', key: 'scene-a' });
  });
});

describe('scenes in Cast files', () => {
  it('carry the shots (not takes or partner) and land as new scenes of the imported Cast', () => {
    const scenes = [
      {
        ...kitchen({ mood: { dayMood: 'intimate', intimatePlayful: true, partnerCharacterId: 'tomas' } }),
        takes: [{ id: 'k', imageUrl: '/k.png', at: 1 }],
        keptTakeId: 'k',
      },
    ];
    const fileScenes = castFileScenes(scenes, 'nora');
    const file = buildCastFile({
      character: { id: 'nora', name: 'Nora', version: 1, updatedAt: 1 } as never,
      stories: [],
      scenes: fileScenes,
      now: 1,
    });
    const read = parseCastFile(JSON.parse(JSON.stringify(file)));
    assert.equal(read?.scenes?.length, 1);
    const [entry] = read!.scenes!;
    assert.equal(entry!.slot.location, 'small kitchen');
    assert.equal(entry!.dayMood, 'intimate');
    assert.equal(entry!.intimatePlayful, true);
    assert.equal('takes' in entry!, false);
    assert.equal('partnerCharacterId' in entry!, false);
    const placed = placeImportedScenes(read!.scenes!, 'nora-2', 100);
    assert.equal(placed[0]!.castId, 'nora-2');
    assert.notEqual(placed[0]!.id, 'scene-a');
    assert.deepEqual(placed[0]!.takes, []);
    assert.deepEqual(parseCastFileScenes([{ name: 'no slot' }, 'junk']), []);
  });
});
