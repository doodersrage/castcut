import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDayEventPlan,
  buildDayEventMessages,
  clearDayEventSlots,
  dayEventClipPrompt,
  dayEventMomentWords,
  normalizeDayEvent,
  parseDayEventPlan,
} from './day-event';
import { daySlotDefaultLabel, normalizeDaySlots, type DaySlot } from './day-planner';

const reply = (moments: Array<{ beat: string; move: string }>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    place: 'candlelit trattoria with checkered tablecloths',
    time: 'Evening',
    moments,
    ending: 'lowers the glass and smiles',
    ...extra,
  });

const four = [
  { beat: 'sitting at the table with the menu open, looking down at it', move: '' },
  { beat: 'leaning forward, a fork of pasta near her mouth', move: 'puts the menu down and picks up her fork' },
  { beat: 'sitting back with a glass of red wine in her hand, smiling across the table', move: 'sets the fork down and lifts her glass' },
  { beat: 'raising the glass in a toast toward the camera', move: 'raises the glass higher in a toast' },
];

describe('one event — the plan', () => {
  it('asks for consecutive moments in one place, from one camera', () => {
    const messages = buildDayEventMessages({
      event: 'dinner date at a trattoria',
      count: 4,
    });
    const system = messages[0];
    const user = messages.at(-1);
    assert.match(system!.content as string, /ONE event, as consecutive moments filmed from one fixed camera in one place/);
    assert.match(system!.content as string, /She never stands up, sits down, kneels or lies down during the event/);
    assert.equal(user!.content, 'Event: dinner date at a trattoria\nMoments: 4');
  });

  it('reads a full plan, with the time and the ending', () => {
    const plan = parseDayEventPlan(`Sure! ${reply(four)}`, 4);
    assert.ok(plan);
    assert.equal(plan.place, 'candlelit trattoria with checkered tablecloths');
    assert.equal(plan.time, 'Evening');
    assert.equal(plan.moments.length, 4);
    assert.equal(plan.moments[0]!.move, '');
    assert.equal(plan.ending, 'lowers the glass and smiles');
  });

  it('wants a stance only on the first moment (later moments are edits)', () => {
    const noStance = [{ beat: 'the menu is open on the table', move: '' }, ...four.slice(1)];
    assert.equal(parseDayEventPlan(reply(noStance), 4), null);
    const laterNoStance = [four[0]!, { beat: 'a fork of pasta near her mouth', move: 'picks up her fork' }, ...four.slice(2)];
    assert.ok(parseDayEventPlan(reply(laterNoStance), 4));
  });

  it('names nobody else (the edit paints them in), and nothing adult', () => {
    assert.ok(parseDayEventPlan(reply(four), 4));
    const waiter = [...four.slice(0, 3), { beat: 'standing, looking at the server', move: 'stands up' }];
    assert.equal(parseDayEventPlan(reply(waiter), 4), null);
    const hug = [...four.slice(0, 3), { beat: 'standing, hugging him by the table', move: 'stands and hugs him' }];
    assert.equal(parseDayEventPlan(reply(hug), 4), null);
    const nude = [...four.slice(0, 3), { beat: 'standing topless by the table', move: 'stands up' }];
    assert.equal(parseDayEventPlan(reply(nude), 4), null);
  });

  it('she stays in the picture: a move out rejects the plan, an ending out is replaced', () => {
    const out = [...four.slice(0, 3), { beat: 'standing by the door', move: 'stands and walks out of the room' }];
    assert.equal(parseDayEventPlan(reply(out), 4), null);
    const plan = parseDayEventPlan(reply(four, { ending: 'turns toward the door, waves once, then walks out into the alley' }), 4);
    assert.equal(plan?.ending, 'smiles and settles where she is');
  });

  it('she never lies down (the edit reframes to an overhead shot)', () => {
    const lie = [...four.slice(0, 3), { beat: 'lying on her back in the shallow surf, arms spread', move: 'rolls onto her back' }];
    assert.equal(parseDayEventPlan(reply(lie), 4), null);
    assert.equal(parseDayEventPlan(reply(four, { ending: 'lies back on the towel and closes her eyes' }), 4)?.ending, 'smiles and settles where she is');
  });

  it('she stays on her spot (a move to a new spot makes the edit recompose the picture)', () => {
    const walk = [...four.slice(0, 3), { beat: 'standing by the window with her glass', move: 'walks over to the window' }];
    assert.equal(parseDayEventPlan(reply(walk), 4), null);
  });

  it('one posture: standing and sitting moments in one plan are rejected', () => {
    const mixed = [
      { beat: 'standing at the water holding a towel', move: '' },
      ...four.slice(1),
    ];
    assert.equal(parseDayEventPlan(reply(mixed), 4), null);
  });

  it('a short or broken plan is no plan (a gap would break the chain)', () => {
    assert.equal(parseDayEventPlan(reply(four.slice(0, 3)), 4), null);
    assert.equal(parseDayEventPlan(reply([four[0]!, { beat: four[1]!.beat, move: '' }, ...four.slice(2)]), 4), null);
    assert.equal(parseDayEventPlan('not json', 4), null);
    assert.equal(parseDayEventPlan(reply(four, { place: '' }), 4), null);
  });
});

