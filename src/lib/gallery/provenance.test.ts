import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatRenderDuration,
  galleryEntryProvenance,
  replayOutcomeLabel,
  storedGraphNote,
  type ProvenanceEntry,
} from './provenance';

const take: ProvenanceEntry = {
  prompt: 'Edit instruction for a Day still: she reads by the window',
  negativePrompt: 'blurry',
  tool: 'image-prompt',
  model: 'qwen-image-edit-2511',
  queueParams: { seed: 1234, width: 832, height: 1216, steps: 8, cfg: 1, samplerName: 'euler' },
  queueQualityProfile: 'final',
  comfyUrl: 'http://127.0.0.1:8188',
  sourceImageUrl: '/api/gallery/media/plate',
  controlImageUrls: ['/pose.png'],
  sessionActiveLoraIds: ['l1', 'l2'],
  hasStoredWorkflow: true,
  status: 'completed',
  queuedAt: 1_000,
  completedAt: 43_000,
  renderDurationMs: 41_600,
};

const rows = (entry: ProvenanceEntry, options = {}) =>
  Object.fromEntries(
    galleryEntryProvenance(entry, { formatTime: ms => `t${ms}`, ...options }).map(row => [
      row.key,
      row.value,
    ])
  );

describe('gallery entry provenance (R4)', () => {
  it('reads what made a take, its settings, references and times', () => {
    const out = rows(take, { castName: 'Nora', madeWith: 'Scene' });
    assert.equal(out['made-with'], 'Scene');
    assert.equal(out.engine, 'ComfyUI · 127.0.0.1:8188');
    assert.equal(out.model, 'qwen-image-edit-2511');
    assert.equal(out.quality, 'final');
    assert.equal(out.seed, '1234');
    assert.equal(out.size, '832 × 1216');
    assert.equal(out.sampler, 'euler');
    assert.equal(out.cast, 'Nora');
    assert.equal(out.references, 'a source picture, 1 control picture, 2 LoRAs');
    assert.equal(out.queued, 't1000');
    assert.equal(out.finished, 't43000');
    assert.equal(out['render-time'], '42 s');
    assert.equal(out.graph, 'Stored — the Gallery can replay it exactly');
    assert.equal(out.negative, 'blurry');
    assert.equal(out.status, undefined, 'a finished render says nothing about status');
    const prompt = galleryEntryProvenance(take).find(row => row.key === 'prompt');
    assert.equal(prompt?.long, true);
  });

  it('leaves out what it does not know, and says why a render failed', () => {
    const out = rows({
      status: 'error',
      statusMessage: 'Job not found (engine restarted).',
      queuedAt: 5,
      prompt: '',
      engineId: 'fal',
      comfyUrl: 'https://queue.fal.run',
    });
    assert.equal(out.status, 'error — Job not found (engine restarted).');
    assert.equal(out.engine, 'Fal', 'a cloud engine shows no ComfyUI host');
    assert.equal(out['made-with'], 'Generate');
    for (const key of ['model', 'seed', 'size', 'references', 'finished', 'prompt', 'cast']) {
      assert.equal(out[key], undefined, key);
    }
    assert.equal(out.graph, 'Not stored with this render');
  });

  it('says when the exact graph was pruned', () => {
    assert.match(storedGraphNote({ workflowJsonOmitted: true }), /^Not kept/);
    assert.match(storedGraphNote({ hasStoredWorkflow: true, workflowJsonOmitted: true }), /^Not kept/);
    assert.match(storedGraphNote({ workflowJson: '{}' }), /^Stored/);
  });

  it('formats render time', () => {
    assert.equal(formatRenderDuration(undefined), '');
    assert.equal(formatRenderDuration(400), '1 s');
    assert.equal(formatRenderDuration(185_000), '3 min 5 s');
    assert.equal(formatRenderDuration(120_000), '2 min');
  });
});

describe('replayOutcomeLabel (D19)', () => {
  it('says a replay used the exact graph only when it did', () => {
    assert.equal(replayOutcomeLabel({ replayedFrom: 'stored' }), 'replayed the exact graph');
    assert.equal(replayOutcomeLabel({ replayedFrom: 'history' }), 'replayed the exact graph');
    assert.match(
      replayOutcomeLabel({ replayedFrom: 'rebuilt' }),
      /^rebuilt from the current template — the exact graph isn’t on this device/
    );
  });

  it('a new seed or quality is a variation, whatever the graph', () => {
    assert.equal(replayOutcomeLabel({ newSeed: true, replayedFrom: 'stored' }), 'queued variation');
    assert.equal(replayOutcomeLabel({ qualityProfile: 'final' }), 'queued variation');
    assert.equal(replayOutcomeLabel({}), 'queued again');
  });
});
