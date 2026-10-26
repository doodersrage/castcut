import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
// The script is plain .mjs outside the TypeScript project: loaded by path, typed here.
const SCRIPT = '../../../scripts/upgrade-check.mjs';
type Counts = Record<string, number>;
type Script = {
  countProduction: (data: Record<string, unknown>) => Counts;
  compareReports: (
    before: { counts: Counts },
    after: { counts: Counts }
  ) => Array<{ key: string; before: number; after: number }>;
};
let countProduction: Script['countProduction'];
let compareReports: Script['compareReports'];
before(async () => {
  ({ countProduction, compareReports } = (await import(SCRIPT)) as Script);
});

describe('upgrade check (M6 V1)', () => {
  const data = {
    settings: {
      tools: {
        scene: {
          scenes: [
            { id: 'a', takes: [{ id: 't1' }, { id: 't2' }], keptTakeId: 't1' },
            { id: 'b', takes: [] },
          ],
          scripts: [{ id: 's', shots: [{ id: 'x' }, { id: 'y' }] }],
          run: { id: 'r' },
        },
        cut: {
          versions: [{ id: 'v' }],
          extras: [{ key: 'x:1' }],
          options: { shotEdits: { shots: { 'scenes:a': {}, 'day:m': {} } } },
        },
        day: { slots: [{ id: 'morning' }], stills: [{ slotId: 'morning' }] },
      },
    },
    gallery: [
      { status: 'completed', durableOriginalPath: 'gallery-media/_global/e/original' },
      { status: 'completed', derivedKind: 'film' },
      { status: 'error' },
    ],
    extras: { characters: [{ id: 'nora', looks: [{}, {}] }] },
    history: [{}, {}, {}],
    deletedIds: ['gone'],
  };

  it('counts what the server holds, and survives missing parts', () => {
    assert.deepEqual(countProduction(data), {
      casts: 1,
      looks: 2,
      scenes: 2,
      takes: 2,
      keptTakes: 1,
      scripts: 1,
      plannedShots: 2,
      sceneRun: 1,
      cutVersions: 1,
      cutAddedShots: 1,
      cutShotEdits: 2,
      daySlots: 1,
      dayStills: 1,
      galleryEntries: 3,
      galleryCompleted: 2,
      galleryFilms: 1,
      galleryKeptCopies: 1,
      galleryDeletedIds: 1,
      historyEntries: 3,
    });
    const empty = countProduction({ settings: null, gallery: null, extras: null, history: null, deletedIds: null });
    assert.equal(Object.values(empty).every(value => value === 0), true);
    assert.equal(countProduction({ ...data, gallery: { entries: data.gallery } }).galleryEntries, 3);
  });

  it('flags any count that went down, and nothing that grew or held', () => {
    const before = { counts: countProduction(data) };
    const more = { counts: { ...before.counts, takes: 5, galleryEntries: 4 } };
    assert.deepEqual(compareReports(before, more), []);
    const less = { counts: { ...before.counts, keptTakes: 0, cutVersions: 0 } };
    assert.deepEqual(compareReports(before, less), [
      { key: 'keptTakes', before: 1, after: 0 },
      { key: 'cutVersions', before: 1, after: 0 },
    ]);
  });
});
