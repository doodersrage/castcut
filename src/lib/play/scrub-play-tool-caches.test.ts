import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scrubPlayToolCachesOnCastChange } from './cast-change';
import { dayAsShort, dayShortFingerprint, slimDayBoard } from '../day/day-as-short';
import type { DayToolCache } from './settings';

describe('scrubPlayToolCachesOnCastChange', () => {
  it('clears Day stills and isolate plate overrides', () => {
    const next = scrubPlayToolCachesOnCastChange({
      day: {
        stills: [{ slotId: 'morning', status: 'completed', imageUrl: '/a.webp' }],
        stillsCharacterId: 'char-a',
        plateImageUrl: '/old-plate.webp',
        plateImageFilename: 'old.png',
        plateIsolateSourceKey: 'src-a',
        referenceIsolated: true,
      },
    });
    assert.deepEqual(next.day?.stills, []);
    assert.equal(next.day?.stillsCharacterId, undefined);
    assert.equal(next.day?.plateImageUrl, undefined);
    assert.equal(next.day?.plateIsolateSourceKey, undefined);
    assert.equal(next.day?.referenceIsolated, false);
  });

  it('clears Outfit try-on refs and allows Cast reseed', () => {
    const next = scrubPlayToolCachesOnCastChange({
      fitting: {
        referenceImageUrl: '/old.webp',
        referenceImageFilename: 'old.png',
        suppressAutoPlateSeed: true,
        pendingOutfitPlatePromptId: 'p1',
        pendingOutfitPlateCharacterId: 'char-b',
        previewPlateUrl: '/preview.webp',
      },
    });
    assert.equal(next.fitting?.referenceImageUrl, undefined);
    assert.equal(next.fitting?.referenceImageFilename, undefined);
    assert.equal(next.fitting?.pendingOutfitPlatePromptId, 'p1');
    assert.equal(next.fitting?.pendingOutfitPlateCharacterId, 'char-b');
    assert.equal(next.fitting?.previewPlateUrl, undefined);
    assert.equal(next.fitting?.suppressAutoPlateSeed, false);
  });

  it('clears Story From-photo refs', () => {
    const next = scrubPlayToolCachesOnCastChange({
      roleplay: {
        referenceImageUrl: '/story.webp',
        referenceImageFilename: 'story.png',
        referenceIsolated: true,
        playAs: 'photo',
      },
    });
    assert.equal(next.roleplay?.referenceImageUrl, undefined);
    assert.equal(next.roleplay?.referenceImageFilename, undefined);
    assert.equal(next.roleplay?.referenceIsolated, false);
    assert.equal(next.roleplay?.playAs, 'photo');
  });

  it('parks a Short saved slim as its short has it (step 4c part 2b)', () => {
    const day = {
      stillsCharacterId: 'mara',
      dayLength: 4,
      slots: [
        { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
        { id: 'afternoon', label: 'Afternoon', location: 'beach', sceneHints: 'walks' },
      ],
      stills: [{ slotId: 'morning', promptId: 'p-m', imageUrl: '/m.png', status: 'completed' }],
    } as unknown as DayToolCache;
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const linked = {
      ...day,
      shortLink: { castId: 'mara', scriptId: short.script.id, fingerprint: dayShortFingerprint(day), syncedAt: 1000 },
    } as DayToolCache;
    const slim = slimDayBoard(linked, short.scenes)!;
    assert.ok(slim);
    const next = scrubPlayToolCachesOnCastChange(
      { day: slim, scene: { scenes: short.scenes } },
      'mara',
      'rob'
    );
    const parked = next.day?.parkedDays?.mara;
    assert.equal(parked?.slots?.find(slot => slot.id === 'morning')?.sceneHints, 'pours coffee');
    assert.equal(parked?.slots?.find(slot => slot.id === 'afternoon')?.location, 'beach');
  });
});
