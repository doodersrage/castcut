/**
 * A still the adult-appearance gate holds (pending) or withheld never appears: not in the
 * Gallery list, a film, an export or a sync push — and the server keeps no copy of it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import {
  galleryEntriesForSync,
  inheritedAdultCheck,
  isGalleryEntryHidden,
  withoutHiddenGalleryEntries,
  type GalleryAdultCheckState,
} from './gallery-adult-check';
import { filterComfyGalleryEntries } from './comfyui-gallery';
import { isFilmSourceStill, resolveFilmPlaylist } from './character-film';
import { isGalleryStitchableVideo } from './gallery-video-stitch';
import { selectLoraDatasetEntries } from './gallery-lora-dataset-export';
import { mergeGalleryWithServer } from './gallery-server-sync';
import { mergeDaySlotStills } from './day-planner';
import { mergeRoleplayStoryStills } from './roleplay-gallery-takes';
import { resetServerStorageFingerprints, syncNamespaceToServer } from './storage-sync';
import { closeStudioDb } from './sqlite/studio-db';
import { readGalleryEntries, upsertGalleryEntries } from './sqlite/gallery';

function entry(id: string, state?: GalleryAdultCheckState, extra?: Partial<ComfyGalleryEntry>) {
  return {
    id,
    promptId: `p-${id}`,
    prompt: `Explicit sex photo ${id}`,
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: 1000,
    completedAt: 2000,
    images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }],
    favorite: true,
    reviewRating: 5,
    ...(state ? { adultCheck: { state, at: 1 } } : {}),
    ...extra,
  } as ComfyGalleryEntry;
}

const visible = entry('ok', 'passed');
const unchecked = entry('free', 'unchecked');
const plain = entry('plain');
const pending = entry('wait', 'pending');
const withheld = entry('gone', 'withheld');
const ALL = [visible, unchecked, plain, pending, withheld];

describe('gallery adult check (withheld / pending entries)', () => {
  it('hides pending and withheld entries only', () => {
    assert.deepEqual(
      ALL.map(isGalleryEntryHidden),
      [false, false, false, true, true]
    );
    assert.deepEqual(withoutHiddenGalleryEntries(ALL).map(e => e.id), ['ok', 'free', 'plain']);
  });

  it('never lists them in the Gallery, whatever the filter', () => {
    for (const filter of [{}, { status: 'all' as const }, { favoritesOnly: true }, { minRating: 5 as const }]) {
      assert.deepEqual(
        filterComfyGalleryEntries(ALL, filter).map(e => e.id),
        ['ok', 'free', 'plain'],
        JSON.stringify(filter)
      );
    }
  });

  it('never puts them in a film', () => {
    const refs = ALL.map(e => ({ ...e, viewUrl: `/view/${e.id}.png` }));
    assert.deepEqual(refs.filter(isFilmSourceStill).map(e => e.id), ['ok', 'free', 'plain']);
    const playlist = resolveFilmPlaylist(
      { items: refs.map(e => ({ entryId: e.id, included: true })), stillHoldSec: 2, updatedAt: 0 },
      refs
    );
    assert.deepEqual(playlist.map(shot => shot.entryId), ['ok', 'free', 'plain']);
    const clip = { ...withheld, viewUrl: '/view/gone.mp4' };
    assert.equal(isGalleryStitchableVideo(clip), false);
    assert.equal(isGalleryStitchableVideo({ ...clip, adultCheck: undefined }), true);
  });

  it('never exports them (LoRA dataset, even when picked)', () => {
    assert.deepEqual(selectLoraDatasetEntries(ALL).map(e => e.id), ['ok', 'free', 'plain']);
    assert.deepEqual(
      selectLoraDatasetEntries(ALL, { selectedIds: ['gone', 'wait', 'ok'] }).map(e => e.id),
      ['ok']
    );
  });

  it('syncs them only as bare stubs (no prompt, no images)', () => {
    const synced = galleryEntriesForSync(ALL);
    assert.deepEqual(synced.slice(0, 3), [visible, unchecked, plain]);
    for (const stub of synced.slice(3)) {
      assert.equal(stub.prompt, '');
      assert.deepEqual(stub.images, []);
      assert.equal(stub.comfyUrl, '');
      assert.equal('favorite' in stub, false);
      assert.ok(isGalleryEntryHidden(stub));
    }
  });

  it('pushes the stubs through storage sync', async () => {
    resetServerStorageFingerprints();
    const bodies: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ''));
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof fetch;
    try {
      await syncNamespaceToServer('comfy-gallery', ALL);
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(bodies.length, 1);
    assert.match(bodies[0]!, /Explicit sex photo ok/);
    assert.doesNotMatch(bodies[0]!, /Explicit sex photo (?:wait|gone)|gone\.png|wait\.png/);
  });

  it('keeps a local hidden entry hidden when the server has an older copy', () => {
    const serverCopy = { ...withheld, adultCheck: undefined, completedAt: 9999 };
    const { merged } = mergeGalleryWithServer([withheld], [serverCopy]);
    assert.equal(merged.length, 1);
    assert.ok(isGalleryEntryHidden(merged[0]));
  });

  it('hides what is made from a hidden picture, not a fresh variation', () => {
    assert.equal(inheritedAdultCheck(withheld, 'soft-pass', 5)?.state, 'withheld');
    assert.equal(inheritedAdultCheck(pending, 'i2v', 5)?.state, 'pending');
    assert.equal(inheritedAdultCheck(withheld, 'variation', 5), undefined);
    assert.equal(inheritedAdultCheck(visible, 'refine', 5), undefined);
  });

  describe('server storage', () => {
    const previousDataDir = process.env.PROMPT_DATA_DIR;
    let tempDir = '';
    beforeEach(() => {
      closeStudioDb();
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-adult-check-'));
      process.env.PROMPT_DATA_DIR = tempDir;
    });
    afterEach(() => {
      closeStudioDb();
      if (previousDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
      else process.env.PROMPT_DATA_DIR = previousDataDir;
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('deletes its copy when a hidden stub arrives, and never stores one', () => {
      upsertGalleryEntries('', [visible, { ...withheld, adultCheck: undefined }]);
      assert.deepEqual(readGalleryEntries('').map(e => e.id).sort(), ['gone', 'ok']);
      upsertGalleryEntries('', galleryEntriesForSync([withheld, pending]));
      assert.deepEqual(readGalleryEntries('').map(e => e.id), ['ok']);
    });
  });
});

describe('Day board and Story reel never show a held still', () => {
  it('Day: checking while held, withheld as failed, the image once it passes', () => {
    const stills = [{ slotId: 'morning' as const, promptId: 'p1', status: 'queued' as const }];
    const gallery = (adultCheck?: 'pending' | 'passed' | 'withheld') => [
      { promptId: 'p1', status: 'completed', imageUrl: '/view/p1.png', adultCheck },
    ];
    const checking = mergeDaySlotStills(stills, gallery('pending')).stills[0]!;
    assert.equal(checking.adultHold, 'checking');
    assert.equal(checking.status, 'running');
    assert.equal(checking.imageUrl, undefined);
    const gone = mergeDaySlotStills([checking], gallery('withheld')).stills[0]!;
    assert.equal(gone.adultHold, 'withheld');
    assert.equal(gone.status, 'error');
    assert.equal(gone.imageUrl, undefined);
    const passed = mergeDaySlotStills([checking], gallery('passed')).stills[0]!;
    assert.equal(passed.adultHold, undefined);
    assert.equal(passed.status, 'completed');
    assert.equal(passed.imageUrl, '/view/p1.png');
    // A withheld take whose card showed an image (before the gate ran) loses it.
    const shown = { ...stills[0]!, status: 'completed' as const, imageUrl: '/view/p1.png' };
    assert.equal(mergeDaySlotStills([shown], gallery('withheld')).stills[0]!.imageUrl, undefined);
  });

  it('Story: the take is held the same way', () => {
    const beat = {
      id: 'b1',
      title: 'Couch',
      blurb: 'reverse cowgirl',
      at: 1,
      promptId: 'p1',
      stillStatus: 'queued' as const,
      stillTakes: [{ promptId: 'p1', stillStatus: 'queued' as const }],
      stillTakeIndex: 0,
    };
    const still = (adultCheck?: 'pending' | 'passed' | 'withheld') => [
      { promptId: 'p1', status: 'completed' as const, imageUrl: '/view/p1.png', adultCheck },
    ];
    const held = mergeRoleplayStoryStills([beat], still('pending')).story[0]!;
    assert.equal(held.imageUrl, undefined);
    assert.equal(held.stillTakes?.[0]?.adultHold, 'checking');
    const gone = mergeRoleplayStoryStills([held], still('withheld')).story[0]!;
    assert.equal(gone.imageUrl, undefined);
    assert.equal(gone.stillStatus, 'error');
    assert.equal(gone.stillTakes?.[0]?.adultHold, 'withheld');
    const passed = mergeRoleplayStoryStills([held], still('passed')).story[0]!;
    assert.equal(passed.imageUrl, '/view/p1.png');
    assert.equal(passed.stillTakes?.[0]?.adultHold, undefined);
  });
});
