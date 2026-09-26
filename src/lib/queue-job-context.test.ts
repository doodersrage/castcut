import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import type { DaySlot, DaySlotStill } from './day-planner';
import { estimateQueueEta, formatEta, typicalRenderMs } from './queue-eta';
import {
  buildPlayJobIndex,
  describeQueueJob,
  groupQueueJobs,
  repointPlayJobIds,
} from './queue-job-context';
import type { RoleplayStoryBeat } from './roleplay';

const slots: DaySlot[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'evening', label: 'Evening' },
];
const stills: DaySlotStill[] = [
  { slotId: 'morning', promptId: 'p-m', status: 'completed' },
  { slotId: 'evening', promptId: 'p-e', clipPromptId: 'c-e', status: 'running' },
];
const story = [
  {
    id: 'b1',
    at: 1,
    title: 'The letter',
    blurb: 'x',
    promptId: 'p-b1-2',
    stillTakes: [{ promptId: 'p-b1-1' }, { promptId: 'p-b1-2' }],
  },
  { id: 'b2', at: 2, title: 'The train', blurb: 'y', promptId: 'p-b2', clipPromptId: 'c-b2' },
] as RoleplayStoryBeat[];

const entry = (overrides: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry => ({
  id: 'e',
  promptId: 'p',
  prompt: 'x',
  comfyUrl: 'http://127.0.0.1:8188',
  status: 'pending',
  queuedAt: 0,
  images: [],
  ...overrides,
});

describe('what a queue job is', () => {
  const index = buildPlayJobIndex({ daySlots: slots, dayStills: stills, story });

  it('names Day slots and clips, with the Cast and a link back', () => {
    const job = describeQueueJob({ promptId: 'p-e', tool: 'day', characterId: 'c1' }, index, 'Robin');
    assert.equal(job.label, 'Day · Evening · Robin');
    assert.equal(job.href, '/day?character=c1');
    assert.equal(job.openLabel, 'Open in Day');
    assert.equal(describeQueueJob({ promptId: 'c-e' }, index).label, 'Day · Evening · clip');
  });

  it('names Story beats, retries and clips', () => {
    assert.equal(describeQueueJob({ promptId: 'p-b1-1' }, index).label, 'Story · beat 1 “The letter”');
    assert.equal(
      describeQueueJob({ promptId: 'p-b1-2' }, index).label,
      'Story · beat 1 “The letter” · retry'
    );
    assert.equal(describeQueueJob({ promptId: 'c-b2' }, index).label, 'Story · beat 2 “The train” · clip');
    assert.equal(describeQueueJob({ promptId: 'p-b2' }, index).openLabel, 'Open in Story');
  });

  it('falls back to the tool for everything else', () => {
    const job = describeQueueJob({ promptId: 'zzz', tool: 'refine' }, index, 'Robin');
    assert.equal(job.label, 'Refine · Robin');
    assert.equal(job.href, '/refine');
    assert.equal(job.source, 'refine');
  });
});

describe('batches', () => {
  it('groups consecutive jobs from one place and Cast queued close together', () => {
    const jobs = [
      entry({ id: 'd1', queuedAt: 0, characterId: 'c1' }),
      entry({ id: 'd2', queuedAt: 30_000, characterId: 'c1' }),
      entry({ id: 'd3', queuedAt: 60_000, characterId: 'c1' }),
      entry({ id: 's1', queuedAt: 90_000, characterId: 'c1' }),
      entry({ id: 'd4', queuedAt: 20 * 60_000, characterId: 'c1' }),
    ];
    const source = (job: ComfyGalleryEntry) => (job.id.startsWith('d') ? 'day' : 'story');
    const groups = groupQueueJobs(jobs, source);
    assert.deepEqual(
      groups.map(group => group.entries.map(job => job.id)),
      [['d1', 'd2', 'd3'], ['s1'], ['d4']]
    );
    assert.equal(groups[0]?.batchLabel, 'Day · 3 jobs');
    assert.equal(groups[1]?.batchLabel, undefined);
  });
});

describe('run next keeps the slot / beat pointed at the job', () => {
  it('re-points Day stills, clips and Story takes to the new prompt id', () => {
    const moved = repointPlayJobIds({ dayStills: stills, story, from: 'p-b1-2', to: 'NEW' });
    assert.ok(moved);
    assert.equal(moved.story?.[0]?.promptId, 'NEW');
    assert.equal(moved.story?.[0]?.stillTakes?.[1]?.promptId, 'NEW');
    assert.equal(moved.story?.[0]?.stillTakes?.[0]?.promptId, 'p-b1-1');
    const clip = repointPlayJobIds({ dayStills: stills, story, from: 'c-e', to: 'NEW2' });
    assert.equal(clip?.dayStills?.[1]?.clipPromptId, 'NEW2');
    assert.equal(repointPlayJobIds({ dayStills: stills, story, from: 'nope', to: 'x' }), null);
  });
});

describe('time left', () => {
  const done = (model: string, ms: number, at: number) =>
    entry({ id: `${model}-${at}`, model, status: 'completed', renderDurationMs: ms, completedAt: at });

  it('uses the median recent render for the model, else any, else a minute', () => {
    const completed = [done('qwen', 30_000, 1), done('qwen', 50_000, 2), done('qwen', 40_000, 3), done('flux', 90_000, 4)];
    assert.equal(typicalRenderMs(completed, 'qwen'), 40_000);
    assert.equal(typicalRenderMs(completed, 'wan'), 50_000, 'no wan jobs: median of all four');
    assert.equal(typicalRenderMs([], 'qwen'), 60_000);
  });

  it('adds the running remainder and each waiting job in queue order', () => {
    const completed = [done('qwen', 40_000, 1)];
    const eta = estimateQueueEta(
      [
        entry({ id: 'w2', model: 'qwen', status: 'pending', queuePosition: 3 }),
        entry({ id: 'run', model: 'qwen', status: 'running', progressValue: 3, progressMax: 4 }),
        entry({ id: 'w1', model: 'qwen', status: 'pending', queuePosition: 2 }),
      ],
      completed
    );
    assert.equal(eta.byId.get('run'), 10);
    assert.equal(eta.byId.get('w1'), 50);
    assert.equal(eta.byId.get('w2'), 90);
    assert.equal(eta.totalSec, 90);
    assert.equal(eta.guess, false);
    // Two hosts share the queue.
    const two = estimateQueueEta(
      [entry({ id: 'a', model: 'qwen' }), entry({ id: 'b', model: 'qwen' })],
      completed,
      2
    );
    assert.equal(two.totalSec, 40);
  });

  it('formats short and long waits', () => {
    assert.equal(formatEta(12), '~10 s');
    assert.equal(formatEta(360), '~6 min');
    assert.equal(formatEta(4800), '~1 h 20 min');
    assert.equal(formatEta(0), '');
  });
});
