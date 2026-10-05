import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { dayStillFixAreaPatch, restorePreviousDayTake, type DaySlotStill } from './day-planner';
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
