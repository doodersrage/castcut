import { describe, it } from 'node:test';
import { isRestoredTake, normalizeDaySlotStills } from './planner';
import assert from 'node:assert/strict';
import {
  addScenePatch,
  castFileScenes,
  continuedSceneName,
  createScene,
  deleteScenePatch,
  keepSceneTake,
  keptTakeOf,
  normalizeSavedScene,
  normalizeSavedScenes,
  openScenePatch,
  parseCastFileScenes,
  placeImportedScenes,
  recordSceneFromWorking,
  recordSceneJobs,
  SCENE_JOB_LOG_LIMIT,
  SCENE_LIMIT_PER_CAST,
  removeSceneTake,
  restoreSceneTake,
  setSceneTakeReview,
  setSceneTakeNotes,
  resolveSceneChecks,
  renderingTakeIdsOf,
  SCENE_TAKE_LIMIT,
  sceneCardBusy,
  sceneCutNote,
  sceneCutShots,
  scriptScenesInOrder,
  sceneCutUse,
  sceneContinuing,
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
  sceneScriptPartners,
  sceneScriptRooms,
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

  // R2 (M0 audit D1): the cap dropped the least recently touched scene, kept take and all.
  it('never drops a scene with takes to stay under the per-Cast cap', () => {
    const withTake = (n: number) =>
      createScene({
        castId: 'nora',
        name: `Scene ${n}`,
        id: `taken-${n}`,
        takes: [{ id: `p${n}`, promptId: `p${n}`, imageUrl: `/api/gallery/media/e${n}`, at: n }],
        now: n,
      });
    const empty = (n: number) =>
      createScene({ castId: 'nora', name: `Empty ${n}`, id: `empty-${n}`, now: n });
    const checking = {
      ...createScene({ castId: 'nora', name: 'Checking', id: 'checking', now: 0.5 }),
      checkingTakeIds: ['p-check'],
    };
    const over = SCENE_LIMIT_PER_CAST + 5;
    const scenes = normalizeSavedScenes([
      { ...withTake(1), keptTakeId: 'p1' },
      checking,
      ...Array.from({ length: over }, (_, i) => withTake(i + 2)),
      empty(1000),
      empty(2000),
    ]);
    const ids = new Set(scenes.map(scene => scene.id));
    assert.ok(ids.has('taken-1'), 'the oldest, with its kept take');
    assert.ok(ids.has('checking'), 'a take still at the adult check counts as a take');
    for (let n = 2; n < over + 2; n += 1) assert.ok(ids.has(`taken-${n}`), `taken-${n}`);
    assert.ok(ids.has('empty-2000'), 'the newest empty scene (just made) stays');
    assert.ok(!ids.has('empty-1000'), 'older empty scenes go first');
  });

  // M6 V4 (D2): a shot's Scene made but not rendered yet was dropped, and the shot read Planned.
  it('never drops a Scene a script shot made, even with no takes yet', () => {
    const fromShot = createScene({
      castId: 'nora',
      name: 'Kitchen — wide',
      id: 'from-shot',
      fromScript: { scriptId: 's1', sceneId: 'int-kitchen-day', shotId: 'int-kitchen-day~1' },
      now: 0.1,
    });
    const empties = Array.from({ length: SCENE_LIMIT_PER_CAST + 3 }, (_, i) =>
      createScene({ castId: 'nora', name: `Empty ${i}`, id: `e${i}`, now: i + 1 })
    );
    const scenes = normalizeSavedScenes([fromShot, ...empties]);
    // Script Scenes don't count toward the cap (Part 19 G1): 60 of the others stay, and it.
    assert.equal(scenes.length, SCENE_LIMIT_PER_CAST + 1);
    const kept = scenes.find(scene => scene.id === 'from-shot');
    assert.deepEqual(kept?.fromScript, fromShot.fromScript);
    assert.ok(!scenes.some(scene => scene.id === 'e2'), 'the oldest unlinked empty Scenes go');
    assert.ok(scenes.some(scene => scene.id === 'e3'));
    // An episode's worth of script Scenes pushes out no Scene made by hand.
    const episode = Array.from({ length: 300 }, (_, i) =>
      createScene({
        castId: 'nora',
        name: `Shot ${i}`,
        id: `ep${i}`,
        fromScript: { scriptId: 's1', sceneId: 'int-kitchen-day', shotId: `int-kitchen-day~${i}` },
        now: 100 + i,
      })
    );
    const mixed = normalizeSavedScenes([...empties.slice(0, 10), ...episode]);
    assert.equal(mixed.length, 310);
  });

  it('drops empty scenes, oldest first, only while over the cap', () => {
    const empties = Array.from({ length: SCENE_LIMIT_PER_CAST + 3 }, (_, i) =>
      createScene({ castId: 'nora', name: `Empty ${i}`, id: `e${i}`, now: i + 1 })
    );
    const taken = createScene({
      castId: 'nora',
      name: 'Old take',
      id: 'old-take',
      takes: [{ id: 'p', promptId: 'p', imageUrl: '/api/gallery/media/e', at: 1 }],
      now: 0.1,
    });
    const scenes = normalizeSavedScenes([taken, ...empties]);
    assert.equal(scenes.length, SCENE_LIMIT_PER_CAST);
    const ids = new Set(scenes.map(scene => scene.id));
    assert.ok(ids.has('old-take'));
    for (const gone of ['e0', 'e1', 'e2', 'e3']) assert.ok(!ids.has(gone), gone);
    assert.ok(ids.has('e4') && ids.has(`e${SCENE_LIMIT_PER_CAST + 2}`));
    // Another Cast's scenes count against their own cap only.
    const other = createScene({ castId: 'tomas', name: 'Scene 1', id: 't1', now: 1 });
    assert.ok(normalizeSavedScenes([...empties, other]).some(scene => scene.id === 't1'));
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

  it('a shot keeps the location record it is set in (M8 T1)', () => {
    const slot = sceneSlotOf([
      { id: 'morning', label: 'Morning', location: 'corner café', locationId: ' loc-cafe ' } as DaySlot,
    ]);
    assert.equal(slot.locationId, 'loc-cafe');
    assert.equal(slot.location, 'corner café', 'its words stay');
    assert.equal(sceneSlotOf([{ id: 'morning', label: 'Morning', locationId: '' } as DaySlot]).locationId, undefined);
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

  // M10 T2: a removed take back from the trash — a new id, where it stood, kept again if it was.
  it('restores a removed take where it stood, kept again when nothing is kept', () => {
    const scene = {
      ...kitchen(),
      takes: [
        { id: 'p1', imageUrl: '/1.png', at: 1 },
        { id: 'p2', imageUrl: '/2.png', at: 2 },
        { id: 'p3', imageUrl: '/3.png', at: 3 },
      ],
      keptTakeId: 'p2',
    };
    const removed = removeSceneTake(scene, 'p2', 7);
    const back = restoreSceneTake(removed, scene.takes[1], { index: 1, keep: true, now: 8 });
    assert.ok(back);
    assert.notEqual(back.takeId, 'p2');
    assert.deepEqual(
      back.scene.takes.map(take => take.imageUrl),
      ['/1.png', '/2.png', '/3.png']
    );
    assert.equal(back.scene.keptTakeId, back.takeId);
    // The old id's removal stays (a synced tombstone): the restored take is not it.
    assert.ok(back.scene.removedTakeIds?.includes('p2'));
    assert.equal(normalizeSavedScene(back.scene)?.takes.length, 3);
    // Something else kept since: it stays kept.
    const other = restoreSceneTake(keepSceneTake(removed, 'p3', 9), scene.takes[1], { keep: true });
    assert.equal(other?.scene.keptTakeId, 'p3');
    assert.equal(restoreSceneTake(removed, { nope: true }), null);
  });

  it('rates and notes a take; the same rating or an empty note clears it', () => {
    const scene = {
      ...kitchen(),
      takes: [{ id: 'p1', imageUrl: '/1.png', at: 1 }],
      updatedAt: 1,
    };
    const rated = setSceneTakeNotes(scene, 'p1', { stars: 4, note: '  best   face ' }, 5);
    assert.equal(rated.takes[0]!.stars, 4);
    assert.equal(rated.takes[0]!.note, 'best face');
    assert.equal(rated.updatedAt, 5);
    assert.equal(setSceneTakeNotes(rated, 'p1', { stars: 4 }, 6), rated, 'nothing changed');
    const cleared = setSceneTakeNotes(rated, 'p1', { stars: null, note: '' }, 7);
    assert.equal(cleared.takes[0]!.stars, undefined);
    assert.equal(cleared.takes[0]!.note, undefined);
    assert.equal(setSceneTakeNotes(scene, 'nope', { stars: 3 }), scene);
  });

  // M7 T3: a verdict on a take, set without rendering it again.
  it('approves and rejects takes, never the kept one, and keeping a rejected take restores it', () => {
    const scene = {
      ...kitchen(),
      takes: [
        { id: 'p1', imageUrl: '/1.png', at: 1 },
        { id: 'p2', imageUrl: '/2.png', at: 2 },
      ],
      keptTakeId: 'p1',
      updatedAt: 1,
    };
    const approved = setSceneTakeReview(scene, 'p2', 'approved', 5);
    assert.equal(approved.takes[1]!.review, 'approved');
    assert.equal(approved.updatedAt, 5, 'a newer copy, so it wins the merge across devices');
    const rejected = setSceneTakeReview(approved, 'p2', 'rejected', 6);
    assert.equal(rejected.takes[1]!.review, 'rejected');
    assert.equal(setSceneTakeReview(rejected, 'p2', null, 7).takes[1]!.review, undefined);
    // The kept take can't be rejected; an unknown take or the same verdict changes nothing.
    assert.equal(setSceneTakeReview(scene, 'p1', 'rejected', 8), scene);
    assert.equal(setSceneTakeReview(scene, 'nope', 'approved', 8), scene);
    assert.equal(setSceneTakeReview(rejected, 'p2', 'rejected', 9), rejected);
    // Keeping a rejected take restores it.
    const keptAgain = keepSceneTake(rejected, 'p2', 10);
    assert.equal(keptAgain.keptTakeId, 'p2');
    assert.equal(keptAgain.takes[1]!.review, undefined);
    assert.equal(keepSceneTake(scene, 'p2', 11).takes, scene.takes, 'nothing to restore: same list');
  });

  it('keeps a verdict through a save and a reload, and drops rejected takes first past the limit', () => {
    const [read] = normalizeSavedScenes([
      {
        ...kitchen(),
        takes: [
          { id: 'a', imageUrl: '/a.png', at: 1, review: 'approved' },
          { id: 'b', imageUrl: '/b.png', at: 2, review: 'rejected' },
          { id: 'c', imageUrl: '/c.png', at: 3, review: 'bogus' },
        ],
      },
    ]);
    assert.deepEqual(
      read!.takes.map(take => [take.id, take.review]),
      [
        ['a', 'approved'],
        ['b', 'rejected'],
        ['c', undefined],
      ]
    );
    const takes = Array.from({ length: SCENE_TAKE_LIMIT + 3 }, (_, at) => ({
      id: `p${at}`,
      imageUrl: `/p${at}.png`,
      at: at + 1,
      // The three newest are rejected: they go before any older candidate.
      ...(at >= SCENE_TAKE_LIMIT ? { review: 'rejected' as const } : {}),
    }));
    const [bounded] = normalizeSavedScenes([{ ...kitchen(), takes }]);
    assert.equal(bounded!.takes.length, SCENE_TAKE_LIMIT);
    assert.ok(bounded!.takes.every(take => take.review !== 'rejected'));
    assert.equal(bounded!.takes[0]!.id, 'p0', 'the oldest candidate stays');
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
        restoredFor: 'p1',
        imageUrl: '/1.png',
        status: 'completed',
        finishedUrl: '/1-done.png',
        finishedFor: 'p1',
      },
    ]);
  });

  it('keeps what she wears and the plate per scene (user request 2026-10-24)', () => {
    const dress = {
      customGarmentImageUrl: '/view?filename=red-dress.png&type=input',
      customGarmentImageFilename: 'red-dress.png',
      customGarmentDescription: 'a red wrap dress',
      footwear: 'white sneakers',
      plateImageFilename: 'cast-plate-a.png',
      plateCharacterId: 'nora',
    };
    // A new scene starts dressed as the page is; opening it puts that back.
    const a = kitchen({ outfit: dress });
    assert.deepEqual(a.outfit, dress);
    const opened = sceneWorkingPatch(a);
    assert.equal(opened.customGarmentImageFilename, 'red-dress.png');
    assert.equal(opened.footwear, 'white sneakers');
    assert.equal(opened.plateImageFilename, 'cast-plate-a.png');
    // A scene in the default outfit clears the last scene's clothing photo.
    const b = kitchen({ id: 'scene-b', outfit: {} });
    const backToB = sceneWorkingPatch(b);
    assert.ok('customGarmentImageFilename' in backToB);
    assert.equal(backToB.customGarmentImageFilename, undefined);
    // A change on the page is recorded on the open scene.
    const changed = recordSceneFromWorking(a, {
      ...sceneWorkingPatch(a),
      footwear: 'black heels',
    } as SceneToolCache);
    assert.equal(changed.outfit?.footwear, 'black heels');
    assert.equal(changed.outfit?.customGarmentImageFilename, 'red-dress.png');
  });

  it('an older scene that never kept its outfit opens dressed as the page is, then keeps it', () => {
    const { outfit: _none, ...old } = kitchen();
    const patch = sceneWorkingPatch(old as SavedScene);
    assert.equal('customGarmentImageFilename' in patch, false);
    assert.equal('plateImageFilename' in patch, false);
    const recorded = recordSceneFromWorking(old as SavedScene, {
      ...patch,
      customGarmentImageFilename: 'blue-jeans.png',
    } as SceneToolCache);
    assert.equal(recorded.outfit?.customGarmentImageFilename, 'blue-jeans.png');
    // And it survives a save.
    assert.deepEqual(normalizeSavedScene(JSON.parse(JSON.stringify(recorded)))?.outfit, recorded.outfit);
  });

  it('a Cast file carries the scene’s clothing but not its plate (it names this install’s Cast)', () => {
    const a = kitchen({
      outfit: { customGarmentImageFilename: 'red-dress.png', plateImageFilename: 'cast-plate-a.png' },
    });
    const [file] = castFileScenes([a], 'nora');
    assert.deepEqual(file!.outfit, { customGarmentImageFilename: 'red-dress.png' });
    const [placed] = placeImportedScenes([file!], 'nora-2');
    assert.equal(placed!.outfit?.customGarmentImageFilename, 'red-dress.png');
    assert.equal(placed!.outfit?.plateImageFilename, undefined);
  });

  it('a take put back on the card is marked restored, so the after-landing passes skip it', () => {
    // Switching scenes re-rendered: the pose redo read the other scene's old take as just landed
    // (user report 2026-10-24).
    const scene = {
      ...kitchen(),
      takes: [{ id: 'p1', promptId: 'p1', imageUrl: '/1.png', at: 1 }],
      keptTakeId: 'p1',
    };
    const [still] = sceneWorkingPatch(scene).stills!;
    assert.equal(isRestoredTake(still), true);
    // Kept through saving, and gone as soon as the card renders a new take.
    assert.equal(
      isRestoredTake(normalizeDaySlotStills([still!]).find(entry => entry.slotId === still!.slotId)),
      true
    );
    assert.equal(isRestoredTake({ ...still!, promptId: 'p2' }), false);
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

  it('remembers removed takes and deleted scenes, for the cross-device merge (R6)', () => {
    const takes = [
      { id: 'p1', promptId: 'p1', imageUrl: '/view?filename=p1.png', at: 1 },
      { id: 'p2', promptId: 'p2', imageUrl: '/view?filename=p2.png', at: 2 },
    ];
    const scene = kitchen({ takes });
    const removed = removeSceneTake(scene, 'p2', 50);
    assert.deepEqual(removed.removedTakeIds, ['p2']);
    // Still on the card: recording the card does not put it back.
    const recorded = recordSceneFromWorking(
      removed,
      { slots: [removed.slot], stills: [done('p2', { slotId: removed.slot.id })] },
      60
    );
    assert.deepEqual(
      recorded.takes.map(take => take.id),
      ['p1']
    );
    // Read back: kept, and a stray copy of the removed take is dropped.
    const back = normalizeSavedScene({ ...removed, takes }, 70)!;
    assert.deepEqual(back.removedTakeIds, ['p2']);
    assert.deepEqual(
      back.takes.map(take => take.id),
      ['p1']
    );

    const cache: SceneToolCache = { scenes: [scene], activeSceneId: 'other' };
    assert.deepEqual(deleteScenePatch(cache, scene.id, 99).removedSceneAt, { [scene.id]: 99 });
  });

  // M1 gate (ROADMAP §4): a failed job cannot erase an approved take; a retry adds a take, it
  // never replaces the kept one.
  it('a failed render or a retry never touches the kept take', () => {
    const kept = { id: 'p1', promptId: 'p1', imageUrl: '/api/gallery/media/p1', at: 1 };
    const scene = { ...kitchen({ takes: [kept] }), keptTakeId: 'p1' };
    const failed = recordSceneFromWorking(scene, {
      slots: [scene.slot],
      stills: [{ slotId: scene.slot.id, promptId: 'p2', status: 'error' }],
    });
    assert.equal(failed, scene, 'nothing recorded for a failed render');
    const retried = recordSceneFromWorking(
      scene,
      { slots: [scene.slot], stills: [done('p3', { slotId: scene.slot.id })] },
      50
    );
    assert.deepEqual(
      retried.takes.map(take => take.id),
      ['p1', 'p3']
    );
    assert.equal(retried.keptTakeId, 'p1');
    assert.equal(keptTakeOf(retried)?.imageUrl, '/api/gallery/media/p1');
  });

  it("says what Cut does when a scene's kept take goes (R7)", () => {
    const scene = { id: 's1', keptTakeId: 'p1' };
    assert.equal(sceneCutUse(undefined, scene), 'follows');
    assert.equal(sceneCutUse({ sources: ['day'] }, scene), 'none');
    assert.equal(sceneCutUse(undefined, { id: 's1' }), 'none');
    const leftOut = { options: { shotEdits: { shots: { 'scenes:s1': { include: false } } } } };
    assert.equal(sceneCutUse(leftOut, scene), 'none');
    const pinnedCopy = {
      options: { shotEdits: { shots: { 'scenes:s1~2': { pin: { url: '/take.mp4' } } } } },
    };
    assert.equal(sceneCutUse(pinnedCopy, scene), 'pinned');
    assert.equal(sceneCutUse(pinnedCopy, { id: 's1' }), 'pinned', 'pinned plays on without it');
    assert.match(sceneCutNote('follows'), /leaves the cut/);
    assert.match(sceneCutNote('pinned'), /keeps playing/);
    assert.equal(sceneCutNote('none'), '');
  });

  it('logs which scene each job was for (R4)', () => {
    const log = recordSceneJobs(undefined, { promptId: 'p1', clipPromptId: 'c1' }, 'Kitchen', 'scene-a');
    assert.deepEqual(
      log.map(job => [job.promptId, job.sceneId]),
      [
        ['p1', 'scene-a'],
        ['c1', 'scene-a'],
      ]
    );
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

describe('a take still rendering goes with its scene (M5 Queue all)', () => {
  it('is kept on its scene, lands there by prompt id, and comes back on the card', () => {
    const a = kitchen();
    const b = createScene({ castId: 'nora', name: 'Scene 2', id: 'scene-b', now: 20 });
    const rendering = done('p-run', { status: 'running', imageUrl: undefined });
    assert.deepEqual(renderingTakeIdsOf(rendering), ['p-run']);
    assert.deepEqual(renderingTakeIdsOf({ ...rendering, adultHold: 'checking' }), []);
    const cache: SceneToolCache = { scenes: [a, b], ...sceneWorkingPatch(a), stills: [rendering] };
    const toB = openScenePatch(cache, 'scene-b', 30)!;
    assert.deepEqual(toB.stills, []);
    const savedA = toB.scenes!.find(scene => scene.id === 'scene-a')!;
    assert.deepEqual(savedA.renderingTakeIds, ['p-run']);
    assert.deepEqual(normalizeSavedScenes(toB.scenes)[0]?.renderingTakeIds, ['p-run']);

    // Not finished (or not in this Gallery yet): unchanged.
    assert.equal(resolveSceneChecks(savedA, [{ promptId: 'p-run', status: 'pending' }]), savedA);
    assert.equal(resolveSceneChecks(savedA, []), savedA);
    // Finished: a take on A.
    const landed = resolveSceneChecks(
      savedA,
      [{ promptId: 'p-run', status: 'completed', imageUrl: '/view?filename=p-run.png' }],
      40
    );
    assert.deepEqual(landed.takes.map(take => take.id), ['p-run']);
    assert.equal(landed.renderingTakeIds, undefined);
    // Held by the adult check: it waits there instead.
    const held = resolveSceneChecks(savedA, [
      {
        promptId: 'p-run',
        status: 'completed',
        imageUrl: '/view?filename=p-run.png',
        adultCheck: { state: 'pending' },
      },
    ]);
    assert.deepEqual(held.checkingTakeIds, ['p-run']);
    assert.equal(held.renderingTakeIds, undefined);
    assert.deepEqual(held.takes, []);
    // Failed: dropped.
    const failed = resolveSceneChecks(savedA, [{ promptId: 'p-run', status: 'error' }]);
    assert.equal(failed.renderingTakeIds, undefined);
    assert.deepEqual(failed.takes, []);

    // Opened again while it renders: back on the card, rendering.
    const backToA = openScenePatch({ ...cache, ...toB }, 'scene-a', 50)!;
    assert.equal(backToA.stills?.[0]?.promptId, 'p-run');
    assert.equal(backToA.stills?.[0]?.status, 'running');
  });
});

describe('Continue scene', () => {
  const kitchen = (): SavedScene => ({
    ...createScene({
      castId: 'nora',
      name: 'Kitchen',
      id: 'scene-kitchen',
      slot: {
        id: 'evening',
        label: 'Evening',
        location: 'small kitchen',
        locationId: 'loc-1',
        sceneHints: 'stirring a pot of risotto',
        line: 'Almost ready.',
        narration: 'She cooks.',
        state: { carries: [{ text: 'a wooden spoon', carriesOver: true }] },
      },
      mood: { dayMood: 'everyday', partnerCharacterId: 'tomas' },
      outfit: { wardrobeId: 'kit-1' },
      takes: [
        {
          id: 'take-1',
          promptId: 'take-1',
          imageUrl: '/still.png',
          clipUrl: '/clip.mp4',
          at: 1,
        },
      ],
      now: 1,
    }),
    keptTakeId: 'take-1',
  });

  it('starts from the clip\'s last frame, kept, with the people, place and story — not the beat', () => {
    const next = sceneContinuing({
      scene: kitchen(),
      take: kitchen().takes[0]!,
      frameUrl: '/api/comfyui/view?filename=last.png&type=input',
      name: 'Kitchen, continued',
      now: 50,
      id: 'scene-next',
    });
    assert.equal(next.castId, 'nora');
    assert.equal(next.name, 'Kitchen, continued');
    assert.equal(next.partnerCharacterId, 'tomas');
    assert.equal(next.dayMood, 'everyday');
    assert.deepEqual(next.continuesFrom, { sceneId: 'scene-kitchen', takeId: 'take-1' });
    assert.equal(next.takes.length, 1);
    assert.equal(keptTakeOf(next)?.imageUrl, '/api/comfyui/view?filename=last.png&type=input');
    assert.equal(keptTakeOf(next)?.clipUrl, undefined);
    assert.equal(next.slot.location, 'small kitchen');
    assert.equal(next.slot.locationId, 'loc-1');
    assert.deepEqual(next.slot.state, { carries: [{ text: 'a wooden spoon', carriesOver: true }] });
    assert.equal(next.slot.sceneHints, undefined);
    assert.equal(next.slot.line, undefined);
    assert.equal(next.slot.narration, undefined);
    // Saved and read back, it keeps where it came from and its kept frame.
    const stored = normalizeSavedScene(JSON.parse(JSON.stringify(next)))!;
    assert.deepEqual(stored.continuesFrom, next.continuesFrom);
    assert.equal(stored.keptTakeId, next.keptTakeId);
  });

  it('is named after the scene it continues, numbered when taken', () => {
    assert.equal(continuedSceneName([], 'nora', 'Kitchen'), 'Kitchen, continued');
    const taken = [
      { castId: 'nora', name: 'Kitchen, continued' },
      { castId: 'nora', name: 'Kitchen, continued 2' },
    ];
    assert.equal(continuedSceneName(taken, 'nora', 'Kitchen'), 'Kitchen, continued 3');
    // Continuing a continuation doesn't stack the word.
    assert.equal(continuedSceneName(taken, 'nora', 'Kitchen, continued 2'), 'Kitchen, continued 3');
    // Another Cast's names don't count.
    assert.equal(continuedSceneName(taken, 'tomas', 'Kitchen'), 'Kitchen, continued');
  });
});

describe('one script’s Scenes for Cut', () => {
  const scene = (id: string, scriptId: string | null, createdAt: number) =>
    ({
      id,
      castId: 'c',
      name: id,
      slot: { id: 'morning', label: 'Morning' },
      takes: [{ id: `${id}-t`, imageUrl: `/${id}.png`, at: 1 }],
      keptTakeId: `${id}-t`,
      ...(scriptId ? { fromScript: { scriptId, sceneId: 's', shotId: id } } : {}),
      createdAt,
      updatedAt: createdAt,
    }) as SavedScene;

  it('keeps the script’s own, in its shots’ order — a later moment in its place', () => {
    const scenes = [scene('a', 'x', 1), scene('hand', null, 2), scene('c', 'x', 3), scene('b', 'x', 9), scene('o', 'y', 4)];
    const script = { id: 'x', shots: [{ madeSceneId: 'a' }, { madeSceneId: 'b' }, { madeSceneId: 'c' }] };
    const ordered = scriptScenesInOrder(scenes, script);
    assert.deepEqual(ordered.map(entry => entry.id), ['a', 'b', 'c']);
    assert.deepEqual(sceneCutShots(ordered, 'c', 3, true).map(shot => shot.key), ['a', 'b', 'c']);
    // Unordered, Cut goes by when each was made.
    assert.deepEqual(sceneCutShots(ordered, 'c').map(shot => shot.key), ['a', 'c', 'b']);
  });

  it('puts a Scene no shot was made for with its scene, by the script — not at the end', () => {
    // A short of three scenes: scene 2's card Scene was made last and no planned shot names it.
    const source = 'INT. KITCHEN - MORNING\n\nShe pours.\n\nINT. CAFE - DAY\n\nShe waits.\n\nEXT. PARK - EVENING\n\nShe walks.\n';
    const at = (id: string, sceneId: string, createdAt: number) =>
      ({ ...scene(id, 'x', createdAt), fromScript: { scriptId: 'x', sceneId, shotId: id } }) as SavedScene;
    const scenes = [
      at('k1', 'int-kitchen-morning', 1),
      at('p1', 'ext-park-evening', 2),
      // The cafe's shot isn't rendered yet: its card shows the moment till then.
      { ...at('c1', 'int-cafe-day', 3), keptTakeId: undefined } as SavedScene,
      { ...at('cafe-card', 'int-cafe-day', 9), fromDaySlot: 'afternoon' } as SavedScene,
      { ...at('k-card', 'int-kitchen-morning', 8), fromDaySlot: 'morning' } as SavedScene,
    ];
    const script = {
      id: 'x',
      source,
      shots: [
        { madeSceneId: 'k1', sceneId: 'int-kitchen-morning' },
        { madeSceneId: 'p1', sceneId: 'ext-park-evening' },
        { madeSceneId: 'c1', sceneId: 'int-cafe-day' },
      ],
    };
    // The kitchen's shot has a kept take: it plays, not the card beside it (cards don't render).
    assert.deepEqual(
      scriptScenesInOrder(scenes, script).map(entry => entry.id),
      ['k1', 'c1', 'cafe-card', 'p1']
    );
    // A one-shot short (no planned shots): by the script's scenes, not when each was made.
    assert.deepEqual(
      scriptScenesInOrder(scenes, { id: 'x', source }).map(entry => entry.id),
      ['k1', 'k-card', 'c1', 'cafe-card', 'p1']
    );
  });

  it('leaves out an earlier short’s shots: Scenes of shots the script no longer has', () => {
    // A Short written anew on the same board keeps its script: the moment's shots are planned
    // again and the old shots' Scenes are moved to the new heading (dayAsShort's "alongside"),
    // still naming their dropped shots. Cut listed them with the new short's (user, 2026-11-13).
    const source = 'INT. BOOKSHOP - DAY\n\nShe reads.\n';
    const at = (id: string, shotId: string, createdAt: number) =>
      ({
        ...scene(id, 'x', createdAt),
        fromScript: { scriptId: 'x', sceneId: 'int-bookshop-day', shotId },
      }) as SavedScene;
    const scenes = [
      at('old-1', 'int-kitchen-morning~1', 1),
      at('old-2', 'int-kitchen-morning~2', 2),
      // The card's own Scene, loose: the moment's shots are rendered, so they play instead.
      { ...at('card', 'int-kitchen-morning~3', 3), fromDaySlot: 'morning' } as SavedScene,
      at('new-1', 'int-bookshop-day~1', 10),
      at('new-2', 'int-bookshop-day~2', 11),
      // Made for a shot whose madeSceneId names another Scene (a second Scene of it): still its.
      at('new-2b', 'int-bookshop-day~2', 12),
      // Made before Scenes named their shot: kept, as before.
      { ...scene('legacy', 'x', 5), fromScript: { scriptId: 'x', sceneId: 'int-bookshop-day' } } as SavedScene,
    ];
    const script = {
      id: 'x',
      source,
      shots: [
        { id: 'int-bookshop-day~1', madeSceneId: 'new-1', sceneId: 'int-bookshop-day' },
        { id: 'int-bookshop-day~2', madeSceneId: 'new-2', sceneId: 'int-bookshop-day' },
      ],
    };
    assert.deepEqual(
      scriptScenesInOrder(scenes, script).map(entry => entry.id),
      ['new-1', 'new-2', 'legacy', 'new-2b']
    );
    // No planned shots (a one-shot short): nothing to tell them apart by — every Scene, as before.
    assert.equal(scriptScenesInOrder(scenes, { id: 'x', source }).length, scenes.length);
  });
});

describe('a Scene from any moment of a long board', () => {
  it('keeps a "-3" moment’s place and beat (boards go to twelve)', () => {
    for (const id of ['morning-3', 'afternoon-3', 'evening-3', 'night-3', 'night-2', 'morning']) {
      const slot = sceneSlotOf([{ id, label: id, location: 'office', sceneHints: `beat ${id}` } as never]);
      assert.equal(slot.id, id);
      assert.equal(slot.sceneHints, `beat ${id}`, id);
      assert.equal(slot.location, 'office', id);
    }
  });
});

describe('the rooms one room a scene made (2026-11-11)', () => {
  it('keeps script|scene → filename, drops the malformed', () => {
    assert.deepEqual(
      sceneScriptRooms({ 's1|int-kitchen-morning': 'scene-room-a.png', bad: 'x.png', 's1|y': 3, 's1|z': ' ' }),
      { 's1|int-kitchen-morning': 'scene-room-a.png' }
    );
    assert.deepEqual(sceneScriptRooms(null), {});
    assert.deepEqual(sceneScriptRooms('nope'), {});
  });
});

describe('one partner a film (2026-11-11)', () => {
  it('keeps scriptId → a stand-in with a face file, drops the malformed', () => {
    const man = { noun: 'man', look: 'a South Asian man in his early thirties', filename: 'day-partner-a.png', imageUrl: '/view?a' };
    assert.deepEqual(
      sceneScriptPartners({
        s1: man,
        s2: { noun: 'person', look: 'x', filename: 'b.png' },
        s3: { noun: 'woman', look: 'y', filename: ' ' },
        'a|b': man,
        'a|b|c': man,
        '|b': man,
        s4: 'nope',
      }),
      // Someone else the film shows keeps a face under script|who ("…|elderly man").
      { s1: man, 'a|b': man }
    );
    // An older save has no map at all.
    assert.deepEqual(sceneScriptPartners(undefined), {});
  });
});
