import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

type Preset = {
  id: string;
  label: string;
  hints: string;
  category?: string;
  model?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  publishedBy?: string;
};

let presets: Preset[] = [];
const loadSharedPresets = mock.fn(() => presets);
const saveSharedPresets = mock.fn((next: Preset[]) => {
  presets = next;
});
mock.module('@/lib/sqlite/tables', { namedExports: { loadSharedPresets, saveSharedPresets } });

afterEach(() => {
  presets = [];
  loadSharedPresets.mock.resetCalls();
  saveSharedPresets.mock.resetCalls();
});

describe('shared-preset-store', async () => {
  const { listSharedPresets, upsertSharedPreset, deleteSharedPreset } = await import(
    './shared-preset-store'
  );

  describe('listSharedPresets', () => {
    it('sorts presets by label alphabetically', () => {
      presets = [
        { id: '2', label: 'Zebra', hints: '', createdAt: 1, updatedAt: 1 },
        { id: '1', label: 'Apple', hints: '', createdAt: 1, updatedAt: 1 },
        { id: '3', label: 'mango', hints: '', createdAt: 1, updatedAt: 1 },
      ];
      const result = listSharedPresets();
      assert.deepEqual(
        result.map(p => p.id),
        ['1', '3', '2']
      );
    });

    it('returns an empty array when there are no presets', () => {
      presets = [];
      assert.deepEqual(listSharedPresets(), []);
    });
  });

  describe('upsertSharedPreset', () => {
    it('creates a new preset with a generated id when no id or matching label is given', () => {
      presets = [];
      const created = upsertSharedPreset({ label: '  My Preset  ', hints: '  a hint  ' });
      assert.match(created.id, /^shared-\d+$/);
      assert.equal(created.label, 'My Preset');
      assert.equal(created.hints, 'a hint');
      assert.equal(created.createdAt, created.updatedAt);
      assert.equal(saveSharedPresets.mock.calls.length, 1);
      const saved = saveSharedPresets.mock.calls[0]!.arguments[0] as Preset[];
      assert.equal(saved[0]!.id, created.id);
    });

    it('updates an existing preset by id, preserving createdAt', () => {
      presets = [
        { id: 'p1', label: 'Old', hints: 'h', createdAt: 100, updatedAt: 100 },
      ];
      const updated = upsertSharedPreset({ id: 'p1', label: 'New', hints: 'h2' });
      assert.equal(updated.id, 'p1');
      assert.equal(updated.label, 'New');
      assert.equal(updated.createdAt, 100);
      assert.ok(updated.updatedAt >= 100);
      assert.equal(presets.length, 1);
      assert.equal(presets[0]!.label, 'New');
    });

    it('matches an existing preset by case-insensitive trimmed label when no id is given, replacing it in place', () => {
      presets = [
        { id: 'p1', label: 'Cinematic', hints: 'h', createdAt: 50, updatedAt: 50 },
      ];
      const updated = upsertSharedPreset({ label: '  cinematic  ', hints: 'h2' });
      // Real behavior: a label-only match still generates a NEW id (only an explicit `id` input
      // is reused) — but createdAt IS carried over from the matched entry, and the match is
      // replaced in place rather than appended.
      assert.notEqual(updated.id, 'p1');
      assert.match(updated.id, /^shared-\d+$/);
      assert.equal(updated.createdAt, 50);
      assert.equal(presets.length, 1);
      assert.equal(presets[0]!.id, updated.id);
    });

    it('drops blank optional fields (category/model/notes) to undefined', () => {
      const result = upsertSharedPreset({ label: 'x', hints: 'h', category: '   ', model: '' });
      assert.equal(result.category, undefined);
      assert.equal(result.model, undefined);
      assert.equal(result.notes, undefined);
    });

    it('preserves non-blank optional fields, trimmed', () => {
      const result = upsertSharedPreset({
        label: 'x',
        hints: 'h',
        category: ' portrait ',
        model: ' sdxl ',
        notes: ' n ',
        publishedBy: 'alice',
      });
      assert.equal(result.category, 'portrait');
      assert.equal(result.model, 'sdxl');
      assert.equal(result.notes, 'n');
      assert.equal(result.publishedBy, 'alice');
    });

    it('inserts a new preset at the front of the list', () => {
      presets = [{ id: 'p1', label: 'Existing', hints: 'h', createdAt: 1, updatedAt: 1 }];
      const created = upsertSharedPreset({ label: 'New One', hints: 'h' });
      assert.equal(presets[0]!.id, created.id);
      assert.equal(presets[1]!.id, 'p1');
    });
  });

  describe('deleteSharedPreset', () => {
    it('removes the preset with the matching id and saves the rest', () => {
      presets = [
        { id: 'p1', label: 'A', hints: '', createdAt: 1, updatedAt: 1 },
        { id: 'p2', label: 'B', hints: '', createdAt: 1, updatedAt: 1 },
      ];
      deleteSharedPreset('p1');
      assert.equal(saveSharedPresets.mock.calls.length, 1);
      const saved = saveSharedPresets.mock.calls[0]!.arguments[0] as Preset[];
      assert.deepEqual(
        saved.map(p => p.id),
        ['p2']
      );
    });

    it('is a no-op (still saves the unchanged list) when the id is not found', () => {
      presets = [{ id: 'p1', label: 'A', hints: '', createdAt: 1, updatedAt: 1 }];
      deleteSharedPreset('missing');
      const saved = saveSharedPresets.mock.calls[0]!.arguments[0] as Preset[];
      assert.equal(saved.length, 1);
    });
  });
});
