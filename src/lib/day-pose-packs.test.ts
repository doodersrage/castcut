import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import { daySlotsForLength, dayBeatIsTyped, typedDayBeatPatch, type DaySlot } from './day-planner';
import { dayPoseAsPhotoPose } from './day-pose-presets';
import {
  activePosePack,
  applyPosePackToSlots,
  BUILT_IN_POSE_PACKS,
  clearPosePackFromSlots,
  normalizePosePack,
  posePackEntryPeople,
  posePackFromSlots,
  type PosePack,
} from './day-pose-packs';
import {
  loadMyPosePacks,
  removeMyPosePack,
  replaceMyPosePacks,
  saveMyPosePack,
} from './my-pose-packs';
import { planDaySlotPose } from './day-slot-pose';
import { resolveSceneGuidePlan } from './day-pose-guide';
import { POSE_PICKER_GROUPS } from './pose-layout-labels';

const PICKER_IDS = new Set(POSE_PICKER_GROUPS.flatMap(group => group.ids));
/** Layouts the live sweeps flagged (see the module comment). */
const FLAGGED = ['sport_pushup', 'sport_pullup', 'foot_up', 'lie_side', 'photograph'];

const fitness = BUILT_IN_POSE_PACKS.find(pack => pack.id === 'fitness')!;

function sixSlots(): DaySlot[] {
  return daySlotsForLength(6).map(slot => ({ ...slot }));
}

const duoPhoto = {
  aspect: 1,
  people: [
    dayPoseAsPhotoPose('stand')!.people[0]!,
    dayPoseAsPhotoPose('walk')!.people[0]!,
  ],
};

describe('built-in pose packs', () => {
  it('ships the six themes, each a list of solo Day poses that draw a figure', () => {
    assert.deepEqual(
      BUILT_IN_POSE_PACKS.map(pack => pack.name),
      ['Fitness', 'Dance', 'Portrait', 'Lounging', 'Street style', 'Beach']
    );
    const ids = new Set<string>();
    for (const pack of BUILT_IN_POSE_PACKS) {
      assert.ok(!ids.has(pack.id), `duplicate id ${pack.id}`);
      ids.add(pack.id);
      assert.ok(pack.entries.length >= 6, `${pack.name} has too few poses`);
      for (const entry of pack.entries) {
        const layout = entry.layout!;
        assert.ok(PICKER_IDS.has(layout), `${pack.name}: ${layout} is not a Day pose`);
        assert.ok(dayPoseAsPhotoPose(layout), `${pack.name}: ${layout} draws no solo figure`);
        assert.equal(posePackEntryPeople(entry), 1, `${pack.name}: ${layout} is not solo`);
        assert.ok(!FLAGGED.includes(layout), `${pack.name}: ${layout} has a weak live record`);
        assert.ok(entry.beat?.trim(), `${pack.name}: ${layout} has no beat`);
      }
    }
  });

  it('a pack beat reads as its own pose, for one person (words and guide agree)', () => {
    for (const pack of BUILT_IN_POSE_PACKS) {
      for (const entry of pack.entries) {
        const plan = planDaySlotPose({ slot: { id: 'morning', sceneHints: entry.beat }, dayMood: 'everyday' });
        assert.equal(plan.headcount, 1, `${pack.name}: "${entry.beat}" plans a duo`);
        const { intent } = resolveSceneGuidePlan(plan.sceneText, 0, plan.options);
        assert.equal(
          intent.intimate ?? intent.social ?? intent.base,
          entry.layout,
          `${pack.name}: "${entry.beat}" reads as another pose`
        );
      }
    }
  });
});

