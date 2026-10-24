import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayAnimateOptions,
  dayAnimateSettingsPatch,
  dayClipFrames,
  dayClipSeconds,
  DAY_H3_CARRY_ON_BEAT,
  DAY_H3_PART_GAIN,
  dayH3ExtraParts,
  dayH3TotalOut,
  dayTalkExtendBySec,
  dayTalkExtraParts,
  dayTalkTotalOut,
  DAY_TALK_OVERLAP_SECONDS,
  DAY_TALK_PART_SECONDS,
  normalizeDayClipExtraSeconds,
  normalizeDayTalkTotalSeconds,
  pendingDialogueStep,
} from './clip-length';
import { extendSegmentCount } from '../clip/extend';
import { normalizeDaySlotStills, upsertDaySlotStill } from './planner';
import { H3_MODEL_ID } from '../engine/h3-renderer';
import { LTX25_MODEL_ID } from '../video/ltx25-renderer';

describe('day clip length', () => {
  it('keeps the old defaults with no extra seconds', () => {
    assert.equal(dayClipFrames({ speaking: false, conversation: false }), 64);
    assert.equal(dayClipFrames({ speaking: true, conversation: false }), 80);
    assert.equal(dayClipFrames({ speaking: true, conversation: true }), 96);
  });

  it('adds the picked seconds at 16 fps', () => {
    assert.equal(dayClipFrames({ speaking: false, conversation: false, extraSeconds: 4 }), 128);
    assert.equal(dayClipFrames({ speaking: true, conversation: true, extraSeconds: 6 }), 192);
  });

  it('ignores lengths that are not offered', () => {
    assert.equal(normalizeDayClipExtraSeconds(3), 0);
    assert.equal(normalizeDayClipExtraSeconds('abc'), 0);
    assert.equal(normalizeDayClipExtraSeconds('6'), 6);
  });

  it('reports seconds per engine', () => {
    assert.equal(dayClipSeconds(128, 'wan-video'), 8);
    assert.ok(Math.abs(dayClipSeconds(128, LTX25_MODEL_ID) - 8) < 0.1);
    // H3's shortest trained length is ~5 s, so the 4 s default comes out longer there.
    assert.ok(dayClipSeconds(64, H3_MODEL_ID) >= 5);
  });
});

describe('talking clip dialogue length', () => {
  const first = dayClipSeconds(dayClipFrames({ speaking: true, conversation: false }), LTX25_MODEL_ID);

  it('offers 5 (the first clip alone) to 30 s, 5 by default', () => {
    assert.ok(Math.abs(first - 5) < 0.1);
    assert.equal(normalizeDayTalkTotalSeconds(undefined), 5);
    assert.equal(normalizeDayTalkTotalSeconds('20'), 20);
    assert.equal(normalizeDayTalkTotalSeconds(25), 5);
    assert.equal(dayTalkExtraParts(first, 5), 0);
  });

  it('counts extension parts to land nearest each length, each about 4.3 s', () => {
    const parts = [10, 15, 20, 30].map(total => dayTalkExtraParts(first, total));
    assert.deepEqual(parts, [1, 2, 3, 6]);
    for (const [index, total] of [10, 15, 20, 30].entries()) {
      // Within about half a part of the picked length.
      const out = dayTalkTotalOut(first, parts[index]!);
      assert.ok(Math.abs(out - total) <= 2.2, `${total} → ${out}`);
    }
  });

  it('asks the job for exactly one part per line, whatever the first clip measures', () => {
    for (const parts of [1, 2, 3, 6]) {
      const by = dayTalkExtendBySec(parts);
      assert.ok(by >= 2 && by <= 30);
      for (const clipSec of [4.9, 5.04, 5.3]) {
        const count = extendSegmentCount({
          currentSec: clipSec,
          targetSec: clipSec + by,
          segmentSec: DAY_TALK_PART_SECONDS,
          overlapSec: DAY_TALK_OVERLAP_SECONDS,
        });
        assert.equal(count, parts);
      }
    }
  });

  it('a talking total queues the default clip and keeps the lines for after it lands', () => {
    assert.deepEqual(
      dayAnimateOptions({ extraSeconds: 4, talkTotalSeconds: 15, lines: ['Hi', ' "so" ', ''] }),
      { extraSeconds: 0, dialogue: { targetSec: 15, lines: ['Hi', 'so', ''] } }
    );
    assert.deepEqual(dayAnimateOptions({ extraSeconds: 2, talkTotalSeconds: 5, lines: [] }), {
      extraSeconds: 0,
    });
    // Motion clips are as before.
    assert.deepEqual(dayAnimateOptions({ extraSeconds: 4, direction: 'waves' }), {
      direction: 'waves',
      extraSeconds: 4,
    });
  });

  it('remembers the talking total apart from the extra seconds', () => {
    assert.deepEqual(
      dayAnimateSettingsPatch({ extraSeconds: 0, talkTotalSeconds: 20 }, { dayClipExtraSeconds: 4 }),
      { dayTalkTotalSeconds: 20 }
    );
    assert.equal(
      dayAnimateSettingsPatch({ extraSeconds: 0, talkTotalSeconds: 5 }, { dayClipExtraSeconds: 4 }),
      null
    );
    assert.deepEqual(dayAnimateSettingsPatch({ extraSeconds: 6 }, { dayTalkTotalSeconds: 30 }), {
      dayClipExtraSeconds: 6,
    });
  });
});

