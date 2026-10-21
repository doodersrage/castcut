import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  cancelClipJob,
  clipJobEta,
  describeClipJobError,
  getClipJob,
  resetClipJobsForTest,
  runningClipJob,
  startClipJob,
  throwIfCancelled,
  type ClipJobContext,
} from './clip-jobs-server';
import { clipJobPercent, clipJobProgressText, ffmpegFailureMessage } from './clip-jobs';
import { MissingModelsError } from '../server/heavy-graph-server';

const tick = () => new Promise(resolve => setImmediate(resolve));

afterEach(() => resetClipJobsForTest());

describe('clip jobs (server)', () => {
  it('runs one job at a time, reports steps, and keeps the result', async () => {
    let context!: ClipJobContext;
    let finish!: (url: string) => void;
    const job = startClipJob('realism', ctx => {
      context = ctx;
      return new Promise(resolve => (finish = resolve));
    });
    assert.ok(job);
    assert.equal(job.status, 'running');
    assert.equal(startClipJob('finish', async () => '/x'), null, 'a second job waits its turn');
    assert.equal(runningClipJob()?.id, job.id);

    context.progress({ total: 3, note: 'Re-rendering part 1 of 2' });
    context.progress({ done: 1, note: 'Re-rendering part 2 of 2' });
    const mid = getClipJob(job.id)!;
    assert.equal(mid.done, 1);
    assert.equal(mid.total, 3);
    assert.equal(mid.note, 'Re-rendering part 2 of 2');
    assert.ok(mid.etaSec != null);

    finish('/api/comfyui/view?filename=out.mp4');
    await tick();
    const done = getClipJob(job.id)!;
    assert.equal(done.status, 'completed');
    assert.equal(done.url, '/api/comfyui/view?filename=out.mp4');
    assert.equal(runningClipJob(), null);
  });

  it('cancels: the work sees the abort and the job reads cancelled', async () => {
    let signal!: AbortSignal;
    const job = startClipJob('finish', ctx => {
      signal = ctx.signal;
      return new Promise((_, reject) =>
        ctx.signal.addEventListener('abort', () => reject(new Error('aborted')))
      );
    })!;
    assert.equal(cancelClipJob(job.id)?.status, 'cancelled');
    assert.equal(signal.aborted, true);
    await tick();
    assert.equal(getClipJob(job.id)?.status, 'cancelled');
    assert.throws(() => throwIfCancelled(signal), /Cancelled/);
  });

  it('a failure keeps its message, and names missing model files', async () => {
    const job = startClipJob(
      'realism',
      async () => {
        throw new MissingModelsError(
          'Make more realistic needs wan.safetensors, lora.safetensors in ComfyUI — install them from Settings → ComfyUI → Models.',
          ['wan.safetensors', 'lora.safetensors']
        );
      },
      { describeError: describeClipJobError }
    )!;
    await tick();
    const failed = getClipJob(job.id)!;
    assert.equal(failed.status, 'error');
    assert.deepEqual(failed.missing, ['wan.safetensors', 'lora.safetensors']);
  });

  it('estimates time left from the timed steps', () => {
    assert.equal(clipJobEta([], 0, 4), undefined);
    assert.equal(clipJobEta([120, 180], 2, 5), 450);
    assert.equal(clipJobEta([60], 3, 3), undefined);
  });
});

describe('clip jobs (shared)', () => {
  it('progress words and percent', () => {
    assert.equal(clipJobPercent({ done: 1, total: 4, status: 'running' }), 25);
    assert.equal(clipJobPercent({ done: 1, total: 4, status: 'completed' }), 100);
    assert.equal(
      clipJobProgressText({ note: 'Re-rendering part 2 of 4', etaSec: 400 }),
      'Re-rendering part 2 of 4 · about 7 min left'
    );
    assert.equal(clipJobProgressText({ note: 'Joining' }), 'Joining');
  });

  it("ffmpeg's log becomes one short reason", () => {
    const log = [
      'ffmpeg version 7.1 Copyright (c) 2000-2024',
      '  configuration: --enable-gpl --enable-libx264 …',
      'Input #0, mov,mp4,m4a,3gp,3g2,mj2, from clip.bin:',
      '[h264 @ 0x55d0c8a1b2c0] Invalid NAL unit size (1234 > 567).',
      'Error while decoding stream #0:0: Invalid data found when processing input',
    ].join('\n');
    assert.equal(
      ffmpegFailureMessage(log, 1),
      'ffmpeg could not process the clip (Error while decoding stream #0:0: Invalid data found when processing input).'
    );
    assert.equal(ffmpegFailureMessage('', 137), 'ffmpeg could not process the clip (exit 137).');
  });
});
