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

  // R1b: what the production uses keeps its graph (keepIds = collectGalleryReferencedEntryIds).
  it('keeps an old graph the production uses', () => {
    const month = 40 * 24 * 60 * 60 * 1000;
    const kept = entry({ id: 'kept-take', queuedAt: Date.now() - month, workflowJson: '{"1":{}}' });
    const loose = entry({ id: 'loose', queuedAt: Date.now() - month, workflowJson: '{"2":{}}' });
    const { entries, pruned } = pruneStaleGalleryWorkflowJson(
      [kept, loose],
      30,
      Date.now(),
      new Set(['kept-take'])
    );
    assert.equal(pruned, 1);
    assert.equal(entries[0]?.workflowJson, '{"1":{}}');
    assert.equal(entries[1]?.workflowJson, undefined);
  });

  it('leaves graphs the production uses out of the byte budget', () => {
    const bulky = 'x'.repeat(1000);
    const used = entry({ id: 'used', queuedAt: 1, workflowJson: bulky });
    const fav = entry({ id: 'fav', queuedAt: 2, workflowJson: bulky, favorite: true });
    const loose = entry({ id: 'loose', queuedAt: 3, workflowJson: bulky });
    // ~2000 bytes each; the budget holds one counted graph, and `used` isn't counted.
    const { entries, pruned, totalBytes } = enforceGalleryWorkflowByteBudget(
      [used, fav, loose],
      2500,
      new Set(['used'])
    );
    assert.equal(pruned, 1);
    assert.ok(entries.find(item => item.id === 'used')?.workflowJson, 'never stripped');
    assert.ok(entries.find(item => item.id === 'fav')?.workflowJson);
    assert.equal(entries.find(item => item.id === 'loose')?.workflowJson, undefined);
    assert.equal(totalBytes, 2000);

    // Over budget on what the production uses alone: nothing of it is stripped.
    const alone = enforceGalleryWorkflowByteBudget([used], 10, new Set(['used']));
    assert.equal(alone.pruned, 0);
    assert.ok(alone.entries[0]?.workflowJson);
  });
});