describe('applyPosePackToSlots', () => {
  it('poses every slot in order, cycling with a new variant on the second lap', () => {
    const short: PosePack = { id: 'x', name: 'X', entries: fitness.entries.slice(0, 4) };
    const { slots, posed, skipped } = applyPosePackToSlots(sixSlots(), short);
    assert.equal(posed, 6);
    assert.equal(skipped, 0);
    assert.deepEqual(
      slots.map(slot => slot.poseLayout),
      ['sport_yoga_warrior', 'sport_squat', 'stretch', 'sport_cycle', 'sport_yoga_warrior', 'sport_squat']
    );
    assert.deepEqual(
      slots.map(slot => slot.poseVariant),
      [undefined, undefined, undefined, undefined, 1, 1]
    );
  });

  it('replaces earlier pose picks (photo, camera) on the slot', () => {
    const slots = sixSlots();
    slots[0] = { ...slots[0]!, posePhoto: duoPhoto, poseCamera: 'side', poseVariant: 4 };
    const result = applyPosePackToSlots(slots, fitness);
    assert.equal(result.slots[0]!.posePhoto, undefined);
    assert.equal(result.slots[0]!.poseCamera, undefined);
    assert.equal(result.slots[0]!.poseVariant, undefined);
    assert.equal(result.slots[0]!.poseLayout, 'sport_yoga_warrior');
  });

  it('fills only empty beats, never a typed or existing one', () => {
    const slots = sixSlots();
    slots[0] = { ...slots[0]!, ...typedDayBeatPatch(slots[0]!, 'my own beat') };
    slots[1] = { ...slots[1]!, sceneHints: "Day's beat", location: 'office' };
    slots[2] = { ...slots[2]!, location: 'my rooftop' };
    const result = applyPosePackToSlots(slots, fitness, { fillBeats: true });
    assert.equal(result.slots[0]!.sceneHints, 'my own beat');
    assert.ok(dayBeatIsTyped(result.slots[0]!));
    assert.equal(result.slots[1]!.sceneHints, "Day's beat");
    assert.equal(result.slots[1]!.location, 'office');
    // Empty beat filled; the player's setting kept.
    assert.equal(result.slots[2]!.sceneHints, fitness.entries[2]!.beat);
    assert.equal(result.slots[2]!.location, 'my rooftop');
    assert.equal(result.slots[3]!.location, fitness.entries[3]!.setting);
    assert.equal(result.beatsFilled, 4);
    assert.equal(dayBeatIsTyped(result.slots[3]!), false);

    const noFill = applyPosePackToSlots(sixSlots(), fitness);
    assert.equal(noFill.beatsFilled, 0);
    assert.equal(noFill.slots[0]!.sceneHints, undefined);
  });

  it('routes around weak layouts unless that leaves nothing', () => {
    const avoid = new Set(['sport_yoga_warrior']);
    const { slots } = applyPosePackToSlots(sixSlots(), fitness, { avoidLayouts: avoid });
    assert.ok(slots.every(slot => slot.poseLayout !== 'sport_yoga_warrior'));
    const one: PosePack = { id: 'o', name: 'O', entries: [{ layout: 'sport_yoga_warrior' }] };
    const forced = applyPosePackToSlots(sixSlots(), one, { avoidLayouts: avoid });
    assert.ok(forced.slots.every(slot => slot.poseLayout === 'sport_yoga_warrior'));
  });

  it('a duo slot only takes a two-person pose; a solo pack leaves it alone', () => {
    const slots = sixSlots();
    slots[1] = { ...slots[1]!, poseLayout: 'hug' };
    const solo = applyPosePackToSlots(slots, fitness, { slotPeople: [1, 2, 1, 1, 1, 1] });
    assert.equal(solo.skipped, 1);
    assert.equal(solo.slots[1]!.poseLayout, 'hug');
    // The solo cycle carries on past the duo slot.
    assert.equal(solo.slots[2]!.poseLayout, 'sport_squat');

    const mixed: PosePack = {
      id: 'm',
      name: 'M',
      entries: [{ layout: 'walk' }, { photo: duoPhoto }, { layout: 'dance' }],
    };
    const result = applyPosePackToSlots(sixSlots(), mixed, { slotPeople: [1, 2, 2, 2, 1, 1] });
    assert.equal(result.slots[1]!.posePhoto?.people.length, 2);
    assert.equal(result.slots[2]!.poseLayout, 'dance');
    assert.equal(result.slots[3]!.posePhoto?.people.length, 2);
    assert.equal(result.slots[3]!.poseVariant, undefined);
    assert.equal(result.slots[4]!.poseLayout, 'walk');
    assert.equal(result.slots[4]!.poseVariant, 1);
  });
});

