import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jobStatusTone } from './status-tone';

describe('jobStatusTone', () => {
  it('maps job states to one colour rule', () => {
    assert.equal(jobStatusTone('running'), 'accent');
    assert.equal(jobStatusTone('pending'), 'neutral');
    assert.equal(jobStatusTone('completed'), 'success');
    assert.equal(jobStatusTone('error'), 'danger');
    assert.equal(jobStatusTone('queued'), 'neutral');
    assert.equal(jobStatusTone(undefined), 'neutral');
  });
});
