/**
 * Raunchy merged into Intimate as its Playful toggle (mood-flavor.ts). The planner still runs
 * the 'raunchy' flavor, so the proof here is that a Day stored the new way (Intimate + Playful)
 * builds byte-identical plans and prompts to the old Raunchy mood, and Intimate with Playful off
 * to the old Intimate — for every beat, slot and mix, from a fixed seed.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayMoodFlavor,
  dayMoodWithPlayful,
  dayPickerMood,
  migrateDayMoodFields,
} from './mood-flavor';
import {
  DAY_MOOD_OPTIONS,
  daySlotsForLength,
  diversifyDaySlotScenes,
  ensureDaySlotsMatchMood,
  intimateBeatsForMix,
  isDayAdultMood,
  raunchyBeatsForMix,
  type DayIntimateMix,
  type DaySlot,
} from './planner';
import { buildDaySlotPromptForStill } from './still-prompt';
import { resolveDayQueueIdentityPlate } from './plate';
import { storySeedFromDay } from './story-seed';
import { swapDayForCast } from './cast-park';
import { castFileDay } from '../cast/transfer';
import { dayEpisodeSnapshot } from './episode-snapshot';
import { migrateLegacyToolSettings, type ToolSettingsCache } from '../settings/cache';
import type { DayToolCache } from '../play/settings';

const MIXES: DayIntimateMix[] = ['solo', 'duo', 'mixed'];
const SLOT_IDS = daySlotsForLength(6).map(slot => slot.id);

/** Deterministic random (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const plate = { filename: 'cast-plate-nora.png', source: 'cast' as const };
const character = {
  id: 'char-nora',
  name: 'Nora',
  version: 1,
  updatedAt: 1,
  descriptor: 'a woman with long red hair',
  traits: { sex: 'woman', pubicHair: 'trimmed' },
};

function prompt(dayMood: string | undefined, intimateMix: DayIntimateMix, slot: DaySlot): string {
  return buildDaySlotPromptForStill(slot, {
    plate,
    queuePlate: resolveDayQueueIdentityPlate({ character, displayPlate: plate } as never),
    character,
    hasPlate: true,
    leadNoun: 'woman',
    dayMood,
    intimateMix,
    intimateEnabled: true,
    allowCompanions: intimateMix !== 'solo',
    model: 'qwen-image-edit-2511-lightning-8',
    defaultPoseGuideStyle: 'openpose',
  } as never);
}

describe('Intimate · Playful (the old Raunchy mood)', () => {
  it('is one mood in the picker: no Raunchy entry', () => {
    assert.deepEqual(
      DAY_MOOD_OPTIONS.map(option => option.id),
      ['everyday', 'suggestive', 'sport', 'vacation', 'intimate']
    );
  });

  it('stored form → flavor', () => {
    assert.equal(dayMoodFlavor({ dayMood: 'intimate', intimatePlayful: true }), 'raunchy');
    assert.equal(dayMoodFlavor({ dayMood: 'intimate', intimatePlayful: false }), 'intimate');
    assert.equal(dayMoodFlavor({ dayMood: 'intimate' }), 'intimate');
    // Legacy saves (before the merge) still play as Raunchy.
    assert.equal(dayMoodFlavor({ dayMood: 'raunchy' }), 'raunchy');
    // Playful only applies to Intimate.
    assert.equal(dayMoodFlavor({ dayMood: 'everyday', intimatePlayful: true }), 'everyday');
    assert.equal(dayMoodFlavor({ dayMood: 'date-night', intimatePlayful: true }), 'date-night');
    assert.equal(dayMoodFlavor({}), undefined);
    assert.equal(dayMoodFlavor(null), undefined);
    assert.equal(isDayAdultMood(dayMoodFlavor({ dayMood: 'intimate', intimatePlayful: true })), true);
  });

  it('picker ↔ flavor round-trips', () => {
    assert.deepEqual(dayPickerMood('raunchy'), { mood: 'intimate', playful: true });
    assert.deepEqual(dayPickerMood('intimate'), { mood: 'intimate', playful: false });
    assert.deepEqual(dayPickerMood('suggestive'), { mood: 'suggestive', playful: false });
    assert.equal(dayMoodWithPlayful('intimate', true), 'raunchy');
    assert.equal(dayMoodWithPlayful('intimate', false), 'intimate');
    assert.equal(dayMoodWithPlayful('suggestive', true), 'suggestive');
  });

  it('migrates a Raunchy Day to Intimate with Playful on, leaves the rest alone', () => {
    assert.deepEqual(migrateDayMoodFields({ dayMood: 'raunchy', intimateMix: 'duo' }), {
      dayMood: 'intimate',
      intimatePlayful: true,
      intimateMix: 'duo',
    });
    const intimate = { dayMood: 'intimate', intimatePlayful: false };
    assert.equal(migrateDayMoodFields(intimate), intimate);
    const everyday = { dayMood: 'everyday', intimatePlayful: true };
    assert.equal(migrateDayMoodFields(everyday), everyday);
    // Round-trip: the migrated form plays as the flavor it came from.
    assert.equal(dayMoodFlavor(migrateDayMoodFields({ dayMood: 'raunchy' })), 'raunchy');
  });

  it('settings load migrates the live Day and the Days parked under other Casts', () => {
    const tools = {
      day: {
        dayMood: 'raunchy',
        intimateMix: 'solo',
        parkedDays: {
          a: { at: 1, dayMood: 'raunchy', slots: [] },
          b: { at: 2, dayMood: 'intimate', slots: [] },
        },
      },
    } as unknown as ToolSettingsCache;
    const { tools: next, changed } = migrateLegacyToolSettings(tools);
    assert.equal(changed, true);
    assert.equal(next.day?.dayMood, 'intimate');
    assert.equal(next.day?.intimatePlayful, true);
    assert.equal(next.day?.intimateMix, 'solo');
    assert.equal(next.day?.parkedDays?.a?.dayMood, 'intimate');
    assert.equal(next.day?.parkedDays?.a?.intimatePlayful, true);
    assert.equal(next.day?.parkedDays?.b, tools.day?.parkedDays?.b);
    const again = migrateLegacyToolSettings(next);
    assert.equal(again.changed, false);
  });

  it('builds byte-identical prompts: Intimate + Playful = old Raunchy, Playful off = Intimate', () => {
    let compared = 0;
    for (const slotId of SLOT_IDS) {
      for (const mix of MIXES) {
        const beats = [
          ...raunchyBeatsForMix(slotId, mix).map(beat => ({ beat, pool: 'raunchy' })),
          ...intimateBeatsForMix(slotId, mix).map(beat => ({ beat, pool: 'intimate' })),
        ];
        for (const { beat } of beats) {
          const slot: DaySlot = {
            id: slotId,
            label: slotId,
            location: 'bedroom',
            sceneHints: beat,
          };
          const oldRaunchy = prompt('raunchy', mix, slot);
          const playful = prompt(
            dayMoodFlavor({ dayMood: 'intimate', intimatePlayful: true }),
            mix,
            slot
          );
          const migrated = prompt(
            dayMoodFlavor(migrateDayMoodFields({ dayMood: 'raunchy' })),
            mix,
            slot
          );
          assert.equal(playful, oldRaunchy, `${slotId}/${mix}: ${beat}`);
          assert.equal(migrated, oldRaunchy, `${slotId}/${mix}: ${beat}`);
          const oldIntimate = prompt('intimate', mix, slot);
          const playfulOff = prompt(
            dayMoodFlavor({ dayMood: 'intimate', intimatePlayful: false }),
            mix,
            slot
          );
          assert.equal(playfulOff, oldIntimate, `${slotId}/${mix}: ${beat}`);
          compared += 1;
        }
      }
    }
    assert.ok(compared > 100, `compared ${compared} beats`);
  });

  it('the two flavors still differ (Playful is not a no-op)', () => {
    // Prompts differ where the mood says so (MOOD / FOREGROUND lines, Solo self-touch locks)…
    const differs = MIXES.flatMap(mix =>
      SLOT_IDS.flatMap(slotId =>
        raunchyBeatsForMix(slotId, mix).map(beat => {
          const slot: DaySlot = { id: slotId, label: slotId, location: 'bedroom', sceneHints: beat };
          return (
            prompt(dayMoodFlavor({ dayMood: 'intimate', intimatePlayful: true }), mix, slot) !==
            prompt(dayMoodFlavor({ dayMood: 'intimate', intimatePlayful: false }), mix, slot)
          );
        })
      )
    );
    assert.ok(differs.some(Boolean));
    // …and the boards differ: Playful draws the comedy beats.
    const board = (playful: boolean) =>
      diversifyDaySlotScenes(daySlotsForLength(6), {
        dayMood: dayMoodFlavor({ dayMood: 'intimate', intimatePlayful: playful }),
        intimateMix: 'mixed',
        allowCompanions: true,
        forceLocations: true,
        forceBeats: true,
        fillBeats: true,
        random: seeded(3),
      }).slots.map(slot => slot.sceneHints);
    assert.notDeepEqual(board(true), board(false));
  });

  it('plans the same board from the same seed (Suggest day, mood re-align)', () => {
    for (const mix of MIXES) {
      for (const seed of [1, 7, 42, 1234]) {
        const plan = (dayMood: string | undefined) =>
          diversifyDaySlotScenes(daySlotsForLength(6), {
            dayMood,
            intimateMix: mix,
            allowCompanions: mix !== 'solo',
            forceLocations: true,
            forceBeats: true,
            fillBeats: true,
            random: seeded(seed),
          }).slots;
        assert.deepEqual(plan(dayMoodFlavor({ dayMood: 'intimate', intimatePlayful: true })), plan('raunchy'));
        assert.deepEqual(plan(dayMoodFlavor({ dayMood: 'intimate', intimatePlayful: false })), plan('intimate'));
        // Flipping Playful re-aligns the board exactly as switching Intimate → Raunchy did.
        const intimateBoard = plan('intimate');
        assert.deepEqual(
          ensureDaySlotsMatchMood(intimateBoard, {
            dayMood: dayMoodWithPlayful('intimate', true),
            intimateMix: mix,
            allowCompanions: mix !== 'solo',
            random: seeded(seed + 1),
          }),
          ensureDaySlotsMatchMood(intimateBoard, {
            dayMood: 'raunchy',
            intimateMix: mix,
            allowCompanions: mix !== 'solo',
            random: seeded(seed + 1),
          })
        );
      }
    }
  });
});

describe('Day → Story seeding keeps Raunchy', () => {
  const day = (over: Partial<DayToolCache>): DayToolCache => ({
    stillsCharacterId: 'cast-1',
    slots: [{ id: 'evening', label: 'Evening', location: 'hotel room' }],
    ...over,
  });
  const seed = (over: Partial<DayToolCache>) =>
    storySeedFromDay({ day: day(over), characterId: 'cast-1' });

  it('Intimate + Playful seeds Story as silly / raunchy, as Raunchy did', () => {
    const playful = seed({ dayMood: 'intimate', intimatePlayful: true });
    assert.equal(playful?.tone, 'silly');
    assert.equal(playful?.content, 'raunchy');
    assert.deepEqual(playful, seed({ dayMood: 'raunchy' as never }));
  });

  it('Intimate without Playful seeds romantic / sultry', () => {
    const intimate = seed({ dayMood: 'intimate', intimatePlayful: false });
    assert.equal(intimate?.tone, 'romantic');
    assert.equal(intimate?.content, 'sultry');
  });

  it('a parked Day carries Playful to Story too', () => {
    const parked = storySeedFromDay({
      day: {
        stillsCharacterId: 'cast-2',
        parkedDays: {
          'cast-1': {
            at: 1,
            slots: [{ id: 'evening', label: 'Evening', location: 'hotel room' }],
            dayMood: 'intimate',
            intimatePlayful: true,
          },
        },
      },
      characterId: 'cast-1',
    });
    assert.equal(parked?.content, 'raunchy');
  });
});

describe('Playful rides along wherever the Day is carried', () => {
  const live: DayToolCache = {
    stillsCharacterId: 'cast-1',
    slots: [{ id: 'evening', label: 'Evening', location: 'hotel room' }],
    stills: [{ slotId: 'evening', status: 'completed', imageUrl: '/x.png', promptId: 'p1' }],
    dayMood: 'intimate',
    intimatePlayful: true,
  };

  it('parked under its Cast and restored', () => {
    const parked = swapDayForCast(live, 'cast-1', 'cast-2');
    assert.equal(parked.parkedDays?.['cast-1']?.intimatePlayful, true);
    const back = swapDayForCast({ ...live, ...parked } as DayToolCache, 'cast-2', 'cast-1');
    assert.equal(back.dayMood, 'intimate');
    assert.equal(back.intimatePlayful, true);
  });

  it('in a Cast file and an episode', () => {
    assert.equal(castFileDay(live)?.intimatePlayful, true);
    assert.equal(dayEpisodeSnapshot(live)?.intimatePlayful, true);
  });
});
