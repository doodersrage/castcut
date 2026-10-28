import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { closeStudioDb } from './studio-db';
import {
  readSubmittedGraph,
  recordSubmittedGraph,
  SUBMITTED_GRAPH_MAX_CHARS,
} from './submitted-graphs';

const graph = (seed: number) => ({
  '3': { class_type: 'KSampler', inputs: { seed, steps: 8 } },
  '7': { class_type: 'LoadImage', inputs: { image: 'plate-252d755af9eb93c0.png' } },
});

describe('the graph each render was submitted with (M7 T4)', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';
  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-graphs-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });
  afterEach(() => {
    closeStudioDb();
    if (previousDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = previousDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps the graph as sent, with where it went, by prompt id', () => {
    assert.equal(
      recordSubmittedGraph({
        promptId: 'p1',
        comfyUrl: 'http://127.0.0.1:8188',
        model: 'qwen-rapid-aio-edit',
        graph: graph(3035471972),
        now: 5,
      }),
      true
    );
    assert.deepEqual(readSubmittedGraph('p1'), {
      promptId: 'p1',
      comfyUrl: 'http://127.0.0.1:8188',
      model: 'qwen-rapid-aio-edit',
      graph: graph(3035471972),
      createdAt: 5,
    });
    assert.equal(readSubmittedGraph('nope'), null);
    // The same prompt id again replaces it.
    recordSubmittedGraph({ promptId: 'p1', graph: graph(1), now: 6 });
    assert.equal((readSubmittedGraph('p1')!.graph['3'] as { inputs: { seed: number } }).inputs.seed, 1);
  });

  it('keeps the newest up to its limit, and skips what it should not keep', () => {
    for (let i = 1; i <= 5; i += 1) {
      recordSubmittedGraph({ promptId: `p${i}`, graph: graph(i), now: i, limit: 3 });
    }
    assert.deepEqual(
      ['p1', 'p2', 'p3', 'p4', 'p5'].map(id => Boolean(readSubmittedGraph(id))),
      [false, false, true, true, true]
    );
    assert.equal(recordSubmittedGraph({ promptId: '', graph: graph(1) }), false);
    assert.equal(recordSubmittedGraph({ promptId: 'arr', graph: [] }), false);
    const huge = { '1': { class_type: 'X', inputs: { blob: 'x'.repeat(SUBMITTED_GRAPH_MAX_CHARS) } } };
    assert.equal(recordSubmittedGraph({ promptId: 'huge', graph: huge }), false);
  });

  it('does nothing without server storage', () => {
    delete process.env.PROMPT_DATA_DIR;
    assert.equal(recordSubmittedGraph({ promptId: 'p1', graph: graph(1) }), false);
    assert.equal(readSubmittedGraph('p1'), null);
  });
});
