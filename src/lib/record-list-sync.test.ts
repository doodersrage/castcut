import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeCastSync, mergeStoryLists, withMergedRecordLists } from './record-list-sync';

const c = (id: string, updatedAt: number, name = id) => ({ id, updatedAt, name });

describe('mergeCastSync', () => {
  it('keeps Cast made on either device', () => {
    const merged = mergeCastSync({ characters: [c('nora', 10)] }, { characters: [c('sam', 20)] });
    assert.deepEqual(
      merged.characters.map(x => x.id),
      ['sam', 'nora']
    );
  });

  it('the newest edit of a Cast member wins, from either side', () => {
    const server = { characters: [c('nora', 30, 'Nora (phone edit)')] };
    const local = { characters: [c('nora', 10, 'Nora (stale desktop)')] };
    assert.equal(mergeCastSync(server, local).characters[0].name, 'Nora (phone edit)');
    assert.equal(mergeCastSync(local, server).characters[0].name, 'Nora (phone edit)');
  });

  it('a deletion on one device removes the stale copy the other still has', () => {
    const merged = mergeCastSync(
      { characters: [c('nora', 10), c('sam', 10)] },
      {
        characters: [c('nora', 10)],
        characterRemovedIds: ['sam'],
        characterRemovedAt: { sam: 50 },
      }
    );
    assert.deepEqual(
      merged.characters.map(x => x.id),
      ['nora']
    );
    assert.deepEqual(merged.characterRemovedIds, ['sam']);
  });

  it('an id made again after its deletion comes back, and the deletion goes', () => {
    const merged = mergeCastSync(
      { characters: [], characterRemovedIds: ['sam'], characterRemovedAt: { sam: 50 } },
      { characters: [c('sam', 80)] }
    );
    assert.deepEqual(
      merged.characters.map(x => x.id),
      ['sam']
    );
    assert.deepEqual(merged.characterRemovedIds, []);
    assert.deepEqual(merged.characterRemovedAt, {});
  });

  it('an old deletion with no time still wins', () => {
    const merged = mergeCastSync(
      { characters: [c('sam', 999)] },
      { characters: [], characterRemovedIds: ['sam'] }
    );
    assert.equal(merged.characters.length, 0);
  });
});

describe('withMergedRecordLists', () => {
  it('merges the Cast and stories, leaves every other field as pushed', () => {
    const out = withMergedRecordLists(
      {
        appTheme: 'dark',
        characters: [c('nora', 10)],
        characterRemovedIds: [],
        roleplayLibrary: [{ id: 's1', updatedAt: 5 }],
      },
      {
        appTheme: 'light',
        characters: [c('sam', 20)],
        roleplayLibrary: [{ id: 's2', updatedAt: 7 }],
      } as never
    );
    assert.equal(out.appTheme, 'dark');
    assert.deepEqual(
      out.characters?.map(x => x.id),
      ['sam', 'nora']
    );
    assert.deepEqual(
      out.roleplayLibrary?.map(x => x.id),
      ['s2', 's1']
    );
  });

  it('a push with no Cast fields leaves the stored Cast alone', () => {
    const out = withMergedRecordLists({ appTheme: 'dark' } as Record<string, unknown>, {
      characters: [c('sam', 20)],
    });
    assert.deepEqual(
      (out as { characters?: { id: string }[] }).characters?.map(x => x.id),
      ['sam']
    );
  });

  it('stories: newest copy of each, null when neither side has any', () => {
    assert.equal(mergeStoryLists([], undefined), null);
    assert.deepEqual(mergeStoryLists([{ id: 'a', updatedAt: 1 }], [{ id: 'a', updatedAt: 9 }]), [
      { id: 'a', updatedAt: 9 },
    ]);
  });
});