describe('one event — the Day', () => {
  const plan = parseDayEventPlan(reply(four), 4)!;
  const slots = normalizeDaySlots([], 4);

  it('every slot is a moment: its beat, the one place, the time as the label, the move into the next', () => {
    const applied = applyDayEventPlan(slots, plan);
    assert.deepEqual(
      applied.map(slot => slot.label),
      ['Evening', 'Evening', 'Evening', 'Evening']
    );
    assert.ok(applied.every(slot => slot.location === plan.place));
    // What she picks up later (the wine glass) is set out beside her in the first moment.
    assert.equal(applied[0]!.sceneHints, `${four[0]!.beat}, with a glass within reach beside her`);
    assert.equal(applied[0]!.eventMove, four[1]!.move);
    assert.equal(applied[2]!.eventMove, four[3]!.move);
    // The last moment rounds the event off.
    assert.equal(applied[3]!.eventMove, 'lowers the glass and smiles');
    // eventMove survives a save and load.
    assert.equal(normalizeDaySlots(applied, 4)[0]!.eventMove, four[1]!.move);
  });

  it("back to a whole day: the Day's own scenes come back, moves go", async () => {
    const { dayEventBefore } = await import('./day-event');
    const own = slots.map(slot => ({ ...slot, location: `own ${slot.id}`, sceneHints: `own beat ${slot.id}` }));
    const before = dayEventBefore(own);
    const cleared = clearDayEventSlots(applyDayEventPlan(own, plan), daySlotDefaultLabel, before);
    assert.deepEqual(cleared.map(slot => slot.label), slots.map(slot => slot.label));
    assert.ok(cleared.every((slot: DaySlot) => slot.eventMove === undefined));
    assert.equal(cleared[1]!.location, `own ${slots[1]!.id}`);
    assert.equal(cleared[1]!.sceneHints, `own beat ${slots[1]!.id}`);
    // An event from before scenes were kept: the cards are left blank for Day to fill.
    const blank = clearDayEventSlots(applyDayEventPlan(own, plan), daySlotDefaultLabel, []);
    assert.ok(blank.every(slot => !slot.location && !slot.sceneHints));
    // The scenes survive a save and load with the event.
    assert.equal(
      normalizeDayEvent({ text: 'x', place: 'y', time: 'Night', before })?.before?.[0]?.sceneHints,
      `own beat ${slots[0]!.id}`
    );
  });

  it('a prop that vanishes is put down in the move', () => {
    const shell = [
      { beat: 'sitting on the towel holding a seashell to her ear, smiling', move: '' },
      { beat: 'sitting on the towel with both hands on her knees', move: 'lowers her hand' },
      { beat: 'sitting on the towel, hands on her knees, looking at the sea', move: 'turns her head' },
      { beat: 'sitting on the towel, smiling at the camera', move: 'looks at the camera' },
    ];
    const parsed = parseDayEventPlan(reply(shell), 4);
    assert.equal(parsed?.moments[1]!.move, 'lowers her hand, putting the seashell down beside her');
    assert.equal(parsed?.moments[2]!.move, 'turns her head');
  });

  it('what she picks up later is beside her from the first moment', () => {
    const plan = parseDayEventPlan(
      reply([
        { beat: 'sitting on the towel, hands on her knees', move: '' },
        { beat: 'sitting on the towel holding a seashell to her ear', move: 'picks up a shell' },
        { beat: 'sitting on the towel holding a water bottle in both hands', move: 'picks up the bottle' },
        { beat: 'sitting on the towel holding a water bottle, smiling', move: 'smiles' },
      ]),
      4
    );
    assert.equal(
      plan?.moments[0]!.beat,
      'sitting on the towel, hands on her knees, with a seashell and a bottle within reach beside her'
    );
  });

  it('only things she holds are put down — not the towel she sits on, not a book she reads', () => {
    const plan = parseDayEventPlan(
      reply([
        { beat: 'sitting on the towel holding a book open in both hands', move: '' },
        { beat: 'sitting on the towel, turning a page, eyes on the text', move: 'turns a page' },
        { beat: 'sitting on the towel, hands on her knees', move: 'lowers her hands' },
        { beat: 'sitting on the towel, smiling', move: 'smiles' },
      ]),
      4
    );
    assert.equal(plan?.moments[1]!.move, 'turns a page');
    assert.doesNotMatch(plan?.moments[2]!.move ?? '', /towel/);
  });

  it('keeps the event only with its text and place', () => {
    assert.deepEqual(normalizeDayEvent({ text: ' date ', place: 'bar', time: 'Night' }), {
      text: 'date',
      place: 'bar',
      time: 'Night',
    });
    assert.equal(normalizeDayEvent({ text: 'date' }), undefined);
    assert.equal(normalizeDayEvent({ text: 'date', place: 'bar', time: 'Noon' })?.time, 'Evening');
  });
});

