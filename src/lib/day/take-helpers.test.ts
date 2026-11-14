import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { locationPictureGraph, locationPicturePrompt } from '@/lib/location/picture';
import { placeShotJob, placeShotStill } from './take-helpers';

describe('a place-only shot (take-helpers.ts)', () => {
  it('the empty place from the shot’s words, indoors unless it says outdoors', () => {
    const job = placeShotJob(
      { location: 'rooftop bar', sceneHints: 'string lights, empty stools' },
      { character: null, leadNoun: 'woman' }
    );
    assert.equal(
      job.prompt,
      locationPicturePrompt({ name: 'rooftop bar', look: 'string lights, empty stools', setting: 'INT' })
    );
    const outdoors = placeShotJob(
      { location: 'a park, outdoors', sceneHints: '' },
      { character: null, leadNoun: 'woman' }
    );
    assert.match(outdoors.prompt, /park/);
    const graph = JSON.parse(job.workflowJson) as Record<string, { class_type: string }>;
    assert.deepEqual(
      Object.values(graph).map(node => node.class_type),
      Object.values(locationPictureGraph({ name: 'x', look: '', setting: 'INT' }, 1)).map(
        node => node.class_type
      )
    );
    assert.equal(placeShotJob({}, { character: null, leadNoun: 'woman' }).prompt.includes('the place'), true);
  });

  it('its still: queued with its job, or an error when it did not queue', () => {
    assert.deepEqual(
      [placeShotStill({ id: 'evening' }, 'p1').status, placeShotStill({ id: 'evening' }, 'p1').promptId],
      ['queued', 'p1']
    );
    assert.equal(placeShotStill({ id: 'evening' }, '').status, 'error');
  });
});
