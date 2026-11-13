import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  migrateToolSchemas,
  migrateVersioned,
  registerToolSchema,
  storedSchemaVersion,
  type StoredSchema,
} from './tool-schema';
// Play's tools register their schemas as their settings module loads.
import '../play/settings';

describe('versioned stored shapes', () => {
  // Version 1 renamed `name` to `title`; version 2 added `tags`.
  const schema: StoredSchema = {
    migrations: [
      ({ name, ...rest }) => ({ ...rest, title: rest.title ?? name }),
      value => ({ ...value, tags: Array.isArray(value.tags) ? value.tags : [] }),
    ],
  };

  it('brings an unstamped copy (as releases before versions wrote it) up to the current version', () => {
    const old = { name: 'Morning', scenes: [1] };
    assert.deepEqual(migrateVersioned(old, schema), {
      scenes: [1],
      title: 'Morning',
      tags: [],
      schemaVersion: 2,
    });
    assert.deepEqual(old, { name: 'Morning', scenes: [1] }, 'the stored copy is not changed');
  });

  it('runs only the migrations after the copy’s version, in order', () => {
    const v1 = { title: 'Night', schemaVersion: 1 };
    assert.deepEqual(migrateVersioned(v1, schema), { title: 'Night', tags: [], schemaVersion: 2 });
  });

  it('leaves a current copy, and one a newer release wrote, exactly as it is', () => {
    const current = { title: 'x', tags: [], schemaVersion: 2 };
    assert.equal(migrateVersioned(current, schema), current);
    const newer = { heading: 'x', schemaVersion: 7 };
    assert.equal(migrateVersioned(newer, schema), newer);
  });

  it('reads a malformed stamp as unversioned, and passes anything not an object through', () => {
    assert.equal(storedSchemaVersion({ schemaVersion: '2' }), 0);
    assert.equal(storedSchemaVersion({ schemaVersion: 1.5 }), 0);
    assert.equal(storedSchemaVersion({ schemaVersion: -1 }), 0);
    assert.equal(storedSchemaVersion(null), 0);
    assert.equal(migrateVersioned(null, schema), null);
    assert.deepEqual(migrateVersioned(['a'], schema), ['a']);
    assert.equal(migrateVersioned({ name: 'y', schemaVersion: 'x' }, schema).schemaVersion, 2);
  });

  it('migrates each registered tool in the settings, and says when the load should save', () => {
    registerToolSchema('test-tool', schema);
    const tools = { 'test-tool': { name: 'a' }, other: { kept: true } };
    const out = migrateToolSchemas(tools);
    assert.equal(out.changed, true);
    assert.deepEqual(out.tools['test-tool'], { title: 'a', tags: [], schemaVersion: 2 });
    assert.equal(out.tools.other, tools.other);
    // Saved and loaded again: nothing to do.
    const again = migrateToolSchemas(out.tools);
    assert.equal(again.changed, false);
    assert.equal(again.tools, out.tools);
  });

  it('stamps Play’s production tools as 3.17 stores them, changing nothing else', () => {
    const scene = {
      scenes: [{ id: 's1', castId: 'mara', takes: [{ id: 't1' }] }],
      removedSceneAt: { s0: 5 },
      run: { state: 'done', items: ['s1'] },
    };
    const cut = { sources: ['scenes'], versions: [] };
    const day = { slots: [{ id: 'morning' }], shortLink: { scriptId: 'x', castId: 'mara' } };
    const roleplay = { story: { title: 't' } };
    const out = migrateToolSchemas({ scene, cut, day, roleplay, generate: { count: 4 } });
    assert.equal(out.changed, true);
    for (const [key, value] of Object.entries({ scene, cut, day, roleplay })) {
      assert.deepEqual(out.tools[key as 'scene'], { ...value, schemaVersion: 1 }, key);
    }
    assert.deepEqual(out.tools.generate, { count: 4 }, 'a tool with no schema is left alone');
    // A tool not stored yet stays absent (its defaults are current).
    assert.equal('scene' in migrateToolSchemas({ cut }).tools, false);
  });
});
