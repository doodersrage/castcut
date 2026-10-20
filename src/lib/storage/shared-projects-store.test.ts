import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

type SharedProject = {
  id: string;
  name: string;
  groupIds: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
};

let projects: SharedProject[] = [];
const loadSharedProjects = mock.fn(() => projects);
const saveSharedProjects = mock.fn((next: SharedProject[]) => {
  projects = next;
});
mock.module('@/lib/sqlite/tables', { namedExports: { loadSharedProjects, saveSharedProjects } });

afterEach(() => {
  projects = [];
  loadSharedProjects.mock.resetCalls();
  saveSharedProjects.mock.resetCalls();
});

describe('shared-projects-store', async () => {
  const {
    listSharedProjects,
    listSharedProjectsForGroups,
    upsertSharedProject,
    deleteSharedProject,
  } = await import('./shared-projects-store');

  describe('listSharedProjects', () => {
    it('returns whatever loadSharedProjects returns', () => {
      projects = [{ id: 'p1', name: 'A', groupIds: [], createdAt: 1, updatedAt: 1 }];
      assert.deepEqual(listSharedProjects(), projects);
    });
  });

  describe('listSharedProjectsForGroups', () => {
    it('returns only projects intersecting the given group ids', () => {
      projects = [
        { id: 'p1', name: 'A', groupIds: ['g1'], createdAt: 1, updatedAt: 1 },
        { id: 'p2', name: 'B', groupIds: ['g2'], createdAt: 1, updatedAt: 1 },
        { id: 'p3', name: 'C', groupIds: ['g1', 'g3'], createdAt: 1, updatedAt: 1 },
      ];
      const result = listSharedProjectsForGroups(['g1']);
      assert.deepEqual(
        result.map(p => p.id),
        ['p1', 'p3']
      );
    });

    it('returns an empty array when no project matches any given group', () => {
      projects = [{ id: 'p1', name: 'A', groupIds: ['g1'], createdAt: 1, updatedAt: 1 }];
      assert.deepEqual(listSharedProjectsForGroups(['g9']), []);
    });
  });

  describe('upsertSharedProject', () => {
    it('creates a new project with a generated uuid id when no id is given', () => {
      projects = [];
      const created = upsertSharedProject({ name: '  My Project  ', groupIds: ['g1'] });
      assert.match(created.id, /^[0-9a-f-]{36}$/);
      assert.equal(created.name, 'My Project');
      assert.equal(created.createdAt, created.updatedAt);
      assert.equal(saveSharedProjects.mock.calls.length, 1);
      assert.equal(projects[0]!.id, created.id);
    });

    it('updates an existing project by id, preserving createdAt and createdBy', () => {
      projects = [
        {
          id: 'p1',
          name: 'Old',
          groupIds: ['g1'],
          createdAt: 100,
          updatedAt: 100,
          createdBy: 'alice',
        },
      ];
      const updated = upsertSharedProject({ id: 'p1', name: 'New', groupIds: ['g2'] });
      assert.equal(updated.id, 'p1');
      assert.equal(updated.name, 'New');
      assert.equal(updated.createdAt, 100);
      assert.equal(updated.createdBy, 'alice');
      assert.deepEqual(updated.groupIds, ['g2']);
      assert.equal(projects.length, 1);
    });

    it('does not label-match — an id-less upsert with no id always inserts a new project', () => {
      projects = [{ id: 'p1', name: 'Existing', groupIds: [], createdAt: 1, updatedAt: 1 }];
      const created = upsertSharedProject({ name: 'Existing', groupIds: [] });
      assert.notEqual(created.id, 'p1');
      assert.equal(projects.length, 2);
      assert.equal(projects[0]!.id, created.id);
    });

    it('drops a blank notes field to undefined and trims a non-blank one', () => {
      const blank = upsertSharedProject({ name: 'x', groupIds: [], notes: '   ' });
      assert.equal(blank.notes, undefined);
      const withNotes = upsertSharedProject({ name: 'x', groupIds: [], notes: ' hello ' });
      assert.equal(withNotes.notes, 'hello');
    });

    it('overrides createdBy with an explicit value even when updating an existing project', () => {
      projects = [
        { id: 'p1', name: 'Old', groupIds: [], createdAt: 1, updatedAt: 1, createdBy: 'alice' },
      ];
      const updated = upsertSharedProject({ id: 'p1', name: 'New', groupIds: [], createdBy: 'bob' });
      assert.equal(updated.createdBy, 'bob');
    });
  });

  describe('deleteSharedProject', () => {
    it('removes the project with the matching id and returns true', () => {
      projects = [
        { id: 'p1', name: 'A', groupIds: [], createdAt: 1, updatedAt: 1 },
        { id: 'p2', name: 'B', groupIds: [], createdAt: 1, updatedAt: 1 },
      ];
      const result = deleteSharedProject('p1');
      assert.equal(result, true);
      assert.deepEqual(
        projects.map(p => p.id),
        ['p2']
      );
    });

    it('returns false and does not save when the id is not found', () => {
      projects = [{ id: 'p1', name: 'A', groupIds: [], createdAt: 1, updatedAt: 1 }];
      const result = deleteSharedProject('missing');
      assert.equal(result, false);
      assert.equal(saveSharedProjects.mock.calls.length, 0);
    });
  });
});