describe('pending dialogue on a slot still', () => {
  const pending = { targetSec: 15, lines: ['Then this.', ''], tones: ['whisper', ''], forClip: 'job-1' };

  it('survives normalizing the stills, and a bad one is dropped', () => {
    const [still] = normalizeDaySlotStills([
      { slotId: 'morning', clipPromptId: 'job-1', clipStatus: 'queued', pendingDialogue: pending },
    ]);
    assert.deepEqual(still?.pendingDialogue, pending);
    const [bad] = normalizeDaySlotStills([
      {
        slotId: 'morning',
        pendingDialogue: { targetSec: 'x', lines: 'nope' } as unknown as typeof pending,
      },
    ]);
    assert.equal(bad && 'pendingDialogue' in bad, false);
  });

  it('a new Animate without one clears it', () => {
    const stills = normalizeDaySlotStills([
      { slotId: 'morning', clipPromptId: 'job-1', pendingDialogue: pending },
    ]);
    const next = upsertDaySlotStill(stills, {
      slotId: 'morning',
      clipPromptId: 'job-2',
      pendingDialogue: undefined,
    });
    assert.equal(normalizeDaySlotStills(next)[0]?.pendingDialogue, undefined);
  });

  it('starts when its own clip lands, waits while it renders, drops on a failed or other clip', () => {
    const base = { clipPromptId: 'job-1', pendingDialogue: pending };
    assert.equal(pendingDialogueStep({ clipPromptId: 'job-1' }), 'none');
    assert.equal(pendingDialogueStep({ ...base, clipStatus: 'queued' }), 'wait');
    assert.equal(pendingDialogueStep({ ...base, clipStatus: 'completed' }), 'wait');
    assert.equal(pendingDialogueStep({ ...base, clipStatus: 'completed', clipUrl: '/c.mp4' }), 'start');
    assert.equal(pendingDialogueStep({ ...base, clipStatus: 'error' }), 'drop');
    assert.equal(
      pendingDialogueStep({ ...base, clipPromptId: 'job-2', clipStatus: 'completed', clipUrl: '/c' }),
      'drop'
    );
    // A voiced copy replaced the clip: still the clip it was queued with.
    assert.equal(
      pendingDialogueStep({
        ...base,
        clipPromptId: 'kept-copy',
        clipRenderPromptId: 'job-1',
        clipStatus: 'completed',
        clipUrl: '/c.mp4',
      }),
      'start'
    );
  });

  it('grows a MiniMax-H3 clip in ~5 s parts to land near each total', () => {
    const first = dayClipSeconds(dayClipFrames({ speaking: false, conversation: false }), H3_MODEL_ID);
    assert.equal(dayH3ExtraParts(first, 5), 0);
    assert.deepEqual(
      [10, 15, 20, 30].map(total => dayH3ExtraParts(first, total)),
      [1, 2, 3, 5]
    );
    for (const total of [10, 15, 20, 30]) {
      assert.ok(Math.abs(dayH3TotalOut(first, dayH3ExtraParts(first, total)) - total) < 2.6);
    }
    // The server makes exactly one part per beat (extendBySec asks for no more).
    for (const parts of [1, 2, 3, 5]) {
      const needed = extendSegmentCount({
        currentSec: first,
        targetSec: first + dayTalkExtendBySec(parts),
        segmentSec: DAY_H3_PART_GAIN + 1 / 24,
        overlapSec: 1 / 24,
      });
      assert.ok(needed <= parts);
    }
  });

  it('queues wordless H3 parts with their beats and keeps the direction', () => {
    const beats = [DAY_H3_CARRY_ON_BEAT, DAY_H3_CARRY_ON_BEAT];
    assert.deepEqual(
      dayAnimateOptions({
        direction: 'she jogs on',
        extraSeconds: 0,
        talkTotalSeconds: 15,
        lines: ['', ''],
        beats,
      }),
      {
        direction: 'she jogs on',
        extraSeconds: 0,
        dialogue: { targetSec: 15, lines: ['', ''], beats },
      }
    );
    const pending = { targetSec: 15, lines: ['', ''], beats, forClip: 'job-9' };
    const [still] = normalizeDaySlotStills([
      { slotId: 'morning', clipPromptId: 'job-9', clipStatus: 'queued', pendingDialogue: pending },
    ]);
    // Kept through a reload while the first clip renders, beats and all.
    assert.deepEqual(still?.pendingDialogue, pending);
    assert.equal(pendingDialogueStep(still!), 'wait');
    assert.equal(
      pendingDialogueStep({ ...still!, clipStatus: 'completed', clipUrl: '/c.mp4' }),
      'start'
    );
  });
});
