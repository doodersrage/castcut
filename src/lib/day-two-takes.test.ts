import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayTwoTakesApplies,
  dayTwoTakesImages,
  dayTwoTakesJudged,
  dayTwoTakesMark,
  dayTwoTakesNeedsOrder,
  dayTwoTakesOrderPatch,
  dayTwoTakesOrdered,
  dayTwoTakesPairId,
  dayTwoTakesPending,
  dayTwoTakesPickPatch,
  dayTwoTakesReady,
  dayTwoTakesSwapPatch,
  settleDayTwoTakes,
  twoTakeFromGallery,
} from './day-two-takes';
import { mergeDaySlotStills, normalizeDaySlotStills, upsertDaySlotStill } from './day-planner';
import type { DaySlotStill } from './day-planner';

const pending: DaySlotStill = {
  slotId: 'morning',
  promptId: 'p-a',
  status: 'queued',
  twoTakes: { promptId: 'p-b', status: 'queued' },
};

const ready: DaySlotStill = {
  slotId: 'morning',
  promptId: 'p-a',
  imageUrl: '/a.png',
  status: 'completed',
  twoTakes: { promptId: 'p-b', imageUrl: '/b.png', status: 'completed' },
};

describe('dayTwoTakesApplies', () => {
  it('queues two takes only for a fresh intimate still with the switch on', () => {
    assert.equal(dayTwoTakesApplies({ enabled: true, intimateStill: true }), true);
    assert.equal(dayTwoTakesApplies({ enabled: false, intimateStill: true }), false);
    assert.equal(dayTwoTakesApplies({ enabled: true, intimateStill: false }), false);
    // A same-seed redo compares with the old take; a pair's second take is one take.
    assert.equal(dayTwoTakesApplies({ enabled: true, intimateStill: true, sameSeed: true }), false);
    assert.equal(
      dayTwoTakesApplies({ enabled: true, intimateStill: true, keepsATake: true }),
      false
    );
  });
});

describe('two takes state', () => {
  it('is pending until picked, ready once both landed', () => {
    assert.equal(dayTwoTakesPending(pending), true);
    assert.equal(dayTwoTakesReady(pending), false);
    assert.equal(dayTwoTakesReady(ready), true);
    assert.equal(dayTwoTakesPending({ twoTakes: undefined }), false);
    // Held by the adult check: not shown, so not ready.
    assert.equal(dayTwoTakesReady({ ...ready, adultHold: 'checking' }), false);
    assert.equal(
      dayTwoTakesReady({ ...ready, twoTakes: { ...ready.twoTakes!, adultHold: 'checking' } }),
      false
    );
  });

  it('shows the images that have landed', () => {
    assert.deepEqual(dayTwoTakesImages(ready), { first: '/a.png', second: '/b.png' });
    assert.deepEqual(
      dayTwoTakesImages({ ...ready, twoTakes: { promptId: 'p-b', status: 'running' } }),
      { first: '/a.png', second: '' }
    );
    // The first take's Face finish is what it shows.
    assert.equal(
      dayTwoTakesImages({ ...ready, finishedUrl: '/a-face.png', finishedFor: 'p-a' }).first,
      '/a-face.png'
    );
  });

  it('marks the card while rendering, while picking and after the pick', () => {
    assert.equal(dayTwoTakesMark(pending), 'Two takes…');
    assert.equal(
      dayTwoTakesMark({ ...ready, twoTakes: { promptId: 'p-b', status: 'running' } }),
      'Two takes — the other is rendering…'
    );
    assert.equal(dayTwoTakesMark(ready), 'Two takes — tap the one to keep');
    assert.equal(
      dayTwoTakesMark({
        slotId: 'morning',
        promptId: 'p-a',
        imageUrl: '/a.png',
        status: 'completed',
        previousTake: { imageUrl: '/b.png', promptId: 'p-b', kind: 'two-takes' },
      }),
      'Two takes · your pick (the other is kept)'
    );
    assert.equal(dayTwoTakesMark({ slotId: 'morning', status: 'completed' }), null);
  });
});

