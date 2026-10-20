import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const upsertComfyWorkflowFile = mock.fn((file: Record<string, unknown>) => file);
mock.module('../comfyui/workflow-files', { namedExports: { upsertComfyWorkflowFile } });

const storage = new Map<string, unknown>();
const readBrowserValue = mock.fn(<T,>(key: string): T | null => (storage.has(key) ? (storage.get(key) as T) : null));
const writeBrowserValue = mock.fn((key: string, value: unknown) => {
  storage.set(key, value);
});
mock.module('../browser-storage', { namedExports: { readBrowserValue, writeBrowserValue } });

type OptimizeResult = { workflowJson: string; contentHash: string };
let optimizeImpl: (input: Record<string, unknown>) => OptimizeResult = input => ({
  workflowJson: JSON.stringify(input.workflow),
  contentHash: 'hash-optimized',
});
const optimizeWorkflowForQueue = mock.fn((input: Record<string, unknown>) => optimizeImpl(input));
mock.module('./queue-optimizer', { namedExports: { optimizeWorkflowForQueue } });

const normalizeQueueQualityProfile = mock.fn((profile: unknown) => profile ?? 'balanced');
mock.module('../queue-quality-profile', { namedExports: { normalizeQueueQualityProfile } });

const workflowContentHash = mock.fn((json: string) => `raw-hash-${json.length}`);
mock.module('./content-hash', { namedExports: { workflowContentHash } });

let sharedSettings: Record<string, unknown> = { model: 'sdxl', queueQualityProfile: 'balanced' };
const loadSettingsCache = mock.fn(() => ({ shared: sharedSettings }));
mock.module('../settings-cache', { namedExports: { loadSettingsCache } });

const inferModelsFromWorkflowLabel = mock.fn((_input: { name: string; filename?: string }) => [] as string[]);
mock.module('./category-defaults', { namedExports: { inferModelsFromWorkflowLabel } });

function installWindow() {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  return {
    restore: () => {
      delete (globalThis as { window?: unknown }).window;
    },
  };
}

function preset(overrides: Partial<{ id: string; name: string; workflowJson: string; createdAt: number }> = {}) {
  return {
    id: overrides.id ?? 'p1',
    name: overrides.name ?? 'My Preset',
    workflowJson: overrides.workflowJson ?? '{}',
    createdAt: overrides.createdAt ?? 100,
  };
}

afterEach(() => {
  storage.clear();
  sharedSettings = { model: 'sdxl', queueQualityProfile: 'balanced' };
  optimizeImpl = input => ({ workflowJson: JSON.stringify(input.workflow), contentHash: 'hash-optimized' });
  for (const m of [
    upsertComfyWorkflowFile,
    readBrowserValue,
    writeBrowserValue,
    optimizeWorkflowForQueue,
    normalizeQueueQualityProfile,
    workflowContentHash,
    loadSettingsCache,
    inferModelsFromWorkflowLabel,
  ]) {
    m.mock.resetCalls();
  }
  delete (globalThis as { window?: unknown }).window;
});

