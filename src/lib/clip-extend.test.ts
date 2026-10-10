import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  colorMatchFilter,
  colorMatchGains,
  extendSegmentCount,
  extendStitchFilter,
  fallbackExtendBeats,
  parseExtendBeats,
  patchWanReplayGraph,
} from './clip-extend';
import { buildLtx25ExtendGraph, LTX25_EXTEND_SAVE_NODE } from './ltx25-renderer';

describe('Make it 30 s', () => {
  it('counts the segments to about 30 s', () => {
    // A 5 s LTX clip, 5 s segments overlapping 17 frames: 6 more.
    assert.equal(extendSegmentCount({ currentSec: 5, segmentSec: 121 / 24, overlapSec: 17 / 24 }), 6);
    assert.equal(extendSegmentCount({ currentSec: 29.5, segmentSec: 5, overlapSec: 0.7 }), 0);
    assert.equal(extendSegmentCount({ currentSec: 1, segmentSec: 2, overlapSec: 1.9 }), 8);
  });

  it('reads numbered beats and falls back to gentle ones', () => {
    assert.deepEqual(
      parseExtendBeats('Here you go:\n1. She sets the mug down on the counter.\n2) *smiles* She picks up her phone.\nok'),
      ['She sets the mug down on the counter.', 'She picks up her phone.']
    );
    assert.equal(fallbackExtendBeats(5).length, 5);
    assert.match(fallbackExtendBeats(1, 'explicit')[0]!, /keep going/);
  });

  it('guides an LTX segment with the tail on both passes and crops the guides', () => {
    const g = buildLtx25ExtendGraph({ lastFrame: 'f.png', tailVideo: 't.mp4', prompt: 'p', seed: 1, prefix: 'x' });
    assert.equal(g['60']!.inputs!.file, 't.mp4');
    assert.deepEqual(g['14']!.inputs!.video_latent, ['64', 2]);
    assert.deepEqual(g['24']!.inputs!.video_latent, ['66', 2]);
    assert.deepEqual(g['27']!.inputs!.guider, ['67', 0]);
    assert.deepEqual(g['29']!.inputs!.samples, ['68', 2]);
    assert.equal(g[LTX25_EXTEND_SAVE_NODE]!.class_type, 'SaveVideo');
  });

  it('replays a WAN graph from the last frame with the beat, a new seed and no end pose', () => {
    const wan = {
      '1': { class_type: 'LoadImage', inputs: { image: 'still.png' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: 'locked camera, pose held' } },
      '3': { class_type: 'LoraLoader', inputs: { conditioning: ['2', 0] } },
      '4': { class_type: 'WanFirstLastFrameToVideo', inputs: { start_image: ['1', 0], end_image: ['9', 0], positive: ['2', 0] } },
      '5': { class_type: 'KSampler', inputs: { seed: 5 } },
      '6': { class_type: 'SaveAnimatedWEBP', inputs: { filename_prefix: 'Castcut' } },
    };
    const out = patchWanReplayGraph(wan, { lastFrame: 'last.png', beat: 'They keep going.', seed: 42, prefix: 'Castcut-extend' })!;
    assert.equal(out.saveNode, '6');
    assert.equal(out.graph['1']!.inputs!.image, 'last.png');
    assert.equal(out.graph['2']!.inputs!.text, 'They keep going. locked camera, pose held');
    assert.equal(out.graph['4']!.inputs!.end_image, undefined);
    assert.equal(out.graph['5']!.inputs!.seed, 42);
    assert.equal(wan['1'].inputs.image, 'still.png');
  });

  it('crossfades video and sound across the seams', () => {
    const f = extendStitchFilter([120, 121, 121], [17, 17]);
    assert.match(f, /\[0:v\]\[1:v\]xfade=transition=fade:duration=0\.7083:offset=4\.2917\[v1\]/);
    assert.match(f, /\[v1\]\[2:v\]xfade=.*offset=8\.6250\[v2\]/);
    assert.match(f, /\[a1\]\[2:a\]acrossfade=d=0\.7083\[a2\]/);
  });

  it('pulls a tinted frame back to the first frame’s colours, within limits', () => {
    const ref = { mean: [120, 110, 100], std: [50, 50, 50] };
    const pink = { mean: [160, 105, 110], std: [50, 50, 50] };
    const match = colorMatchGains(ref, pink);
    assert.deepEqual(match.gain, [1, 1, 1]);
    assert.deepEqual(match.offset, [-40, 5, -10]);
    assert.equal(colorMatchGains(ref, { mean: [0, 0, 0], std: [5, 5, 5] }).gain[0], 1.25);
    assert.match(colorMatchFilter(match), /^lutrgb=r='clip\(val\*1\+-40,0,255\)':g=/);
  });
});
