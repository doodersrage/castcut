import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  galleryEntryIsPosedTryOn,
  keeperStandInEntry,
  keeperStandInDayLine,
  keeperStandInLine,
  keeperStandInStatus,
  latestKeeperEntry,
} from '@/lib/fitting/keeper-stand-in';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery-entry';

function entry(id: string, patch: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id,
    promptId: `prompt-${id}`,
    prompt: 'Dress the person in Image 1 in the outfit.',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: 1,
    images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }],
    ...patch,
  };
}

const POSED_PROMPT =
  'POSE FIRST: she is sitting on a chair, exactly as the pose map in Image 3 shows.\nDress her.\nPOSE: Image 3 is a pose map (a skeleton, not a person) — the body takes exactly that stance.';

const pictureOf = (item: ComfyGalleryEntry) => `/view/${item.id}.png`;

describe('galleryEntryIsPosedTryOn', () => {
  it('reads the custom-pose lines of the try-on, or of the try-on a pass was made from', () => {
    const posed = entry('posed', { prompt: POSED_PROMPT });
    const feet = entry('feet', { prompt: 'Put the shoes on.', parentGalleryEntryId: 'posed' });
    const plain = entry('plain');
    assert.equal(galleryEntryIsPosedTryOn(posed, [posed]), true);
    assert.equal(galleryEntryIsPosedTryOn(feet, [posed, feet]), true);
    assert.equal(galleryEntryIsPosedTryOn(plain, [plain]), false);
    assert.equal(galleryEntryIsPosedTryOn(null, []), false);
  });
});

describe('keeperStandInEntry', () => {
  it('finds the landed stand-in by its entry, else its job — only once completed', () => {
    const landed = entry('stand');
    assert.equal(keeperStandInEntry({ promptId: 'prompt-stand', at: 1 }, [landed]), landed);
    assert.equal(keeperStandInEntry({ entryId: 'stand', at: 1 }, [landed]), landed);
    assert.equal(
      keeperStandInEntry({ promptId: 'prompt-stand', at: 1 }, [
        { ...landed, status: 'running' },
      ]),
      null
    );
    assert.equal(keeperStandInEntry(undefined, [landed]), null);
  });
});

describe('keeperStandInStatus', () => {
  const posed = entry('keep', { prompt: POSED_PROMPT });

  it('offers a standing picture for a posed Keep that has none; none for a standing Keep', () => {
    assert.equal(
      keeperStandInStatus({ look: { keeperEntryIds: ['keep'] }, gallery: [posed], pictureOf })
        ?.state,
      'offer'
    );
    const plain = entry('plain');
    assert.equal(
      keeperStandInStatus({ look: { keeperEntryIds: ['plain'] }, gallery: [plain], pictureOf })
        ?.state,
      'not-needed'
    );
    assert.equal(keeperStandInStatus({ look: { keeperEntryIds: [] }, gallery: [], pictureOf }), null);
  });

  it('follows the job: rendering, ready with its picture, failed', () => {
    const look = {
      keeperEntryIds: ['keep'],
      keeperStandIns: { keep: { promptId: 'prompt-stand', at: 1 } },
    };
    const running = entry('stand', { status: 'running' });
    assert.equal(
      keeperStandInStatus({ look, gallery: [posed, running], pictureOf })?.state,
      'rendering'
    );
    const ready = keeperStandInStatus({ look, gallery: [posed, entry('stand')], pictureOf });
    assert.equal(ready?.state, 'ready');
    assert.equal(ready?.imageUrl, '/view/stand.png');
    assert.equal(
      keeperStandInStatus({
        look,
        gallery: [posed, entry('stand', { status: 'error' })],
        pictureOf,
      })?.state,
      'failed'
    );
    assert.equal(
      keeperStandInStatus({
        look: { ...look, keeperStandIns: { keep: { at: 1, failed: true } } },
        gallery: [posed],
        pictureOf,
      })?.state,
      'failed'
    );
  });

  it('looks at the newest Keep in the gallery', () => {
    const older = entry('older');
    assert.equal(
      latestKeeperEntry({ keeperEntryIds: ['older', 'keep', 'gone'] }, [older, posed])?.id,
      'keep'
    );
  });
});

describe('keeperStandInLine', () => {
  it('says something for every state but not-needed', () => {
    assert.equal(keeperStandInLine('not-needed'), null);
    assert.equal(keeperStandInLine(null), null);
    for (const state of ['offer', 'rendering', 'ready', 'failed'] as const) {
      assert.ok(keeperStandInLine(state));
    }
  });
});

describe('keeperStandInDayLine', () => {
  it('says something short on Day for every state but not-needed', () => {
    assert.equal(keeperStandInDayLine('not-needed'), null);
    assert.equal(keeperStandInDayLine(undefined), null);
    for (const state of ['offer', 'rendering', 'ready', 'failed'] as const) {
      const line = keeperStandInDayLine(state);
      assert.ok(line && line.length <= 100, `${state}: ${line}`);
      assert.doesNotMatch(line, /Story/);
    }
  });
});
