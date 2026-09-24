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