describe('clearPosePackFromSlots / activePosePack', () => {
  it('finds the applied pack, and clearing puts every slot back to auto', () => {
    const applied = applyPosePackToSlots(sixSlots(), fitness, { fillBeats: true }).slots;
    applied[4] = { ...applied[4]!, ...typedDayBeatPatch(applied[4]!, 'typed over it') };
    assert.equal(activePosePack(applied, BUILT_IN_POSE_PACKS)?.id, 'fitness');
    const cleared = clearPosePackFromSlots(applied);
    assert.ok(cleared.every(slot => !slot.poseLayout && !slot.posePhoto && !slot.poseVariant));
    // The pack's beats and settings go; a beat the player typed stays.
    assert.equal(cleared[0]!.sceneHints, undefined);
    assert.equal(cleared[0]!.location, undefined);
    assert.equal(cleared[4]!.sceneHints, 'typed over it');
    assert.equal(activePosePack(cleared, BUILT_IN_POSE_PACKS), null);
  });

  it('a hand-picked pose that is in no pack means no active pack', () => {
    const applied = applyPosePackToSlots(sixSlots(), fitness).slots;
    applied[0] = { ...applied[0]!, poseLayout: 'cook' };
    assert.equal(activePosePack(applied, BUILT_IN_POSE_PACKS), null);
  });

  it('prefers the pack whose order matches when two share the poses', () => {
    const street = BUILT_IN_POSE_PACKS.find(pack => pack.id === 'street')!;
    const slots = applyPosePackToSlots(daySlotsForLength(2), street).slots;
    // walk + lean_wall: Street style (in that order); Beach has walk but not lean_wall.
    assert.equal(activePosePack(slots, BUILT_IN_POSE_PACKS)?.id, 'street');
  });
});

describe('posePackFromSlots / normalizePosePack', () => {
  it('saves the posed slots in order with their picks, skipping unposed ones', () => {
    const slots = sixSlots();
    slots[0] = { ...slots[0]!, poseLayout: 'walk', poseVariant: 3, poseCamera: 'low' };
    slots[2] = { ...slots[2]!, posePhoto: duoPhoto, poseLead: 'right' };
    const pack = posePackFromSlots(slots, '  Gym day  ', 'mine-1', 5)!;
    assert.equal(pack.name, 'Gym day');
    assert.equal(pack.mine, true);
    assert.deepEqual(pack.entries[0], { layout: 'walk', variant: 3, camera: 'low' });
    assert.equal(pack.entries[1]!.photo?.people.length, 2);
    assert.equal(pack.entries[1]!.lead, 'right');
    assert.equal(pack.entries.length, 2);
    assert.equal(posePackFromSlots(sixSlots(), 'Empty', 'mine-2'), null);
  });

  it('drops junk entries and packs with no pose', () => {
    assert.equal(normalizePosePack({ id: 'a', name: 'A', entries: [{}, { layout: ' ' }] }), null);
    assert.equal(normalizePosePack({ name: 'No id', entries: [{ layout: 'walk' }] }), null);
    const pack = normalizePosePack({
      id: 'b',
      name: 'x'.repeat(80),
      entries: [{ layout: 'walk', camera: 'sideways', variant: -2 }, 'junk'],
    })!;
    assert.equal(pack.name.length, 40);
    assert.deepEqual(pack.entries, [{ layout: 'walk' }]);
  });
});

describe('my-pose-packs storage', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const store = new Map<string, string>();
    const localStorage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage,
        dispatchEvent: () => true,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    resetBrowserStorageCache();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow,
    });
    resetBrowserStorageCache();
  });

  it('saves newest first, replaces a same-named pack, removes, and takes a server copy', () => {
    const posed = applyPosePackToSlots(sixSlots(), fitness).slots;
    const first = saveMyPosePack(posed, 'Gym day');
    saveMyPosePack(posed.slice(0, 2), 'Short');
    saveMyPosePack(posed.slice(0, 3), 'gym DAY');
    assert.deepEqual(
      loadMyPosePacks().map(pack => [pack.name, pack.entries.length]),
      [
        ['gym DAY', 3],
        ['Short', 2],
      ]
    );
    assert.ok(loadMyPosePacks().every(pack => pack.mine && pack.id !== first.id));
    assert.throws(() => saveMyPosePack(sixSlots(), 'Nothing'), /Pick a pose/);
    removeMyPosePack(loadMyPosePacks()[1]!.id);
    assert.deepEqual(
      loadMyPosePacks().map(pack => pack.name),
      ['gym DAY']
    );
    replaceMyPosePacks([{ id: 'srv', name: 'From server', entries: [{ layout: 'walk' }] }, null]);
    assert.deepEqual(
      loadMyPosePacks().map(pack => [pack.id, pack.mine]),
      [['srv', true]]
    );
  });
});
