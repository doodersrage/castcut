import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isServerScheduledBatchEnabled } from './server-scheduled-batch';

describe('isServerScheduledBatchEnabled', () => {
  it('turns on from stored overlay even when env is unset', () => {
    assert.equal(isServerScheduledBatchEnabled(true, undefined), true);
    assert.equal(isServerScheduledBatchEnabled(true, 'false'), true);
  });

  it('turns on from SERVER_SCHEDULED_BATCH=true when storage has no overlay', () => {
    assert.equal(isServerScheduledBatchEnabled(undefined, 'true'), true);
    assert.equal(isServerScheduledBatchEnabled(false, 'true'), true);
  });

  it('stays off unless stored overlay or env forces it', () => {
    assert.equal(isServerScheduledBatchEnabled(undefined, undefined), false);
    assert.equal(isServerScheduledBatchEnabled(false, 'false'), false);
  });
});
