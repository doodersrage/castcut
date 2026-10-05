import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  injectPromptsWithFallbacks,
  resolvePlaceholderTokens,
  resolveQueueParams,
} from './comfyui-config';
import {
  activeDayEndPose,
  buildDayEndPoseEditPrompt,
  DAY_END_POSE_FRAMING_WARNING,
  dayEndPoseCandidates,
  dayEndPoseFramingWarning,
  dayEndPoseSupported,
  normalizeDayEndPose,
  withDayEndPoseMotion,
} from './day-end-pose';
import { normalizeDaySlotStills, upsertDaySlotStill } from './day-planner';
import { buildWorkflowScaffoldForModel } from './workflow-scaffold';

type Node = { class_type: string; inputs: Record<string, unknown> };

/** The clip graph the queue builds for a Day still (scaffold → inject → I2V wire → LTX swap). */
function buildClipGraph(model: 'wan-video' | 'ltx-video-2.5', endImage?: string) {
  const params = resolveQueueParams(undefined, {
    seed: '7',
    width: '960',
    height: '1280',
    videoFrames: 64,
    videoFps: 16,
    inputImageFilename: 'day-still.png',
    ...(endImage !== undefined ? { videoEndImageFilename: endImage } : {}),
  });
  return injectPromptsWithFallbacks(
    JSON.parse(buildWorkflowScaffoldForModel(model).json) as Record<string, unknown>,
    { positive: 'she turns and smiles', negative: 'flicker', params },
    resolvePlaceholderTokens(),
    {
      model,
      directWorkflowPatching: true,
      ...(model === 'ltx-video-2.5' ? { videoRenderer: 'ltx-2.5' as const } : {}),
    }
  ).workflow as Record<string, Node>;
}

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('Day end pose', () => {
  it('leaves the plain clip graph byte-identical when no end pose is set', () => {
    // Hashes of the graphs the queue built before end poses existed (2026-10-03). Only update
    // them when the plain clip graph is meant to change. WAN changed 2026-10-04: its canvas is
    // sized from the still (wan-clip-canvas.ts).
    assert.equal(
      sha(buildClipGraph('wan-video')),
      '6cd29076c5195c6304349f988e971d6c367c7dd23580d8627239d6380f58114b'
    );
    assert.equal(
      sha(buildClipGraph('ltx-video-2.5')),
      '401fa5e29b87a10030a5f82e403900e022e6ac34e7960aba1a654139b1cd9f34'
    );
    assert.deepEqual(buildClipGraph('wan-video', ''), buildClipGraph('wan-video'));
  });

  it('queues the end image through both engines', () => {
    const wan = Object.values(buildClipGraph('wan-video', 'end-pose.png'));
    assert.ok(wan.some(node => node.class_type === 'WanFirstLastFrameToVideo'));
    assert.ok(wan.some(node => node.class_type === 'LoadImage' && node.inputs.image === 'end-pose.png'));
    const ltx = Object.values(buildClipGraph('ltx-video-2.5', 'end-pose.png'));
    assert.equal(ltx.filter(node => node.class_type === 'LTXVAddGuide').length, 2);
    assert.ok(ltx.some(node => node.class_type === 'LoadImage' && node.inputs.image === 'end-pose.png'));
  });

  it('normalises stored end poses on Day stills', () => {
    assert.equal(normalizeDayEndPose(null), undefined);
    assert.equal(normalizeDayEndPose({ source: 'edit' }), undefined);
    assert.deepEqual(normalizeDayEndPose({ imageUrl: ' /e.png ', source: 'bogus', extra: 1 }), {
      imageUrl: '/e.png',
      source: 'still',
    });
    const [still] = normalizeDaySlotStills([
      {
        slotId: 'morning',
        status: 'completed',
        imageUrl: '/m.png',
        endPose: { imageUrl: '/e.png', source: 'edit', poseWords: 'arms raised', forTake: 'p1' },
      },
    ]);
    assert.deepEqual(still!.endPose, {
      imageUrl: '/e.png',
      source: 'edit',
      forTake: 'p1',
      poseWords: 'arms raised',
    });
    const [plain] = normalizeDaySlotStills([{ slotId: 'morning', imageUrl: '/m.png' }]);
    assert.equal('endPose' in plain!, false);
    const cleared = upsertDaySlotStill([still!], { slotId: 'morning', endPose: undefined });
    assert.equal(cleared[0]!.endPose, undefined);
  });

  it('drops an end pose made for an earlier take', () => {
    const endPose = { imageUrl: '/e.png', source: 'edit' as const, forTake: 'p1' };
    assert.equal(activeDayEndPose({ promptId: 'p1', endPose }), endPose);
    assert.equal(activeDayEndPose({ promptId: 'p2', endPose }), undefined);
    assert.equal(activeDayEndPose({ promptId: 'p2' }), undefined);
  });

  it('gates on the clip engine’s nodes', () => {
    const wan = new Set(['WanImageToVideo', 'WanFirstLastFrameToVideo']);
    const ltx = new Set(['LTXVImgToVideoInplace', 'LTXVAddGuide', 'LTXVCropGuides']);
    assert.equal(dayEndPoseSupported('wan-video', wan), true);
    assert.equal(dayEndPoseSupported('wan-video', ltx), false);
    assert.equal(dayEndPoseSupported('ltx-video-2.5', ltx), true);
    assert.equal(dayEndPoseSupported('ltx-video-2.5', wan), false);
    assert.equal(dayEndPoseSupported('hunyuan-video', wan), false);
    assert.equal(dayEndPoseSupported('wan-video', null), false);
  });

  it('warns when the end still comes from another slot', () => {
    assert.equal(
      dayEndPoseFramingWarning('morning', { imageUrl: '/e', source: 'still', fromSlotId: 'night' }),
      DAY_END_POSE_FRAMING_WARNING
    );
    assert.equal(
      dayEndPoseFramingWarning('morning', { imageUrl: '/e', source: 'edit' }),
      null
    );
    assert.deepEqual(
      dayEndPoseCandidates(
        [
          { slotId: 'morning', status: 'completed', imageUrl: '/m' },
          { slotId: 'afternoon', status: 'queued' },
          { slotId: 'night', status: 'completed', imageUrl: '/n' },
        ],
        'morning'
      ).map(still => still.slotId),
      ['night']
    );
  });

  it('writes a short same-camera re-pose edit and names the end in the motion', () => {
    assert.equal(
      buildDayEndPoseEditPrompt('arms raised, laughing.', 'woman'),
      'Edit Image 1: the same person, same clothes, same place and camera framing, now arms raised, laughing. Keep her face, hair, skin tone and body shape exactly; same light. Photoreal.'
    );
    assert.equal(
      withDayEndPoseMotion('She stretches by the window.', {
        imageUrl: '/e',
        source: 'edit',
        poseWords: 'arms raised',
      }),
      'She stretches by the window; by the end of the clip, arms raised.'
    );
    assert.equal(withDayEndPoseMotion('She stretches.', undefined), 'She stretches.');
  });
});
