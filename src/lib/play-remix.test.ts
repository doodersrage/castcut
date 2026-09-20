import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DAY_SLOTS, type DaySlot } from './day-planner';
import {
  applyDayTheme,
  clearDaySlotOutfits,
  DAY_THEMES,
  dayThemeById,
  normalizeDayRemixKind,
  normalizeDayThemeId,
} from './play-remix';

describe('play remix', () => {
  it('normalizes remix kinds with new-day as the default', () => {
    assert.equal(normalizeDayRemixKind('new-outfit'), 'new-outfit');
    assert.equal(normalizeDayRemixKind(' THEME '), 'theme');
    assert.equal(normalizeDayRemixKind('bogus'), 'new-day');
    assert.equal(normalizeDayRemixKind(undefined), 'new-day');
  });

  it('gives every theme a distinct id and a Setting + Beat for all four dayparts', () => {
    assert.equal(new Set(DAY_THEMES.map(theme => theme.id)).size, DAY_THEMES.length);
    for (const theme of DAY_THEMES) {
      for (const slot of DEFAULT_DAY_SLOTS) {
        const entry = theme.slots[slot.id];
        assert.ok(entry.location.trim().length > 10, `${theme.id} ${slot.id} location`);
        assert.ok(entry.beat.trim().length > 10, `${theme.id} ${slot.id} beat`);
      }
    }
  });

  it('looks themes up by id and rejects unknown ids', () => {
    assert.equal(normalizeDayThemeId(' Rainy-Day '), 'rainy-day');
    assert.equal(normalizeDayThemeId('nope'), null);
    assert.equal(dayThemeById('workday')?.label, 'Workday');
    assert.equal(dayThemeById(null), null);
  });

  it('applies a theme while keeping wardrobe kits and labels', () => {
    const slots: DaySlot[] = DEFAULT_DAY_SLOTS.map(slot => ({
      ...slot,
      wardrobeId: `kit-${slot.id}`,
      location: 'old place',
      sceneHints: 'old beat',
    }));
    const themed = applyDayTheme(slots, 'rainy-day');
    assert.equal(themed.length, 4);
    for (const slot of themed) {
      assert.equal(slot.wardrobeId, `kit-${slot.id}`);
      assert.notEqual(slot.location, 'old place');
      assert.notEqual(slot.sceneHints, 'old beat');
    }
    assert.match(themed[0]!.location ?? '', /rain/i);
    // Unknown theme is a no-op that returns the same slots.
    assert.equal(applyDayTheme(slots, 'nope'), slots);
    // Input is not mutated.
    assert.equal(slots[0]!.location, 'old place');
  });

  it('clears outfits but keeps every Setting and Beat', () => {
    const slots: DaySlot[] = DEFAULT_DAY_SLOTS.map(slot => ({
      ...slot,
      wardrobeId: 'kit-a',
      location: `${slot.id} place`,
      sceneHints: `${slot.id} beat`,
    }));
    const cleared = clearDaySlotOutfits(slots);
    for (const [index, slot] of cleared.entries()) {
      assert.equal(slot.wardrobeId, undefined);
      assert.equal(slot.location, slots[index]!.location);
      assert.equal(slot.sceneHints, slots[index]!.sceneHints);
    }
    assert.equal(slots[0]!.wardrobeId, 'kit-a');
  });
});
