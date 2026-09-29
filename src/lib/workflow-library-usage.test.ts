import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isWorkflowFileUnused, workflowLibraryUsage } from './workflow-library-usage';
import { comfyModelListFingerprint, workflowLibraryWatchToast } from './workflow-library-watch';

const file = (id: string) => ({ id, name: id, workflowJson: '{}', createdAt: 1 });

describe('workflowLibraryUsage', () => {
  it('counts pins, the selected file, and system auto picks for unpinned models', () => {
    const files = [file('qwen'), file('wan'), file('spare'), file('picked')];
    const usage = workflowLibraryUsage({
      files,
      shared: {
        modelWorkflowMap: { 'qwen-image-2512': 'qwen', faceDetailer: 'qwen' },
        selectedWorkflowFileId: 'wan',
        useSystemWorkflows: true,
      },
      pickPack: model => (model === 'flux-2-klein' ? { file: { id: 'picked' } } : null),
    });
    assert.deepEqual(usage.get('qwen')!.pinned, ['qwen-image-2512', 'faceDetailer']);
    assert.equal(usage.get('wan')!.selected, true);
    assert.deepEqual(usage.get('picked')!.auto, ['flux-2-klein']);
    assert.equal(isWorkflowFileUnused(usage.get('spare')), true);
    assert.equal(isWorkflowFileUnused(usage.get('picked')), false);
  });

  it('skips auto picks when system workflows are off', () => {
    const usage = workflowLibraryUsage({
      files: [file('picked')],
      shared: { useSystemWorkflows: false },
      pickPack: () => ({ file: { id: 'picked' } }),
    });
    assert.equal(isWorkflowFileUnused(usage.get('picked')), true);
  });
});

describe('workflow library watch', () => {
  const report = (messages: string[]) => ({
    scanned: 3,
    healthy: 3 - messages.length,
    issues: messages.map(message => ({
      workflowId: 'wf',
      workflowName: 'wf',
      severity: 'error' as const,
      message,
    })),
  });

  it('toasts new errors once, not warnings or repeats', () => {
    const first = workflowLibraryWatchToast(report(['a video model is mapped to a 3D one.']), null);
    assert.ok(first);
    assert.match(first.text, /workflow library: a video model is mapped to a 3D one\. Open Settings/);
    assert.equal(workflowLibraryWatchToast(report(['a video model is mapped to a 3D one.']), first.signature), null);
    assert.equal(workflowLibraryWatchToast({ scanned: 1, healthy: 0, issues: [{ workflowId: 'w', workflowName: 'w', severity: 'warn', message: 'x' }] }, null), null);
    const changed = workflowLibraryWatchToast(report(['one.', 'two.']), first.signature, { modelsChanged: true });
    assert.match(changed!.text, /^ComfyUI models changed — .*\(\+1 more\)/);
  });

  it('fingerprints model lists regardless of order', () => {
    const a = comfyModelListFingerprint({ checkpoints: ['b', 'a'], loras: ['x'] });
    const b = comfyModelListFingerprint({ loras: ['x'], checkpoints: ['a', 'b'] });
    assert.equal(a, b);
    assert.notEqual(a, comfyModelListFingerprint({ checkpoints: ['a', 'c'], loras: ['x'] }));
    assert.equal(comfyModelListFingerprint(null), '');
  });
});
