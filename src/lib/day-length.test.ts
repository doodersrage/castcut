import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayPartOf,
  daySlotDefaultLabel,
  daySlotsForLength,
  diversifyDaySlotScenes,
  inferDayLength,
  normalizeDayLength,
  normalizeDaySlotStills,
  normalizeDaySlots,
  DEFAULT_DAY_SLOTS,
} from './day-planner';
import { applyDayTheme } from './play-remix';
import { buildDayPoseGuide } from './day-pose-guide';

describe('variable Day length', () => {
  it('lays out 2–8 slot Days morning → night', () => {
    assert.deepEqual(
      daySlotsForLength(2).map(slot => slot.id),
      ['morning', 'night']
    );
    assert.deepEqual(
      daySlotsForLength(6).map(slot => slot.label),
      ['Morning', 'Late morning', 'Afternoon', 'Evening', 'Night', 'Late night']
    );
    assert.equal(daySlotsForLength(8).length, 8);
    assert.equal(normalizeDayLength(5), 4);
    assert.equal(normalizeDayLength('6'), 6);
  });

  it('maps late slots onto their daypart', () => {
    assert.equal(dayPartOf('morning-2'), 'morning');
    assert.equal(dayPartOf('night'), 'night');
    assert.equal(dayPartOf('bogus'), 'afternoon');
    assert.equal(daySlotDefaultLabel('evening-2'), 'Late evening');
  });

  it('keeps legacy four-slot saves at four and infers longer Days from their ids', () => {
    assert.equal(inferDayLength(['morning', 'night']), 4);
    assert.equal(inferDayLength(['morning-2']), 6);
    assert.equal(inferDayLength(['afternoon-2']), 8);
    assert.deepEqual(
      normalizeDaySlots(DEFAULT_DAY_SLOTS).map(slot => slot.id),
      ['morning', 'afternoon', 'evening', 'night']
    );
  });

  it('keeps each slot plan by id when the Day grows or shrinks', () => {
    const four = normalizeDaySlots([
      { id: 'morning', label: 'Morning', sceneHints: 'stretching by the window' },
      { id: 'night', label: 'Night', sceneHints: 'reading in bed' },
    ]);
    const six = normalizeDaySlots(four, 6);
    assert.equal(six.length, 6);
    assert.equal(six.find(slot => slot.id === 'morning')?.sceneHints, 'stretching by the window');
    assert.equal(six.find(slot => slot.id === 'morning-2')?.sceneHints, undefined);
    const two = normalizeDaySlots(six, 2);
    assert.deepEqual(
      two.map(slot => [slot.id, slot.sceneHints]),
      [
        ['morning', 'stretching by the window'],
        ['night', 'reading in bed'],
      ]
    );
  });

  it('orders stills by the board and drops stills for removed slots', () => {
    const six = daySlotsForLength(6);
    const stills = normalizeDaySlotStills(
      [
        { slotId: 'night-2', status: 'completed', imageUrl: 'n2.png' },
        { slotId: 'morning', status: 'completed', imageUrl: 'm.png' },
      ],
      six
    );
    assert.deepEqual(
      stills.map(still => still.slotId),
      six.map(slot => slot.id)
    );
    assert.equal(stills[5]?.imageUrl, 'n2.png');
    const four = normalizeDaySlotStills(stills, daySlotsForLength(4));
    assert.equal(four.length, 4);
    assert.ok(!four.some(still => still.slotId === 'night-2'));
  });

  it('suggests a distinct plan for every slot of a long Day', () => {
    const { slots } = diversifyDaySlotScenes(daySlotsForLength(8), {
      forceLocations: true,
      forceBeats: true,
      fillBeats: true,
      random: () => 0.37,
    });
    assert.equal(slots.length, 8);
    const beats = slots.map(slot => slot.sceneHints?.trim().toLowerCase());
    assert.ok(beats.every(Boolean));
    assert.equal(new Set(beats).size, 8, 'no repeated beats across the two morning slots');
  });

  it('themes script the base dayparts and leave late slots their own plan', () => {
    const six = normalizeDaySlots(
      [{ id: 'morning-2', label: 'Late morning', sceneHints: 'my own late-morning beat' }],
      6
    );
    const themed = applyDayTheme(six, 'rainy-day');
    assert.equal(themed.find(slot => slot.id === 'morning-2')?.sceneHints, 'my own late-morning beat');
    assert.ok(themed.find(slot => slot.id === 'morning')?.sceneHints);
  });

  it('draws a late slot guide from its daypart', async () => {
    // No browser canvas here: the guide build rejects, but it must not trip over the slot id.
    await assert.rejects(buildDayPoseGuide('morning-2', undefined), /browser canvas/);
  });
});

