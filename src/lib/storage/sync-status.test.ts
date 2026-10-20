import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  describeSyncStatus,
  getSyncStatus,
  noteSyncPending,
  noteSyncPull,
  noteSyncPush,
  resetSyncStatus,
} from './sync-status';

describe('sync status', () => {
  beforeEach(() => resetSyncStatus());

  it('starts not synced, then says when it last synced', () => {
    assert.equal(describeSyncStatus(getSyncStatus()).tone, 'none');
    noteSyncPull(true, 1_000_000);
    assert.equal(describeSyncStatus(getSyncStatus(), 1_000_000 + 120_000).text, 'Synced 2 min ago.');
  });

  it('a failed push stays until that namespace pushes again', () => {
    noteSyncPush('comfy-gallery', false, 1_000);
    noteSyncPush('settings-cache', true, 2_000);
    const failed = describeSyncStatus(getSyncStatus(), 2_000);
    assert.equal(failed.tone, 'error');
    assert.match(failed.text, /gallery/);
    noteSyncPush('comfy-gallery', true, 3_000);
    assert.equal(describeSyncStatus(getSyncStatus(), 3_000).tone, 'ok');
  });

  it('a scheduled push reads as waiting', () => {
    noteSyncPush('settings-cache', true, 1_000);
    noteSyncPending(true);
    assert.equal(describeSyncStatus(getSyncStatus(), 2_000).tone, 'waiting');
    noteSyncPending(false);
    assert.equal(describeSyncStatus(getSyncStatus(), 2_000).tone, 'ok');
  });
});
