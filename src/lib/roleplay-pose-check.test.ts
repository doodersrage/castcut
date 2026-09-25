import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { storyFlaggedBeats } from './roleplay-pose-check';
describe('storyFlaggedBeats', () => {
  const thresholds = { minPose: 0.6, minFace: 0.3, warnFace: 0.45 };
  const done = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    at: 1,
    stillStatus: 'completed',
    imageUrl: `/img/${id}.png`,
    ...extra,
  });

  it('flags failed stills and pose / face misses on the shown still', () => {
    const story = [
      done('ok', {
        poseMatch: { imageUrl: '/img/ok.png', score: 0.9, expectedPeople: 1, detectedPeople: 1 },
      }),
      done('pose', {
        poseMatch: { imageUrl: '/img/pose.png', score: 0.3, expectedPeople: 1, detectedPeople: 1 },
      }),
      done('face', { faceMatch: { imageUrl: '/img/face.png', similarity: 0.1 } }),
      { id: 'failed', at: 1, stillStatus: 'error' },
      { id: 'rendering', at: 1, stillStatus: 'running' },
      // A miss scored on an older take no longer applies.
      done('stale', {
        poseMatch: { imageUrl: '/img/old.png', score: 0.1, expectedPeople: 1, detectedPeople: 1 },
      }),
    ];
    assert.deepEqual(
      storyFlaggedBeats(story, thresholds).map(beat => beat.id),
      ['pose', 'face', 'failed']
    );
  });
});
