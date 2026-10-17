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
