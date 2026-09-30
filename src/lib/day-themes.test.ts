import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_DAY_SLOTS,
  diversifyDaySlotScenes,
  ensureDaySlotsMatchMood,
  normalizeDayMood,
  rerollDaySlotScene,
  resolveDayPoseHeadcount,
} from './day-planner';
import { pickDayAutoKit } from './day-auto-kit';
import { DAY_THEMES, dayThemeOf, dayThemeOwns, dayThemeSettingForBeat } from './day-themes';

const seeded = (seed = 7) => {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
};

describe('Day themes', () => {
  it('render as Everyday underneath', () => {
    for (const id of Object.keys(DAY_THEMES)) {
      assert.equal(normalizeDayMood(id), 'everyday');
      assert.equal(dayThemeOf(id)?.id, id);
    }
    assert.equal(dayThemeOf('vacation'), null);
  });

  it('plan every slot from the theme beats and rooms', () => {
    for (const theme of Object.values(DAY_THEMES)) {
      const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
        dayMood: theme.id,
        fillBeats: true,
        forceBeats: true,
        forceLocations: true,
        allowCompanions: theme.companions,
        random: seeded(),
      });
      for (const slot of slots) {
        assert.ok(
          dayThemeOwns(theme, slot.sceneHints ?? '', slot.location ?? ''),
          `${theme.id} ${slot.id}: ${slot.sceneHints} · ${slot.location}`
        );
      }
    }
  });

  it('solo beats draw one figure and partner beats two, even with companions on', () => {
    for (const theme of Object.values(DAY_THEMES)) {
      for (const part of ['morning', 'afternoon', 'evening', 'night'] as const) {
        for (const [beat, setting] of theme.scenes[part]) {
          assert.equal(
            resolveDayPoseHeadcount({
              haystack: `${setting} · ${beat}`,
              beat,
              dayMood: 'everyday',
              allowCompanions: true,
            }),
            1,
            beat
          );
        }
        for (const [beat, setting] of theme.duoScenes[part]) {
          assert.equal(
            resolveDayPoseHeadcount({
              haystack: `${setting} · ${beat}`,
              beat,
              dayMood: 'everyday',
              allowCompanions: true,
            }),
            2,
            beat
          );
        }
      }
    }
  });

  it('keeps each beat in its own room', () => {
    for (const theme of Object.values(DAY_THEMES)) {
      const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
        dayMood: theme.id,
        fillBeats: true,
        forceBeats: true,
        forceLocations: true,
        allowCompanions: true,
        random: seeded(11),
      });
      for (const slot of slots) {
        assert.equal(slot.location, dayThemeSettingForBeat(theme, slot.sceneHints ?? ''), slot.id);
      }
      const rerolled = rerollDaySlotScene(slots, 'evening', {
        dayMood: theme.id,
        allowCompanions: true,
        random: seeded(12),
      }).slots.find(slot => slot.id === 'evening')!;
      assert.equal(rerolled.location, dayThemeSettingForBeat(theme, rerolled.sceneHints ?? ''));
    }
  });

  it('rerolls leftover boards when switching into or out of a theme', () => {
    const cosplay = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
      dayMood: 'cosplay',
      fillBeats: true,
      forceBeats: true,
      forceLocations: true,
      random: seeded(3),
    }).slots;
    const toDate = ensureDaySlotsMatchMood(cosplay, { dayMood: 'date-night', random: seeded(4) });
    assert.equal(toDate.changed, true);
    for (const slot of toDate.slots) {
      assert.ok(dayThemeOwns(DAY_THEMES['date-night'], slot.sceneHints ?? '', slot.location ?? ''));
    }
    const toEveryday = ensureDaySlotsMatchMood(cosplay, { dayMood: 'everyday', random: seeded(5) });
    assert.equal(toEveryday.changed, true);
    for (const slot of toEveryday.slots) {
      assert.equal(dayThemeOwns(DAY_THEMES.cosplay, slot.sceneHints ?? '', ''), false);
    }
  });

  it('dresses from the theme outfit pool, costumes included', () => {
    const options = [
      { value: 'a', label: 'relaxed-fit sage evening gown', group: 'Full outfits' },
      { value: 'b', label: 'tapered denim jacket casual', group: 'Full outfits' },
      { value: 'c', label: 'wide-leg lilac knight armor cuirass look', group: 'Full outfits' },
    ];
    const pick = (dayMood: string) =>
      pickDayAutoKit({ options, dayMood, slotId: 'evening', hasPackshot: () => true });
    assert.equal(pick('date-night'), 'a');
    assert.equal(pick('cosplay'), 'c');
    assert.equal(pick('everyday'), 'b');
  });
});
