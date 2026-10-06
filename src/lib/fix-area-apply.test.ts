import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import {
  dayFixUndoDepth,
  dayStillFixAreaPatch,
  normalizeDaySlotStills,
  restorePreviousDayTake,
  type DaySlotStill,
} from './day-planner';
import {
  fixAreaGalleryEntryInput,
  findGalleryEntryForStill,
  galleryEntryComfyStillUrl,
} from './fix-area-gallery';
import { addRoleplayFixedTakePatch, roleplayStillTakes } from './roleplay-gallery-takes';
import type { RoleplayStoryBeat } from './roleplay';

const result = {
  imageUrl: '/api/comfyui/view?filename=Castcut-fix_00001_.png&subfolder=&type=output',
  image: { filename: 'Castcut-fix_00001_.png', subfolder: '', type: 'output' },
  promptId: 'fix-1',
  seed: 5,
  originalUrl: '/api/comfyui/view?filename=Castcut_00010_.png&subfolder=&type=output',
  text: 'a plain wall',
};

const parent: ComfyGalleryEntry = {
  id: 'g1',
  promptId: 'p1',
  prompt: 'a café still',
  tool: 'day',
  model: 'rapid',
  characterId: 'c1',
  comfyUrl: 'http://127.0.0.1:8188',
  status: 'completed',
  queuedAt: 1,
  images: [{ filename: 'Castcut_00010_.png', subfolder: '', type: 'output' }],
};

