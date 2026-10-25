import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { productionReferenceValues, referenceValuesIn } from './gallery-references';

describe('play gallery references (R1b)', () => {
  it('finds the takes of every scene, kept or not, with their clips', () => {
    const values = productionReferenceValues({
      scene: {
        scenes: [
          {
            id: 'scene-1',
            name: 'Scene 1',
            takes: [
              { id: 'p-old', promptId: 'p-old', imageUrl: '/api/gallery/media/e-old', at: 1 },
              {
                id: 'p-kept',
                promptId: 'p-kept',
                imageUrl: '/api/gallery/media/e-kept',
                clipUrl: '/api/comfyui/view?filename=clip_0001.mp4&type=output',
                clipPromptId: 'p-clip',
                at: 2,
              },
            ],
            keptTakeId: 'p-kept',
          },
        ],
        stills: [{ slotId: 'afternoon', promptId: 'p-on-card', status: 'running' }],
      },
    });
    for (const value of [
      'p-old',
      '/api/gallery/media/e-old',
      'p-kept',
      'p-clip',
      '/api/comfyui/view?filename=clip_0001.mp4&type=output',
      'p-on-card',
    ]) {
      assert.ok(values.includes(value), value);
    }
  });

  it("finds Day's stills, the takes they replaced, a parked Day's, Story's and Cut's", () => {
    const values = productionReferenceValues({
      day: {
        stills: [
          {
            slotId: 'morning',
            promptId: 'p-day',
            previousTake: { imageUrl: '/api/gallery/media/e-prev', promptId: 'p-prev' },
            fixHistory: [{ imageUrl: '/api/gallery/media/e-fix', promptId: 'p-fix' }],
          },
        ],
        parkedDays: { 'cast-2': { stills: [{ slotId: 'night', promptId: 'p-parked' }] } },
      },
      story: [{ at: 1, stillTakes: [{ promptId: 'p-beat' }], clipTakes: [{ clipPromptId: 'p-bc' }] }],
      savedStories: [[{ at: 2, promptId: 'p-saved-beat' }]],
      cut: {
        extras: [{ key: 'x:1', kind: 'media', url: '/api/gallery/media/e-extra', entryId: 'e-extra' }],
        versions: [{ id: 'v1', extras: [{ key: 'x:2', kind: 'generated', promptId: 'p-gen' }] }],
      },
    });
    for (const value of [
      'p-day',
      'p-prev',
      'p-fix',
      'p-parked',
      'p-beat',
      'p-bc',
      'p-saved-beat',
      'e-extra',
      'p-gen',
    ]) {
      assert.ok(values.includes(value), value);
    }
  });

  it('counts id- and URL-shaped strings only, and bounds a malformed blob', () => {
    const values = referenceValuesIn({
      sceneHints: 'she reads by the window',
      line: 'Good morning.',
      id: 'abc',
      inline: `data:image/png;base64,${'A'.repeat(4000)}`,
      promptId: 'prompt-1',
    });
    assert.deepEqual(values, ['prompt-1']);

    let deep: Record<string, unknown> = { promptId: 'too-deep' };
    for (let i = 0; i < 20; i += 1) deep = { next: deep };
    assert.deepEqual(referenceValuesIn(deep), []);
    assert.deepEqual(productionReferenceValues({}), []);
  });
});
