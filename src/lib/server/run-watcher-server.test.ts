import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { COMFY_PROMPT_LOST_MESSAGE, type ComfyPromptStatus } from '@/lib/comfyui/status';
import { markJobCancelled, markJobSeen } from '@/lib/sqlite/run-watch-jobs';
import { writeSceneRun } from '@/lib/sqlite/scene-runs';
import { closeStudioDb } from '@/lib/sqlite/studio-db';
import { recordSubmittedGraph, readSubmittedGraph } from '@/lib/sqlite/submitted-graphs';
import { requeueLostJob, tickRunWatcher, watchedPromptStatus } from './run-watcher-server';

const COMFY = 'http://comfy.test:8188';

/** A fake ComfyUI: each job's state, settable; and what was submitted to it. */
function fakeComfy() {
  const jobs = new Map<string, ComfyPromptStatus['status']>();
  const submitted: string[] = [];
  let next = 0;
  return {
    jobs,
    submitted,
    status: async (promptId: string): Promise<ComfyPromptStatus> => {
      const state = jobs.get(promptId);
      if (!state) return { promptId, status: 'error', statusMessage: COMFY_PROMPT_LOST_MESSAGE, comfyUrl: COMFY };
      return {
        promptId,
        status: state,
        comfyUrl: COMFY,
        ...(state === 'completed' ? { images: [{ filename: `${promptId}.png`, subfolder: '', type: 'output' }] } : {}),
      } as ComfyPromptStatus;
    },
    submit: async (graph: Record<string, unknown>): Promise<string | null> => {
      next += 1;
      const id = `q${next}`;
      submitted.push(JSON.stringify(graph));
      jobs.set(id, 'pending');
      return id;
    },
  };
}

describe('the server’s run watch (Phase 3, step 3): close the page, kill ComfyUI, no duplicates', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';
  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-watch-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });
  afterEach(() => {
    closeStudioDb();
    if (previousDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = previousDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('lands what finished, queues again what a restart lost — once — and the page sees the new jobs', async () => {
    const handed = { s1: 'p1', s2: 'p2', s3: 'p3', s4: 'p4', s5: 'p5' };
    writeSceneRun('global', {
      id: 'run-1',
      castId: 'mara',
      items: [],
      state: 'handed',
      handOff: { sceneIds: Object.keys(handed), handed },
      updatedAt: Date.now(),
    });
    for (const id of Object.values(handed))
      recordSubmittedGraph({ promptId: id, comfyUrl: COMFY, graph: { '1': { class_type: 'Take', inputs: { id } } } });
    const comfy = fakeComfy();
    const deps = { status: comfy.status, submit: comfy.submit };

    // The page closed; ComfyUI renders p1, has finished p2, holds p3 and p4; p5 it never had.
    comfy.jobs.set('p1', 'running').set('p2', 'completed').set('p3', 'pending').set('p4', 'pending');
    assert.deepEqual(await tickRunWatcher(deps), { watched: 5, landed: 1, requeued: 0 });

    // p4 cancelled from Castcut's Queue.
    markJobCancelled('p4');
    // ComfyUI killed: its queue and history are gone.
    comfy.jobs.clear();
    const after = await tickRunWatcher(deps);
    assert.equal(after.requeued, 2, 'p1 and p3 — not p4 (cancelled), not p5 (never seen)');
    assert.equal(comfy.submitted.length, 2);
    // Each queued again exactly as it was submitted.
    assert.deepEqual(readSubmittedGraph('q1')?.graph, { '1': { class_type: 'Take', inputs: { id: 'p1' } } });

    // Ticks after it: nothing queued twice, even with the new jobs lost too.
    await tickRunWatcher(deps);
    comfy.jobs.clear();
    await tickRunWatcher(deps);
    await tickRunWatcher(deps);
    assert.equal(comfy.submitted.length, 2, 'no duplicates');

    // The page asks about its own ids: p1 answers as q1 (rendering again), p2 as it finished
    // (ComfyUI forgot it; the watch kept it).
    comfy.jobs.set('q1', 'running');
    const p1 = await watchedPromptStatus('p1', undefined, comfy.status);
    assert.deepEqual([p1.promptId, p1.status], ['p1', 'running']);
    const p2 = await watchedPromptStatus('p2', undefined, comfy.status);
    assert.deepEqual([p2.promptId, p2.status, p2.images?.[0]?.filename], ['p2', 'completed', 'p2.png']);
    // q1 finishes: landed, and the page's p1 lands with its picture.
    comfy.jobs.set('q1', 'completed');
    const landed = await tickRunWatcher(deps);
    assert.equal(landed.landed, 1);
    comfy.jobs.delete('q1');
    const p1Done = await watchedPromptStatus('p1', undefined, comfy.status);
    assert.deepEqual([p1Done.promptId, p1Done.status, p1Done.images?.[0]?.filename], ['p1', 'completed', 'q1.png']);
    // p5 (never seen) stays lost as ComfyUI says.
    assert.equal((await watchedPromptStatus('p5', undefined, comfy.status)).statusMessage, COMFY_PROMPT_LOST_MESSAGE);
  });

  it('leaves runs a page renders, and does nothing without server storage', async () => {
    writeSceneRun('global', {
      id: 'run-2',
      castId: 'mara',
      items: [],
      state: 'running',
      handOff: { sceneIds: ['s1'], handed: { s1: 'p1' } },
      updatedAt: Date.now(),
    });
    const comfy = fakeComfy();
    assert.deepEqual(await tickRunWatcher({ status: comfy.status, submit: comfy.submit }), {
      watched: 0,
      landed: 0,
      requeued: 0,
    });
    delete process.env.PROMPT_DATA_DIR;
    assert.deepEqual(await tickRunWatcher({ status: comfy.status, submit: comfy.submit }), {
      watched: 0,
      landed: 0,
      requeued: 0,
    });
  });

  it('a server run’s lost take: sent again once its job is on the list; a failed send can be tried again', async () => {
    recordSubmittedGraph({ promptId: 'srv-1', comfyUrl: COMFY, graph: { '1': { class_type: 'Take', inputs: {} } } });
    // Not on the watch list: nothing to claim.
    assert.equal(await requeueLostJob('srv-1', { runId: 'run-s', sceneId: 's1' }), null);
    markJobSeen('srv-1', { runId: 'run-s', sceneId: 's1', comfyUrl: COMFY });
    // ComfyUI still starting: the send fails, the claim is let go.
    assert.equal(
      await requeueLostJob('srv-1', { runId: 'run-s', sceneId: 's1' }, { submit: async () => null }),
      null
    );
    const comfy = fakeComfy();
    const next = await requeueLostJob('srv-1', { runId: 'run-s', sceneId: 's1' }, { submit: comfy.submit });
    assert.equal(next, 'q1');
    assert.equal(comfy.submitted.length, 1);
    // Once only.
    assert.equal(await requeueLostJob('srv-1', { runId: 'run-s', sceneId: 's1' }, { submit: comfy.submit }), null);
    // Its status follows the new job.
    comfy.jobs.set('q1', 'completed');
    const status = await watchedPromptStatus('srv-1', undefined, comfy.status);
    assert.equal(status.status, 'completed');
    assert.equal(status.promptId, 'srv-1');
  });
});
