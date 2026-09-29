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
