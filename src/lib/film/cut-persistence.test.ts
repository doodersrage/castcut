import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withMergedSettingsRecords, withMergedToolRecords } from '../storage/tool-record-merge';
import { restoreCutHistory, serializeCutHistory, CUT_HISTORY_MAX_CHARS } from './cut-history';
import {
  cutEditStamp,
  deleteCutVersionPatch,
  saveCutVersionsPatch,
  type CutVersion,
} from './cut-room';

const version = (id: string, name: string, savedAt: number): CutVersion => ({ id, name, savedAt });
const edit = (label: string) => ({ options: { label }, extras: [{ key: `x:${label}` }] });

describe('Cut persistence across devices (M4 F1)', () => {
  it('keeps both devices’ versions, and a deleted or replaced version stays gone', () => {
    let desk: Record<string, unknown> = { versions: [version('a', 'Long cut', 1)] };
    desk = { ...desk, ...saveCutVersionsPatch(desk, [version('b', 'Long cut', 5)], 6) };
    // Same name replaced: the old one is marked removed.
    assert.deepEqual(desk.removedVersionAt, { a: 6 });
    const phone = { versions: [version('a', 'Long cut', 1), version('c', 'Reel', 3)] };
    const merged = withMergedToolRecords({ cut: desk }, { cut: phone }).cut as {
      versions: CutVersion[];
    };
    assert.deepEqual(
      merged.versions.map(entry => entry.id),
      ['b', 'c']
    );
    const deleted = deleteCutVersionPatch({ versions: merged.versions }, 'c', 9);
    assert.deepEqual(deleted, { versions: [merged.versions[0]], removedVersionAt: { c: 9 } });
  });

  it('a later edit built on the stored one replaces it; nothing is kept twice', () => {
    const stored = { cut: { ...edit('one'), editedAt: 10, editBase: 5 } };
    const incoming = { cut: { ...edit('two'), editedAt: 20, editBase: 10 } };
    const merged = withMergedSettingsRecords({ tools: incoming }, { tools: stored }) as {
      tools: { cut: Record<string, unknown> };
    };
    assert.deepEqual(merged.tools.cut.options, { label: 'two' });
    assert.equal(merged.tools.cut.versions, undefined);
  });

  it('an edit another device made meanwhile is kept as a version, never lost', () => {
    // Both edited from 10: the phone at 15 (stored), the desk at 20 (pushed).
    const stored = { cut: { ...edit('phone'), editedAt: 15, editBase: 10 } };
    const incoming = { cut: { ...edit('desk'), editedAt: 20, editBase: 10 } };
    const merged = withMergedSettingsRecords({ tools: incoming }, { tools: stored }) as unknown as {
      tools: { cut: { options: unknown; versions: Array<Record<string, unknown>> } };
    };
    assert.deepEqual(merged.tools.cut.options, { label: 'desk' });
    assert.equal(merged.tools.cut.versions.length, 1);
    const kept = merged.tools.cut.versions[0]!;
    assert.equal(kept.id, 'sync-f');
    assert.equal(kept.savedAt, 15);
    assert.deepEqual(kept.options, { label: 'phone' });
    assert.match(String(kept.name), /^Edit from another device \(1970-01-01 00:00 UTC\)$/);
    // Merging again (the other way round, or twice) keeps one copy.
    const again = withMergedToolRecords(merged.tools, stored) as unknown as typeof merged.tools;
    assert.equal(again.cut.versions.length, 1);
  });

  it('a stale copy pushed later does not take back the newer edit', () => {
    // The desk's blob is newer (another tool changed) but its Cut is the old edit.
    const stored = { cut: { ...edit('new'), editedAt: 30, editBase: 20 } };
    const incoming = { cut: { ...edit('old'), editedAt: 20, editBase: 10 } };
    const merged = withMergedSettingsRecords({ tools: incoming }, { tools: stored }) as {
      tools: { cut: Record<string, unknown> };
    };
    assert.deepEqual(merged.tools.cut.options, { label: 'new' });
    assert.equal(merged.tools.cut.editedAt, 30);
    assert.equal(merged.tools.cut.versions, undefined, 'the old edit is in the new one');
  });

  it('stamps an edit after the one it was made on, even with a clock behind', () => {
    assert.deepEqual(cutEditStamp(undefined, 100), { editedAt: 100 });
    assert.deepEqual(cutEditStamp(100, 200), { editedAt: 200, editBase: 100 });
    assert.deepEqual(cutEditStamp(500, 200), { editedAt: 501, editBase: 500 });
  });
});

describe('Cut undo across a reload (M4 F1)', () => {
  it('comes back only for the edit it leads to', () => {
    const json = serializeCutHistory(edit('now'), { past: [edit('a'), edit('b')], future: [] });
    assert.deepEqual(restoreCutHistory(json, edit('now')), {
      past: [edit('a'), edit('b')],
      future: [],
    });
    assert.equal(restoreCutHistory(json, edit('changed elsewhere')), null);
    assert.equal(restoreCutHistory('not json', edit('now')), null);
  });

  it('keeps fewer steps rather than none when the history is large', () => {
    const big = (i: number) => ({ options: { label: String(i).padEnd(200_000, '.') } });
    const json = serializeCutHistory(big(99), {
      past: Array.from({ length: 30 }, (_, i) => big(i)),
      future: [],
    })!;
    assert.ok(json.length <= CUT_HISTORY_MAX_CHARS);
    const restored = restoreCutHistory(json, big(99))!;
    assert.ok(restored.past.length >= 1 && restored.past.length < 30);
    assert.equal((restored.past.at(-1)!.options as { label: string }).label.startsWith('29'), true);
  });
});