describe('one event — the clips', () => {
  it('moves into the next moment, which the clip ends on, with the camera held', () => {
    const prompt = dayEventClipPrompt({
      place: 'candlelit trattoria.',
      move: 'She pulls out the chair and sits down',
      nextBeat: 'sitting at the table, forearms on the tablecloth',
    });
    assert.match(prompt, /the camera stays still and keeps the same framing — it does not move, zoom or push in/);
    assert.match(prompt, /In the candlelit trattoria, she pulls out the chair and sits down; by the end of the clip she is sitting at the table, forearms on the tablecloth\./);
  });

  it('a spoken line is said on the way into the next moment', () => {
    const prompt = dayEventClipPrompt({
      place: 'beach',
      move: 'leans back and rests her palms behind her head',
      nextBeat: 'leaning back with hands behind head',
      line: 'Still holding those shades?',
    });
    assert.match(prompt, /by the end of the clip she is leaning back with hands behind head\. As she moves she says clearly, "Still holding those shades\?" — her lips move with every word\./);
  });

  it('the last moment has nothing to land on', () => {
    const prompt = dayEventClipPrompt({ place: 'bar', move: 'lowers the glass and smiles', speaker: 'He' });
    assert.match(prompt, /In the bar, he lowers the glass and smiles\./);
    assert.doesNotMatch(prompt, /by the end of the clip/);
    assert.match(prompt, /his face, hair and clothes stay the same/);
  });

  it('a later moment is an edit of the one before, posed by its beat', () => {
    assert.equal(dayEventMomentWords({ sceneHints: 'sitting at the table. ' }), 'sitting at the table');
  });
});
