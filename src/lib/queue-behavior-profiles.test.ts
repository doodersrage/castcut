import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  QUEUE_BEHAVIOR_PROFILES,
  applyQueueBehaviorProfile,
  detectQueueBehaviorProfile,
} from './queue-behavior-profiles';
import type { SharedToolSettings } from './settings-cache';

describe('queue-behavior-profiles', () => {
  it('detects reliable defaults', () => {
    const shared = {
      ...applyQueueBehaviorProfile('reliable'),
    } as SharedToolSettings;
    assert.equal(detectQueueBehaviorProfile(shared), 'reliable');
  });

  it('detects studio and raw', () => {
    assert.equal(
      detectQueueBehaviorProfile(applyQueueBehaviorProfile('studio') as SharedToolSettings),
      'studio'
    );
    assert.equal(
      detectQueueBehaviorProfile(applyQueueBehaviorProfile('raw') as SharedToolSettings),
      'raw'
    );
  });

  it('returns null for custom mixes', () => {
    const shared = {
      ...applyQueueBehaviorProfile('reliable'),
      workflowGraphEnrich: false,
    } as SharedToolSettings;
    assert.equal(detectQueueBehaviorProfile(shared), null);
  });

  it('exposes three profiles with patches', () => {
    assert.equal(QUEUE_BEHAVIOR_PROFILES.length, 3);
    for (const profile of QUEUE_BEHAVIOR_PROFILES) {
      assert.ok(profile.label);
      assert.equal(typeof profile.shared.directWorkflowPatching, 'boolean');
    }
  });
});
