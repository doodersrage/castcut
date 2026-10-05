import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextStoryPoseCheck, storyFlaggedBeats } from './roleplay-pose-check';
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

describe('nextStoryPoseCheck keys', () => {
  // A gallery-stored still is shown from /api/gallery/media but checked in ComfyUI through its
  // /api/comfyui/view URL. The hook must record the shown URL, or the beat is picked forever.
  const expect = { promptId: 'p1', keypoints: [], aspect: 0.75, style: 'openpose', poseKey: 'stand' };
  const beat = (extra: Record<string, unknown> = {}) => ({
    id: 'b1',
    at: 1,
    promptId: 'p1',
    stillStatus: 'completed',
    imageUrl: '/api/gallery/media/abc/original',
    poseGuideExpect: expect as never,
    ...extra,
  });
  const comfyUrl = '/api/comfyui/view?filename=Castcut_00001_.png&type=output';

  it('a check recorded under the shown URL is done', () => {
    const checked = beat({ poseMatch: { imageUrl: '/api/gallery/media/abc/original', score: 0.8, expectedPeople: 1, detectedPeople: 1 } });
    assert.equal(nextStoryPoseCheck([checked]), null);
  });

  it('a check recorded under the ComfyUI URL is not (the old loop)', () => {
    const checked = beat({ poseMatch: { imageUrl: comfyUrl, score: 0.8, expectedPeople: 1, detectedPeople: 1 } });
    assert.equal(nextStoryPoseCheck([checked])?.id, 'b1');
  });

  it('a failed check skipped under the shown URL is not retried', () => {
    assert.equal(nextStoryPoseCheck([beat()], new Set(['/api/gallery/media/abc/original'])), null);
    assert.equal(nextStoryPoseCheck([beat()], new Set([comfyUrl]))?.id, 'b1');
  });
});
