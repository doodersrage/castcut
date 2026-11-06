import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  autopilotRun,
  DEFAULT_EPISODE_AUTOPILOT,
  normalizeEpisodeAutopilot,
  partsToConfirm,
} from './episode-autopilot';
import { normalizeEpisodeRunAuto } from './episode-run';
import type { SceneRun } from './scene-run';

const run = (items: number): SceneRun => ({
  id: 'r1',
  castId: 'lena',
  scriptId: 's1',
  label: 'Ep',
  items: Array.from({ length: items }, (_, i) => ({ sceneId: `s${i}`, include: i !== 0 })),
  maxTakes: 8,
  maxMinutes: 30,
  skipKept: true,
  state: 'prepared',
  position: 0,
  log: [],
  createdAt: 1,
  updatedAt: 1,
});

describe('episode autopilot', () => {
  it('confirms only the names that match one Cast member', () => {
    assert.deepEqual(
      partsToConfirm([
        { speaker: 'LENA', castId: 'lena', status: 'suggested', how: 'name' },
        { speaker: 'ROB', castId: 'rob', status: 'confirmed' },
        { speaker: 'TOMMY', status: 'unknown' },
        { speaker: 'GABLE', castId: null, status: 'confirmed' },
      ]),
      [{ speaker: 'LENA', castId: 'lena' }]
    );
  });

  it('starts the run as an episode, its limits fitted to the script', () => {
    const started = autopilotRun(run(11), { ...DEFAULT_EPISODE_AUTOPILOT, redo: 2, animate: 'lines' });
    // Ten Scenes in it (one left out), a take each and two redos.
    assert.equal(started.maxTakes, 30);
    assert.equal(started.maxMinutes, 24 * 60);
    assert.deepEqual(started.auto, {
      keep: true,
      redo: 2,
      animate: true,
      animateOnly: 'lines',
      cutWhenDone: true,
    });
    // Stored and read back, the cut is still asked for.
    assert.deepEqual(normalizeEpisodeRunAuto(JSON.parse(JSON.stringify(started.auto))), started.auto);
    const still = autopilotRun(run(3), { ...DEFAULT_EPISODE_AUTOPILOT, cutWhenDone: false });
    assert.deepEqual(still.auto, { keep: true, redo: 1, animate: false });
  });

  it('reads its settings, the defaults for anything odd', () => {
    assert.deepEqual(normalizeEpisodeAutopilot(null), DEFAULT_EPISODE_AUTOPILOT);
    assert.deepEqual(normalizeEpisodeAutopilot({ redo: 9, animate: 'dance', makeCast: false }), {
      makeCast: false,
      redo: 3,
      animate: 'none',
      cutWhenDone: true,
    });
  });
});
