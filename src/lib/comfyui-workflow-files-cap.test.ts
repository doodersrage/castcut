import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

const store = new Map<string, unknown>();
mock.module('./browser-storage', {
  namedExports: {
    readBrowserValue: (key: string) => store.get(key) ?? null,
    writeBrowserValue: (key: string, value: unknown) => store.set(key, value),
  },
});
mock.module('./comfyui-workflow-presets', {
  namedExports: { loadComfyWorkflowPresets: () => [] },
});

describe('workflow library size', async () => {
  const { loadComfyWorkflowFiles, saveComfyWorkflowFiles, upsertComfyWorkflowFile } = await import(
    './comfyui-workflow-files'
  );
  const g = globalThis as unknown as { window?: unknown };

  it('never drops the oldest files past 32 (import or restore)', () => {
    const had = 'window' in g;
    g.window = {};
    try {
      for (let index = 0; index < 40; index += 1) {
        upsertComfyWorkflowFile({ name: `wf ${index}`, workflowJson: '{}' });
      }
      const files = loadComfyWorkflowFiles();
      assert.equal(files.length, 40);
      assert.ok(files.some(file => file.name === 'wf 0'), 'the first import is still there');

      saveComfyWorkflowFiles(
        Array.from({ length: 45 }, (_, index) => ({ id: `r${index}`, name: `r${index}`, workflowJson: '{}', createdAt: 1 }))
      );
      assert.equal(loadComfyWorkflowFiles().length, 45);
    } finally {
      if (!had) delete g.window;
    }
  });
});

describe('recently deleted', async () => {
  const lib = await import('./comfyui-workflow-files');
  const g = globalThis as unknown as { window?: unknown };

  it('moves a deleted workflow to the trash and restores it with its id and tokens', () => {
    const had = 'window' in g;
    g.window = {};
    try {
      const saved = lib.upsertComfyWorkflowFile({
        name: 'Klein pack',
        workflowJson: '{"1":{}}',
        customTokens: [{ token: '{{LORA_LIGHTNING}}', value: 'x.safetensors' }],
      });
      lib.deleteComfyWorkflowFile(saved.id, Date.now(), { unpinned: ['faceDetailer'] });
      assert.equal(lib.loadComfyWorkflowFiles().some(file => file.id === saved.id), false);
      assert.equal(lib.loadDeletedComfyWorkflowFiles()[0]!.file.id, saved.id);

      const restored = lib.restoreDeletedComfyWorkflowFile(saved.id)!;
      assert.equal(restored.file.id, saved.id);
      assert.deepEqual(restored.unpinned, ['faceDetailer']);
      assert.equal(lib.loadComfyWorkflowFiles().find(file => file.id === saved.id)?.customTokens?.[0]?.value, 'x.safetensors');
      assert.equal(lib.loadDeletedComfyWorkflowFiles().some(entry => entry.file.id === saved.id), false);
    } finally {
      if (!had) delete g.window;
    }
  });

  it('forgets deletions older than 30 days', () => {
    const had = 'window' in g;
    g.window = {};
    try {
      const day = 24 * 60 * 60 * 1000;
      const saved = lib.upsertComfyWorkflowFile({ name: 'old', workflowJson: '{}' });
      lib.deleteComfyWorkflowFile(saved.id, 1000 * day);
      assert.equal(lib.loadDeletedComfyWorkflowFiles(1029 * day).some(entry => entry.file.id === saved.id), true);
      assert.equal(lib.loadDeletedComfyWorkflowFiles(1031 * day).some(entry => entry.file.id === saved.id), false);
    } finally {
      if (!had) delete g.window;
    }
  });
});
