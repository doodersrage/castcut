import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyDayNarration } from './narration';
import type { DaySlot, DaySlotStill } from './planner';
import type { FilmPlaylistShot } from '../media/kind';

const slot = (id: string, narration?: string) => ({ id, label: id, narration }) as unknown as DaySlot;
const shot = (key: string): FilmPlaylistShot & { key: string } => ({
  kind: 'still',
  url: `/${key}.png`,
  title: key,
  key,
});

describe('applyDayNarration', () => {
  it('puts recorded lines on their shots (held for the line) and lists the rest', () => {
    const stills = [
      { slotId: 'morning', narrationUrl: '/n1.flac', narrationFor: 'She wakes early.' },
      { slotId: 'noon', narrationUrl: '/old.flac', narrationFor: 'An older line.' },
    ] as unknown as DaySlotStill[];
    const { shots, missing } = applyDayNarration(
      [shot('morning'), shot('noon'), shot('night')],
      [slot('morning', 'She wakes early.'), slot('noon', 'Lunch with Sam.'), slot('night')],
      stills
    );
    assert.equal(shots[0]!.narrationUrl, '/n1.flac');
    assert.ok((shots[0]!.holdSec ?? 0) > 0);
    assert.equal(shots[1]!.narrationUrl, undefined);
    assert.equal(shots[2]!.narrationUrl, undefined);
    assert.deepEqual(missing, [{ slotId: 'noon', label: 'noon', line: 'Lunch with Sam.' }]);
  });
});
