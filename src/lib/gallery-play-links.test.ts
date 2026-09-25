import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterComfyGalleryEntries,
  galleryEntryRenderKey,
  sortGalleryEntries,
  uniqueGalleryCastIds,
  type ComfyGalleryEntry,
} from './comfyui-gallery';
import type { PhotoPose } from './day-pose-guide';
import type { DaySlot } from './day-planner';
import { storyBeatKey, withDaySlotPose, withStoryBeatPose } from './gallery-pose-targets';
import { galleryToolHrefForEntry, galleryToolLabel } from './gallery-tool-href';
import { applyGalleryUrlState, parseGalleryUrlState } from './gallery-url-state';
import type { RoleplayStoryBeat } from './roleplay';

const entry = (overrides: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry => ({
  id: 'e',
  promptId: 'p',
  prompt: 'a still',
  comfyUrl: 'http://127.0.0.1:8188',
  status: 'completed',
  queuedAt: 1000,
  images: [{ filename: 'out.png', subfolder: '', type: 'output' }],
  ...overrides,
});

describe('opening a still in its tool', () => {
  it('sends Day, Outfit and Look stills to their own pages, on their Cast', () => {
    assert.equal(galleryToolHrefForEntry({ tool: 'day', characterId: 'c 1' }), '/day?character=c%201');
    assert.equal(galleryToolHrefForEntry({ tool: 'fitting', characterId: 'c1' }), '/fitting?character=c1');
    assert.equal(galleryToolHrefForEntry({ tool: 'moodboard' }), '/moodboard');
    assert.equal(galleryToolHrefForEntry({ tool: 'roleplay', characterId: 'c1' }), '/story?character=c1');
    assert.equal(galleryToolLabel('day'), 'Day');
    assert.equal(galleryToolLabel('fitting'), 'Outfit');
    assert.equal(galleryToolLabel('moodboard'), 'Look');
  });

  it('leaves other tools as they were', () => {
    assert.equal(galleryToolHrefForEntry({ tool: 'generate', characterId: 'c1' }), '/');
    assert.equal(galleryToolHrefForEntry({ tool: 'duo', characterId: 'c1' }), '/character?mode=duo');
    assert.equal(galleryToolHrefForEntry({}), '/');
  });
});

describe('Cast filter', () => {
  it('lists each Cast once and filters to one', () => {
    const entries = [
      entry({ id: 'a', characterId: 'rin' }),
      entry({ id: 'b', characterId: 'rin' }),
      entry({ id: 'c', characterId: 'kai' }),
      entry({ id: 'd' }),
    ];
    assert.deepEqual(uniqueGalleryCastIds(entries).sort(), ['kai', 'rin']);
    assert.deepEqual(
      filterComfyGalleryEntries(entries, { characterId: 'rin' }).map(item => item.id),
      ['a', 'b']
    );
  });
});

describe('Play checks in the gallery', () => {
  const checked = [
    entry({ id: 'miss', queuedAt: 4, playChecks: { pose: 0.3, poseMiss: true, at: 1 } }),
    entry({ id: 'best', queuedAt: 3, playChecks: { pose: 0.9, face: 0.8, at: 1 } }),
    entry({ id: 'ok', queuedAt: 2, playChecks: { pose: 0.7, at: 1 } }),
    entry({ id: 'unchecked', queuedAt: 5 }),
    entry({ id: 'face', queuedAt: 1, playChecks: { pose: 0.8, face: 0.2, faceMiss: true, at: 1 } }),
  ];

  it('filters to stills whose pose or face missed', () => {
    assert.deepEqual(
      filterComfyGalleryEntries(checked, { playCheckMissOnly: true }).map(item => item.id).sort(),
      ['face', 'miss']
    );
  });

  it('sorts checked stills by fewest misses, then closest pose; unchecked last', () => {
    assert.deepEqual(
      sortGalleryEntries(checked, 'play-match-desc').map(item => item.id),
      ['best', 'ok', 'face', 'miss', 'unchecked']
    );
  });

  it('re-renders a card when its checks land', () => {
    assert.notEqual(
      galleryEntryRenderKey(entry()),
      galleryEntryRenderKey(entry({ playChecks: { pose: 0.5, at: 1 } }))
    );
  });

  it('keeps the missed filter and best-match sort in the URL', () => {
    const params = new URLSearchParams();
    applyGalleryUrlState(params, {
      filter: { playCheckMissOnly: true, characterId: 'rin' },
      sort: 'play-match-desc',
      projectFilterId: '',
      page: 1,
    });
    const parsed = parseGalleryUrlState(params);
    assert.equal(parsed.filter.playCheckMissOnly, true);
    assert.equal(parsed.filter.characterId, 'rin');
    assert.equal(parsed.sort, 'play-match-desc');
  });
});

describe('use a still pose for a slot or beat', () => {
  const pose: PhotoPose = { aspect: 0.75, people: [[{ x: 0.5, y: 0.2 }]] };

  it('sets the slot pose and clears the picked layout', () => {
    const slots: DaySlot[] = [
      { id: 'morning', label: 'Morning', poseLayout: 'cook', poseVariant: 2 },
      { id: 'night', label: 'Night' },
    ];
    const next = withDaySlotPose(slots, 'morning', pose);
    assert.deepEqual(next[0]?.posePhoto, pose);
    assert.equal(next[0]?.poseLayout, undefined);
    assert.equal(next[0]?.poseVariant, undefined);
    assert.equal(next[1], slots[1]);
  });

  it('targets one beat by id and roll time', () => {
    const story = [
      { id: 'b', at: 1, title: 'First' },
      { id: 'b', at: 2, title: 'Rerolled' },
    ] as RoleplayStoryBeat[];
    const next = withStoryBeatPose(story, storyBeatKey(story[1]!), pose);
    assert.equal(next[0]?.posePhoto, undefined);
    assert.deepEqual(next[1]?.posePhoto, pose);
  });
});
