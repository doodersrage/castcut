import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeSettingsCache, mergeStartupServerSettings } from './merge';
import { withMergedSettingsRecords, withMergedToolRecords } from './tool-record-merge';

const take = (id: string, at = 1) => ({ id, promptId: id, imageUrl: `/api/gallery/media/${id}`, at });
const scene = (id: string, updatedAt: number, takes: ReturnType<typeof take>[] = [], extra = {}) => ({
  id,
  castId: 'nora',
  name: id,
  slot: { id: 'evening', label: 'Evening' },
  takes,
  createdAt: 1,
  updatedAt,
  ...extra,
});
const ids = (tools: unknown) =>
  ((tools as { scene?: { scenes?: Array<{ id: string }> } }).scene?.scenes ?? []).map(s => s.id);

describe('record lists inside tool settings (R6)', () => {
  it("keeps both devices' new scenes", () => {
    const desk = { scene: { scenes: [scene('a', 10), scene('desk-new', 20)], activeSceneId: 'a' } };
    const phone = { scene: { scenes: [scene('a', 10), scene('phone-new', 30)], activeSceneId: 'phone-new' } };
    const merged = withMergedToolRecords(desk, phone);
    assert.deepEqual(ids(merged), ['a', 'desk-new', 'phone-new']);
    assert.equal(merged.scene.activeSceneId, 'a', "the open scene is this device's");
  });

  it("one scene edited on both: the newer wins, with the other's new takes", () => {
    const older = { scene: { scenes: [scene('a', 10, [take('t1'), take('phone-take', 2)], { name: 'Old name' })] } };
    const newer = {
      scene: { scenes: [scene('a', 20, [take('t1'), take('desk-take', 3)], { name: 'New name', keptTakeId: 'desk-take' })] },
    };
    const merged = withMergedToolRecords(older, newer).scene.scenes[0] as ReturnType<typeof scene> & {
      keptTakeId?: string;
    };
    assert.equal(merged.name, 'New name');
    assert.equal(merged.keptTakeId, 'desk-take');
    assert.deepEqual(
      merged.takes.map(t => t.id),
      ['t1', 'desk-take', 'phone-take']
    );
  });

  it('a take removed on one device is not brought back by the other', () => {
    const removedHere = {
      scene: { scenes: [scene('a', 20, [take('t1')], { removedTakeIds: ['t2'] })] },
    };
    const stillThere = { scene: { scenes: [scene('a', 10, [take('t1'), take('t2')])] } };
    for (const [first, second] of [
      [removedHere, stillThere],
      [stillThere, removedHere],
    ] as const) {
      const merged = withMergedToolRecords(first, second).scene.scenes[0] as {
        takes: Array<{ id: string }>;
        removedTakeIds?: string[];
      };
      assert.deepEqual(
        merged.takes.map(t => t.id),
        ['t1']
      );
      assert.deepEqual(merged.removedTakeIds, ['t2']);
    }
  });

  it('a deleted scene stays deleted, unless it was saved after the deletion', () => {
    const deletedHere = { scene: { scenes: [scene('keep', 5)], removedSceneAt: { gone: 50, back: 50 } } };
    const other = { scene: { scenes: [scene('keep', 5), scene('gone', 40), scene('back', 60)] } };
    const merged = withMergedToolRecords(other, deletedHere);
    assert.deepEqual(ids(merged), ['keep', 'back']);
    assert.deepEqual((merged.scene as { removedSceneAt?: unknown }).removedSceneAt, { gone: 50, back: 50 });
  });

  it('leaves other tools, and tools with no such list, as they are', () => {
    const day = { slots: [{ id: 'morning' }] };
    const primary = { day, cut: { extras: [] } };
    assert.equal(withMergedToolRecords(primary, { day: { slots: [] } }), primary);
    const merged = withMergedToolRecords(primary, { scene: { scenes: [scene('a', 1)] } });
    assert.equal(merged.day, day);
    assert.deepEqual(ids(merged), ['a']);
    assert.equal(withMergedToolRecords(undefined, { scene: {} }), undefined);
  });

  it("the startup pull keeps the server's scenes from another device (the push no longer drops them)", () => {
    const before = { shared: {}, tools: { scene: { scenes: [scene('a', 10)] } } };
    const server = { shared: {}, tools: { scene: { scenes: [scene('a', 10), scene('other-device', 30)] } } };
    const merged = mergeStartupServerSettings(before, before, server);
    assert.deepEqual(ids(merged.tools), ['a', 'other-device']);

    const local = { updatedAt: 100, shared: {}, tools: { scene: { scenes: [scene('a', 10), scene('mine', 90)] } } };
    const viaMerge = mergeSettingsCache(local, { ...server, updatedAt: 50 });
    assert.deepEqual(ids(viaMerge.tools), ['a', 'mine', 'other-device']);
  });

  it("a push to the server keeps the scenes the server has from another device", () => {
    const stored = { shared: {}, tools: { scene: { scenes: [scene('phone-new', 30)] } } };
    const push = { updatedAt: 99, shared: { x: 1 }, tools: { scene: { scenes: [scene('desk-new', 40)] } } };
    const saved = withMergedSettingsRecords(push, stored);
    assert.deepEqual(ids(saved.tools), ['desk-new', 'phone-new']);
    assert.deepEqual(saved.shared, { x: 1 });
    assert.equal(withMergedSettingsRecords(push, null), push, 'nothing stored yet');
  });
});
