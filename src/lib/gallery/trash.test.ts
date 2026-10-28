import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import {
  TRASH_DAYS,
  galleryEntryTrashItem,
  normalizeTrash,
  restoredGalleryEntry,
  sceneTakeTrashItem,
  trashedTakesOf,
} from './trash';

const ID = '11111111-2222-4333-8444-555555555555';
const DAY = 86_400_000;
const entry = (extra: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry =>
  ({
    id: ID,
    promptId: 'p-1',
    prompt: 'A kitchen at dawn',
    comfyUrl: '',
    status: 'success',
    queuedAt: 1,
    images: [],
    ...extra,
  }) as ComfyGalleryEntry;

describe('trash (M10 T2)', () => {
  it('keeps a deleted entry whole but its search corpus and a large graph, with a link to its media', () => {
    const small = galleryEntryTrashItem(
      { ...entry({ workflowJson: '{"1":{}}', hasStoredWorkflow: true }), _corpus: 'x' } as ComfyGalleryEntry,
      { now: 10 }
    );
    assert.equal(small.kind, 'gallery-entry');
    assert.equal(small.label, 'A kitchen at dawn');
    assert.equal(small.entry?.workflowJson, '{"1":{}}');
    assert.equal('_corpus' in (small.entry ?? {}), false);
    assert.deepEqual(small.links, [`/api/gallery/media/${ID}`]);

    const large = galleryEntryTrashItem(
      entry({ workflowJson: 'x'.repeat(60_000), hasStoredWorkflow: true }),
      { now: 10 }
    );
    assert.equal(large.entry?.workflowJson, undefined);
    assert.equal(large.entry?.hasStoredWorkflow, undefined);
  });

  it('drops items whose days are up, and anything that is not one', () => {
    const now = 100 * DAY;
    const fresh = galleryEntryTrashItem(entry(), { now: now - DAY });
    const old = galleryEntryTrashItem(entry(), { now: now - (TRASH_DAYS + 1) * DAY });
    const take = sceneTakeTrashItem({
      take: { id: 'p2', imageUrl: '/2.png', at: 2 },
      sceneId: 'scene-1',
      sceneName: 'Kitchen',
      index: 1,
      wasKept: true,
      now: now - 2 * DAY,
    });
    const kept = normalizeTrash([old, take, { id: 'x', kind: 'other', at: now }, fresh, fresh], now);
    assert.deepEqual(
      kept.map(item => item.id),
      [fresh.id, take.id]
    );
    assert.equal(kept[1]?.index, 1);
    assert.equal(kept[1]?.wasKept, true);
    assert.deepEqual(
      trashedTakesOf(kept, 'scene-1').map(item => item.id),
      [take.id]
    );
    assert.deepEqual(trashedTakesOf(kept, 'scene-2'), []);
  });

  it('restores an entry under a new id with its media links moved to it', () => {
    const NEW = '99999999-8888-4777-8666-555555555555';
    const restored = restoredGalleryEntry(
      entry({ sourceImageUrl: `/api/gallery/media/${ID}?variant=original` }),
      NEW
    );
    assert.equal(restored.id, NEW);
    assert.equal(restored.sourceImageUrl, `/api/gallery/media/${NEW}?variant=original`);
    assert.equal(restored.promptId, 'p-1');
  });
});