describe('late-slot activities', () => {
  it('gives each late daypart its own everyday pool with a real posture spread', async () => {
    const { DAY_LATE_SLOT_BEAT_PRESETS, DAY_SLOT_BEAT_PRESETS, dayEverydayPoseClass } =
      await import('./day-planner');
    for (const part of ['morning', 'afternoon', 'evening', 'night'] as const) {
      const late = DAY_LATE_SLOT_BEAT_PRESETS[part];
      assert.ok(late.length >= 10, part);
      assert.ok(!late.some(beat => DAY_SLOT_BEAT_PRESETS[part].includes(beat)), `${part} overlap`);
      const classes = late.map(beat => dayEverydayPoseClass(beat));
      const counts = new Map<string, number>();
      for (const c of classes) counts.set(c, (counts.get(c) ?? 0) + 1);
      assert.ok(counts.size >= 6, `${part}: ${[...counts.keys()].join(',')}`);
      assert.ok(Math.max(...counts.values()) / late.length <= 0.4, `${part} class skew`);
    }
  });

  it('never draws a sex layout from a late everyday beat', async () => {
    const { DAY_LATE_SLOT_BEAT_PRESETS } = await import('./day-planner');
    const { parsePoseGuideIntent } = await import('./day-pose-guide');
    for (const beats of Object.values(DAY_LATE_SLOT_BEAT_PRESETS)) {
      for (const beat of beats) {
        assert.equal(parsePoseGuideIntent(beat, 0, { allowIntimate: false }).intimate ?? null, null);
      }
    }
  });

  it('fills late slots from the late pools on everyday, vacation and sport Days', async () => {
    const { DAY_LATE_SLOT_BEAT_PRESETS } = await import('./day-planner');
    const { dayVacationBeatPresetsForSlot } = await import('./day-vacation');
    const { daySportBeatPresetsForSlot } = await import('./day-sport');
    const eight = daySlotsForLength(8);
    const everyday = diversifyDaySlotScenes(eight, {
      forceBeats: true,
      forceLocations: true,
      random: () => 0.5,
    }).slots;
    for (const slot of everyday.filter(s => /-2$/.test(s.id))) {
      assert.ok(
        DAY_LATE_SLOT_BEAT_PRESETS[dayPartOf(slot.id)].includes(slot.sceneHints ?? ''),
        `${slot.id}: ${slot.sceneHints}`
      );
    }
    const vacation = diversifyDaySlotScenes(eight, {
      forceBeats: true,
      forceLocations: true,
      dayMood: 'vacation',
      random: () => 0.5,
    }).slots;
    const lateVacation = vacation.find(s => s.id === 'evening-2');
    assert.ok(dayVacationBeatPresetsForSlot('evening-2').includes(lateVacation?.sceneHints ?? ''));
    assert.ok(!dayVacationBeatPresetsForSlot('evening').includes(lateVacation?.sceneHints ?? ''));
    assert.ok(daySportBeatPresetsForSlot('night-2').length > 0);
    assert.notDeepEqual(daySportBeatPresetsForSlot('night-2'), daySportBeatPresetsForSlot('night'));
  });

  it('leads every late vacation scene with a pose verb the guide reads', async () => {
    const { dayVacationBeatPresetsForSlot, vacationPoseClassFromBeat } = await import(
      './day-vacation'
    );
    for (const id of ['morning-2', 'afternoon-2', 'evening-2', 'night-2']) {
      for (const beat of dayVacationBeatPresetsForSlot(id)) {
        assert.notEqual(vacationPoseClassFromBeat(beat), 'OTHER', beat);
      }
    }
  });
});

