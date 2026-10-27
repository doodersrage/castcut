import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeSceneScriptStores,
  normalizeSceneScriptStore,
  sceneScriptChanges,
  scriptsCacheOf,
  withScriptsPatch,
  withServerAnswer,
} from './scene-script-store';
import { removeScriptPatch, renameScriptPatch } from './scene-scripts';

const script = (id: string, updatedAt: number, name = 'Draft') => ({
  id,
  castId: 'cast-mara',
  name,
  source: 'INT. KITCHEN - DAY\n\nMara pours coffee.\n',
  createdAt: 1,
  updatedAt,
});
const store = (scripts: ReturnType<typeof script>[], removedAt: Record<string, number> = {}) =>
  normalizeSceneScriptStore({ scripts, removedAt });

describe('the script store (M6 V6)', () => {
  it('merges two copies script by script, the newer of each', () => {
    const merged = mergeSceneScriptStores(
      store([script('a', 10, 'Old'), script('b', 5)]),
      store([script('a', 20, 'New'), script('c', 7)])
    );
    assert.deepEqual(
      merged.scripts.map(entry => [entry.id, entry.name]).sort(),
      [
        ['a', 'New'],
        ['b', 'Draft'],
        ['c', 'Draft'],
      ]
    );
  });

  it('a deletion wins over copies made before it; a later copy brings it back', () => {
    const deleted = mergeSceneScriptStores(store([script('a', 10)]), store([], { a: 15 }));
    assert.deepEqual(deleted, { scripts: [], removedAt: { a: 15 } });
    const back = mergeSceneScriptStores(deleted, store([script('a', 20, 'Again')]));
    assert.deepEqual(back.scripts.map(entry => entry.name), ['Again']);
    assert.deepEqual(back.removedAt, {});
  });

  it('a Script-section patch applies as it did on the settings, and sends only what it touched', () => {
    const before = store([script('a', 10), script('b', 10)]);
    const renamed = withScriptsPatch(before, renameScriptPatch(scriptsCacheOf(before), 'a', 'Act one', 30)!);
    assert.deepEqual(
      sceneScriptChanges(before, renamed).put.map(entry => [entry.id, entry.name]),
      [['a', 'Act one']]
    );
    assert.deepEqual(sceneScriptChanges(before, renamed).remove, []);
    const removed = withScriptsPatch(renamed, removeScriptPatch(scriptsCacheOf(renamed), 'b', 40));
    assert.deepEqual(sceneScriptChanges(renamed, removed), { put: [], remove: [{ id: 'b', at: 40 }] });
    assert.deepEqual(removed.scripts.map(entry => entry.id), ['a']);
  });

  it('takes the server’s answer to a save: its newer copy, or its deletion', () => {
    const local = store([script('a', 10, 'Mine')]);
    assert.deepEqual(
      withServerAnswer(local, 'a', { script: script('a', 20, 'Theirs') }).scripts.map(e => e.name),
      ['Theirs']
    );
    assert.deepEqual(withServerAnswer(local, 'a', { removedAt: 15 }), { scripts: [], removedAt: { a: 15 } });
    assert.equal(withServerAnswer(local, 'a', null), local);
  });

  it('reads a stored copy defensively', () => {
    assert.deepEqual(normalizeSceneScriptStore(null), { scripts: [], removedAt: {} });
    assert.deepEqual(
      normalizeSceneScriptStore({ scripts: [{ id: 'x' }], removedAt: { a: 'no', b: 3 } }),
      { scripts: [], removedAt: { b: 3 } }
    );
  });
});
