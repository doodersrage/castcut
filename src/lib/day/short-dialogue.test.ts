import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import type { DayToolCache } from '../play/settings';
import { dayAsShort } from './day-as-short';
import { momentDialogueOutline, momentPeople, withMomentDialogue } from './short-dialogue';
import { shortMomentsOf } from './short-moments';

const day = {
  stillsCharacterId: 'mara',
  dayLength: 4,
  slots: [
    { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee with her partner', line: 'Coffee first.' },
    { id: 'afternoon', label: 'Afternoon', location: 'beach', sceneHints: 'walks along the water' },
    { id: 'evening', label: 'Evening' },
    { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed', thirdCastId: 'june' },
  ],
  stills: [{ slotId: 'morning', promptId: 'p-m', imageUrl: '/m.png', status: 'completed' }],
} as unknown as DayToolCache;

const theo = { name: 'Theo', castId: 'theo', sex: 'man' };
const june = { name: 'June', castId: 'june', sex: 'woman' };
const peopleOf = (slot: Parameters<typeof momentPeople>[0], companions = true) =>
  momentPeople(slot, {
    companions,
    partner: theo,
    castById: id => (id === 'june' ? june : undefined),
  });

describe('a Short’s moments written with their dialogue (Step 5c)', () => {
  it('says who is in a moment: the partner when the beat has someone, a Cast member set on it', () => {
    const [morning, afternoon, , night] = day.slots!;
    assert.deepEqual(peopleOf(morning!).map(person => person.name), ['Theo']);
    assert.deepEqual(peopleOf(afternoon!), []);
    assert.deepEqual(peopleOf(night!).map(person => person.name), ['June']);
    // Companions off: the partner isn't brought in; an unnamed partner is the writer's to name.
    assert.deepEqual(peopleOf(morning!, false), []);
    assert.deepEqual(
      momentPeople(morning!, { companions: true, castById: () => undefined }).map(person => person.name),
      ['her partner']
    );
  });

  it('makes the outline from the cards: their headings, beats, who — alone, a line or two', () => {
    const { outline, slotIds } = momentDialogueOutline({ day, title: 'Mara’s day', logline: 'a slow Sunday', peopleOf: slot => peopleOf(slot) });
    assert.deepEqual(slotIds, ['morning', 'afternoon', 'night']);
    assert.deepEqual(outline.scenes.map(scene => scene.heading), ['INT. KITCHEN - MORNING', 'EXT. BEACH - DAY', 'INT. BEDROOM - NIGHT']);
    assert.deepEqual(outline.scenes[0]!.who, ['Theo']);
    assert.match(outline.scenes[1]!.summary, /^walks along the water\. She is alone/);
  });

  it('puts a written scene in its moment’s place: shots planned, the card on her first line', () => {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const script = { ...short.script, shots: short.shots, castMap: { MARA: 'mara' } };
    const written = [
      'INT. KITCHEN - MORNING',
      '',
      'Mara pours two cups. Theo shuffles in, hair a mess.',
      '',
      'THEO',
      '(hoarse)',
      'Is one of those mine?',
      '',
      'MARA',
      'If you ask nicely.',
      '',
      'THEO',
      'Please.',
      '',
    ].join('\n');
    const out = withMomentDialogue({
      script,
      scenes: short.scenes,
      slotId: 'morning',
      written,
      castId: 'mara',
      leadName: 'Mara',
      people: [theo],
      now: 2000,
    })!;
    assert.ok(out);
    const parsed = parseScript(out.script.source);
    // The other moments' scenes as they were; the kitchen is the written one.
    assert.deepEqual(parsed.scenes.map(scene => scene.heading), ['INT. KITCHEN - MORNING', 'EXT. BEACH - DAY', 'INT. BEDROOM - NIGHT']);
    assert.deepEqual(parsed.scenes[0]!.speakers, ['THEO', 'MARA']);
    assert.equal(out.script.castMap!.THEO, 'theo');
    assert.equal(out.line, 'If you ask nicely.');
    // The card's Scene is on her line's shot, its line hers; its kept still stays.
    const card = out.scenes.find(scene => scene.fromDaySlot === 'morning')!;
    assert.equal(card.slot.line, 'If you ask nicely.');
    assert.equal(card.keptTakeId, short.scenes.find(scene => scene.fromDaySlot === 'morning')!.keptTakeId);
    const shot = out.script.shots!.find(entry => entry.id === card.fromScript!.shotId)!;
    assert.equal(shot.madeSceneId, card.id);
    assert.equal(shot.speaker, 'MARA');
    // Read back: the moment is a whole scene now, the other shots waiting to be made.
    const [moment] = shortMomentsOf(out.script, short.scenes.map(scene => out.scenes.find(entry => entry.id === scene.id) ?? scene));
    assert.ok(moment!.shots.length > 1);
    assert.equal(moment!.shots.filter(entry => entry.scene).length, 1);
    assert.deepEqual(moment!.loose, []);
    assert.equal(moment!.daySlot, 'morning');
  });

  it('writes nothing for a moment with no scene in the short, or text that isn’t one scene', () => {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const script = { ...short.script, shots: short.shots };
    const base = { script, scenes: short.scenes, castId: 'mara', leadName: 'Mara', people: [] };
    assert.equal(withMomentDialogue({ ...base, slotId: 'evening', written: 'INT. X - DAY\n\nHi.\n' }), null);
    assert.equal(withMomentDialogue({ ...base, slotId: 'morning', written: 'INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n' }), null);
  });
});
