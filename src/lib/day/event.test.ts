import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDayEventPlan,
  buildDayEventMessages,
  checkDayEventPlan,
  clearDayEventSlots,
  dayEventActionWords,
  dayEventClipPrompt,
  dayEventMomentWords,
  normalizeDayEvent,
  activeDayEvent,
  parseDayEventPlan,
  slotsForWholeDay,
} from './event';
import { dayEventFixMessages } from './event-server';
import { daySlotDefaultLabel, normalizeDaySlots, type DaySlot } from './planner';

const reply = (moments: Array<{ beat: string; move: string }>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    place: 'candlelit trattoria with checkered tablecloths',
    time: 'Evening',
    moments,
    ending: 'lowers the glass and smiles',
    ...extra,
  });

const four = [
  { beat: 'sitting at the table holding a glass of red wine, looking at the candle', move: '' },
  { beat: 'sitting at the table, the glass of red wine raised to her lips', move: 'lifts the glass and takes a sip' },
  { beat: 'sitting back, the glass of red wine lowered to her chest, smiling across the table', move: 'lowers the glass and smiles' },
  { beat: 'sitting at the table, raising the glass of red wine toward the camera in a toast', move: 'raises the glass in a toast' },
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
    const laterNoStance = [four[0]!, { beat: 'the glass of red wine near her lips', move: 'brings the glass closer' }, ...four.slice(2)];
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

  it('she stays in the picture: a move or an ending out rejects the plan', () => {
    const out = [...four.slice(0, 3), { beat: 'standing by the door', move: 'stands and walks out of the room' }];
    assert.equal(parseDayEventPlan(reply(out), 4), null);
    assert.equal(parseDayEventPlan(reply(four, { ending: 'turns toward the door, waves once, then walks out into the alley' }), 4), null);
    // Plant leaves are not her leaving.
    assert.ok(parseDayEventPlan(reply(four, { ending: 'tips the glass toward the basil leaves and smiles' }), 4));
  });

  it('she never lies down (the edit reframes to an overhead shot)', () => {
    const lie = [...four.slice(0, 3), { beat: 'lying on her back in the shallow surf, arms spread', move: 'rolls onto her back' }];
    assert.equal(parseDayEventPlan(reply(lie), 4), null);
    assert.equal(parseDayEventPlan(reply(four, { ending: 'lies back on the towel and closes her eyes' }), 4), null);
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
    assert.equal(applied[0]!.sceneHints, four[0]!.beat);
    assert.equal(applied[0]!.eventMove, four[1]!.move);
    assert.equal(applied[2]!.eventMove, four[3]!.move);
    // The last moment rounds the event off.
    assert.equal(applied[3]!.eventMove, 'lowers the glass and smiles');
    // eventMove survives a save and load.
    assert.equal(normalizeDaySlots(applied, 4)[0]!.eventMove, four[1]!.move);
  });

  it("back to a whole day: the Day's own scenes come back, moves go", async () => {
    const { dayEventBefore } = await import('./event');
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

  it('she holds what she uses from first to last — a plan that picks up or puts down is rejected', () => {
    const pickUp = [...four.slice(0, 3), { beat: 'sitting at the table holding the menu', move: 'puts the glass down and picks up the menu' }];
    assert.equal(parseDayEventPlan(reply(pickUp), 4), null);
    const reach = [...four.slice(0, 3), { beat: 'sitting at the table, glass in hand', move: 'reaches for the bread' }];
    assert.equal(parseDayEventPlan(reply(reach), 4), null);
  });

  it('the first moment holds every listed prop; more than two is not one take', () => {
    const plan = parseDayEventPlan(
      reply(
        [
          { beat: 'sitting on the towel, looking at the sea', move: '' },
          { beat: 'sitting on the towel, the paperback book open in her lap', move: 'opens the book' },
          { beat: 'sitting on the towel, turning a page of the paperback book', move: 'turns a page' },
          { beat: 'sitting on the towel, smiling at the camera over the book', move: 'lifts the book and smiles over it' },
        ],
        { props: ['a paperback book'] }
      ),
      4
    );
    assert.equal(plan?.moments[0]!.beat, 'sitting on the towel, looking at the sea, holding a paperback book');
    assert.equal(parseDayEventPlan(reply(four, { props: ['a', 'b', 'c'] }), 4), null);
  });

  it('listed props are held throughout — a beat that leaves one out does not put it down', () => {
    const plan = parseDayEventPlan(
      reply(
        [
          { beat: 'sitting cross-legged on her bed holding a black acoustic guitar', move: '' },
          { beat: 'sitting cross-legged, fingers on the strings, eyes down', move: 'strums a soft chord' },
          { beat: 'sitting cross-legged, smiling at the camera', move: 'strums again and smiles' },
          { beat: 'sitting cross-legged, head bent over the frets', move: 'shifts her fingers to a new chord' },
        ],
        { props: ['a black acoustic guitar'], ending: 'strums one final chord' }
      ),
      4
    );
    assert.ok(plan);
    assert.ok(plan.moments.every(moment => !/\bdown beside her\b/.test(moment.beat)));
  });

  it('every move and the ending is something to watch, not only a look or a breath', () => {
    const resting = [...four.slice(0, 3), { beat: 'sitting at the table, eyes closed', move: 'closes her eyes and breathes deeply' }];
    assert.equal(parseDayEventPlan(reply(resting), 4), null);
    const winding = [...four.slice(0, 3), { beat: 'sitting at the table, gazing at the candle', move: 'rests her hand on the table and gazes at the candle' }];
    assert.equal(parseDayEventPlan(reply(winding), 4), null);
    assert.equal(parseDayEventPlan(reply(four, { ending: 'smiles softly at the candle' }), 4), null);
    assert.equal(parseDayEventPlan(reply(four, { ending: '' }), 4), null);
    assert.equal(parseDayEventPlan(reply(four, { ending: 'holds the glass steady, gaze locked on the candle' }), 4), null);
    // Her hands lead; a look or a smile can join in.
    const handsFirst = [...four.slice(0, 3), { beat: 'sitting at the table, the glass at her lips', move: 'lifts the glass and looks over it at the camera' }];
    assert.ok(parseDayEventPlan(reply(handsFirst), 4));
  });

  it('says what is wrong with a plan, in words the LLM can fix', () => {
    const resting = [...four.slice(0, 3), { beat: 'sitting at the table, eyes closed', move: 'closes her eyes and breathes deeply' }];
    const checked = checkDayEventPlan(reply(resting, { props: ['a glass of red wine'] }), 4);
    assert.ok('problem' in checked);
    assert.match(checked.problem, /^Move 4 \("closes her eyes and breathes deeply"\) is only a look, breath, smile or rest/);
    assert.match(checked.problem, /her hands do with a glass of red wine/);
    const crowd = [four[0]!, { beat: 'sitting at the table, watching the passers-by', move: 'sips the wine' }, ...four.slice(2)];
    const company = checkDayEventPlan(reply(crowd), 4);
    assert.ok('problem' in company && /Moment 2 mentions someone else \("passers-by"\)/.test(company.problem));
    assert.deepEqual(checkDayEventPlan('not json', 4), { problem: 'The answer was not the JSON asked for.' });
  });

  it('keeps her action and cuts the world around her out of the ending', () => {
    assert.equal(
      dayEventActionWords('holds the mug steady with both hands, smiling as the sun hits her face through the trees'),
      'holds the mug steady with both hands, smiling'
    );
    assert.equal(dayEventActionWords('takes one more sip as the waves roll in'), 'takes one more sip');
    assert.equal(dayEventActionWords('lifts the glass while the breeze moves her hair'), 'lifts the glass');
    assert.equal(dayEventActionWords('turns the spoon and hums as steam rises from the pot'), 'turns the spoon and hums as steam rises from the pot');
    assert.equal(dayEventActionWords('strums one final chord'), 'strums one final chord');
  });

  it('a passing cyclist or jogger is someone else in the picture', () => {
    const cyclist = [...four.slice(0, 3), { beat: 'sitting at the table, the glass of red wine lowered', move: 'grips the glass and watches a cyclist pass' }];
    assert.equal(parseDayEventPlan(reply(cyclist), 4), null);
  });

  it('sends a failed plan back with its problem, or starts over when it was not JSON', () => {
    const fresh = buildDayEventMessages({ event: 'wine on a rooftop', count: 4 });
    const fixing = dayEventFixMessages(fresh, `Here: ${reply(four)}`, 'Move 4 is only a look.');
    assert.equal(fixing.length, fresh.length + 2);
    assert.deepEqual(fixing.slice(0, fresh.length), fresh);
    assert.equal(fixing.at(-2)!.role, 'assistant');
    assert.equal(fixing.at(-2)!.content, reply(four));
    assert.match(fixing.at(-1)!.content as string, /^That plan can't be used: Move 4 is only a look\. Write the whole plan again as JSON/);
    assert.equal(dayEventFixMessages(fresh, 'sorry, no', 'x'), fresh);
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

  it('the listed props are kept where they lie in every moment edit', async () => {
    const { dayEventKeepPropsLine } = await import('./event');
    assert.equal(
      dayEventKeepPropsLine(['a paperback book', 'a plastic cup of lemonade']),
      'She is still holding the paperback book and the plastic cup of lemonade, the same as in Image 1; nothing else appears in her hands or around her.'
    );
    assert.equal(dayEventKeepPropsLine(undefined), '');
    assert.deepEqual(
      normalizeDayEvent({ text: 'x', place: 'y', time: 'Night', props: ['a book', 3] })?.props,
      ['a book']
    );
  });

  it('a later moment is an edit of the one before, posed by its beat', () => {
    assert.equal(dayEventMomentWords({ sceneHints: 'sitting at the table. ' }), 'sitting at the table');
  });
});

describe('one event — leaving it for a whole day', () => {
  it('Write the day / Suggest on an event Day clear the event, its labels and moves', () => {
    const slots = normalizeDaySlots([
      { id: 'morning', label: 'Evening', sceneHints: 'sitting at the table holding a glass of red wine', eventMove: 'lifts the glass' },
      { id: 'afternoon', label: 'Evening', sceneHints: 'sitting at the table, sipping', eventMove: 'lowers the glass' },
    ]) as DaySlot[];
    const event = { text: 'wine at a trattoria', place: 'candlelit trattoria', time: 'Evening' };
    const whole = slotsForWholeDay(slots, event, daySlotDefaultLabel);
    assert.equal(whole.leaves, true);
    assert.deepEqual(
      whole.slots.map(slot => [slot.label, slot.eventMove]),
      slots.map(slot => [daySlotDefaultLabel(slot.id), undefined])
    );
  });

  it('a whole day stays as it is', () => {
    const slots = normalizeDaySlots([{ id: 'morning', label: 'Morning', sceneHints: 'jogging in the park' }]) as DaySlot[];
    assert.deepEqual(slotsForWholeDay(slots, undefined, daySlotDefaultLabel), { slots, leaves: false });
  });
});

describe('one event — only while its moments are there', () => {
  const event = { text: 'wine at a trattoria', place: 'candlelit trattoria', time: 'Evening' };
  it('runs while every slot carries its move', () => {
    const moments = applyDayEventPlan(normalizeDaySlots([], 4) as DaySlot[], parseDayEventPlan(reply(four), 4)!);
    assert.equal(activeDayEvent(event, moments)?.text, 'wine at a trattoria');
  });
  it('a saved event under whole-day slots does nothing (the rooftop drawn over the stairs)', () => {
    const moments = applyDayEventPlan(normalizeDaySlots([], 4) as DaySlot[], parseDayEventPlan(reply(four), 4)!);
    assert.equal(activeDayEvent(event, normalizeDaySlots([], 4)), undefined);
    // One card re-rolled to a whole-day scene breaks the chain.
    const rerolled = moments.map((slot, index) => (index === 2 ? { ...slot, eventMove: undefined } : slot));
    assert.equal(activeDayEvent(event, rerolled), undefined);
    assert.equal(activeDayEvent(undefined, moments), undefined);
  });
});
