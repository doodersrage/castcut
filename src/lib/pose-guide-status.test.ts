import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  poseGuideFailureReason,
  recordPoseGuideOutcome,
  summarizePoseGuideOutcomes,
  type PoseGuideOutcome,
} from './pose-guide-status';

const attached = (slotId: string, slotLabel: string): PoseGuideOutcome => ({
  slotId,
  slotLabel,
  state: 'attached',
});

describe('pose guide status', () => {
  it('says nothing before anything has queued', () => {
    assert.equal(summarizePoseGuideOutcomes([]), null);
  });

  it('confirms a clean run', () => {
    assert.equal(
      summarizePoseGuideOutcomes([attached('morning', 'Morning'), attached('night', 'Night')]),
      'Pose guide attached on 2 of 2 slots.'
    );
    assert.match(summarizePoseGuideOutcomes([attached('m', 'Morning')]) ?? '', /1 of 1 slot\./);
  });

  it('warns first when a guide attached on a text-to-image model', () => {
    const line = summarizePoseGuideOutcomes([
      {
        slotId: 'morning',
        slotLabel: 'Morning',
        state: 'attached',
        model: 'qwen-image-2512',
        editCapableModel: false,
      },
      { slotId: 'night', slotLabel: 'Night', state: 'failed', reason: 'boom' },
    ]);
    assert.match(line ?? '', /non-Edit model \(qwen-image-2512\)/);
    assert.match(line ?? '', /bleed into the still/);
    // An edit-capable attach says nothing special.
    assert.match(
      summarizePoseGuideOutcomes([
        {
          slotId: 'morning',
          slotLabel: 'Morning',
          state: 'attached',
          model: 'qwen-image-edit-2511',
          editCapableModel: true,
        },
      ]) ?? '',
      /attached on 1 of 1 slot\./
    );
  });

  it('leads with failures and names the reason', () => {
    const line = summarizePoseGuideOutcomes([
      attached('morning', 'Morning'),
      { slotId: 'night', slotLabel: 'Night', state: 'failed', reason: 'Upload failed (HTTP 401)' },
      { slotId: 'evening', slotLabel: 'Evening', state: 'failed' },
    ]);
    assert.match(line ?? '', /^Pose guide failed on Night and Evening — Upload failed \(HTTP 401\)/);
    assert.match(line ?? '', /keep the plate's pose/);
  });

  it('explains a by-design skip differently from a failure', () => {
    const allSkipped = summarizePoseGuideOutcomes([
      { slotId: 'a', slotLabel: 'Morning', state: 'skipped', reason: 'Lightning identity path' },
      { slotId: 'b', slotLabel: 'Night', state: 'skipped' },
    ]);
    assert.match(allSkipped ?? '', /^Pose guide off on Morning and Night — Lightning identity path/);
    assert.match(allSkipped ?? '', /prompt text/);

    const mixed = summarizePoseGuideOutcomes([
      attached('a', 'Morning'),
      attached('b', 'Afternoon'),
      { slotId: 'c', slotLabel: 'Night', state: 'skipped', reason: 'Lightning identity path' },
    ]);
    assert.equal(
      mixed,
      'Pose guide on 2 of 3 slots; off on Night — Lightning identity path.'
    );
  });

  it('lists three or more slots readably', () => {
    const line = summarizePoseGuideOutcomes([
      { slotId: 'a', slotLabel: 'Morning', state: 'failed' },
      { slotId: 'b', slotLabel: 'Afternoon', state: 'failed' },
      { slotId: 'c', slotLabel: 'Night', state: 'failed' },
    ]);
    assert.match(line ?? '', /Morning, Afternoon and Night/);
  });

  it('turns any thrown value into a short reason', () => {
    assert.equal(poseGuideFailureReason(new Error('  Pose guide PNG encode failed.  ')), 'Pose guide PNG encode failed.');
    assert.equal(poseGuideFailureReason('plain string'), 'plain string');
    assert.equal(poseGuideFailureReason(null), 'unknown error');
    assert.equal(poseGuideFailureReason(new Error('')), 'unknown error');
    // 157 chars + the ellipsis.
    const truncated = poseGuideFailureReason(new Error('x'.repeat(300)));
    assert.equal(truncated.length, 158);
    assert.ok(truncated.endsWith('…'));
  });

  it('upserts by slot id and keeps order', () => {
    let outcomes = recordPoseGuideOutcome([], attached('morning', 'Morning'));
    outcomes = recordPoseGuideOutcome(outcomes, attached('night', 'Night'));
    const before = outcomes;
    outcomes = recordPoseGuideOutcome(outcomes, {
      slotId: 'morning',
      slotLabel: 'Morning',
      state: 'failed',
      reason: 'boom',
    });
    assert.equal(outcomes.length, 2);
    assert.equal(outcomes[0]?.state, 'failed');
    assert.equal(outcomes[1]?.slotId, 'night');
    // Input array is never mutated.
    assert.equal(before[0]?.state, 'attached');
  });
});
