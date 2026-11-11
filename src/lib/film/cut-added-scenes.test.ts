import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScene, type SavedScene } from '../day/scenes';
import { cutAddedSceneList, cutOrderWithAfter, normalizeCutAddedScenes, cutAddedScenesFor, cutAddedScenesTagged } from './cut-added-scenes';

const scene = (id: string, scriptId: string, sceneId: string, shotId: string, at: number): SavedScene =>
  createScene({ castId: 'mara', name: id, id, fromScript: { scriptId, sceneId, shotId }, now: at });

describe('a cut with scenes from another script (Step 5e)', () => {
  const scenes = [
    scene('ep-1', 'episode', 'int-cafe-day', 'a', 1),
    scene('ep-2', 'episode', 'ext-pier-night', 'b', 2),
    scene('sh-2', 'short', 'int-kitchen-morning', 'k2', 4),
    scene('sh-1', 'short', 'int-kitchen-morning', 'k1', 3),
    scene('sh-3', 'short', 'ext-beach-day', 'b1', 5),
  ];
  const scripts = [
    { id: 'episode', shots: [{ madeSceneId: 'ep-1' }, { madeSceneId: 'ep-2' }] },
    { id: 'short', shots: [{ madeSceneId: 'sh-1' }, { madeSceneId: 'sh-2' }, { madeSceneId: 'sh-3' }] },
  ];

  it('reads back every Scene of the added script scene, in its script’s order', () => {
    // Added by one of its Scenes: its other shot comes too, the beach doesn't.
    const list = cutAddedSceneList({ added: [{ scriptId: 'short', sceneIds: ['sh-2'] }], scenes, scripts, ownScriptId: 'episode' });
    assert.deepEqual(list.map(entry => entry.id), ['sh-1', 'sh-2']);
  });

  it('follows the scene when its heading changed (its Scenes moved with it)', () => {
    const moved = scenes.map(entry =>
      entry.fromScript?.sceneId === 'int-kitchen-morning'
        ? { ...entry, fromScript: { ...entry.fromScript, sceneId: 'int-kitchen-day' } }
        : entry
    );
    const list = cutAddedSceneList({ added: [{ scriptId: 'short', sceneIds: ['sh-1'] }], scenes: moved, scripts });
    assert.deepEqual(list.map(entry => entry.id), ['sh-1', 'sh-2']);
  });

  it('gives nothing for the cut’s own script, a script gone or Scenes gone', () => {
    assert.deepEqual(cutAddedSceneList({ added: [{ scriptId: 'episode', sceneIds: ['ep-1'] }], scenes, scripts, ownScriptId: 'episode' }), []);
    assert.deepEqual(cutAddedSceneList({ added: [{ scriptId: 'gone', sceneIds: ['x'] }], scenes, scripts }), []);
    assert.deepEqual(cutAddedSceneList({ added: [{ scriptId: 'short', sceneIds: ['deleted'] }], scenes, scripts }), []);
  });

  it('places the new shots after the one chosen, the rest as shown', () => {
    assert.deepEqual(cutOrderWithAfter(['a', 'b', 'c'], ['x', 'y'], 'a'), ['a', 'x', 'y', 'b', 'c']);
    assert.deepEqual(cutOrderWithAfter(['a', 'b', 'c'], ['x'], null), ['x', 'a', 'b', 'c']);
    // Already in the list (placed before): moved, not doubled.
    assert.deepEqual(cutOrderWithAfter(['x', 'a', 'b'], ['x'], 'b'), ['a', 'b', 'x']);
    // After a shot gone since: at the end.
    assert.deepEqual(cutOrderWithAfter(['a', 'b'], ['x'], 'gone'), ['a', 'b', 'x']);
  });

  it('reads stored added scenes back, dropping what it can’t read', () => {
    assert.deepEqual(
      normalizeCutAddedScenes([
        { scriptId: 'short', sceneIds: ['sh-1', 5, ''] },
        { scriptId: 'short', sceneIds: ['sh-1'] },
        { scriptId: '', sceneIds: ['x'] },
        { scriptId: 'other', sceneIds: [] },
        'junk',
      ]),
      [{ scriptId: 'short', sceneIds: ['sh-1'] }]
    );
    assert.deepEqual(normalizeCutAddedScenes(undefined), []);
  });
});

describe('added scenes belong to the cut they were added to (2026-11-10)', () => {
  it('reads, keeps and shows them per cut; tags older ones with the cut they were in', () => {
    const added = normalizeCutAddedScenes([
      { scriptId: 'short-a', sceneIds: ['a1'], toScriptId: 'episode' },
      { scriptId: 'short-a', sceneIds: ['a1'], toScriptId: 'other-episode' },
      { scriptId: 'short-b', sceneIds: ['b1'] },
    ]);
    assert.equal(added.length, 3);
    assert.deepEqual(cutAddedScenesFor(added, 'episode').map(entry => entry.toScriptId ?? '-'), ['episode', '-']);
    // A short sent to Cut: not the episodes' added scenes.
    assert.deepEqual(cutAddedScenesFor(added, 'short-c').map(entry => entry.scriptId), ['short-b']);
    const tagged = cutAddedScenesTagged(added, 'episode');
    assert.deepEqual(cutAddedScenesFor(tagged, 'short-c'), []);
    assert.deepEqual(cutAddedScenesFor(tagged, 'episode').map(entry => entry.scriptId), ['short-a', 'short-b']);
    assert.deepEqual(cutAddedScenesTagged(added, undefined), added);
  });
});
