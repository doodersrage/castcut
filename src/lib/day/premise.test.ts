import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDayPremiseBeats,
  buildDayPremiseMessages,
  dayPremiseAvailable,
  parseDayPremiseBeats,
} from './premise';
import type { DaySlot } from './planner';

const SLOTS = ['morning', 'afternoon', 'evening', 'night', 'morning-2'];

describe('Day from an idea', () => {
  it('serves clothed moods only', () => {
    assert.equal(dayPremiseAvailable('everyday'), true);
    assert.equal(dayPremiseAvailable('vacation'), true);
    assert.equal(dayPremiseAvailable('date-night'), true);
    assert.equal(dayPremiseAvailable('intimate'), false);
    assert.equal(dayPremiseAvailable('sport'), false);
  });

  it('asks for a short — every moment, close together in time, titled — solo or with people', () => {
    const solo = buildDayPremiseMessages({ premise: 'rainy Saturday', slotIds: SLOTS, companions: false });
    // Not a day: the moments are one stretch of the story, a time of day for them all.
    assert.match(solo.at(-1)!.content as string, /Slots: "morning", "afternoon", "evening", "night", "morning-2"/);
    assert.match(solo[0]!.content as string, /within an hour or two/);
    assert.match(solo[0]!.content as string, /short title/);
    assert.doesNotMatch(solo[0]!.content as string, /morning to night/);
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

describe('the adult check on a written day', () => {
  it('keeps a striped awning or umbrella; still drops undressing', () => {
    const reply = JSON.stringify([
      { slot: 'morning', beat: 'standing in the fish market gripping a paper bag', setting: 'wet dock under striped awnings' },
      { slot: 'afternoon', beat: 'lying on a towel with arms behind her head', setting: 'beach with a striped umbrella' },
      { slot: 'evening', beat: 'standing by the stage watching the stripper', setting: 'dim club' },
      { slot: 'night', beat: 'sitting on the bed, stripped to her underwear', setting: 'hotel room' },
    ]);
    assert.deepEqual(
      parseDayPremiseBeats(reply, SLOTS, { companions: false }).map(beat => beat.slotId),
      ['morning', 'afternoon']
    );
  });
});

describe('Write it: titles and times', () => {
  it('reads each moment’s title and time, and writes them in', () => {
    const reply =
      '[{"slot":"morning","title":"Last touches","time":"Evening","beat":"standing at the set table straightening a napkin","setting":"candlelit dining room"},' +
      '{"slot":"evening","title":"A toast","time":"noon","beat":"standing at the table raising a glass","setting":"candlelit dining room"}]';
    const beats = parseDayPremiseBeats(reply, ['morning', 'evening'], { companions: false });
    assert.deepEqual(
      beats.map(beat => [beat.slotId, beat.title, beat.timeOfDay]),
      [
        ['morning', 'Last touches', 'evening'],
        ['evening', 'A toast', undefined],
      ]
    );
    const slots = applyDayPremiseBeats(
      [
        { id: 'morning', label: 'Morning' },
        { id: 'evening', label: 'Evening' },
      ] as DaySlot[],
      beats
    );
    assert.deepEqual(
      slots.map(slot => [slot.label, slot.timeOfDay]),
      [
        ['Last touches', 'evening'],
        ['A toast', undefined],
      ]
    );
  });
});

