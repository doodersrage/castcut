import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveGalleryDisplaySource } from './useGalleryDisplayPlan';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';

function entry(id: string, patch: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id,
    prompt: id,
    negativePrompt: '',
    status: 'completed',
    images: [],
    queuedAt: 1,
    ...patch,
  } as ComfyGalleryEntry;
}

describe('resolveGalleryDisplaySource', () => {
  const all = [entry('a', { favorite: true }), entry('b'), entry('c')];
  const filtered = [entry('b'), entry('c')];

  it('uses unfiltered entries when filters chrome is off', () => {
    assert.deepEqual(
      resolveGalleryDisplaySource({
        showFilters: false,
        filter: {},
        filteredEntries: filtered,
        entries: all,
      }).map(e => e.id),
      ['a', 'b', 'c']
    );
  });

  it('honors atRiskOnly even when filters chrome is off (Settings Data compact)', () => {
    assert.deepEqual(
      resolveGalleryDisplaySource({
        showFilters: false,
        filter: { atRiskOnly: true },
        filteredEntries: filtered,
        entries: all,
      }).map(e => e.id),
      ['b', 'c']
    );
  });

  it('uses filtered entries when filters chrome is on', () => {
    assert.deepEqual(
      resolveGalleryDisplaySource({
        showFilters: true,
        filter: {},
        filteredEntries: filtered,
        entries: all,
      }).map(e => e.id),
      ['b', 'c']
    );
  });
});
