import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDayProgressLightboxState,
  buildDaySlotMotionSubject,
  buildDaySlotPrompt,
  DAY_SLOT_BEAT_PRESETS,
  DAY_SLOT_SETTING_PRESETS,
  daySlotProgressState,
  dayStillsBelongToCharacter,
  dayStillsCachePatch,
  dayWatchPlaylist,
  diversifyDaySlotScenes,
  DEFAULT_DAY_SLOTS,
  mergeDaySlotStills,
  nextDaySlotToEdit,
  normalizeDaySlots,
  seedDaySlotsFromKeeperWardrobes,
  seedDaySlotsWardrobe,
  upsertDaySlotStill,
} from './day-planner';

describe('day-planner', () => {
  it('nextDaySlotToEdit advances past completed slots', () => {
    const stills = [
      { slotId: 'morning' as const, status: 'completed' as const, imageUrl: '/a.webp' },
      { slotId: 'afternoon' as const, status: 'queued' as const },
    ];
    assert.equal(nextDaySlotToEdit(DEFAULT_DAY_SLOTS, stills, 'morning'), 'afternoon');
    assert.equal(
      nextDaySlotToEdit(
        DEFAULT_DAY_SLOTS,
        [
          { slotId: 'morning', status: 'completed', imageUrl: '/a.webp' },
          { slotId: 'afternoon', status: 'completed', imageUrl: '/b.webp' },
          { slotId: 'evening', status: 'completed', imageUrl: '/c.webp' },
          { slotId: 'night', status: 'completed', imageUrl: '/d.webp' },
        ],
        'evening'
      ),
      null
    );
    assert.equal(daySlotProgressState({ slotId: 'morning', status: 'running' }), 'queued');
  });

  it('buildDayProgressLightboxState opens completed stills in slot order', () => {
    const state = buildDayProgressLightboxState(
      DEFAULT_DAY_SLOTS,
      [
        { slotId: 'morning', status: 'completed', imageUrl: '/morning.webp' },
        { slotId: 'evening', status: 'completed', imageUrl: ' /evening.webp ' },
        { slotId: 'afternoon', status: 'queued', imageUrl: '/skip.webp' },
      ],
      'evening'
    );
    assert.ok(state);
    assert.deepEqual(state!.images, ['/morning.webp', '/evening.webp']);
    assert.deepEqual(state!.titles, ['Morning', 'Evening']);
    assert.equal(state!.index, 1);
    assert.equal(state!.title, 'Evening');
    assert.equal(buildDayProgressLightboxState(DEFAULT_DAY_SLOTS, [], 'morning'), null);
  });

  it('dayStillsBelongToCharacter matches Cast ownership', () => {
    assert.equal(dayStillsBelongToCharacter('char-a', 'char-a'), true);
    assert.equal(dayStillsBelongToCharacter('char-a', 'char-b'), false);
    assert.equal(dayStillsBelongToCharacter(undefined, 'char-a'), false);
    assert.equal(dayStillsBelongToCharacter('', ''), true);
  });

  it('dayStillsCachePatch stamps ownership and clears it when empty', () => {
    assert.deepEqual(dayStillsCachePatch([], 'char-a'), {
      stills: [],
      stillsCharacterId: undefined,
    });
    const stills = [{ slotId: 'morning' as const, status: 'queued' as const }];
    assert.deepEqual(dayStillsCachePatch(stills, ' char-a '), {
      stills,
      stillsCharacterId: 'char-a',
    });
  });

  it('normalizeDaySlots always returns four slots', () => {
    const slots = normalizeDaySlots([{ id: 'morning', label: 'Morning', sceneHints: 'coffee run' }]);
    assert.equal(slots.length, 4);
    assert.equal(slots[0]?.sceneHints, 'coffee run');
    assert.equal(slots[1]?.id, 'afternoon');
  });

  it('diversifyDaySlotScenes fills blank settings with distinct daypart presets', () => {
    let cursor = 0;
    const sequence = [0.1, 0.3, 0.5, 0.7, 0.2, 0.4, 0.6, 0.8];
    const { slots, changed } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
      random: () => sequence[cursor++ % sequence.length]!,
    });
    assert.equal(changed, true);
    const locations = slots.map(slot => slot.location?.trim() || '');
    assert.ok(locations.every(Boolean));
    assert.equal(new Set(locations).size, 4);
    for (const slot of slots) {
      assert.ok(DAY_SLOT_SETTING_PRESETS[slot.id].includes(slot.location!));
      assert.ok(DAY_SLOT_BEAT_PRESETS[slot.id].includes(slot.sceneHints!));
    }
  });

  it('diversifyDaySlotScenes keeps filled settings unless forced', () => {
    const seeded = DEFAULT_DAY_SLOTS.map((slot, index) => ({
      ...slot,
      location: `custom ${index}`,
      sceneHints: `beat ${index}`,
    }));
    const kept = diversifyDaySlotScenes(seeded);
    assert.equal(kept.changed, false);
    assert.equal(kept.slots[0]?.location, 'custom 0');

    const forced = diversifyDaySlotScenes(seeded, {
      forceLocations: true,
      forceBeats: true,
      random: () => 0,
    });
    assert.equal(forced.changed, true);
    assert.notEqual(forced.slots[0]?.location, 'custom 0');
    assert.ok(DAY_SLOT_SETTING_PRESETS.morning.includes(forced.slots[0]!.location!));
  });

  it('normalizeDaySlots keeps spaces in Setting and Beat while typing', () => {
    const slots = normalizeDaySlots([
      {
        id: 'morning',
        label: 'Morning',
        location: 'sunny kitchen ',
        sceneHints: 'quiet breakfast ',
      },
    ]);
    assert.equal(slots[0]?.location, 'sunny kitchen ');
    assert.equal(slots[0]?.sceneHints, 'quiet breakfast ');
  });

  it('upsertDaySlotStill clears imageUrl when re-queued', () => {
    const queued = upsertDaySlotStill(
      [
        {
          slotId: 'morning',
          promptId: 'old',
          status: 'completed',
          imageUrl: 'https://example.com/old.jpg',
        },
      ],
      {
        slotId: 'morning',
        promptId: 'new',
        status: 'queued',
        imageUrl: undefined,
      }
    );
    assert.equal(queued[0]?.promptId, 'new');
    assert.equal(queued[0]?.imageUrl, undefined);
    assert.equal(queued[0]?.status, 'queued');
  });

  it('upsertDaySlotStill clears prior clips when still is re-queued', () => {
    const queued = upsertDaySlotStill(
      [
        {
          slotId: 'morning',
          promptId: 'old',
          status: 'completed',
          imageUrl: 'https://example.com/old.jpg',
          clipPromptId: 'clip-old',
          clipStatus: 'completed',
          clipUrl: 'https://example.com/old.mp4',
        },
      ],
      {
        slotId: 'morning',
        promptId: 'new',
        status: 'queued',
        imageUrl: undefined,
        clipPromptId: undefined,
        clipUrl: undefined,
        clipStatus: undefined,
      }
    );
    assert.equal(queued[0]?.promptId, 'new');
    assert.equal(queued[0]?.clipPromptId, undefined);
    assert.equal(queued[0]?.clipUrl, undefined);
    assert.equal(queued[0]?.clipStatus, undefined);
  });

  it('buildDaySlotPrompt includes slot label and beat', () => {
    const slot = DEFAULT_DAY_SLOTS[0]!;
    const prompt = buildDaySlotPrompt({
      slot: { ...slot, sceneHints: 'quiet breakfast', location: 'sunny kitchen' },
      wardrobeLabel: 'linen set',
      characterName: 'Rin',
      notes: 'cozy autumn',
    });
    assert.match(prompt, /morning/i);
    assert.match(prompt, /Rin/);
    assert.match(prompt, /linen set/);
    assert.match(prompt, /quiet breakfast/);
    assert.match(prompt, /cozy autumn/);
    assert.doesNotMatch(prompt, /Edit instruction/i);
  });

  it('buildDaySlotPrompt with keeper plate keeps outfit and restages the scene', () => {
    const slot = DEFAULT_DAY_SLOTS[0]!;
    const prompt = buildDaySlotPrompt({
      slot: { ...slot, sceneHints: 'coffee on the porch', location: 'front porch' },
      wardrobeLabel: 'navy trench',
      characterName: 'Rin',
      hasPlate: true,
      plateSource: 'keeper',
    });
    assert.match(prompt, /worn outfit/i);
    assert.match(prompt, /Outfit Keep try-on/i);
    assert.match(prompt, /aggressively refactor/i);
    assert.match(prompt, /navy trench/);
    assert.match(prompt, /mandatory new pose/i);
    assert.match(prompt, /same kept outfit, different pose/i);
  });

  it('buildDaySlotPrompt with keeper plate invents a default pose when beat is empty', () => {
    const slot = DEFAULT_DAY_SLOTS[0]!;
    const prompt = buildDaySlotPrompt({
      slot,
      wardrobeLabel: 'navy trench',
      hasPlate: true,
      plateSource: 'keeper',
    });
    assert.match(prompt, /mandatory new pose:/i);
    assert.match(prompt, /kitchen counter|pouring/i);
    assert.match(prompt, /keep the clothing/i);
  });

  it('buildDaySlotPrompt with cast plate swaps wardrobe into a new scene', () => {
    const slot = DEFAULT_DAY_SLOTS[1]!;
    const prompt = buildDaySlotPrompt({
      slot: { ...slot, location: 'city park' },
      wardrobeLabel: 'linen set',
      hasPlate: true,
      plateSource: 'cast',
    });
    assert.match(prompt, /facial identity and likeness only/i);
    assert.match(prompt, /linen set/);
    assert.match(prompt, /aggressively refactor/i);
    assert.match(prompt, /mandatory new pose/i);
  });

  it('dayWatchPlaylist builds Morning→Night still shots', () => {
    const stills = upsertDaySlotStill(
      upsertDaySlotStill(undefined, {
        slotId: 'morning',
        promptId: 'p1',
        status: 'completed',
        imageUrl: 'https://example.com/m.jpg',
      }),
      {
        slotId: 'night',
        promptId: 'p2',
        status: 'completed',
        imageUrl: 'https://example.com/n.jpg',
      }
    );
    const playlist = dayWatchPlaylist(stills);
    assert.equal(playlist.length, 2);
    assert.equal(playlist[0]?.title, 'Morning');
    assert.equal(playlist[1]?.title, 'Night');
    assert.equal(playlist[0]?.kind, 'still');
  });

  it('mergeDaySlotStills updates from gallery poll', () => {
    const queued = upsertDaySlotStill(undefined, {
      slotId: 'afternoon',
      promptId: 'job-9',
      status: 'queued',
    });
    const merged = mergeDaySlotStills(queued, [
      { promptId: 'job-9', status: 'completed', imageUrl: 'https://example.com/a.jpg' },
    ]);
    assert.equal(merged.changed, true);
    assert.equal(merged.stills.find(s => s.slotId === 'afternoon')?.status, 'completed');
  });

  it('dayWatchPlaylist prefers clips over stills', () => {
    const stills = upsertDaySlotStill(undefined, {
      slotId: 'morning',
      promptId: 'p1',
      status: 'completed',
      imageUrl: 'https://example.com/m.jpg',
      clipPromptId: 'c1',
      clipStatus: 'completed',
      clipUrl: 'https://example.com/m.mp4',
    });
    const playlist = dayWatchPlaylist(stills);
    assert.equal(playlist.length, 1);
    assert.equal(playlist[0]?.kind, 'clip');
    assert.equal(playlist[0]?.url, 'https://example.com/m.mp4');
  });

  it('buildDaySlotMotionSubject includes slot label', () => {
    const slot = DEFAULT_DAY_SLOTS[0]!;
    assert.match(buildDaySlotMotionSubject({ ...slot, sceneHints: 'coffee' }, 'Rin'), /morning/i);
    assert.match(buildDaySlotMotionSubject({ ...slot, sceneHints: 'coffee' }, 'Rin'), /Rin/);
  });

  it('seedDaySlotsWardrobe fills empty kits only', () => {
    const seeded = seedDaySlotsWardrobe(
      [{ id: 'morning', label: 'Morning', wardrobeId: 'keep-me' }],
      'new-kit'
    );
    assert.equal(seeded[0]?.wardrobeId, 'keep-me');
    assert.equal(seeded[1]?.wardrobeId, 'new-kit');
  });

  it('seedDaySlotsWardrobe force overwrites existing kits', () => {
    const seeded = seedDaySlotsWardrobe(
      [{ id: 'morning', label: 'Morning', wardrobeId: 'keep-me' }],
      'new-kit',
      { force: true }
    );
    assert.equal(seeded[0]?.wardrobeId, 'new-kit');
    assert.equal(seeded[1]?.wardrobeId, 'new-kit');
  });

  it('seedDaySlotsFromKeeperWardrobes maps kits onto morning→night', () => {
    const seeded = seedDaySlotsFromKeeperWardrobes(DEFAULT_DAY_SLOTS, [
      'kit-a',
      'kit-b',
      'kit-c',
    ]);
    assert.equal(seeded[0]?.wardrobeId, 'kit-a');
    assert.equal(seeded[1]?.wardrobeId, 'kit-b');
    assert.equal(seeded[2]?.wardrobeId, 'kit-c');
    assert.equal(seeded[3]?.wardrobeId, 'kit-c');
  });

  it('seedDaySlotsFromKeeperWardrobes overwrites prior Day kits on Keep', () => {
    const prior = DEFAULT_DAY_SLOTS.map(slot => ({ ...slot, wardrobeId: 'old-kit' }));
    const seeded = seedDaySlotsFromKeeperWardrobes(prior, ['kept-kit']);
    assert.equal(seeded[0]?.wardrobeId, 'kept-kit');
    assert.equal(seeded[3]?.wardrobeId, 'kept-kit');
  });

  it('buildDaySlotPrompt with garment reinforce keeps Keep as Image 1', () => {
    const slot = DEFAULT_DAY_SLOTS[0]!;
    const prompt = buildDaySlotPrompt({
      slot: { ...slot, wardrobeId: 'kit-linen' },
      wardrobeLabel: 'linen set',
      hasPlate: true,
      plateSource: 'keeper',
      garmentReinforce: true,
    });
    assert.match(prompt, /Image 1 is the Outfit Keep try-on/i);
    assert.match(prompt, /Image 2 is a wardrobe packshot/i);
    assert.match(prompt, /linen set/);
    assert.match(prompt, /mandatory new pose/i);
  });
});