describe('fix-area apply', () => {
  it('a used fix becomes a child gallery entry; the original is untouched', () => {
    const input = fixAreaGalleryEntryInput(parent, result, 100);
    assert.equal(input.parentGalleryEntryId, 'g1');
    assert.equal(input.derivedKind, 'fix-area');
    assert.equal(input.promptId, 'fix-1');
    assert.equal(input.status, 'completed');
    assert.deepEqual(input.images, [result.image]);
    assert.equal(input.characterId, 'c1');
    assert.equal(input.adultCheck, undefined);
    const adult = fixAreaGalleryEntryInput(
      { ...parent, adultCheck: { state: 'passed', at: 1 } },
      { ...result, adultCheck: 'unchecked' },
      100
    );
    assert.equal(adult.adultCheck?.state, 'unchecked');
    assert.equal(parent.images[0]!.filename, 'Castcut_00010_.png');
  });

  it('finds the gallery still and its ComfyUI URL', () => {
    assert.equal(
      galleryEntryComfyStillUrl(parent),
      '/api/comfyui/view?filename=Castcut_00010_.png&subfolder=&type=output'
    );
    assert.equal(galleryEntryComfyStillUrl({ ...parent, status: 'running' }), null);
    assert.equal(
      galleryEntryComfyStillUrl({
        ...parent,
        images: [{ filename: 'clip.mp4', subfolder: '', type: 'output' }],
      }),
      null
    );
    assert.equal(findGalleryEntryForStill([parent], { promptId: 'p1' })?.id, 'g1');
    assert.equal(
      findGalleryEntryForStill([parent], { comfyUrl: result.originalUrl })?.id,
      'g1'
    );
    assert.equal(findGalleryEntryForStill([parent], { promptId: 'nope' }), null);
  });

  it('Day: the fix is shown, the picture before it is the previous take, undo restores it', () => {
    const still: DaySlotStill = {
      slotId: 'morning',
      promptId: 'p1',
      imageUrl: '/raw.png',
      finishedUrl: '/face-finished.png',
      finishedFor: 'p1',
      status: 'completed',
    };
    const patch = dayStillFixAreaPatch(still, result.imageUrl);
    assert.ok(patch);
    assert.equal(patch.imageUrl, result.imageUrl);
    assert.equal(patch.finishedUrl, result.imageUrl);
    assert.equal(patch.finishedFor, 'p1');
    assert.deepEqual(patch.previousTake, {
      imageUrl: '/face-finished.png',
      promptId: 'p1',
      kind: 'fix-area',
    });
    assert.equal(dayStillFixAreaPatch({ ...still, status: 'running' }, result.imageUrl), null);
    const fixed = { ...still, ...patch };
    const restored = restorePreviousDayTake([fixed], 'morning')[0]!;
    assert.equal(restored.imageUrl, '/face-finished.png');
    assert.equal(restored.finishedUrl, '/face-finished.png');
    assert.equal(restored.finishedFor, 'p1');
    assert.equal(restored.previousTake, undefined);
    assert.equal(restored.fixHistory, undefined);
  });

  it('Day: a fix on a fix stacks, and Undo the fix walks back one picture at a time', () => {
    const still: DaySlotStill = {
      slotId: 'morning',
      promptId: 'p1',
      imageUrl: '/raw.png',
      status: 'completed',
    };
    assert.equal(dayFixUndoDepth(still), 0);
    const once = { ...still, ...dayStillFixAreaPatch(still, '/fix-1.png')! };
    assert.equal(dayFixUndoDepth(once), 1);
    assert.equal(once.fixHistory, undefined);
    const twice = { ...once, ...dayStillFixAreaPatch(once, '/fix-2.png')! };
    assert.equal(twice.imageUrl, '/fix-2.png');
    assert.deepEqual(twice.previousTake, { imageUrl: '/fix-1.png', promptId: 'p1', kind: 'fix-area' });
    assert.deepEqual(twice.fixHistory, [{ imageUrl: '/raw.png', promptId: 'p1' }]);
    const thrice = { ...twice, ...dayStillFixAreaPatch(twice, '/fix-3.png')! };
    assert.equal(dayFixUndoDepth(thrice), 3);
    assert.deepEqual(thrice.fixHistory, [
      { imageUrl: '/raw.png', promptId: 'p1' },
      { imageUrl: '/fix-1.png', promptId: 'p1' },
    ]);
    // The stack survives the slot store's normalisation.
    const stored = normalizeDaySlotStills([thrice])[0]!;
    assert.deepEqual(stored.fixHistory, thrice.fixHistory);
    // Undo: fix-3 → fix-2 (fix-1 is now the previous take), → fix-1, → raw, then nothing.
    const back1 = restorePreviousDayTake([thrice], 'morning')[0]!;
    assert.equal(back1.imageUrl, '/fix-2.png');
    assert.equal(back1.finishedUrl, '/fix-2.png');
    assert.deepEqual(back1.previousTake, { imageUrl: '/fix-1.png', promptId: 'p1', kind: 'fix-area' });
    assert.deepEqual(back1.fixHistory, [{ imageUrl: '/raw.png', promptId: 'p1' }]);
    assert.equal(dayFixUndoDepth(back1), 2);
    const back2 = restorePreviousDayTake([back1], 'morning')[0]!;
    assert.equal(back2.imageUrl, '/fix-1.png');
    assert.deepEqual(back2.previousTake, { imageUrl: '/raw.png', promptId: 'p1', kind: 'fix-area' });
    assert.equal(back2.fixHistory, undefined);
    const back3 = restorePreviousDayTake([back2], 'morning')[0]!;
    assert.equal(back3.imageUrl, '/raw.png');
    assert.equal(back3.previousTake, undefined);
    assert.equal(dayFixUndoDepth(back3), 0);
    assert.equal(restorePreviousDayTake([back3], 'morning')[0]!.imageUrl, '/raw.png');
  });

  it('Story: the fix joins the takes, pinned; the original stays a take', () => {
    const beat = {
      id: 'b1',
      at: 1,
      title: 'Café',
      text: 'She sits.',
      promptId: 'p1',
      imageUrl: '/orig.png',
      stillStatus: 'completed',
      poseMatch: { score: 0.9, at: 1 },
    } as unknown as RoleplayStoryBeat;
    const patch = addRoleplayFixedTakePatch(beat, {
      promptId: 'fix-1',
      imageUrl: result.imageUrl,
    });
    assert.equal(patch.promptId, 'fix-1');
    assert.equal(patch.imageUrl, result.imageUrl);
    assert.equal(patch.stillTakePinned, true);
    assert.equal(patch.poseMatch, undefined);
    assert.equal(patch.stillTakeIndex, 1);
    const takes = roleplayStillTakes({ ...beat, ...patch });
    assert.deepEqual(
      takes.map(take => take.imageUrl),
      ['/orig.png', result.imageUrl]
    );
  });
});
