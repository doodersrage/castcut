import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import type { DayToolCache } from '../play/settings';
import { dayAsShort } from './day-as-short';
import { momentDialogueOutline, momentPeople, withKnownCues, withMomentDialogue, withPeoplePresent } from './short-dialogue';
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

describe('the people in the moment are there, seen', () => {
  it('takes (V.O.) off a person in the moment, by their cue; a voice on the phone keeps it', () => {
    const written = [
      'INT. KITCHEN - MORNING',
      '',
      'Her partner sits opposite.',
      '',
      'PARTNER (V.O.)',
      'I’m right here.',
      '',
      'MOM (V.O.)',
      'Call me back!',
      '',
      'MARA (V.O.)',
      'I never did.',
    ].join('\n');
    const out = withPeoplePresent(written, [{ name: 'her partner' }]);
    assert.match(out, /^PARTNER\nI’m right here\./m);
    assert.match(out, /^MOM \(V\.O\.\)$/m);
    assert.match(out, /^MARA \(V\.O\.\)$/m);
    assert.equal(withPeoplePresent(written, []), written);
    assert.match(withPeoplePresent('THEO (O.S.)\nHey.', [{ name: 'Theo' }]), /^THEO\nHey\.$/);
  });
});

describe('a misspelt cue put right', () => {
  it('writes a cue one slip from a known name as that name (a live run’s SYLNE for Slyne)', () => {
    const written = [
      'INT. KITCHEN - MORNING',
      '',
      'Slyne stirs her coffee.',
      '',
      'PARTNER',
      'You like art.',
      '',
      'SYLNE (teasing)',
      'Since when has a little rain stopped you?',
      '',
      'SLYEN',
      'Deal.',
      '',
      'SLYNEE',
      'Fine.',
      '',
      'MOM',
      'Call me.',
    ].join('\n');
    const out = withKnownCues(written, ['Slyne', 'her partner']);
    assert.deepEqual(parseScript(out).scenes[0]!.speakers, ['PARTNER', 'SLYNE', 'MOM']);
    assert.match(out, /^SLYNE \(teasing\)$/m);
    assert.match(out, /^INT\. KITCHEN - MORNING$/m);
    assert.match(out, /^Slyne stirs her coffee\.$/m);
  });

  it('leaves a cue near two names, a short cue, and another person alone', () => {
    assert.equal(withKnownCues('MARK\nHi.', ['Mara', 'Mary']), 'MARK\nHi.');
    // A voice named only by its tag (the bookshop's "V.O. (PHONE)"): the one other person, off
    // screen; with nobody else, or two others, it stays (the shots read it as a voice).
    const call = 'SLYNE\nWhere are you?\n\nV.O. (PHONE)\nBy the travel books.';
    assert.equal(
      withKnownCues(call, ['Slyne', 'her partner']),
      'SLYNE\nWhere are you?\n\nPARTNER (V.O.)\nBy the travel books.'
    );
    assert.equal(withKnownCues(call, ['Slyne']), call);
    assert.equal(withKnownCues(call, ['Slyne', 'Rob', 'Ana']), call);
    assert.equal(withKnownCues('JIM\nHi.', ['Jin']), 'JIM\nHi.');
    assert.equal(withKnownCues('THEO\nHi.', ['Slyne']), 'THEO\nHi.');
  });

  it('maps the corrected cue to her in the short', () => {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const script = { ...short.script, shots: short.shots, castMap: { MARA: 'mara' } };
    const written = ['INT. KITCHEN - MORNING', '', 'Theo yawns.', '', 'THEO', 'Morning.', '', 'MAAR', 'Coffee first.', ''].join('\n');
    const out = withMomentDialogue({ script, scenes: short.scenes, slotId: 'morning', written, castId: 'mara', leadName: 'Mara', people: [theo], now: 2000 })!;
    assert.deepEqual(parseScript(out.script.source).scenes[0]!.speakers, ['THEO', 'MARA']);
    assert.equal(out.line, 'Coffee first.');
    assert.ok(!('MAAR' in out.script.castMap!));
  });
});