describe('twoTakeFromGallery', () => {
  const take = { promptId: 'p-b', status: 'queued' as const };

  it('lands the second take from its own gallery entry', () => {
    assert.deepEqual(
      twoTakeFromGallery(take, { promptId: 'p-b', status: 'completed', imageUrl: '/b.png' }),
      { promptId: 'p-b', status: 'completed', imageUrl: '/b.png' }
    );
    assert.deepEqual(twoTakeFromGallery(take, { promptId: 'p-b', status: 'running' }), {
      promptId: 'p-b',
      status: 'running',
    });
    assert.deepEqual(twoTakeFromGallery(take, { promptId: 'p-b', status: 'error' }), {
      promptId: 'p-b',
      status: 'error',
    });
  });

  it('keeps the same object when nothing moved, or with no entry', () => {
    assert.equal(twoTakeFromGallery(take, undefined), take);
    assert.equal(twoTakeFromGallery(take, { promptId: 'p-b', status: 'pending' }), take);
  });

  it('holds the take while the adult check reads it; a withheld take fails', () => {
    assert.deepEqual(
      twoTakeFromGallery(take, {
        promptId: 'p-b',
        status: 'completed',
        imageUrl: '/b.png',
        adultCheck: 'pending',
      }),
      { promptId: 'p-b', status: 'running', adultHold: 'checking' }
    );
    assert.deepEqual(
      twoTakeFromGallery(take, {
        promptId: 'p-b',
        status: 'completed',
        imageUrl: '/b.png',
        adultCheck: 'withheld',
      }),
      { promptId: 'p-b', status: 'error', adultHold: 'withheld' }
    );
  });
});

describe('settleDayTwoTakes', () => {
  it('drops a failed second take — the first stands alone', () => {
    const settled = settleDayTwoTakes({
      ...ready,
      twoTakes: { promptId: 'p-b', status: 'error' },
    });
    assert.equal(settled.twoTakes, undefined);
    assert.equal(settled.promptId, 'p-a');
    assert.equal(settled.imageUrl, '/a.png');
  });

  it('promotes the second take when the first failed', () => {
    const withheld: DaySlotStill = {
      slotId: 'morning',
      promptId: 'p-a',
      status: 'error',
      adultHold: 'withheld',
      adultHoldCause: 'age',
      twoTakes: { promptId: 'p-b', imageUrl: '/b.png', status: 'completed' },
    };
    const settled = settleDayTwoTakes(withheld);
    assert.equal(settled.promptId, 'p-b');
    assert.equal(settled.imageUrl, '/b.png');
    assert.equal(settled.status, 'completed');
    assert.equal(settled.adultHold, undefined);
    assert.equal(settled.twoTakes, undefined);
  });

  it('waits while a take is still rendering', () => {
    const firstFailed: DaySlotStill = {
      slotId: 'morning',
      promptId: 'p-a',
      status: 'error',
      twoTakes: { promptId: 'p-b', status: 'running' },
    };
    assert.equal(settleDayTwoTakes(firstFailed), firstFailed);
    assert.equal(settleDayTwoTakes(ready), ready);
    assert.equal(settleDayTwoTakes(pending), pending);
  });
});

