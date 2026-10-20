import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  enforceGalleryWorkflowByteBudget,
  normalizeGalleryWorkflowMaxBytes,
  normalizeGalleryWorkflowRetentionDays,
  pruneStaleGalleryWorkflowJson,
  stripGalleryWorkflowJsonForExport,
} from './workflow-hygiene';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

function entry(partial: Partial<ComfyGalleryEntry>): ComfyGalleryEntry {
  return {
    id: partial.id ?? '1',
    promptId: 'p',
    prompt: 'x',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: partial.queuedAt ?? Date.now(),
    images: [],
    ...partial,
  };
}

describe('gallery-workflow-hygiene', () => {
  it('normalizes retention days', () => {
    assert.equal(normalizeGalleryWorkflowRetentionDays(-1), 0);
    assert.equal(normalizeGalleryWorkflowRetentionDays(400), 365);
    assert.equal(normalizeGalleryWorkflowRetentionDays(undefined), 30);
  });

  it('prunes stale graphs and strips export bodies', () => {
    const old = entry({
      id: 'old',
      queuedAt: Date.now() - 40 * 24 * 60 * 60 * 1000,
      workflowJson: '{"1":{}}',
      hasStoredWorkflow: true,
    });
    const fresh = entry({
      id: 'fresh',
      queuedAt: Date.now(),
      workflowJson: '{"2":{}}',
      hasStoredWorkflow: true,
    });
    const { entries, pruned } = pruneStaleGalleryWorkflowJson([old, fresh], 30);
    assert.equal(pruned, 1);
    assert.equal(entries[0]?.workflowJson, undefined);
    assert.equal(entries[0]?.workflowJsonOmitted, true);
    assert.ok(entries[1]?.workflowJson);

    const stripped = stripGalleryWorkflowJsonForExport(fresh);
    assert.equal(stripped.workflowJson, undefined);
    assert.equal(stripped.hasStoredWorkflow, true);
  });

  it('enforces total byte budget and prefers pruning non-favorites first', () => {
    assert.equal(normalizeGalleryWorkflowMaxBytes(-1), 0);
    const bulky = 'x'.repeat(1000);
    const old = entry({
      id: 'old',
      queuedAt: 1,
      workflowJson: bulky,
      favorite: false,
    });
    const fav = entry({
      id: 'fav',
      queuedAt: 2,
      workflowJson: bulky,
      favorite: true,
    });
    // Each graph is ~2000 bytes (UTF-16); budget keeps one favorite.
    const { entries, pruned } = enforceGalleryWorkflowByteBudget([old, fav], 2500);
    assert.equal(pruned, 1);
    assert.equal(entries.find(item => item.id === 'old')?.workflowJson, undefined);
    assert.ok(entries.find(item => item.id === 'fav')?.workflowJson);
  });
});

