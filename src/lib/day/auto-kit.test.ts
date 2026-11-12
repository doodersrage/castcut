import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayMoodWantsAutoKit,
  pickDayAutoKit,
  scriptSceneOutfitKit,
  type DayAutoKitOption,
} from './auto-kit';

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

describe('a script’s Scenes keep one outfit for the day and one for the evening', () => {
  const scene = (id: string, at: number, part: string, kit?: string, scriptId = 's1') => ({
    id,
    createdAt: at,
    fromScript: { scriptId },
    slot: { id: part, ...(kit ? { wardrobeId: kit } : {}) },
  });
  const scenes = [
    scene('a', 1, 'morning', 'green-wrap'),
    scene('b', 2, 'afternoon', 'grey-romper'),
    scene('c', 3, 'night', 'blue-dress'),
    scene('d', 4, 'afternoon'),
    scene('e', 5, 'evening'),
    scene('x', 0, 'afternoon', 'other-script', 's2'),
  ];

  it('wears the first-made kit of the same script at that time of day', () => {
    assert.equal(scriptSceneOutfitKit(scenes, 'd', 'everyday'), 'green-wrap');
    assert.equal(scriptSceneOutfitKit(scenes, 'e', 'everyday'), 'blue-dress');
    assert.equal(scriptSceneOutfitKit(scenes, 'a', 'everyday'), 'grey-romper');
  });

  it('skips kits that don’t fit, Scenes of no script, and Vacation', () => {
    assert.equal(scriptSceneOutfitKit(scenes, 'd', 'everyday', id => id !== 'green-wrap'), 'grey-romper');
    assert.equal(
      scriptSceneOutfitKit([{ id: 'n', createdAt: 1, slot: { id: 'morning' } }, ...scenes], 'n', 'everyday'),
      undefined
    );
    assert.equal(scriptSceneOutfitKit(scenes, 'd', 'vacation'), undefined);
  });

  it('wears what the same script scene wears first, whatever its time (s11, 2026-11-12)', () => {
    // 2B sits on the board's "night" moment while the script says DAY: it matched no one and
    // wore a sweater dress between 2A and 2C in magenta.
    const shot = (id: string, at: number, part: string, sceneId: string, kit?: string) => ({
      id,
      createdAt: at,
      fromScript: { scriptId: 's1', sceneId },
      slot: { id: part, ...(kit ? { wardrobeId: kit } : {}) },
    });
    const shots = [
      shot('1a', 1, 'afternoon', 'shop', 'magenta-wrap'),
      shot('2a', 2, 'afternoon', 'corner', 'magenta-wrap'),
      shot('2b', 3, 'night', 'corner'),
      shot('n2', 0, 'night', 'elsewhere', 'stone-sweater'),
    ];
    assert.equal(scriptSceneOutfitKit(shots, '2b', 'everyday'), 'magenta-wrap');
    // Nothing worn in its scene yet: the time of day, as before.
    assert.equal(scriptSceneOutfitKit([...shots.slice(0, 1), shots[2]!, shots[3]!], '2b', 'everyday'), 'stone-sweater');
  });
});
