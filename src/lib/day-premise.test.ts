import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDayPremiseBeats,
  buildDayPremiseMessages,
  dayPremiseAvailable,
  parseDayPremiseBeats,
} from './day-premise';
import type { DaySlot } from './day-planner';

const SLOTS = ['morning', 'afternoon', 'evening', 'night', 'morning-2'];

describe('Day from an idea', () => {
  it('serves clothed moods only', () => {
    assert.equal(dayPremiseAvailable('everyday'), true);
    assert.equal(dayPremiseAvailable('vacation'), true);
    assert.equal(dayPremiseAvailable('date-night'), true);
    assert.equal(dayPremiseAvailable('intimate'), false);
    assert.equal(dayPremiseAvailable('sport'), false);
  });

  it('asks for every slot with its part of the day, solo or with people', () => {
    const solo = buildDayPremiseMessages({ premise: 'rainy Saturday', slotIds: SLOTS, companions: false });
    assert.match(solo.at(-1)!.content as string, /"night" \(night\)/);
    assert.match(solo[0]!.content as string, /alone in every beat/);
    const duo = buildDayPremiseMessages({ premise: 'x', slotIds: SLOTS, companions: true });
    assert.match(duo[0]!.content as string, /partner or a friend/);
  });

  it('keeps beats with a stance; drops adult, crowded-solo and stance-less ones', () => {
    const reply = `Sure! [
      {"slot":"morning","beat":"sitting at the window seat with a coffee, watching the rain","setting":"grey-lit living room"},
      {"slot":"afternoon","beat":"the gallery is full of paintings","setting":"white gallery"},
      {"slot":"evening","beat":"walking with her partner under one umbrella","setting":"wet street at dusk"},
      {"slot":"night","beat":"lying naked on the bed","setting":"bedroom"},
      {"slot":"morning-2","beat":"lying in bath sipping tea","setting":"bathroom"}
    ]`;
    const beats = parseDayPremiseBeats(reply, SLOTS, { companions: false });
    assert.deepEqual(beats.map(beat => beat.slotId), ['morning']);
    assert.equal(beats[0]!.setting, 'grey-lit living room');
    const withPartner = parseDayPremiseBeats(reply, SLOTS, { companions: true });
    assert.deepEqual(withPartner.map(beat => beat.slotId), ['morning', 'evening']);
  });

  it('maps misnamed slots by order and ignores junk', () => {
    const reply = '[{"slot":"1","beat":"standing at the stove stirring a pot","setting":"kitchen"},{"slot":"2","beat":"leaning on the balcony rail","setting":"balcony at sunset"}]';
    assert.deepEqual(
      parseDayPremiseBeats(reply, ['morning', 'evening'], { companions: false }).map(beat => beat.slotId),
      ['morning', 'evening']
    );
    assert.deepEqual(parseDayPremiseBeats('no json here', SLOTS, { companions: false }), []);
    assert.deepEqual(parseDayPremiseBeats('[{"slot":', SLOTS, { companions: false }), []);
  });

  it("writes the beats in as Day's own, clearing the old pose", () => {
    const slots = [
      { id: 'morning', label: 'Morning', sceneHints: 'old', sceneHintsTyped: 'old', poseLayout: 'cook' },
      { id: 'evening', label: 'Evening', sceneHints: 'keep me' },
    ] as DaySlot[];
    const next = applyDayPremiseBeats(slots, [
      { slotId: 'morning', beat: 'sitting on the step tying her shoes', setting: 'front porch' },
    ]);
    assert.equal(next[0]!.sceneHints, 'sitting on the step tying her shoes');
    assert.equal(next[0]!.location, 'front porch');
    assert.equal(next[0]!.sceneHintsTyped, undefined);
    assert.equal(next[0]!.poseLayout, undefined);
    assert.equal(next[1]!.sceneHints, 'keep me');
  });
});
