import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PARKED_DAY_LIMIT, swapDayForCast } from './cast-park';
import type { DayToolCache } from '../play/settings';

const still = (slotId: string) => ({ slotId, status: 'completed', imageUrl: `/${slotId}.png` }) as never;

describe('each Cast keeps its own Day', () => {
  it('parks the Day on a switch and brings it back', () => {
    const nora: DayToolCache = {
      slots: [{ id: 'morning', label: 'morning', sceneHints: 'café' }] as never,
      stills: [still('morning')],
      stillsCharacterId: 'nora',
      dayMood: 'everyday',
    };
    const toTomas = swapDayForCast(nora, 'nora', 'tomas', 1);
    assert.deepEqual(toTomas.stills, []);
    assert.equal(toTomas.stillsCharacterId, undefined);
    assert.ok(toTomas.parkedDays?.nora);
    const tomasDay: DayToolCache = { ...nora, ...toTomas };
    const back = swapDayForCast(tomasDay, 'tomas', 'nora', 2);
    assert.equal(back.stills?.length, 1);
    assert.equal(back.stillsCharacterId, 'nora');
    assert.equal(back.parkedDays, undefined);
  });

  it('does not park an empty Day, and keeps a bounded number', () => {
    assert.equal(swapDayForCast({ stills: [] }, 'a', 'b').parkedDays, undefined);
    let day: DayToolCache = {};
    for (let index = 0; index < PARKED_DAY_LIMIT + 3; index += 1) {
      day = { ...day, stills: [still('x')], stillsCharacterId: `cast-${index}` };
      day = { ...day, ...swapDayForCast(day, `cast-${index}`, `cast-${index + 1}`, index) };
    }
    assert.equal(Object.keys(day.parkedDays ?? {}).length, PARKED_DAY_LIMIT);
    assert.ok(!day.parkedDays?.['cast-0'], 'the oldest went first');
  });

  it('parks a Short with its link, stills or not, and brings it back linked', () => {
    const link = { castId: 'nora', scriptId: 'script-n', fingerprint: 'f', syncedAt: 1 };
    const short: DayToolCache = {
      slots: [{ id: 'morning', label: 'morning', sceneHints: 'café' }] as never,
      stills: [],
      stillsCharacterId: 'nora',
      shortLink: link as never,
    };
    const away = swapDayForCast(short, 'nora', 'tomas', 1);
    assert.deepEqual(away.parkedDays?.nora?.shortLink, link);
    const back = swapDayForCast({ ...short, ...away, shortLink: undefined }, 'tomas', 'nora', 2);
    assert.deepEqual(back.shortLink, link);
    // A Cast whose parked Day has no short gets none (not the one on the page before).
    const other = swapDayForCast({ ...short, parkedDays: { tomas: { at: 1, slots: [] } } }, 'nora', 'tomas', 3);
    assert.ok('shortLink' in other && other.shortLink === undefined);
    // Another Cast's link isn't parked with this Day.
    const stray = swapDayForCast({ ...short, stills: [still('morning')], shortLink: { ...link, castId: 'x' } as never }, 'nora', 'tomas', 4);
    assert.equal(stray.parkedDays?.nora?.shortLink, undefined);
  });
});
