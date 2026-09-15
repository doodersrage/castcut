import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDaySlotMotionSubject,
  buildDaySlotPrompt,
  dayWatchPlaylist,
  DEFAULT_DAY_SLOTS,
  mergeDaySlotStills,
  normalizeDaySlots,
  seedDaySlotsFromKeeperWardrobes,
  seedDaySlotsWardrobe,
  upsertDaySlotStill,
} from './day-planner';

describe('day-planner', () => {
  it('normalizeDaySlots always returns four slots', () => {
    const slots = normalizeDaySlots([{ id: 'morning', label: 'Morning', sceneHints: 'coffee run' }]);
    assert.equal(slots.length, 4);
    assert.equal(slots[0]?.sceneHints, 'coffee run');
    assert.equal(slots[1]?.id, 'afternoon');
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
});
