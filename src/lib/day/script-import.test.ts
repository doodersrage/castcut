import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayLengthForCards, dayScriptSlots, parseDayScript, withoutLeadName } from './script-import';

const FOUNTAIN = `Title: Saturday
Author: Someone

INT. KITCHEN - MORNING

ADA pours coffee and leans on the counter, still half asleep.

ADA
(to herself)
Okay. Today's the day.

EXT. FARMERS MARKET - AFTERNOON

Ada weighs two peaches in her hands, smiling at the vendor.

VENDOR
Two for a dollar.

ADA
I'll take them.

CUT TO:

.ROOFTOP BAR - NIGHT

Ada's phone buzzes on the bar; she laughs and holds it up for a selfie.
`;

describe('day-script-import', () => {
  it("reads a Fountain script: place, time, beat, the lead's line", () => {
    const script = parseDayScript(FOUNTAIN);
    assert.equal(script.format, 'fountain');
    assert.equal(script.scenes.length, 3);
    assert.deepEqual(
      script.scenes.map(scene => [scene.place, scene.time]),
      [['kitchen', 'morning'], ['farmers market', 'afternoon'], ['rooftop bar', 'night']]
    );
    assert.equal(script.scenes[0]!.beat, 'ADA pours coffee and leans on the counter, still half asleep.');
    const { slots, length, used } = dayScriptSlots(script, { leadName: 'Ada', leadNoun: 'woman' });
    assert.equal(length, 3);
    assert.equal(used, 3);
    assert.equal(slots[0]!.sceneHints, 'She pours coffee and leans on the counter, still half asleep.');
    assert.equal(slots[0]!.sceneHintsTyped, slots[0]!.sceneHints);
    assert.equal(slots[0]!.line, "Okay. Today's the day.");
    // The lead's line, not the vendor's.
    assert.equal(slots[1]!.line, "I'll take them.");
    assert.equal(slots[2]!.location, 'rooftop bar');
    assert.equal(slots[2]!.sceneHints, 'Her phone buzzes on the bar; she laughs and holds it up for a selfie.');
    assert.equal(slots[2]!.line, undefined);
  });

  it('reads a plain outline: one card per paragraph or list item, the Day grown to fit', () => {
    const script = parseDayScript('1. Wakes up late and races to the bus\n2. Lunch alone on a park bench\n3. Dinner with friends\n4. Walks home in the rain\n5. Falls asleep on the couch');
    assert.equal(script.format, 'outline');
    assert.equal(script.scenes.length, 5);
    const { slots, length } = dayScriptSlots(script, { leadName: '', leadNoun: 'woman' });
    assert.equal(length, 6);
    assert.equal(slots[1]!.sceneHints, 'Lunch alone on a park bench');
    assert.equal(slots[5]!.sceneHints, undefined);
  });

  it('caps at eight cards and counts the rest', () => {
    const many = Array.from({ length: 11 }, (_, i) => `Scene ${i + 1} beat.`).join('\n\n');
    const result = dayScriptSlots(parseDayScript(many), { leadName: '', leadNoun: 'man' });
    assert.equal(result.length, 8);
    assert.equal(result.dropped, 3);
    assert.equal(dayLengthForCards(1), 2);
  });

  it("turns the lead's name into a pronoun only as a whole word", () => {
    assert.equal(withoutLeadName('Max adjusts Maxine’s scarf; Max grins.', 'Max', 'man'), 'He adjusts Maxine’s scarf; he grins.');
  });
});