describe('late-slot heat pools', () => {
  const PARTS = ['morning', 'afternoon', 'evening', 'night'] as const;

  it('split cleanly into Solo and Duo for Intimate and Raunchy', async () => {
    const m = await import('./day-planner');
    for (const part of PARTS) {
      const id = `${part}-2`;
      for (const [pool, split, isSolo] of [
        [m.DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS[part], m.intimateBeatsForMix, m.isDayIntimateSoloBeat],
        [m.DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS[part], m.raunchyBeatsForMix, m.isDayRaunchySoloBeat],
      ] as const) {
        const solo = split(id as never, 'solo');
        const duo = split(id as never, 'duo');
        assert.ok(solo.length > 0 && duo.length > 0, `${id} needs both`);
        assert.equal(solo.length + duo.length, pool.length);
        assert.ok(solo.every(isSolo));
        assert.equal(split(id as never, 'mixed').length, pool.length);
      }
    }
  });

  it('names a sex layout the pose guide draws on every Intimate / Raunchy beat', async () => {
    const m = await import('./day-planner');
    const { parseIntimateLayout } = await import('./day-pose-guide');
    for (const part of PARTS) {
      for (const beat of [
        ...m.DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS[part],
        ...m.DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS[part],
      ]) {
        const layout = parseIntimateLayout(beat);
        assert.ok(layout, `no layout: ${beat}`);
        const solo =
          m.isDayIntimateSoloBeat(beat) || m.isDayRaunchySoloBeat(beat);
        if (!solo) {
          assert.notEqual(layout, 'solo', `duo beat drew solo: ${beat}`);
        }
      }
    }
  });

  it('keeps Suggestive clothed and every late pool on a deliberate pose', async () => {
    const m = await import('./day-planner');
    const { dayVacationBeatPresetsForSlot } = await import('./day-vacation');
    const { parsePoseGuideIntent } = await import('./day-pose-guide');
    const CLOTHED = { clothedUprightOnly: true as const, forcePeople: 1 };
    const SOLO = { allowIntimate: false as const, forcePeople: 1 };
    const DUO = { allowIntimate: false as const, forcePeople: 2 };
    for (const part of PARTS) {
      const pools: Array<[string, string[], Record<string, unknown>]> = [
        ['suggestive', m.DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS[part], CLOTHED],
        ['everyday', m.DAY_LATE_SLOT_BEAT_PRESETS[part], SOLO],
        ['companion', m.DAY_LATE_SLOT_COMPANION_BEAT_PRESETS[part], DUO],
        ['vacation', dayVacationBeatPresetsForSlot(`${part}-2`), CLOTHED],
      ];
      for (const [name, beats, opts] of pools) {
        for (const beat of beats) {
          assert.equal(
            parsePoseGuideIntent(beat, 0, opts).base,
            parsePoseGuideIntent(beat, 1, opts).base,
            `${name}/${part}-2 matches no layout: ${beat}`
          );
        }
      }
      for (const beat of m.DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS[part]) {
        assert.doesNotMatch(beat, /\b(nude|naked|topless|bottomless|mid-sex)\b/i, beat);
      }
      for (const setting of m.DAY_LATE_SLOT_HEAT_SETTING_PRESETS[part]) {
        assert.doesNotMatch(setting, /\b(beach|ocean|sand|pier|balcony|shoreline)\b/i, setting);
      }
    }
  });

  it('fills late slots from the late heat pools on an 8-still adult Day', async () => {
    const m = await import('./day-planner');
    const { slots } = diversifyDaySlotScenes(daySlotsForLength(8), {
      forceBeats: true,
      forceLocations: true,
      dayMood: 'intimate',
      intimateMix: 'solo',
      random: () => 0.3,
    });
    for (const slot of slots.filter(s => /-2$/.test(s.id))) {
      const beat = slot.sceneHints ?? '';
      assert.ok(m.DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS[dayPartOf(slot.id)].includes(beat), beat);
      assert.ok(m.isDayIntimateSoloBeat(beat), beat);
    }
  });
});