describe('picking a take', () => {
  it('keeps the first: the second becomes the alternate', () => {
    const pick = dayTwoTakesPickPatch(ready, 'first');
    assert.ok(pick);
    assert.equal(pick.keptId, 'p-a');
    assert.equal(pick.otherId, 'p-b');
    const [still] = upsertDaySlotStill([ready], pick.patch);
    assert.equal(still!.promptId, 'p-a');
    assert.equal(still!.imageUrl, '/a.png');
    assert.equal(still!.twoTakes, undefined);
    assert.deepEqual(still!.previousTake, {
      imageUrl: '/b.png',
      promptId: 'p-b',
      kind: 'two-takes',
    });
    assert.equal(dayTwoTakesJudged(still), true);
  });

  it('keeps the second: it becomes the still, the first the alternate', () => {
    const pick = dayTwoTakesPickPatch(
      { ...ready, finishedUrl: '/a-face.png', finishedFor: 'p-a' },
      'second'
    );
    assert.ok(pick);
    assert.equal(pick.keptId, 'p-b');
    assert.equal(pick.otherId, 'p-a');
    const [still] = upsertDaySlotStill([ready], pick.patch);
    assert.equal(still!.promptId, 'p-b');
    assert.equal(still!.imageUrl, '/b.png');
    assert.equal(still!.status, 'completed');
    assert.equal(still!.finishedUrl, undefined);
    assert.equal(still!.twoTakes, undefined);
    assert.deepEqual(still!.previousTake, {
      imageUrl: '/a-face.png',
      promptId: 'p-a',
      kind: 'two-takes',
    });
  });

  it('cannot pick before both land', () => {
    assert.equal(dayTwoTakesPickPatch(pending, 'first'), null);
    assert.equal(dayTwoTakesPickPatch(undefined, 'second'), null);
  });

  it('swaps to the other take and back — nothing is dropped', () => {
    const picked = upsertDaySlotStill([ready], dayTwoTakesPickPatch(ready, 'first')!.patch)[0]!;
    const swap = dayTwoTakesSwapPatch(picked);
    assert.ok(swap);
    assert.equal(swap.keptId, 'p-b');
    assert.equal(swap.otherId, 'p-a');
    const swapped = upsertDaySlotStill([picked], swap.patch)[0]!;
    assert.equal(swapped.promptId, 'p-b');
    assert.equal(swapped.imageUrl, '/b.png');
    assert.deepEqual(swapped.previousTake, {
      imageUrl: '/a.png',
      promptId: 'p-a',
      kind: 'two-takes',
    });
    const back = upsertDaySlotStill([swapped], dayTwoTakesSwapPatch(swapped)!.patch)[0]!;
    assert.equal(back.promptId, 'p-a');
    assert.equal(back.previousTake?.promptId, 'p-b');
    // Not a two-takes pick: nothing to swap.
    assert.equal(
      dayTwoTakesSwapPatch({
        ...picked,
        previousTake: { imageUrl: '/old.png', promptId: 'p-old' },
      }),
      null
    );
  });
});

describe('two takes through the Day still store', () => {
  it('survives normalization', () => {
    const [still] = normalizeDaySlotStills([
      { ...ready, previousTake: { imageUrl: '/c.png', promptId: 'p-c', kind: 'two-takes' } },
    ]);
    assert.deepEqual(still!.twoTakes, {
      promptId: 'p-b',
      imageUrl: '/b.png',
      status: 'completed',
    });
    assert.equal(still!.previousTake?.kind, 'two-takes');
  });

  it('lands both takes from one gallery poll, then settles a failure', () => {
    const merged = mergeDaySlotStills(
      [pending],
      [
        { promptId: 'p-a', status: 'completed', imageUrl: '/a.png' },
        { promptId: 'p-b', status: 'completed', imageUrl: '/b.png' },
      ]
    );
    assert.equal(merged.changed, true);
    const still = merged.stills.find(entry => entry.slotId === 'morning')!;
    assert.equal(dayTwoTakesReady(still), true);

    const failed = mergeDaySlotStills(
      [pending],
      [
        { promptId: 'p-a', status: 'completed', imageUrl: '/a.png' },
        { promptId: 'p-b', status: 'error' },
      ]
    );
    const alone = failed.stills.find(entry => entry.slotId === 'morning')!;
    assert.equal(alone.twoTakes, undefined);
    assert.equal(alone.imageUrl, '/a.png');
  });

  it('promotes the second take when the first is withheld by the adult check', () => {
    const merged = mergeDaySlotStills(
      [pending],
      [
        { promptId: 'p-a', status: 'completed', imageUrl: '/a.png', adultCheck: 'withheld' },
        { promptId: 'p-b', status: 'completed', imageUrl: '/b.png', adultCheck: 'passed' },
      ]
    );
    const still = merged.stills.find(entry => entry.slotId === 'morning')!;
    assert.equal(still.promptId, 'p-b');
    assert.equal(still.imageUrl, '/b.png');
    assert.equal(still.status, 'completed');
    assert.equal(still.twoTakes, undefined);
  });
});

