import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

type Store = Record<string, unknown>;
let store: Store = {};
const readBrowserValue = mock.fn(<T,>(key: string) => (key in store ? (store[key] as T) : undefined));
const writeBrowserValue = mock.fn((key: string, value: unknown) => {
  store[key] = value;
});
const readBrowserString = mock.fn((key: string) => (key in store ? String(store[key]) : null));
const writeBrowserString = mock.fn((key: string, value: string) => {
  store[key] = value;
});
const removeBrowserKey = mock.fn((key: string) => {
  delete store[key];
});
mock.module('../storage/browser-storage', {
  namedExports: {
    readBrowserValue,
    writeBrowserValue,
    readBrowserString,
    writeBrowserString,
    removeBrowserKey,
  },
});

afterEach(() => {
  store = {};
  delete (globalThis as { window?: unknown }).window;
  for (const m of [
    readBrowserValue,
    writeBrowserValue,
    readBrowserString,
    writeBrowserString,
    removeBrowserKey,
  ]) {
    m.mock.resetCalls();
  }
});

describe('prompt-projects (no window)', async () => {
  const {
    loadPromptProjects,
    savePromptProjects,
    setActiveProjectId,
    loadActiveProjectId,
    itemMatchesProject,
  } = await import('./projects');

  it('loadPromptProjects returns [] without window', () => {
    assert.deepEqual(loadPromptProjects(), []);
  });

  it('savePromptProjects/setActiveProjectId are no-ops without window', () => {
    savePromptProjects([{ id: 'p1', name: 'x', createdAt: 0, updatedAt: 0 }]);
    setActiveProjectId('p1');
    assert.equal(writeBrowserValue.mock.calls.length, 0);
    assert.equal(writeBrowserString.mock.calls.length, 0);
  });

  it('loadActiveProjectId returns undefined without window', () => {
    assert.equal(loadActiveProjectId(), undefined);
  });

  it('itemMatchesProject is true for any metadata when projectId is falsy', () => {
    assert.equal(itemMatchesProject(undefined, { projectId: 'anything' }), true);
    assert.equal(itemMatchesProject(undefined, undefined), true);
  });

  it('itemMatchesProject matches metadata.projectId exactly', () => {
    assert.equal(itemMatchesProject('p1', { projectId: 'p1' }), true);
    assert.equal(itemMatchesProject('p1', { projectId: 'p2' }), false);
    assert.equal(itemMatchesProject('p1', undefined), false);
  });
});

describe('prompt-projects (with window)', async () => {
  const {
    PROMPT_PROJECTS_KEY,
    ACTIVE_PROJECT_KEY,
    loadPromptProjects,
    savePromptProjects,
    upsertPromptProject,
    deletePromptProject,
    setActiveProjectId,
    loadActiveProjectId,
  } = await import('./projects');

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  });

  it('loadPromptProjects returns [] when nothing is stored', () => {
    assert.deepEqual(loadPromptProjects(), []);
  });

  it('loadPromptProjects returns [] when readBrowserValue throws', () => {
    readBrowserValue.mock.mockImplementationOnce(() => {
      throw new Error('storage error');
    });
    assert.deepEqual(loadPromptProjects(), []);
  });

  it('savePromptProjects caps at 50 entries', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`,
      name: `p${i}`,
      createdAt: 0,
      updatedAt: 0,
    }));
    savePromptProjects(many);
    assert.equal((store[PROMPT_PROJECTS_KEY] as unknown[]).length, 50);
  });

  it('upsertPromptProject trims name/notes, sets createdAt/updatedAt, and prepends the project', () => {
    const created = upsertPromptProject({ id: 'p1', name: '  Project One  ', notes: '  hi  ' });
    assert.equal(created.name, 'Project One');
    assert.equal(created.notes, 'hi');
    assert.ok(typeof created.createdAt === 'number');
    assert.equal(created.updatedAt, created.createdAt);
    assert.deepEqual(loadPromptProjects(), [created]);
  });

  it('upsertPromptProject replaces (not duplicates) an existing project by id', () => {
    const first = upsertPromptProject({ id: 'p1', name: 'First' });
    upsertPromptProject({ id: 'p1', name: 'First Updated', createdAt: first.createdAt });
    const all = loadPromptProjects();
    assert.equal(all.length, 1);
    assert.equal(all[0]!.name, 'First Updated');
    assert.equal(all[0]!.createdAt, first.createdAt);
  });

  it('upsertPromptProject drops blank notes to undefined', () => {
    const created = upsertPromptProject({ id: 'p1', name: 'x', notes: '   ' });
    assert.equal(created.notes, undefined);
  });

  it('deletePromptProject removes the project by id', () => {
    upsertPromptProject({ id: 'p1', name: 'x' });
    upsertPromptProject({ id: 'p2', name: 'y' });
    deletePromptProject('p1');
    const all = loadPromptProjects();
    assert.equal(all.length, 1);
    assert.equal(all[0]!.id, 'p2');
  });

  it('deletePromptProject clears the active project id when it matches the deleted project', () => {
    upsertPromptProject({ id: 'p1', name: 'x' });
    setActiveProjectId('p1');
    deletePromptProject('p1');
    assert.equal(loadActiveProjectId(), undefined);
  });

  it('deletePromptProject leaves the active project id alone when it does not match', () => {
    upsertPromptProject({ id: 'p1', name: 'x' });
    setActiveProjectId('p2');
    deletePromptProject('p1');
    assert.equal(loadActiveProjectId(), 'p2');
  });

  it('setActiveProjectId writes the id, and clearing with undefined removes the key', () => {
    setActiveProjectId('p1');
    assert.equal(store[ACTIVE_PROJECT_KEY], 'p1');
    setActiveProjectId(undefined);
    assert.equal(ACTIVE_PROJECT_KEY in store, false);
  });

  it('loadActiveProjectId trims and returns undefined for a blank value', () => {
    store[ACTIVE_PROJECT_KEY] = '   ';
    assert.equal(loadActiveProjectId(), undefined);
  });
});
