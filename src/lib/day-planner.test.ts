import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSoloMasturbationPoseKind } from '@/lib/day-pose-guide';
import {
  buildDayProgressLightboxState,
  buildDaySlotMotionSubject,
  buildDaySlotPrompt,
  dayBeatOmitsGarmentPackshot,
  dayBeatUsesSoloSexToy,
  daySlotMatchesAdultMix,
  DAY_SLOT_BEAT_PRESETS,
  DAY_SLOT_HEAT_SETTING_PRESETS,
  DAY_SLOT_INTIMATE_BEAT_PRESETS,
  DAY_SLOT_RAUNCHY_BEAT_PRESETS,
  DAY_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_SLOT_SETTING_PRESETS,
  dayQueueBlockReason,
  daySessionStatusLine,
  daySlotBoardCaption,
  daySlotClipProgressState,
  daySlotPlanLabel,
  daySlotProgressState,
  dayStillsBelongToCharacter,
  dayStillsCachePatch,
  dayWatchPlaylist,
  diversifyDaySlotScenes,
  DEFAULT_DAY_SLOTS,
  dayMoodReplacesKeepOutfit,
  ensureDaySlotsMatchMood,
  intimateBeatsForMix,
  isDayAdultMood,
  isDayHeatMood,
  isDayIntimateSoloBeat,
  resolveDayAdultIndoorSetting,
  isDayRaunchySoloBeat,
  mergeDaySlotStills,
  nextDaySlotToEdit,
  normalizeDayIntimateMix,
  normalizeDayMood,
  normalizeDaySlots,
  promoteDayStillsToSoftPassChildren,
  resolveDayPoseHeadcount,
  raunchyBeatsForMix,
  rerollDaySlotScene,
  resolveDaySlotPoseBaseline,
  seedDaySlotsFromKeeperWardrobes,
  seedDaySlotsWardrobe,
  upsertDaySlotStill,
  buildDaySuggestivePoseLock,
  buildDaySuggestiveKeepPoseUnlock,
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
    assert.deepEqual(state!.slotIds, ['morning', 'evening']);
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

  it('daySlotBoardCaption surfaces clip progress on completed stills', () => {
    assert.equal(daySlotClipProgressState({ slotId: 'morning', status: 'completed' }), 'idle');
    assert.equal(
      daySlotBoardCaption({
        slotId: 'morning',
        status: 'completed',
        clipStatus: 'queued',
      }),
      'Animating…'
    );
    assert.equal(
      daySlotBoardCaption({
        slotId: 'morning',
        status: 'completed',
        clipStatus: 'completed',
        clipUrl: '/clip.mp4',
      }),
      'Clip ready'
    );
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
    assert.match(prompt, /mandatory new body pose/i);
    assert.match(prompt, /SETTING \(mandatory/i);
    assert.match(prompt, /front porch/i);
    assert.match(prompt, /coffee on the porch/i);
    assert.match(prompt, /camera:/i);
    assert.match(prompt, /same face, (?:same kept outfit, )?different pose/i);
  });

  it('buildDaySlotPrompt with keeper plate invents a default pose when beat is empty', () => {
    const slot = DEFAULT_DAY_SLOTS[0]!;
    const prompt = buildDaySlotPrompt({
      slot,
      wardrobeLabel: 'navy trench',
      hasPlate: true,
      plateSource: 'keeper',
    });
    assert.match(prompt, /mandatory new body pose:/i);
    assert.match(prompt, /camera:/i);
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
    assert.match(prompt, /mandatory new body pose/i);
    assert.match(prompt, /SETTING \(mandatory/i);
    assert.match(prompt, /city park/i);
  });

  it('buildDaySlotPrompt with isolated plate forces white backdrop replacement', () => {
    const slot = DEFAULT_DAY_SLOTS[1]!;
    const prompt = buildDaySlotPrompt({
      slot: { ...slot, location: 'city park', sceneHints: 'mid-stride on the path' },
      wardrobeLabel: 'linen set',
      hasPlate: true,
      plateSource: 'keeper',
      plateIsolated: true,
      garmentReinforce: true,
      poseGuide: true,
    });
    assert.match(prompt, /isolated on a blank white backdrop/i);
    assert.match(prompt, /never leave a white background|never a blank white backdrop/i);
    assert.match(prompt, /Image 2 white is packshot only|Image 3 white is pose-guide only/i);
    assert.match(prompt, /city park/i);
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

  it('mergeDaySlotStills keeps prior preview while soft-pass is still running', () => {
    const prior = upsertDaySlotStill(undefined, {
      slotId: 'morning',
      promptId: 'refine-1',
      status: 'completed',
      imageUrl: 'https://example.com/prior.jpg',
    });
    const merged = mergeDaySlotStills(prior, [
      { promptId: 'refine-1', status: 'queued' },
    ]);
    assert.equal(merged.changed, false);
    assert.equal(merged.stills.find(s => s.slotId === 'morning')?.imageUrl, 'https://example.com/prior.jpg');
    assert.equal(merged.stills.find(s => s.slotId === 'morning')?.status, 'completed');
  });

  it('promoteDayStillsToSoftPassChildren rebinds parent stills to soft-pass kids', () => {
    const stills = upsertDaySlotStill(undefined, {
      slotId: 'evening',
      promptId: 'parent-job',
      status: 'completed',
      imageUrl: 'https://example.com/parent.jpg',
    });
    const { stills: next, changed } = promoteDayStillsToSoftPassChildren(stills, [
      {
        id: 'parent-entry',
        promptId: 'parent-job',
        status: 'completed',
        imageUrl: 'https://example.com/parent.jpg',
        queuedAt: 1,
      },
      {
        id: 'child-entry',
        promptId: 'soft-job',
        parentGalleryEntryId: 'parent-entry',
        derivedKind: 'soft-pass',
        status: 'completed',
        imageUrl: 'https://example.com/soft.jpg',
        queuedAt: 2,
      },
    ]);
    assert.equal(changed, true);
    const evening = next.find(s => s.slotId === 'evening');
    assert.equal(evening?.promptId, 'soft-job');
    assert.equal(evening?.imageUrl, 'https://example.com/soft.jpg');
    assert.equal(evening?.status, 'completed');
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
    assert.match(
      buildDaySlotMotionSubject({ ...slot, sceneHints: 'coffee' }, 'Rin'),
      /stretch|pour|steam|morning light/i
    );
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
    assert.match(prompt, /mandatory new body pose/i);
  });

  it('buildDaySlotPrompt with poseGuide names Image 3 wireframe', () => {
    const slot = DEFAULT_DAY_SLOTS[1]!;
    const prompt = buildDaySlotPrompt({
      slot,
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
    });
    assert.match(prompt, /Image 3 is a flat SCHEMATIC|Image 3 is a flat mannequin|Image 3 is a crude stick-figure/i);
    assert.match(prompt, /never draw (?:stick figures|mannequins)/i);
    assert.match(prompt, /photorealistic live-action photograph/i);
    assert.match(prompt, /exactly one person|Exactly one adult|SOLO SUBJECT/i);
    assert.match(prompt, /Match Image 3 body positions/i);
  });

  it('buildDaySlotPrompt allowCompanions skips solo lock', () => {
    const slot = {
      ...DEFAULT_DAY_SLOTS[0]!,
      sceneHints: 'selfie with a friend leaning into frame',
    };
    const prompt = buildDaySlotPrompt({
      slot,
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      allowCompanions: true,
    });
    assert.doesNotMatch(prompt, /SOLO SUBJECT \(mandatory\)/i);
    assert.match(prompt, /COMPANIONS:/i);
    assert.match(prompt, /camera:/i);
    assert.match(prompt, /Never paint Image 3 into the photo/i);
  });

  it('resolveDaySlotPoseBaseline rotates with setting/beat', () => {
    const a = resolveDaySlotPoseBaseline({
      id: 'morning',
      location: 'kitchen',
      sceneHints: 'stretching',
    });
    const b = resolveDaySlotPoseBaseline({
      id: 'morning',
      location: 'balcony',
      sceneHints: 'waving',
    });
    assert.ok(a.length > 10);
    assert.ok(b.length > 10);
    // Different scene salt should usually pick different baselines from the pool.
    assert.notEqual(a, b);
  });

  it('diversifyDaySlotScenes intimate mix uses indoor heat settings only', () => {
    let i = 0;
    const sequence = Array.from({ length: 40 }, (_, n) => (n % 10) / 10);
    const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
      forceLocations: true,
      forceBeats: true,
      dayMood: 'intimate',
      intimateMix: 'duo',
      random: () => sequence[i++ % sequence.length]!,
    });
    for (const slot of slots) {
      const location = slot.location ?? '';
      assert.ok(
        DAY_SLOT_HEAT_SETTING_PRESETS[slot.id].includes(location),
        `expected heat setting, got: ${location}`
      );
      assert.doesNotMatch(location, /pier|park|street|café|cafe|boardwalk/i);
    }
  });

  it('diversifyDaySlotScenes mixes suggestive beats when dayMood is suggestive', () => {
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    for (let trial = 0; trial < 12; trial++) {
      const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
        forceLocations: true,
        forceBeats: true,
        dayMood: 'suggestive',
        random: () => sequence[i++ % sequence.length]!,
      });
      for (const slot of slots) {
        const beat = slot.sceneHints ?? '';
        assert.ok(
          DAY_SLOT_SUGGESTIVE_BEAT_PRESETS[slot.id].includes(beat),
          `expected suggestive beat, got: ${beat}`
        );
        assert.ok(!DAY_SLOT_BEAT_PRESETS[slot.id].includes(beat), `everyday beat leaked: ${beat}`);
      }
    }
  });

  it('buildDaySlotPrompt suggestive beat owns pose without everyday baseline', () => {
    const sceneHints =
      'leaning in a doorway in lingerie and an open robe, inviting look down the hall';
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[2]!,
        location: 'dim hotel suite with city glow through sheer curtains',
        sceneHints,
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'suggestive',
    });
    assert.match(prompt, /MOOD: suggestive heat/i);
    assert.match(prompt, /POSE FIRST: mandatory body pose and suggestive clothed heat from the beat only/i);
    assert.match(prompt, /CLOTHING LOCK:|POSE LOCK:|bottoms stay on|never nude|never mid-sex|hip cocked|looking back|standing try-on|ZIP\/TWIST|DANCING|LEANING|SEATED|never invent a bikini/i);
    assert.match(prompt, /SOLO SUBJECT \(mandatory\)/i);
    assert.match(prompt, /SETTING \(backdrop only/i);
    assert.match(prompt, /lingerie and an open robe/i);
    assert.match(prompt, /standing try-on plate|discard that standing fashion stance/i);
    assert.doesNotMatch(prompt, /mandatory new body pose:.*Also follow the beat/i);
    assert.doesNotMatch(prompt, /walking outdoors mid-stride|arms stretching overhead mid-yawn/i);
    assert.doesNotMatch(prompt, /PARTNERS:|DUO ACT:/i);
    // Pose must appear before Setting so Edit doesn't let the room rewrite stance.
    const poseIdx = prompt.indexOf('POSE FIRST:');
    const settingIdx = prompt.indexOf('SETTING (backdrop only');
    assert.ok(poseIdx >= 0 && settingIdx > poseIdx, 'pose should precede setting');
  });

  it('buildDaySuggestivePoseLock names dance and zip-twist so Keep cannot freeze stand', () => {
    const dance = buildDaySuggestivePoseLock(
      'DANCING alone on the patio — both arms raised overhead, one knee lifted mid-kick'
    );
    assert.match(dance, /DANCING alone/i);
    assert.match(dance, /BOTH arms raised|knee lifted/i);
    assert.match(dance, /NEVER.*arms hanging|NEVER both arms hanging|catalog stand/i);

    const danceUnlock = buildDaySuggestiveKeepPoseUnlock(
      'DANCING alone on the patio — both arms raised overhead'
    );
    assert.match(danceUnlock, /CRITICAL:.*DANCING|edit FAILED/i);

    const zip = buildDaySuggestivePoseLock(
      'twisting to zip a dress in a mirror — back arched, looking over a shoulder'
    );
    assert.match(zip, /ZIP\/TWIST|hands on her own dress zipper/i);
    assert.match(zip, /standing try-on/i);
  });

  it('buildDaySlotPrompt suggestive zip face-break locks exact Keep garment not bikini', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[1]!,
        location: 'apartment bedroom with blinds half-drawn',
        sceneHints:
          'twisting to zip a dress in a mirror — torso twisted, back arched, both hands on the zipper behind her back, looking over a shoulder',
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'suggestive',
      faceOnlyIdentity: true,
      garmentReinforce: true,
      garmentDescription: 'navy floral mini dress with spaghetti straps',
    });
    assert.match(prompt, /FACE CROP only|face likeness only/i);
    assert.match(prompt, /EXACT Outfit Keep garment|exact Image 2 garment|never invent a bikini/i);
    assert.match(prompt, /zip-twist|LOOK_BACK|hands on zipper/i);
    assert.match(prompt, /navy floral mini dress/i);
  });

  it('buildDaySlotPrompt vacation mid-stride face-break invents body from Image 3', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[0]!,
        location: 'quiet morning shoreline',
        sceneHints:
          'MID-STRIDE barefoot on wet sand swinging a tote — one foot clearly ahead, opposite arm swing',
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'vacation',
      faceOnlyIdentity: true,
      garmentReinforce: true,
    });
    assert.match(prompt, /FACE CROP only|face likeness only/i);
    assert.match(prompt, /Image 2 is the Outfit Keep|Image 2 is the Outfit Keep full-body|outfit color\/cut/i);
    assert.match(prompt, /Image 3/i);
    assert.doesNotMatch(prompt, /Image 1 is the Outfit Keep try-on \(face \+ worn kit\)/i);
  });

  it('buildDaySlotPrompt vacation mid-stride face-break works on Cast plate source', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[1]!,
        location: 'sunny fishing pier',
        sceneHints:
          'MID-STRIDE along a wooden pier with an ice-cream cone — walking mid-step one foot ahead',
      },
      hasPlate: true,
      plateSource: 'cast',
      poseGuide: true,
      dayMood: 'vacation',
      faceOnlyIdentity: true,
      garmentReinforce: true,
      garmentDescription: 'navy floral swimsuit',
    });
    assert.match(prompt, /FACE CROP only|face likeness only/i);
    assert.doesNotMatch(prompt, /Image 1 is the Cast identity plate/i);
    assert.match(prompt, /mid-stride|one foot/i);
  });

  it('buildDaySlotPrompt vacation dancing face-break demands arms overhead', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[2]!,
        location: 'hotel terrace at blue hour',
        sceneHints:
          'DANCING alone on a terrace at blue hour — both arms raised overhead, one knee lifted mid-kick, hips mid-sway',
      },
      hasPlate: true,
      plateSource: 'cast',
      poseGuide: true,
      dayMood: 'vacation',
      faceOnlyIdentity: true,
      garmentReinforce: true,
    });
    assert.match(prompt, /FACE CROP only|face likeness only/i);
    assert.match(prompt, /BOTH arms raised|arms overhead|mid-dance/i);
    assert.match(prompt, /fashion stand.*FAILED|edit FAILED/i);
    assert.doesNotMatch(prompt, /Image 1 is the Cast identity plate/i);
  });

  it('buildDaySlotPrompt vacation upright face-break covers reach/kick/jump/climb/toss/stretch', () => {
    const cases: Array<{ beat: string; expect: RegExp }> = [
      {
        beat: 'REACHING for a pier railing mid-lean after a jog — evening wear',
        expect: /FULL BODY reach|one arm stretched HIGH/i,
      },
      {
        beat: 'STRETCHING both arms overhead at the pool ladder — swimsuit on',
        expect: /FULL BODY stretch|BOTH arms raised overhead/i,
      },
      {
        beat: 'CLIMBING museum steps mid-stride — hand on the railing',
        expect: /FULL BODY climb|one foot up/i,
      },
      {
        beat: 'JUMPING mid-air off the pool ledge — swimsuit, knees tucked',
        expect: /FULL BODY jump|both feet off the ground/i,
      },
      {
        beat: 'KICKING through the morning surf — sundress hem wet, arms out',
        expect: /FULL BODY kick|one leg extended mid-kick/i,
      },
      {
        beat: 'TOSSING a beach ball on the sand — arms raised mid-catch',
        expect: /FULL BODY toss|arm cocked|follow-through/i,
      },
    ];
    for (const { beat, expect } of cases) {
      const prompt = buildDaySlotPrompt({
        slot: { ...DEFAULT_DAY_SLOTS[1]!, location: 'vacation venue', sceneHints: beat },
        hasPlate: true,
        plateSource: 'cast',
        poseGuide: true,
        dayMood: 'vacation',
        faceOnlyIdentity: true,
        garmentReinforce: true,
      });
      assert.match(prompt, /FACE CROP only|face likeness only/i, beat);
      assert.match(prompt, expect, beat);
      assert.doesNotMatch(prompt, /Image 1 is the Cast identity plate/i, beat);
    }
  });

  it('buildDaySlotPrompt suggestive zip-twist unlocks Keep standing plate', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[1]!,
        location: 'bright apartment living room with a full-length mirror',
        sceneHints:
          'twisting to zip a dress in a mirror — torso twisted, back arched, both hands on the zipper behind her back, looking over a shoulder',
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'suggestive',
    });
    assert.match(prompt, /standing try-on plate|discard that standing fashion stance/i);
    assert.match(prompt, /ZIP\/TWIST|zipper behind her back|looking over a shoulder/i);
    assert.match(prompt, /match Image 3 and the beat stance \(dance with both arms raised and one knee lifted, zip-twist/i);
  });

  it('buildDaySlotPrompt suggestive ignores leftover duo intimateMix', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[3]!,
        location: 'hotel room after dark with a single lamp',
        sceneHints:
          'sitting on the edge of a hotel bed, unzipping a dress halfway, lingerie visible underneath',
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'suggestive',
      intimateMix: 'duo',
    });
    assert.match(prompt, /SOLO SUBJECT \(mandatory\)|CLOTHING LOCK/i);
    assert.doesNotMatch(prompt, /PARTNERS: Exactly TWO|DUO ACT:/i);
  });

  it('resolveDayPoseHeadcount keeps suggestive and vacation solo without companions', () => {
    assert.equal(
      resolveDayPoseHeadcount({
        haystack: 'straddling a café chair backwards after dinner looking over a shoulder',
        beat: 'straddling a café chair backwards after dinner',
        dayMood: 'suggestive',
        allowCompanions: false,
      }),
      1
    );
    assert.equal(
      resolveDayPoseHeadcount({
        haystack: 'straddling a café chair backwards after dinner looking over a shoulder',
        beat: 'straddling a café chair backwards after dinner',
        dayMood: 'vacation',
        allowCompanions: false,
      }),
      1
    );
  });

  it('buildDaySlotPrompt vacation bans invented partners', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[0]!,
        location: 'sunny beach near the waterline',
        sceneHints:
          'RELAXING on a beach towel with a sunhat over her face — body lying on the towel, knees drawn up, morning breeze',
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'vacation',
      intimateMix: 'duo',
    });
    assert.match(prompt, /MOOD: vacation travel day/i);
    assert.match(prompt, /CLOTHED SOLO LOCK|never invent a man/i);
    assert.doesNotMatch(prompt, /PARTNERS: Exactly TWO|DUO ACT:/i);
    assert.doesNotMatch(prompt, /\b(doggy|mid-sex|missionary)\b/i);
    // Regression: never force upright-only — that froze RELAXING as standing plates.
    assert.doesNotMatch(prompt, /upright lean\/sit\/walk only|upright travel pose/i);
    assert.match(prompt, /relaxing\/reclining on a towel|match the beat stance/i);
    assert.match(prompt, /RELAXING =|lying or deeply reclined|hips and back on/i);
  });

  it('ensureDaySlotsMatchMood rerolls mid-sex boards under suggestive and vacation', () => {
    const stale = DEFAULT_DAY_SLOTS.map(slot => ({
      ...slot,
      location: 'dark bedroom with a single warm lamp — bare nightstand only',
      sceneHints:
        'bent over the foot of the bed from behind when a partner slips — partner still in frame mid-doggy',
    }));
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    const suggestive = ensureDaySlotsMatchMood(stale, {
      dayMood: 'suggestive',
      random: () => sequence[i++ % sequence.length]!,
    });
    assert.equal(suggestive.changed, true);
    for (const slot of suggestive.slots) {
      assert.doesNotMatch(slot.sceneHints ?? '', /mid-doggy|partner|mid-sex/i);
    }
    i = 0;
    const vacation = ensureDaySlotsMatchMood(stale, {
      dayMood: 'vacation',
      random: () => sequence[i++ % sequence.length]!,
    });
    assert.equal(vacation.changed, true);
    for (const slot of vacation.slots) {
      assert.doesNotMatch(slot.sceneHints ?? '', /mid-doggy|partner|mid-sex/i);
    }
  });

  it('ensureDaySlotsMatchMood rerolls everyday boards under suggestive', () => {
    const stale = DEFAULT_DAY_SLOTS.map(slot => ({
      ...slot,
      location: 'bookstore cafe with notebooks on the table',
      sceneHints: 'reading a book at the counter with a tote bag',
    }));
    const { slots, changed } = ensureDaySlotsMatchMood(stale, {
      dayMood: 'suggestive',
      random: () => 0.2,
    });
    assert.equal(changed, true);
    for (const slot of slots) {
      assert.ok(
        DAY_SLOT_SUGGESTIVE_BEAT_PRESETS[slot.id].includes(slot.sceneHints ?? ''),
        `expected suggestive beat, got: ${slot.sceneHints}`
      );
      assert.doesNotMatch(slot.sceneHints ?? '', /reading a book|tote bag/i);
    }
  });

  it('ensureDaySlotsMatchMood rerolls vacation pier/scooter boards under suggestive', () => {
    const stale = DEFAULT_DAY_SLOTS.map((slot, index) => ({
      ...slot,
      location:
        index % 2 === 0
          ? 'sunny fishing pier with bait shops and bright afternoon water'
          : 'sunlit cobblestone street with café awnings and morning delivery bikes',
      sceneHints:
        index % 2 === 0
          ? 'MID-STRIDE along a wooden pier with an ice-cream cone — walking mid-step one foot ahead, sundress, ocean breeze, gulls overhead'
          : 'SEATED on a scooter saddle — one foot on the peg, looking back over a shoulder at the street',
    }));
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    const { slots, changed } = ensureDaySlotsMatchMood(stale, {
      dayMood: 'suggestive',
      random: () => sequence[i++ % sequence.length]!,
    });
    assert.equal(changed, true);
    for (const slot of slots) {
      assert.doesNotMatch(slot.location ?? '', /fishing pier|cobblestone street|delivery bikes/i);
      assert.doesNotMatch(slot.sceneHints ?? '', /MID-STRIDE along a wooden pier|SEATED on a scooter/i);
      assert.ok(
        DAY_SLOT_SUGGESTIVE_BEAT_PRESETS[slot.id].includes(slot.sceneHints ?? '') ||
          /lingerie|unzip|dress|robe|charged|hip cocked|looking back/i.test(slot.sceneHints ?? ''),
        `expected suggestive heat beat, got: ${slot.sceneHints}`
      );
    }
  });

  it('diversifyDaySlotScenes mixes intimate beats when dayMood is intimate', () => {
    let i = 0;
    const sequence = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];
    const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
      forceLocations: true,
      forceBeats: true,
      dayMood: 'intimate',
      random: () => sequence[i++ % sequence.length]!,
    });
    const beats = slots.map(s => s.sceneHints ?? '').join(' ');
    assert.match(beats, /sex|missionary|bent over|wall|oral|spoon|masturbat/i);
  });

  it('diversifyDaySlotScenes mixes raunchy beats when dayMood is raunchy', () => {
    let i = 0;
    const sequence = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];
    const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
      forceLocations: true,
      forceBeats: true,
      dayMood: 'raunchy',
      random: () => sequence[i++ % sequence.length]!,
    });
    const beats = slots.map(s => s.sceneHints ?? '').join(' ');
    assert.match(beats, /wardrobe|flash|slapstick|nip\s*slip|malfunction|comedy|caught naked|masturbat|naked|laughing|gag/i);
  });

  it('buildDaySlotPrompt intimate mood adds MOOD and partner lock', () => {
    const slot = {
      ...DEFAULT_DAY_SLOTS[1]!,
      sceneHints: 'bent over a desk from behind with a partner',
    };
    const prompt = buildDaySlotPrompt({
      slot,
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'intimate',
      omitGarment: true,
    });
    assert.match(prompt, /MOOD: intimate/i);
    assert.match(prompt, /PARTNERS:/i);
    assert.match(prompt, /clothes are now gone|bare skin only/i);
    assert.doesNotMatch(prompt, /SOLO SUBJECT \(mandatory\)/i);
  });

  it('buildDaySlotPrompt raunchy mood adds comedy MOOD and partner lock', () => {
    const slot = {
      ...DEFAULT_DAY_SLOTS[1]!,
      sceneHints: 'bent over a desk mid-sex when the chair rolls away and both scramble laughing',
    };
    const prompt = buildDaySlotPrompt({
      slot,
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'raunchy',
      omitGarment: true,
    });
    assert.match(prompt, /MOOD: raunchy/i);
    assert.match(prompt, /PARTNERS:/i);
    assert.doesNotMatch(prompt, /SOLO SUBJECT \(mandatory\)/i);
  });

  it('buildDaySlotPrompt intimate solo masturbation keeps one-adult lock', () => {
    const slot = {
      ...DEFAULT_DAY_SLOTS[3]!,
      sceneHints: 'solo masturbation on the bed edge under a lamp',
    };
    const prompt = buildDaySlotPrompt({
      slot,
      hasPlate: true,
      plateSource: 'cast',
      poseGuide: true,
      dayMood: 'intimate',
      omitGarment: true,
    });
    assert.match(prompt, /MOOD: intimate/i);
    assert.match(prompt, /SOLO SUBJECT \(mandatory\)/i);
    assert.doesNotMatch(prompt, /PARTNERS:/i);
  });

  it('normalizeDayMood accepts raunchy', () => {
    assert.equal(normalizeDayMood('raunchy'), 'raunchy');
    assert.equal(normalizeDayMood('intimate'), 'intimate');
    assert.equal(isDayAdultMood('raunchy'), true);
    assert.equal(isDayAdultMood('intimate'), true);
    assert.equal(isDayAdultMood('suggestive'), false);
    assert.equal(isDayHeatMood('suggestive'), true);
    assert.equal(isDayHeatMood('intimate'), true);
    assert.equal(isDayHeatMood('everyday'), false);
  });

  it('normalizeDayMood accepts sport as heat (not adult)', () => {
    assert.equal(normalizeDayMood('sport'), 'sport');
    assert.equal(isDayAdultMood('sport'), false);
    assert.equal(isDayHeatMood('sport'), true);
  });

  it('normalizeDayMood accepts vacation as heat (not adult)', () => {
    assert.equal(normalizeDayMood('vacation'), 'vacation');
    assert.equal(isDayAdultMood('vacation'), false);
    assert.equal(isDayHeatMood('vacation'), true);
    assert.equal(dayMoodReplacesKeepOutfit('vacation'), false);
  });

  it('diversifyDaySlotScenes picks vacation beats/settings by daypart', async () => {
    const { DAY_SLOT_VACATION_BEAT_PRESETS, DAY_SLOT_VACATION_SETTING_PRESETS } = await import(
      './day-vacation'
    );
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    for (let trial = 0; trial < 8; trial++) {
      const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
        forceLocations: true,
        forceBeats: true,
        dayMood: 'vacation',
        random: () => sequence[i++ % sequence.length]!,
      });
      for (const slot of slots) {
        const beat = slot.sceneHints ?? '';
        const setting = slot.location ?? '';
        assert.ok(
          DAY_SLOT_VACATION_BEAT_PRESETS[slot.id].includes(beat),
          `expected vacation beat for ${slot.id}, got: ${beat}`
        );
        assert.ok(
          DAY_SLOT_VACATION_SETTING_PRESETS[slot.id].includes(setting),
          `expected vacation setting for ${slot.id}, got: ${setting}`
        );
        assert.ok(!DAY_SLOT_BEAT_PRESETS[slot.id].includes(beat), `everyday beat leaked: ${beat}`);
      }
    }
  });

  it('buildDaySlotPrompt vacation beat owns travel pose and keeps outfit', () => {
    const sceneHints =
      'RELAXING on a beach towel with a sunhat over her face — body lying on the towel, knees drawn up, sunscreen bottle beside her, morning breeze';
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[0]!,
        location: 'sunny beach near the waterline with morning light',
        sceneHints,
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'vacation',
    });
    assert.match(prompt, /MOOD: vacation travel day/i);
    assert.match(prompt, /POSE FIRST:.*RELAXING|POSE FIRST:.*LYING DOWN|POSE FIRST: mandatory vacation/i);
    assert.match(prompt, /camera: travel medium/i);
    assert.match(prompt, /SETTING \(venue\/lighting only/i);
    assert.match(prompt, /POSE LOCK:|standing try-on|discard that standing/i);
    assert.match(
      prompt,
      /standing try-on plate|aggressively refactor into the beat pose|standing plate/i
    );
    assert.doesNotMatch(prompt, /upright lean\/sit\/walk only|upright travel pose/i);
    assert.match(prompt, /RELAXING =|lying or deeply reclined|body ON the towel/i);
    assert.doesNotMatch(prompt, /SPORT KIT|ATHLETIC KIT ONLY/i);
    assert.doesNotMatch(prompt, /\b(doggy|mid-sex|missionary)\b/i);
    assert.match(prompt, /keep the clothing from Image 1|outfit continuity|DAY_KEEP|keep facial likeness only for identity; keep the clothing/i);
    assert.doesNotMatch(prompt, /mandatory new body pose:.*Also follow the beat/i);
    const poseIdx = prompt.indexOf('POSE FIRST:');
    const settingIdx = prompt.indexOf('SETTING (venue/lighting only');
    assert.ok(poseIdx >= 0 && settingIdx > poseIdx, 'pose should precede setting');
  });

  it('ensureDaySlotsMatchMood rerolls office boards under vacation', () => {
    const stale = DEFAULT_DAY_SLOTS.map(slot => ({
      ...slot,
      location: 'an office desk with a day planner and spreadsheet printouts',
      sceneHints: 'standing at the cubicle with a clipboard',
    }));
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    const { slots, changed } = ensureDaySlotsMatchMood(stale, {
      dayMood: 'vacation',
      random: () => sequence[i++ % sequence.length]!,
    });
    assert.equal(changed, true);
    for (const slot of slots) {
      assert.doesNotMatch(slot.location ?? '', /office|grocery|bookstore|cubicle/i);
      assert.match(
        slot.sceneHints ?? '',
        /hotel|pool|beach|market|rooftop|café|cafe|scooter|balcony|suitcase|boat|harbor|sundress|lounge|sand|ferry|resort|terrace|museum|gelato|boardwalk|plaza|espresso|SEATED|MID-STRIDE|RECLINING|RELAXING|DANCING|CLIMBING|WAVING|PERCHED|KICKING|SWIMMING|PEDALING|TOSSING|JUMPING|REACHING|PADDLING|STRETCHING|bike|surf|volleyball|kayak/i
      );
    }
  });

  it('diversifyDaySlotScenes picks sport beats/settings by daypart', async () => {
    const { DAY_SLOT_SPORT_BEAT_PRESETS, DAY_SLOT_SPORT_SETTING_PRESETS } = await import(
      './day-sport'
    );
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    for (let trial = 0; trial < 8; trial++) {
      const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
        forceLocations: true,
        forceBeats: true,
        dayMood: 'sport',
        random: () => sequence[i++ % sequence.length]!,
      });
      for (const slot of slots) {
        const beat = slot.sceneHints ?? '';
        const setting = slot.location ?? '';
        assert.ok(
          DAY_SLOT_SPORT_BEAT_PRESETS[slot.id].includes(beat),
          `expected sport beat for ${slot.id}, got: ${beat}`
        );
        assert.ok(
          DAY_SLOT_SPORT_SETTING_PRESETS[slot.id].includes(setting),
          `expected sport setting for ${slot.id}, got: ${setting}`
        );
        assert.ok(!DAY_SLOT_BEAT_PRESETS[slot.id].includes(beat), `everyday beat leaked: ${beat}`);
      }
    }
  });

  it('buildDaySlotPrompt sport beat owns athletic pose and kit lock', () => {
    const sceneHints =
      'mid-stride sprint drive on the track — running athletic action in proper running kit and sport footwear, mid-play on a running venue, Cast alone, never a sundress or soft fashion pin-up, never invent a second sport';
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[0]!,
        location: 'an outdoor running path at sunrise',
        sceneHints,
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'sport',
    });
    assert.match(prompt, /MOOD: sport still/i);
    assert.match(prompt, /POSE FIRST: mandatory athletic body pose and sport action from the beat only/i);
    assert.match(prompt, /SPORT KIT/i);
    assert.match(prompt, /ATHLETIC KIT ONLY|discard every Image 1 garment|use FACE only|face\/body identity only/i);
    assert.match(prompt, /discard Image 1.*dress|sundress|floral|ATHLETIC KIT ONLY/i);
    assert.doesNotMatch(prompt, /outfit continuity: stay in/i);
    assert.doesNotMatch(prompt, /keep the clothing from Image 1/i);
    assert.match(prompt, /SETTING \(venue\/lighting only/i);
    assert.doesNotMatch(prompt, /mandatory new body pose:.*Also follow the beat/i);
    const poseIdx = prompt.indexOf('POSE FIRST:');
    const settingIdx = prompt.indexOf('SETTING (venue/lighting only');
    assert.ok(poseIdx >= 0 && settingIdx > poseIdx, 'pose should precede setting');
  });

  it('ensureDaySlotsMatchMood rerolls beach boards under sport', () => {
    const stale = DEFAULT_DAY_SLOTS.map(slot => ({
      ...slot,
      location: 'a rocky beach shoreline at night with city lights across the water',
      sceneHints: 'standing barefoot by the rocks in a floral sundress',
    }));
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    const { slots, changed } = ensureDaySlotsMatchMood(stale, {
      dayMood: 'sport',
      random: () => sequence[i++ % sequence.length]!,
    });
    assert.equal(changed, true);
    for (const slot of slots) {
      assert.doesNotMatch(slot.location ?? '', /beach|shoreline|parking/i);
      assert.match(slot.sceneHints ?? '', /athletic action|mid-play|kit/i);
    }
  });

  it('ensureDaySlotsMatchMood rerolls pier/beach boards under raunchy solo', () => {
    const stale = DEFAULT_DAY_SLOTS.map((slot, index) =>
      index === 0
        ? {
            ...slot,
            location: 'sunset pier railing with long shadows and cool wind',
            sceneHints:
              'solo fingering naked against the kitchen sink — back arched hard, both hands between her thighs, Cast alone fully nude',
          }
        : { ...slot }
    );
    assert.equal(
      daySlotMatchesAdultMix({
        slot: stale[0]!,
        dayMood: 'raunchy',
        intimateMix: 'solo',
      }),
      false
    );
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    const { slots, changed } = ensureDaySlotsMatchMood(stale, {
      dayMood: 'raunchy',
      intimateMix: 'solo',
      random: () => sequence[i++ % sequence.length]!,
    });
    assert.equal(changed, true);
    assert.doesNotMatch(slots[0]!.location ?? '', /pier|beach|boardwalk|ocean|\bsand\b/i);
    assert.match(slots[0]!.location ?? '', /bedroom|hotel|bathroom|apartment|sheets|lamp/i);
  });

  it('resolveDayAdultIndoorSetting replaces outdoor nouns with heat bedroom presets', () => {
    assert.match(
      resolveDayAdultIndoorSetting({
        setting: 'riverside boardwalk with bikes and midday glare on the water',
        slotId: 'afternoon',
      }),
      /bedroom|hotel|sheets|lamp|blinds/i
    );
    assert.doesNotMatch(
      resolveDayAdultIndoorSetting({
        setting: 'moonlit bedroom with soft city lights through the window',
        slotId: 'night',
      }),
      /city lights/i
    );
  });

  it('daySlotSceneSummary joins setting and beat', async () => {
    const { daySlotSceneSummary } = await import('./day-planner');
    assert.equal(
      daySlotSceneSummary({
        location: 'cozy living-room couch',
        sceneHints: 'reading a book',
      }),
      'cozy living-room couch · reading a book'
    );
    assert.match(
      daySlotSceneSummary(
        {
          location: 'a'.repeat(80),
          sceneHints: 'b'.repeat(40),
        },
        40
      ),
      /…$/
    );
  });

  it('buildDaySlotPrompt poseGuide respects anime realism mode', () => {
    const slot = DEFAULT_DAY_SLOTS[1]!;
    const prompt = buildDaySlotPrompt({
      slot,
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      realismMode: 'anime',
    });
    assert.match(prompt, /finished anime\/illustration scene/i);
    assert.doesNotMatch(prompt, /photorealistic live-action photograph/i);
  });

  it('normalizeDayIntimateMix defaults to mixed', () => {
    assert.equal(normalizeDayIntimateMix('solo'), 'solo');
    assert.equal(normalizeDayIntimateMix('duo'), 'duo');
    assert.equal(normalizeDayIntimateMix('mixed'), 'mixed');
    assert.equal(normalizeDayIntimateMix(''), 'mixed');
    assert.equal(normalizeDayIntimateMix(null), 'mixed');
    assert.equal(normalizeDayIntimateMix('invalid'), 'mixed');
  });

  it('isDayIntimateSoloBeat classifies solo intimate lines', () => {
    assert.equal(isDayIntimateSoloBeat('solo masturbation on the bed edge'), true);
    assert.equal(isDayIntimateSoloBeat('alone on the bed touching herself'), true);
    assert.equal(
      isDayIntimateSoloBeat('solo kneeling on the sheets after dark, self-pleasure, soft lamp'),
      true
    );
    assert.equal(isDayIntimateSoloBeat('hands on her own body at dusk'), true);
    assert.equal(isDayIntimateSoloBeat('missionary on a rumpled bed with afternoon light'), false);
    assert.equal(isDayIntimateSoloBeat('bent over a desk from behind with a partner'), false);
  });

  it('intimateBeatsForMix solo covers every masturbation stance kind', () => {
    const kinds = new Set<string>();
    for (const slotId of ['morning', 'afternoon', 'evening', 'night'] as const) {
      for (const beat of intimateBeatsForMix(slotId, 'solo')) {
        kinds.add(resolveSoloMasturbationPoseKind(beat));
      }
    }
    for (const kind of [
      'on_back',
      'side_lying',
      'prone',
      'kneeling',
      'all_fours',
      'standing',
      'lean',
      'seated',
    ]) {
      assert.ok(kinds.has(kind), `missing solo masturbation Image 3 kind: ${kind}`);
    }
  });

  it('intimateBeatsForMix filters solo duo and mixed pools', () => {
    const morning = DAY_SLOT_INTIMATE_BEAT_PRESETS.morning;
    const solo = intimateBeatsForMix('morning', 'solo');
    const duo = intimateBeatsForMix('morning', 'duo');
    assert.equal(intimateBeatsForMix('morning', 'mixed').length, morning.length);
    assert.ok(solo.length > 0);
    assert.ok(duo.length > 0);
    assert.equal(solo.length + duo.length, morning.length);
    assert.ok(solo.every(isDayIntimateSoloBeat));
    assert.ok(duo.every(beat => !isDayIntimateSoloBeat(beat)));
  });

  it('diversifyDaySlotScenes intimateMix solo only produces solo-ish beats', () => {
    let i = 0;
    const sequence = Array.from({ length: 32 }, (_, n) => (n % 10) / 10);
    const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
      forceLocations: true,
      forceBeats: true,
      dayMood: 'intimate',
      intimateMix: 'solo',
      random: () => sequence[i++ % sequence.length]!,
    });
    for (const slot of slots) {
      const beat = slot.sceneHints ?? '';
      const fromIntimatePool = DAY_SLOT_INTIMATE_BEAT_PRESETS[slot.id].includes(beat);
      if (fromIntimatePool) {
        assert.equal(isDayIntimateSoloBeat(beat), true, `expected solo beat, got: ${beat}`);
      }
    }
  });

  it('diversifyDaySlotScenes intimateMix duo never picks everyday solo beats', () => {
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    for (let trial = 0; trial < 20; trial++) {
      const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
        forceLocations: true,
        forceBeats: true,
        dayMood: 'intimate',
        intimateMix: 'duo',
        random: () => sequence[i++ % sequence.length]!,
      });
      for (const slot of slots) {
        const beat = slot.sceneHints ?? '';
        assert.equal(
          DAY_SLOT_BEAT_PRESETS[slot.id].includes(beat),
          false,
          `everyday beat leaked into duo: ${beat}`
        );
        assert.equal(
          isDayIntimateSoloBeat(beat),
          false,
          `solo intimate beat leaked into duo: ${beat}`
        );
        assert.ok(
          DAY_SLOT_INTIMATE_BEAT_PRESETS[slot.id].includes(beat),
          `expected intimate duo beat, got: ${beat}`
        );
      }
    }
  });

  it('buildDaySlotPrompt intimate duo never emits SOLO SUBJECT on partner beats', () => {
    for (const sceneHints of [
      'straddling a partner on a kitchen chair, morning light',
      'undressing in the bedroom doorway before pulling a partner close',
      'bent over a desk from behind with a partner gripping her hips',
    ]) {
      const prompt = buildDaySlotPrompt({
        slot: { ...DEFAULT_DAY_SLOTS[0]!, sceneHints },
        hasPlate: true,
        plateSource: 'keeper',
        poseGuide: true,
        dayMood: 'intimate',
        intimateMix: 'duo',
        omitGarment: true,
      });
      assert.doesNotMatch(prompt, /SOLO SUBJECT \(mandatory\)/i, sceneHints);
      assert.match(prompt, /PARTNERS:/i, sceneHints);
    }
  });

  it('buildDaySlotPrompt intimate beat does not inject everyday grocery/book baselines', () => {
    const sceneHints =
      'oral sex: partner kneeling between her thighs, mouth on her vulva, both hands on her thighs';
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[1]!,
        location: 'apartment bedroom with blinds half-drawn',
        sceneHints,
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'intimate',
      intimateMix: 'duo',
      omitGarment: true,
    });
    assert.match(prompt, /mandatory body pose and sex\/action from the beat only/i);
    assert.match(prompt, /oral sex/i);
    assert.doesNotMatch(prompt, /mandatory new body pose:/i);
    assert.doesNotMatch(prompt, /carrying two grocery bags|park bench with a book|menu held open/i);
    assert.match(prompt, /exactly TWO adults|two-adult framing/i);
    assert.match(prompt, /Discard Image 1|Discard every garment|ZERO fabric|use FACE only|face identity only|clothes are now gone|bare skin only|Image 1 fabric is invisible/i);
    assert.doesNotMatch(prompt, /\b(beige lingerie|nude-tone bra|tan bikini|bra cups|panties-only)\b/i);
    assert.doesNotMatch(prompt, /no second person in frame/i);
  });

  it('raunchyBeatsForMix splits solo vs duo comedy lines', () => {
    const morning = DAY_SLOT_RAUNCHY_BEAT_PRESETS.morning;
    const solo = raunchyBeatsForMix('morning', 'solo');
    const duo = raunchyBeatsForMix('morning', 'duo');
    assert.ok(solo.length > 0);
    assert.ok(duo.length > 0);
    assert.equal(solo.length + duo.length, morning.length);
    assert.ok(solo.every(isDayRaunchySoloBeat));
    assert.ok(duo.every(beat => !isDayRaunchySoloBeat(beat)));
  });

  it('diversifyDaySlotScenes raunchy + solo mix only produces solo-ish gags', () => {
    let i = 0;
    const sequence = Array.from({ length: 32 }, (_, n) => (n % 10) / 10);
    const { slots } = diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
      forceLocations: true,
      forceBeats: true,
      dayMood: 'raunchy',
      intimateMix: 'solo',
      random: () => sequence[i++ % sequence.length]!,
    });
    for (const slot of slots) {
      const beat = slot.sceneHints ?? '';
      const fromRaunchyPool = DAY_SLOT_RAUNCHY_BEAT_PRESETS[slot.id].includes(beat);
      if (fromRaunchyPool) {
        assert.equal(isDayRaunchySoloBeat(beat), true, `expected solo raunchy beat, got: ${beat}`);
      }
    }
  });

  it('dayQueueBlockReason returns user-facing block strings', () => {
    assert.equal(
      dayQueueBlockReason({ hasCharacter: false, hasPlate: true }),
      'Pick a Cast character in Setup first.'
    );
    assert.equal(
      dayQueueBlockReason({ hasCharacter: true, hasPlate: false }),
      'Add a look plate on Cast (or Keep a try-on in Outfit) before Queue day.'
    );
    assert.equal(
      dayQueueBlockReason({
        hasCharacter: true,
        hasPlate: true,
        isolateSubject: true,
        isolatePending: true,
      }),
      'Wait for plate isolate on white to finish.'
    );
    assert.equal(
      dayQueueBlockReason({
        hasCharacter: true,
        hasPlate: true,
        isolatePending: true,
      }),
      null
    );
    assert.equal(dayQueueBlockReason({ hasCharacter: true, hasPlate: true }), null);
  });

  it('daySessionStatusLine names plate · mood · progress', () => {
    assert.match(
      daySessionStatusLine({
        hasPlate: false,
        dayMood: 'intimate',
        intimateMix: 'duo',
        completedStills: 1,
        completedClips: 0,
        slotTotal: 4,
      }),
      /No plate · intimate · duo · 1\/4 stills/
    );
    assert.match(
      daySessionStatusLine({
        hasPlate: true,
        dayMood: 'everyday',
        completedStills: 4,
        completedClips: 2,
        slotTotal: 4,
        kitLabel: 'Linen set',
      }),
      /Plate ready · everyday · Linen set · 4\/4 stills · 2 clips/
    );
  });

  it('rerollDaySlotScene changes only the named slot', () => {
    const seeded = DEFAULT_DAY_SLOTS.map((slot, index) => ({
      ...slot,
      location: `custom-loc-${index}`,
      sceneHints: `custom-beat-${index}`,
    }));
    let cursor = 0;
    const random = () => [0.05, 0.15, 0.25, 0.35, 0.45, 0.55][cursor++ % 6]!;
    const { slots, changed } = rerollDaySlotScene(seeded, 'afternoon', {
      dayMood: 'everyday',
      random,
    });
    assert.equal(changed, true);
    assert.equal(slots[0]?.location, 'custom-loc-0');
    assert.equal(slots[0]?.sceneHints, 'custom-beat-0');
    assert.equal(slots[2]?.location, 'custom-loc-2');
    assert.equal(slots[3]?.location, 'custom-loc-3');
    assert.notEqual(slots[1]?.location, 'custom-loc-1');
    assert.notEqual(slots[1]?.sceneHints, 'custom-beat-1');
  });

  it('daySlotPlanLabel shows empty-state hints', () => {
    assert.equal(daySlotPlanLabel(null), 'Tap to set setting & beat');
    assert.equal(daySlotPlanLabel({}), 'Tap to set setting & beat');
    assert.equal(
      daySlotPlanLabel({ location: 'sunlit kitchen', sceneHints: '' }),
      'sunlit kitchen · Add a beat'
    );
    assert.equal(
      daySlotPlanLabel({ location: '', sceneHints: 'pouring coffee' }),
      'Add a setting · pouring coffee'
    );
    assert.equal(
      daySlotPlanLabel({ location: 'kitchen', sceneHints: 'coffee run' }),
      'kitchen · coffee run'
    );
  });

  it('isDayRaunchySoloBeat treats roommate/partner flash as duo', () => {
    assert.equal(
      isDayRaunchySoloBeat(
        'accidental flash bending to pick up laundry when a roommate opens the door — then slapstick hallway sex against the wall'
      ),
      false
    );
    assert.equal(
      isDayRaunchySoloBeat('solo nip slip while stretching on the couch, blinds half-open'),
      false
    );
    assert.equal(
      isDayRaunchySoloBeat(
        'solo masturbation naked on the couch — hand on her vulva, Cast alone fully nude'
      ),
      true
    );
  });

  it('ensureDaySlotsMatchMood rerolls everyday notebook boards under raunchy duo', () => {
    const stale = DEFAULT_DAY_SLOTS.map((slot, index) => ({
      ...slot,
      location: index === 0 ? 'bookstore aisle with warm lamps' : slot.location,
      sceneHints:
        index === 0
          ? 'sitting on a park bench reading a book with a notebook open'
          : 'solo nip slip while stretching on the couch, blinds half-open',
    }));
    assert.equal(
      daySlotMatchesAdultMix({
        slot: stale[0]!,
        dayMood: 'raunchy',
        intimateMix: 'duo',
      }),
      false
    );
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    const { slots, changed } = ensureDaySlotsMatchMood(stale, {
      dayMood: 'raunchy',
      intimateMix: 'duo',
      random: () => sequence[i++ % sequence.length]!,
    });
    assert.equal(changed, true);
    for (const slot of slots) {
      const beat = slot.sceneHints ?? '';
      assert.equal(DAY_SLOT_BEAT_PRESETS[slot.id].includes(beat), false, beat);
      assert.equal(isDayRaunchySoloBeat(beat), false, beat);
      assert.ok(DAY_SLOT_RAUNCHY_BEAT_PRESETS[slot.id].includes(beat), beat);
      assert.doesNotMatch(beat, /notebook|clipboard|reading a book/i);
    }
  });

  it('dayBeatOmitsGarmentPackshot drops Keep kit on raunchy mid-sex even with pants words', () => {
    assert.equal(
      dayBeatOmitsGarmentPackshot({
        blurb: 'partner yanking her pants down mid-argument that turns into slapstick doggy-style',
        dayMood: 'raunchy',
        intimateMix: 'duo',
      }),
      true
    );
    assert.equal(
      dayBeatOmitsGarmentPackshot({
        blurb: 'solo nip slip while stretching on the couch, blinds half-open',
        dayMood: 'raunchy',
        intimateMix: 'solo',
      }),
      false
    );
    assert.equal(
      dayBeatOmitsGarmentPackshot({
        blurb:
          'solo nip slip while stretching on the couch — then she keeps going, hand between her thighs masturbating',
        dayMood: 'raunchy',
        intimateMix: 'solo',
      }),
      true
    );
  });

  it('raunchy solo beats keep comedy props but punch with self-touch', () => {
    for (const slotId of ['morning', 'afternoon', 'evening', 'night'] as const) {
      const solo = raunchyBeatsForMix(slotId, 'solo');
      assert.ok(solo.length >= 3, `${slotId} needs enough solo heat`);
      const toyBeats = solo.filter(beat => dayBeatUsesSoloSexToy(beat));
      assert.ok(toyBeats.length >= 1, `${slotId} needs at least one dildo beat`);
      for (const beat of solo) {
        assert.match(
          beat,
          /finger(?:ing)?|fingers?|hand between her thighs|rid(?:e|es|ing) her own hand|grinding|clit|vulva|masturbat|dildo/i,
          `expected fingering or dildo punchline, got: ${beat}`
        );
        assert.match(beat, /naked|nude|fully nude/i, `expected nude lead, got: ${beat}`);
        assert.equal(isDayRaunchySoloBeat(beat), true);
      }
    }
  });

  it('buildDaySlotPrompt raunchy solo dildo beat forces vaginal opening penetration', () => {
    const sceneHints =
      'alone on her back naked with a realistic penis-shaped silicone dildo — the tip of the penis pushed deep into her vaginal opening, shaft entering her vagina, both hands on the base thrusting deeper, Cast alone fully nude, never invent a man or second adult';
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[0]!,
        location: 'sunlit bedroom with rumpled sheets',
        sceneHints,
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'raunchy',
      intimateMix: 'solo',
      omitGarment: true,
    });
    assert.match(prompt, /vaginal opening/i);
    assert.match(prompt, /tip of the penis|penis-shaped/i);
    assert.match(prompt, /SOLO TOY LOCK|never invent a man/i);
    assert.match(prompt, /never hold the dildo upright against her belly|tip pointing at her chest/i);
    assert.doesNotMatch(prompt, /nothing held — fingers only|nothing held between the thighs — fingers only/i);
  });

  it('buildDaySlotPrompt raunchy solo demands crude self-touch not tame flash', () => {
    const sceneHints =
      'solo fingering naked against the kitchen sink — back arched hard, one knee hooked on the counter, two fingers buried in her vulva, Cast alone fully nude';
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[0]!,
        location: 'sunlit bedroom with rumpled sheets and an open window',
        sceneHints,
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'raunchy',
      intimateMix: 'solo',
      omitGarment: true,
    });
    assert.match(prompt, /MOOD: raunchy solo/i);
    assert.match(prompt, /wild fingering|wild mid-fingering|fingers/i);
    assert.match(prompt, /SOLO ACT:/i);
    assert.match(prompt, /fingers on her vulva|knuckle-deep|inside her vulva|rubbing her clit|mid-self-touch/i);
    assert.match(prompt, /inner thighs framing|claw|thigh-frame|rock-on|jazz/i);
    assert.match(prompt, /bare skin only|clothes are now gone|ZERO fabric/i);
    // Naming lingerie in the positive summons it on Rapid — bans stay in negatives.
    assert.doesNotMatch(prompt, /\b(beige|lingerie|bra|panties|bikini|thong)\b/i);
    assert.match(prompt, /fingers? (?:only|on|inside|actively|knuckle)|ANATOMY:/i);
    assert.match(prompt, /nothing held|clothes are now gone|zero fabric/i);
    assert.match(prompt, /never beach|No beach|indoor rumpled sheets only|strictly no beach/i);
    assert.match(prompt, /pointing up|raised middle|raised hands|exactly two hands|continuous forearm|continues from her own forearm/i);
    // Naming toys in the positive summons them on Rapid AIO — bans stay in negatives.
    assert.doesNotMatch(prompt, /\b(vibrator|dildo|wand|egg vibrator|sex toy)\b/i);
    assert.doesNotMatch(prompt, /other hand on a breast|hand on a breast/i);
  });

  it('buildDaySlotPrompt face-only nude identity invents body without stripping Image 1 clothes', () => {
    const sceneHints =
      'solo fingering naked on the bed — knees spread, two fingers knuckle-deep in her vulva, Cast alone fully nude';
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[0]!,
        location: 'sunlit bedroom with rumpled sheets',
        sceneHints,
      },
      hasPlate: true,
      plateSource: 'cast',
      poseGuide: true,
      dayMood: 'raunchy',
      intimateMix: 'solo',
      omitGarment: true,
      faceOnlyIdentity: true,
    });
    assert.match(prompt, /indoors at|No beach|strictly no beach|BACKGROUND MANDATORY/i);
    assert.match(
      prompt,
      /Put her body into this exact pose|clothes are now gone|bare skin only|Invent the body|invent bare-skin body/i
    );
    assert.doesNotMatch(prompt, /IGNORE and strip every garment visible on Image 1/i);
    assert.doesNotMatch(prompt, /skin-tone thong bikini|Change her outfit to a skin-tone/i);
  });

  it('buildDaySlotPrompt raunchy solo on Cast plate still demands bare-skin mid-act', () => {
    const sceneHints =
      'solo naked on the windowsill at dusk — heels planted, knees out, two fingers deep in her vulva, Cast alone fully nude';
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[2]!,
        location: 'hotel window at dusk with city lights',
        sceneHints,
      },
      hasPlate: true,
      plateSource: 'cast',
      poseGuide: true,
      dayMood: 'raunchy',
      intimateMix: 'solo',
      omitGarment: true,
    });
    assert.match(prompt, /IGNORE|ignore Image 1|body (?:proportions|shape)|ZERO fabric|Image 1 fabric is invisible|do not copy fabric/i);
    assert.match(prompt, /ZERO fabric|bare breasts.*vulva|nipples visible|clothes are now gone|bare skin only/i);
    assert.match(prompt, /fingers|fingering|wild mid-fingering|mid-self-touch/i);
    assert.match(prompt, /fingers (?:deep )?in her vulva|fingers on her vulva|knuckle-deep|Put her body into this exact pose/i);
    assert.doesNotMatch(prompt, /\b(beige|lingerie|bra|panties|bikini|thong)\b/i);
    assert.match(prompt, /bare skin only|clothes are now gone|wild fingering|nothing held/i);
    assert.match(prompt, /claw|thigh-frame|inner thighs framing|rock-on/i);
    assert.doesNotMatch(prompt, /\b(vibrator|dildo|wand|sex toy)\b/i);
  });

  it('dayBeatOmitsGarmentPackshot always drops Keep kit on intimate duo', () => {
    assert.equal(
      dayBeatOmitsGarmentPackshot({
        blurb: 'undressing in the bedroom doorway before pulling a partner close',
        dayMood: 'intimate',
        intimateMix: 'duo',
      }),
      true
    );
  });

  it('dayBeatOmitsGarmentPackshot always drops Keep kit on intimate solo masturbation', () => {
    assert.equal(
      dayBeatOmitsGarmentPackshot({
        blurb: 'solo masturbation on the bed edge under a lamp',
        dayMood: 'intimate',
        intimateMix: 'solo',
      }),
      true
    );
    assert.equal(
      dayBeatOmitsGarmentPackshot({
        blurb: 'alone on her back touching herself, soft lamp on bare skin',
        dayMood: 'intimate',
        intimateMix: 'mixed',
      }),
      true
    );
  });

  it('buildDaySlotPrompt intimate solo beat owns pose without soft pin-up collapse', () => {
    const sceneHints = 'solo masturbation on the bed edge under a lamp';
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[3]!,
        location: 'hotel bedroom with warm lamp and rumpled sheets',
        sceneHints,
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'intimate',
      intimateMix: 'solo',
      omitGarment: true,
    });
    assert.match(prompt, /MOOD: intimate solo/i);
    assert.match(prompt, /FOREGROUND: empty rumpled sheets/i);
    assert.match(prompt, /POSE FIRST: mandatory body pose and sex\/action from the beat only/i);
    assert.match(prompt, /SETTING \(backdrop only/i);
    assert.match(prompt, /nothing on the bed except sheets|behind the beat pose/i);
    assert.match(prompt, /PROPS \+ FRAME:/i);
    assert.match(prompt, /SOLO ACT:|HANDS: both hands on her own body/i);
    assert.match(prompt, /Day still —/i);
    assert.doesNotMatch(prompt, /Day planner still/i);
    // Avoid summoning lined notebooks by naming them in the positive.
    assert.doesNotMatch(prompt, /\bnever invent a (?:book|notebook|planner)\b/i);
    assert.match(prompt, /never a soft floral-dress pin-up|never a soft fashion pin-up|use FACE only|face identity only|Discard every garment/i);
    assert.match(prompt, /SOLO SUBJECT \(mandatory\)/i);
    assert.doesNotMatch(prompt, /PARTNERS:/i);
  });

  it('buildDaySlotPrompt raunchy duo bans invented notebooks and demands slapstick sex', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[0]!,
        location: 'sunlit bedroom with rumpled sheets and an open window',
        sceneHints: 'straddling a partner on a kitchen chair mid-slapstick sex, coffee cup tipping',
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'raunchy',
      intimateMix: 'duo',
      omitGarment: true,
    });
    assert.match(prompt, /MOOD: raunchy duo/i);
    assert.match(prompt, /never a tame softcore/i);
    assert.match(prompt, /FOREGROUND:|never invent walking, grocery, reading|empty sheets/i);
    assert.match(prompt, /PROPS \+ FRAME:/i);
    assert.match(prompt, /PARTNERS:/i);
    assert.doesNotMatch(prompt, /SOLO SUBJECT \(mandatory\)/i);
  });

  it('buildDaySlotPrompt intimate duo bans books and camera-stare portraits', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[1]!,
        location: 'apartment bedroom with blinds half-drawn and warm dust light',
        sceneHints: 'missionary on a rumpled bed with afternoon light through blinds',
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'intimate',
      intimateMix: 'duo',
      omitGarment: true,
    });
    assert.match(prompt, /MOOD: intimate duo/i);
    assert.match(prompt, /looking at each other not the lens/i);
    assert.match(prompt, /FOREGROUND:|bare sheets|empty bed/i);
    assert.match(prompt, /PROPS \+ FRAME:/i);
    assert.match(prompt, /BODIES: exactly two fully separate/i);
    assert.match(prompt, /two pelvises|never double genitals/i);
    assert.match(prompt, /HANDS: exactly four hands|never a floating\/ghost hand/i);
    assert.match(prompt, /SKIN TEXTURE:|natural matte pores/i);
    assert.match(prompt, /looking at partner not the lens/i);
    assert.doesNotMatch(prompt, /reading a book/i);
  });

  it('buildDaySlotPrompt adult duo omit garment uses bare-skin outfit (no lingerie nouns)', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[1]!,
        location: 'apartment bedroom with blinds half-drawn and warm dust light',
        sceneHints: 'missionary on a rumpled bed with afternoon light through blinds',
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'intimate',
      intimateMix: 'duo',
      omitGarment: true,
    });
    assert.match(prompt, /ZERO fabric|clothes are now gone|bare skin only|Image 1 fabric is invisible/i);
    assert.match(prompt, /outfit: her clothes are now gone|outfit: bare skin only/i);
    assert.doesNotMatch(prompt, /\b(beige lingerie|nude-tone bra|tan bikini|bra cups)\b/i);
  });

  it('ensureDaySlotsMatchMood rerolls kitchen boards under intimate duo', () => {
    const stale = DEFAULT_DAY_SLOTS.map(slot => ({
      ...slot,
      location: 'kitchen with morning light — clear counter, no office clutter',
      sceneHints: 'straddling a partner on a kitchen chair, morning light',
    }));
    assert.equal(
      daySlotMatchesAdultMix({
        slot: stale[0]!,
        dayMood: 'intimate',
        intimateMix: 'duo',
      }),
      false
    );
  });

  it('ensureDaySlotsMatchMood rerolls book boards under intimate mixed', () => {
    const stale = DEFAULT_DAY_SLOTS.map(slot => ({
      ...slot,
      location: 'independent bookstore aisle with warm lamps and crowded shelves',
      sceneHints: 'sitting on a park bench reading a book, one leg crossed',
    }));
    assert.equal(
      daySlotMatchesAdultMix({
        slot: stale[0]!,
        dayMood: 'intimate',
        intimateMix: 'mixed',
      }),
      false
    );
    const { slots, changed } = ensureDaySlotsMatchMood(stale, {
      dayMood: 'intimate',
      intimateMix: 'mixed',
      random: () => 0.1,
    });
    assert.equal(changed, true);
    for (const slot of slots) {
      const beat = slot.sceneHints ?? '';
      assert.doesNotMatch(beat, /notebook|clipboard|reading a book|bookstore/i);
    }
  });

  it('resolveDayPoseHeadcount duo is exactly two even when copy mentions a crowd', () => {
    assert.equal(
      resolveDayPoseHeadcount({
        haystack: 'bent over mid-sex among the crowd at the market',
        beat: 'bent over mid-sex when the chair rolls away',
        dayMood: 'raunchy',
        intimateMix: 'duo',
      }),
      2
    );
    assert.equal(
      resolveDayPoseHeadcount({
        haystack: 'solo nip slip on the couch',
        beat: 'solo nip slip while stretching on the couch',
        dayMood: 'raunchy',
        intimateMix: 'solo',
      }),
      1
    );
  });

  it('buildDaySlotPrompt intimate duo never emits SOLO SUBJECT', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[1]!,
        location: 'apartment bedroom with blinds half-drawn and warm dust light',
        sceneHints: 'missionary on a rumpled bed with afternoon light through blinds',
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'intimate',
      intimateMix: 'duo',
      omitGarment: true,
    });
    assert.doesNotMatch(prompt, /SOLO SUBJECT \(mandatory\)/i);
    assert.match(prompt, /HEADCOUNT LOCK: exactly TWO adults/i);
    assert.match(prompt, /DUO VISIBLE: partner head and torso share/i);
    assert.match(prompt, /PARTNERS:/i);
    assert.match(prompt, /FOREGROUND:|bare sheets|nothing open on the bed/i);
  });

  it('buildDaySlotPrompt raunchy duo locks exactly two adults and bans third faces', () => {
    const prompt = buildDaySlotPrompt({
      slot: {
        ...DEFAULT_DAY_SLOTS[0]!,
        location: 'sunlit bedroom with rumpled sheets and an open window',
        sceneHints:
          'bent over the foot of the bed from behind when a partner slips and face-plants laughing',
      },
      hasPlate: true,
      plateSource: 'keeper',
      poseGuide: true,
      dayMood: 'raunchy',
      intimateMix: 'duo',
      omitGarment: true,
    });
    assert.match(prompt, /exactly TWO adults/i);
    assert.match(prompt, /HEADCOUNT LOCK/i);
    assert.match(prompt, /never a third face/i);
    assert.match(prompt, /exactly four hands/i);
    assert.match(prompt, /DUO ACT:|never Cast alone masturbating|never solo nude posing/i);
    assert.doesNotMatch(prompt, /SOLO SUBJECT \(mandatory\)/i);
  });
});
