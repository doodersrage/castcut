import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayMoodWantsAutoKit, pickDayAutoKit, type DayAutoKitOption } from './day-auto-kit';

const OUTFITS = 'Full outfits';
const options: DayAutoKitOption[] = [
  { value: '', label: 'Default kit…' },
  { value: 'outfit-a-slip', label: 'high-waisted denim blue slip dress', group: OUTFITS },
  { value: 'outfit-b-romper', label: 'tailored coral romper', group: OUTFITS },
  { value: 'outfit-c-street', label: 'boxy steel streetwear fit', group: OUTFITS },
  { value: 'outfit-d-wizard', label: 'cropped plum wizard robe outfit', group: OUTFITS },
  { value: 'outfit-e-suit', label: 'boxy lime two-piece linen suit', group: OUTFITS },
  { value: 'top-f-tee', label: 'cropped white tee', group: 'Tops' },
  { value: 'outfit-g-nothumb', label: 'soft grey sweater dress', group: OUTFITS },
];
const hasPackshot = (id: string) => id !== 'outfit-g-nothumb';

describe('day-auto-kit', () => {
  it('only everyday and vacation dress from an auto kit', () => {
    assert.equal(dayMoodWantsAutoKit('everyday'), true);
    assert.equal(dayMoodWantsAutoKit('vacation'), true);
    for (const mood of ['sport', 'suggestive', 'intimate', 'raunchy']) {
      assert.equal(dayMoodWantsAutoKit(mood), false, mood);
      assert.equal(
        pickDayAutoKit({ options, dayMood: mood, slotId: 'morning', hasPackshot }),
        undefined
      );
    }
  });

  it('picks a day-out full outfit with a packshot — never a costume, suit, lone top or thumbless kit', () => {
    const everyday = new Set<string>();
    const vacation = new Set<string>();
    for (const slotId of ['morning', 'afternoon', 'evening', 'night', 'a', 'b', 'c', 'd']) {
      everyday.add(pickDayAutoKit({ options, dayMood: 'everyday', slotId, hasPackshot })!);
      vacation.add(pickDayAutoKit({ options, dayMood: 'vacation', slotId, hasPackshot })!);
    }
    assert.deepEqual([...everyday].sort(), ['outfit-a-slip', 'outfit-b-romper', 'outfit-c-street']);
    assert.deepEqual([...vacation].sort(), ['outfit-a-slip', 'outfit-b-romper']);
  });

  it('is stable per slot and avoids kits other slots already wear', () => {
    const input = { options, dayMood: 'everyday', slotId: 'afternoon', salt: 'cast-1', hasPackshot };
    const first = pickDayAutoKit(input);
    assert.equal(pickDayAutoKit(input), first);
    const others = ['outfit-a-slip', 'outfit-b-romper', 'outfit-c-street'].filter(id => id !== first);
    assert.equal(pickDayAutoKit({ ...input, exclude: [first, others[0]] }), others[1]);
    // Everything taken: still dress her rather than fall back to the plate's underwear.
    assert.ok(pickDayAutoKit({ ...input, exclude: [first, ...others] }));
  });
});
