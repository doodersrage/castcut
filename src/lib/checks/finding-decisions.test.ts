import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from '../storage/browser-storage';
import { mergeRecordList, recordListSpec } from '../storage/record-list-sync';
import {
  decideFinding,
  findingDecisionMap,
  loadFindingDecisions,
  normalizeFindingDecision,
  replaceFindingDecisions,
  undecideFinding,
} from './finding-decisions';
import { findingsForGalleryEntry, isFindingDismissed } from './findings';

function installWindow() {
  const storage = new Map<string, string>();
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
      get length() {
        return storage.size;
      },
      key: (index: number) => [...storage.keys()][index] ?? null,
    },
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  return () => {
    (globalThis as { window?: unknown }).window = original;
  };
}

describe('decisions about continuity findings (M2 C2)', () => {
  let restore: () => void = () => {};
  beforeEach(() => {
    restore = installWindow();
    resetBrowserStorageCache();
  });
  afterEach(() => {
    resetBrowserStorageCache();
    restore();
  });

  it('keeps one decision per finding, newest first, and can take it back', () => {
    const [finding] = findingsForGalleryEntry({ promptId: 'p1', playChecks: { faceMiss: true, at: 1 } });
    decideFinding(finding!.id, 'accepted', 'her jaw is wrong', 10);
    decideFinding('p2:pose-miss', 'dismissed', undefined, 20);
    decideFinding(finding!.id, 'dismissed', 'fine at this size', 30);
    const all = loadFindingDecisions();
    assert.deepEqual(
      all.map(d => [d.id, d.decision]),
      [
        ['p1:face-miss', 'dismissed'],
        ['p2:pose-miss', 'dismissed'],
      ]
    );
    assert.equal(all[0]!.note, 'fine at this size');
    const map = findingDecisionMap(all);
    assert.equal(isFindingDismissed(map, 'p1', 'face-miss'), true);
    assert.equal(isFindingDismissed(map, 'p1', 'pose-miss'), false);
    undecideFinding('p1:face-miss');
    assert.deepEqual(
      loadFindingDecisions().map(d => d.id),
      ['p2:pose-miss']
    );
  });

  it('reads a synced copy, dropping what is not a decision', () => {
    replaceFindingDecisions([
      { id: 'a:clip-cuts', decision: 'dismissed', at: 1 },
      { id: 'b:clip-cuts', decision: 'maybe', at: 1 },
      { decision: 'accepted', at: 1 },
      'junk',
    ]);
    assert.deepEqual(
      loadFindingDecisions().map(d => d.id),
      ['a:clip-cuts']
    );
    assert.equal(normalizeFindingDecision({ id: ' x ', decision: 'accepted', note: '  ' })?.note, undefined);
  });

  it('merges across devices per finding: the newer decision wins, a taken-back one stays gone', () => {
    const spec = recordListSpec('continuityDecisions');
    const desk = [
      { id: 'p1:face-miss', decision: 'dismissed', at: 1, updatedAt: 10 },
      { id: 'p3:pose-miss', decision: 'accepted', at: 1, updatedAt: 5 },
    ];
    const phone = [
      { id: 'p1:face-miss', decision: 'accepted', at: 1, updatedAt: 20 },
      { id: 'p9:clip-silent', decision: 'dismissed', at: 1, updatedAt: 7 },
    ];
    const merged = mergeRecordList(spec, phone, desk, { 'p3:pose-miss': 8 });
    assert.deepEqual(
      merged.map(d => [d.id, d.decision]).sort(),
      [
        ['p1:face-miss', 'accepted'],
        ['p9:clip-silent', 'dismissed'],
      ]
    );
  });
});