describe('workflow-preset-packs', async () => {
  const {
    WORKFLOW_PRESET_PACKS_KEY,
    loadWorkflowPresetPacks,
    saveWorkflowPresetPacks,
    exportWorkflowPresetPack,
    importWorkflowPresetPack,
    upsertWorkflowPresetPack,
    workflowFileToPreset,
    addPresetsToPack,
    applyWorkflowPresetPackToLibrary,
  } = await import('./preset-packs');

  describe('loadWorkflowPresetPacks / saveWorkflowPresetPacks', () => {
    it('returns [] without a window (SSR)', () => {
      assert.deepEqual(loadWorkflowPresetPacks(), []);
      assert.equal(readBrowserValue.mock.calls.length, 0);
    });

    it('returns [] when nothing is stored', () => {
      const win = installWindow();
      try {
        assert.deepEqual(loadWorkflowPresetPacks(), []);
      } finally {
        win.restore();
      }
    });

    it('returns the stored packs when present', () => {
      const win = installWindow();
      try {
        const packs = [{ id: 'p1', name: 'Pack 1', tags: [], createdAt: 1, presets: [] }];
        storage.set(WORKFLOW_PRESET_PACKS_KEY, packs);
        assert.deepEqual(loadWorkflowPresetPacks(), packs);
      } finally {
        win.restore();
      }
    });

    it('returns [] when readBrowserValue throws', () => {
      const win = installWindow();
      readBrowserValue.mock.mockImplementationOnce(() => {
        throw new Error('boom');
      });
      try {
        assert.deepEqual(loadWorkflowPresetPacks(), []);
      } finally {
        win.restore();
      }
    });

    it('does not write without a window (SSR)', () => {
      saveWorkflowPresetPacks([]);
      assert.equal(writeBrowserValue.mock.calls.length, 0);
    });

    it('writes the packs under WORKFLOW_PRESET_PACKS_KEY when a window is present', () => {
      const win = installWindow();
      try {
        const packs = [{ id: 'p1', name: 'Pack 1', tags: [], createdAt: 1, presets: [] }];
        saveWorkflowPresetPacks(packs);
        assert.equal(writeBrowserValue.mock.calls.length, 1);
        assert.equal(writeBrowserValue.mock.calls[0]!.arguments[0], WORKFLOW_PRESET_PACKS_KEY);
        assert.deepEqual(writeBrowserValue.mock.calls[0]!.arguments[1], packs);
      } finally {
        win.restore();
      }
    });
  });

  describe('exportWorkflowPresetPack / importWorkflowPresetPack', () => {
    it('exports a JSON envelope with version, exportedAt, and the pack', () => {
      const pack = { id: 'p1', name: 'Pack 1', tags: [], createdAt: 1, presets: [] };
      const json = exportWorkflowPresetPack(pack);
      const parsed = JSON.parse(json) as { version: number; exportedAt: string; pack: unknown };
      assert.equal(parsed.version, 1);
      assert.equal(typeof parsed.exportedAt, 'string');
      assert.deepEqual(parsed.pack, pack);
    });

    it('imports a wrapped {pack: ...} envelope', () => {
      const raw = JSON.stringify({ pack: { id: 'p9', name: 'Wrapped', presets: [], createdAt: 5, tags: ['x'] } });
      const result = importWorkflowPresetPack(raw);
      assert.equal(result.id, 'p9');
      assert.equal(result.name, 'Wrapped');
    });

    it('imports a bare pack object', () => {
      const raw = JSON.stringify({ id: 'p8', name: 'Bare', presets: [], createdAt: 5, tags: [] });
      const result = importWorkflowPresetPack(raw);
      assert.equal(result.id, 'p8');
    });

    it('throws when the pack has no name', () => {
      const raw = JSON.stringify({ presets: [] });
      assert.throws(() => importWorkflowPresetPack(raw), /Invalid workflow preset pack JSON/);
    });

    it('throws when presets is not an array', () => {
      const raw = JSON.stringify({ name: 'No Presets' });
      assert.throws(() => importWorkflowPresetPack(raw), /Invalid workflow preset pack JSON/);
    });

    it('fills in a generated id, createdAt, and empty tags when missing', () => {
      const raw = JSON.stringify({ name: 'Minimal', presets: [] });
      const result = importWorkflowPresetPack(raw);
      assert.match(result.id, /^[0-9a-f-]{36}$/);
      assert.equal(typeof result.createdAt, 'number');
      assert.deepEqual(result.tags, []);
    });
  });

  describe('upsertWorkflowPresetPack', () => {
    it('prepends a new pack when its id is not found', () => {
      const win = installWindow();
      try {
        storage.set(WORKFLOW_PRESET_PACKS_KEY, [{ id: 'old', name: 'Old', tags: [], createdAt: 1, presets: [] }]);
        upsertWorkflowPresetPack({ id: 'new', name: 'New', tags: [], createdAt: 2, presets: [] });
        const saved = storage.get(WORKFLOW_PRESET_PACKS_KEY) as { id: string }[];
        assert.deepEqual(
          saved.map(p => p.id),
          ['new', 'old']
        );
      } finally {
        win.restore();
      }
    });

    it('replaces an existing pack in place when its id matches', () => {
      const win = installWindow();
      try {
        storage.set(WORKFLOW_PRESET_PACKS_KEY, [
          { id: 'a', name: 'A', tags: [], createdAt: 1, presets: [] },
          { id: 'b', name: 'B', tags: [], createdAt: 2, presets: [] },
        ]);
        upsertWorkflowPresetPack({ id: 'a', name: 'A Updated', tags: [], createdAt: 1, presets: [] });
        const saved = storage.get(WORKFLOW_PRESET_PACKS_KEY) as { id: string; name: string }[];
        assert.equal(saved.length, 2);
        assert.equal(saved[0]!.name, 'A Updated');
      } finally {
        win.restore();
      }
    });
  });

  describe('workflowFileToPreset', () => {
    it('generates an id and createdAt when not given', () => {
      const result = workflowFileToPreset({ name: 'File', workflowJson: '{}' });
      assert.match(result.id, /^[0-9a-f-]{36}$/);
      assert.equal(typeof result.createdAt, 'number');
      assert.equal(result.name, 'File');
    });

    it('uses the given id and createdAt when provided', () => {
      const result = workflowFileToPreset({ id: 'fixed-id', name: 'File', workflowJson: '{}', createdAt: 42 });
      assert.equal(result.id, 'fixed-id');
      assert.equal(result.createdAt, 42);
    });
  });

  describe('addPresetsToPack', () => {
    it('returns null when the packId is not found', () => {
      const win = installWindow();
      try {
        storage.set(WORKFLOW_PRESET_PACKS_KEY, []);
        assert.equal(addPresetsToPack('missing', [preset()]), null);
      } finally {
        win.restore();
      }
    });

    it('merges new presets into the pack and dedupes by id', () => {
      const win = installWindow();
      try {
        storage.set(WORKFLOW_PRESET_PACKS_KEY, [
          { id: 'pack1', name: 'Pack', tags: [], createdAt: 1, presets: [preset({ id: 'p1' })] },
        ]);
        const result = addPresetsToPack('pack1', [preset({ id: 'p1' }), preset({ id: 'p2' })]);
        assert.equal(result?.presets.length, 2);
        assert.deepEqual(
          result?.presets.map(p => p.id),
          ['p1', 'p2']
        );
      } finally {
        win.restore();
      }
    });
  });

  describe('applyWorkflowPresetPackToLibrary', () => {
    it('returns 0 without a window (SSR)', () => {
      const pack = { id: 'p1', name: 'Pack', tags: [], createdAt: 1, presets: [preset()] };
      assert.equal(applyWorkflowPresetPackToLibrary(pack), 0);
      assert.equal(upsertComfyWorkflowFile.mock.calls.length, 0);
    });

    it('optimizes each preset workflow and upserts it into the library, returning the count', () => {
      const win = installWindow();
      try {
        const pack = {
          id: 'p1',
          name: 'Pack',
          tags: [],
          createdAt: 1,
          presets: [preset({ id: 'p1' }), preset({ id: 'p2' })],
        };
        const count = applyWorkflowPresetPackToLibrary(pack);
        assert.equal(count, 2);
        assert.equal(upsertComfyWorkflowFile.mock.calls.length, 2);
        assert.equal(optimizeWorkflowForQueue.mock.calls.length, 2);
        const firstCall = upsertComfyWorkflowFile.mock.calls[0]!.arguments[0] as Record<string, unknown>;
        assert.equal(firstCall.lastOptimizedHash, 'hash-optimized');
      } finally {
        win.restore();
      }
    });

    it('falls back to the raw preset JSON and a raw content hash when JSON.parse fails', () => {
      const win = installWindow();
      try {
        const pack = {
          id: 'p1',
          name: 'Pack',
          tags: [],
          createdAt: 1,
          presets: [preset({ workflowJson: '{not valid json' })],
        };
        applyWorkflowPresetPackToLibrary(pack);
        assert.equal(optimizeWorkflowForQueue.mock.calls.length, 0);
        assert.equal(workflowContentHash.mock.calls.length, 1);
        const call = upsertComfyWorkflowFile.mock.calls[0]!.arguments[0] as Record<string, unknown>;
        assert.equal(call.workflowJson, '{not valid json');
      } finally {
        win.restore();
      }
    });

    it('uses inferModelsFromWorkflowLabel to pick the optimize model, falling back to the shared model', () => {
      const win = installWindow();
      try {
        inferModelsFromWorkflowLabel.mock.mockImplementationOnce(() => ['flux-2-klein']);
        sharedSettings = { model: 'sdxl', queueQualityProfile: 'balanced' };
        const pack = { id: 'p1', name: 'Pack', tags: [], createdAt: 1, presets: [preset()] };
        applyWorkflowPresetPackToLibrary(pack);
        const call = upsertComfyWorkflowFile.mock.calls[0]!.arguments[0] as Record<string, unknown>;
        assert.equal(call.lastOptimizedModel, 'flux-2-klein');
      } finally {
        win.restore();
      }
    });
  });
});