describe('two takes order (duo-still-check counts)', () => {
  const note = 'Shown first — the other take counted one face.';

  it('shows Take 1 then Take 2 until the counts say otherwise; labels stay with their takes', () => {
    const plain = dayTwoTakesOrdered(ready);
    assert.deepEqual(
      plain.map(take => [take.keep, take.label, take.url, take.likelier]),
      [
        ['first', 'Take 1', '/a.png', false],
        ['second', 'Take 2', '/b.png', false],
      ]
    );
    const secondFirst = dayTwoTakesOrdered({
      ...ready,
      twoTakes: { ...ready.twoTakes!, likelierChecked: true, likelier: 'second', likelierNote: note },
    });
    assert.deepEqual(
      secondFirst.map(take => [take.keep, take.label, take.likelier, take.note]),
      [
        ['second', 'Take 2', true, note],
        ['first', 'Take 1', false, undefined],
      ]
    );
    const firstFirst = dayTwoTakesOrdered({
      ...ready,
      twoTakes: { ...ready.twoTakes!, likelierChecked: true, likelier: 'first', likelierNote: 'n' },
    });
    assert.deepEqual(
      firstFirst.map(take => take.keep),
      ['first', 'second']
    );
    assert.equal(firstFirst[0]!.note, 'n');
  });

  it('needs an order once both takes landed, and only once per pair', () => {
    assert.equal(dayTwoTakesNeedsOrder(pending), false);
    assert.equal(dayTwoTakesNeedsOrder(ready), true);
    assert.equal(
      dayTwoTakesNeedsOrder({ ...ready, twoTakes: { ...ready.twoTakes!, likelierChecked: true } }),
      false
    );
    assert.equal(dayTwoTakesNeedsOrder({ ...ready, adultHold: 'checking' }), false);
    assert.equal(dayTwoTakesPairId(ready), 'p-a|p-b');
    assert.equal(dayTwoTakesPairId({ ...ready, twoTakes: undefined }), '');
  });

  it('remembers the likelier take for the pair it counted, and nothing for a tie', () => {
    const patch = dayTwoTakesOrderPatch(ready, 'p-a|p-b', { pick: 'second', note: 'why' });
    assert.deepEqual(patch, {
      slotId: 'morning',
      twoTakes: {
        promptId: 'p-b',
        imageUrl: '/b.png',
        status: 'completed',
        likelierChecked: true,
        likelier: 'second',
        likelierNote: 'why',
      },
    });
    const tie = dayTwoTakesOrderPatch(ready, 'p-a|p-b', null);
    assert.deepEqual(tie?.twoTakes, { ...ready.twoTakes, likelierChecked: true });
    // The pair moved on (a requeue) while the counts ran: no patch.
    assert.equal(dayTwoTakesOrderPatch(ready, 'p-a|p-z', { pick: 'first', note: 'n' }), null);
    assert.equal(dayTwoTakesOrderPatch({ ...ready, twoTakes: undefined }, 'p-a|p-b', null), null);
  });

  it('keeps the order fields through the stills normalizer and a gallery poll', () => {
    const ordered: DaySlotStill = {
      ...ready,
      twoTakes: { ...ready.twoTakes!, likelierChecked: true, likelier: 'second', likelierNote: 'why' },
    };
    const normalized = normalizeDaySlotStills([ordered])[0]!;
    assert.deepEqual(normalized.twoTakes, ordered.twoTakes);
    const junk = normalizeDaySlotStills([
      { ...ready, twoTakes: { ...ready.twoTakes!, likelier: 'third' as 'first' } },
    ])[0]!;
    assert.equal(junk.twoTakes?.likelier, undefined);
    // A poll that finds both takes unchanged keeps the same take object (and its order).
    const polled = mergeDaySlotStills(
      [ordered],
      [
        { promptId: 'p-a', status: 'completed', imageUrl: '/a.png' },
        { promptId: 'p-b', status: 'completed', imageUrl: '/b.png' },
      ]
    );
    assert.equal(polled.stills[0]!.twoTakes?.likelier, 'second');
  });
});