describe('record lists (outfits, shoes, poses, packs, dress plates, workflows)', () => {
  it('saved outfits: union by id, newest edit wins, one per photo', async () => {
    const { withMergedRecordLists } = await import('./record-list-sync');
    const out = withMergedRecordLists(
      {
        fittingSavedGarments: [
          { id: 'a', imageFilename: 'dress.png', savedAt: 10, description: 'phone edit', updatedAt: 90 },
          { id: 'c', imageFilename: 'coat.png', savedAt: 30 },
        ],
      } as Record<string, unknown>,
      {
        fittingSavedGarments: [
          { id: 'a', imageFilename: 'dress.png', savedAt: 10, description: 'old' },
          { id: 'b', imageFilename: 'skirt.png', savedAt: 20 },
          { id: 'z', imageFilename: 'coat.png', savedAt: 5 },
        ],
      } as never
    ) as { fittingSavedGarments: { id: string; description?: string }[] };
    assert.deepEqual(
      out.fittingSavedGarments.map(e => e.id),
      ['a', 'c', 'b']
    );
    assert.equal(out.fittingSavedGarments[0].description, 'phone edit');
  });

  it('a deletion travels; an entry saved after its deletion stays', async () => {
    const { withMergedRecordLists } = await import('./record-list-sync');
    const out = withMergedRecordLists(
      { myPoses: [{ id: 'p1', savedAt: 10 }], recordTombstones: { myPoses: { p2: 50 } } } as Record<
        string,
        unknown
      >,
      {
        myPoses: [
          { id: 'p1', savedAt: 10 },
          { id: 'p2', savedAt: 20 },
          { id: 'p3', savedAt: 60 },
        ],
        recordTombstones: { myPoses: { p3: 40 } },
      } as never
    ) as { myPoses: { id: string }[]; recordTombstones: Record<string, Record<string, number>> };
    assert.deepEqual(
      out.myPoses.map(e => e.id),
      ['p3', 'p1']
    );
    assert.deepEqual(out.recordTombstones.myPoses, { p2: 50, p3: 40 });
  });

  it('dress plates merge by key; pose packs keep one per name', async () => {
    const { withMergedRecordLists } = await import('./record-list-sync');
    const out = withMergedRecordLists(
      {
        dressPlates: [{ key: 'k1', filename: 'new.png', at: 90 }],
        myPosePacks: [{ id: 'm2', name: 'Gym day', savedAt: 80 }],
      } as Record<string, unknown>,
      {
        dressPlates: [
          { key: 'k1', filename: 'old.png', at: 10 },
          { key: 'k2', filename: 'b.png', at: 20 },
        ],
        myPosePacks: [{ id: 'm1', name: 'gym day', savedAt: 10 }],
      } as never
    ) as {
      dressPlates: { key: string; filename: string }[];
      myPosePacks: { id: string }[];
    };
    assert.deepEqual(
      out.dressPlates.map(e => `${e.key}:${e.filename}`),
      ['k1:new.png', 'k2:b.png']
    );
    assert.deepEqual(
      out.myPosePacks.map(e => e.id),
      ['m2']
    );
  });

  it('workflow trash drops a file that is back in the library', async () => {
    const { withMergedRecordLists } = await import('./record-list-sync');
    const out = withMergedRecordLists(
      {
        comfyWorkflowFiles: [{ id: 'w1', createdAt: 1, updatedAt: 100 }],
        comfyWorkflowTrash: [],
      } as Record<string, unknown>,
      {
        comfyWorkflowFiles: [],
        comfyWorkflowTrash: [
          { file: { id: 'w1' }, deletedAt: 50 },
          { file: { id: 'w2' }, deletedAt: 60 },
        ],
      } as never
    ) as { comfyWorkflowTrash: { file: { id: string } }[] };
    assert.deepEqual(
      out.comfyWorkflowTrash.map(e => e.file.id),
      ['w2']
    );
  });

  it('stampListChanges stamps edits, keeps unchanged times, reports deletions', async () => {
    const { stampListChanges } = await import('./record-list-sync');
    const idOf = (e: Record<string, unknown>) => String(e.id);
    const prev = [
      { id: 'a', name: 'A', updatedAt: 5 },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ];
    const next = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B2' },
    ];
    const { entries, removed } = stampListChanges(prev, next, idOf, 1000);
    assert.deepEqual(entries, [
      { id: 'a', name: 'A', updatedAt: 5 },
      { id: 'b', name: 'B2', updatedAt: 1000 },
    ]);
    assert.deepEqual(removed, { c: 1000 });
  });
});
