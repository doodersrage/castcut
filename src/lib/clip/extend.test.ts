import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildExtendBeatsMessages,
  colorMatchFilter,
  colorMatchGains,
  extendSegmentCount,
  extendStitchFilter,
  fallbackExtendBeats,
  laplacianVariance,
  parseExtendBeats,
  pickStartSharpenIndex,
  patchWanReplayGraph,
} from './extend';
import { buildLtx25ExtendGraph, extendSegmentPrompt, LTX25_EXTEND_SAVE_NODE } from '../video/ltx25-renderer';
import { h3PartPrompt } from '../engine/h3-renderer';
import { buildDaySlotClipPrompt, dayPartClipPrompt } from '../day/clip-direction';
import type { DaySlot } from '../day/planner';

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

  // M11 T1: a part does its own beat; the first clip's action (the player's direction) stays there.
  it('a part says its own beat, not the first clip’s direction again', () => {
    const slot = { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' } as DaySlot;
    const first = buildDaySlotClipPrompt({ slot, direction: 'She throws the mug at the wall' });
    assert.match(first, /throws the mug/);
    const part = dayPartClipPrompt({ slot, beat: 'She sweeps up the pieces' });
    assert.match(part, /sweeps up the pieces/);
    assert.doesNotMatch(part, /throws the mug/);
    // H3: the part's prompt in place of the clip's.
    const h3 = h3PartPrompt(part, { beat: 'She sweeps up the pieces', place: 'kitchen' });
    assert.doesNotMatch(h3, /throws the mug/);
    assert.match(h3, /sweeps up the pieces/);
    // WAN: the part's own text in place of the clip's.
    const wan = {
      '1': { class_type: 'LoadImage', inputs: { image: 'still.png' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: first } },
      '4': { class_type: 'WanImageToVideo', inputs: { start_image: ['1', 0], positive: ['2', 0] } },
      '6': { class_type: 'SaveAnimatedWEBP', inputs: { filename_prefix: 'x' } },
    };
    const out = patchWanReplayGraph(wan, { lastFrame: 'l.png', beat: 'Then.', seed: 1, prefix: 'p', ownText: part })!;
    assert.doesNotMatch(String(out.graph['2']!.inputs!.text), /throws the mug/);
    assert.match(String(out.graph['2']!.inputs!.text), /^Then\. .*sweeps up the pieces/);
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

  it('steers the beats toward the player’s direction', () => {
    const [system, user] = buildExtendBeatsMessages({
      scene: 'at the counter with coffee',
      count: 5,
      direction: 'she grabs her keys and leaves',
    });
    assert.match(system!.content, /follow that, spread over the beats/);
    assert.match(user!.content, /Where it should go: she grabs her keys and leaves/);
    assert.doesNotMatch(buildExtendBeatsMessages({ scene: 'x', count: 2 })[0]!.content, /follow that/);
  });

  it('a talking clip’s beats keep the speaker in place, never moving toward the camera', () => {
    const [system] = buildExtendBeatsMessages({ scene: 'x', count: 3, heat: 'sensual', talking: true });
    assert.match(system!.content, /never stepping, leaning or moving toward it/);
    assert.doesNotMatch(system!.content, /moving a little|kisses/);
    const beats = fallbackExtendBeats(4, 'explicit', { speaker: 'He' });
    assert.equal(beats.length, 4);
    for (const beat of beats) assert.match(beat, /^He /);
    assert.doesNotMatch(beats.join(' '), /toward the camera|closer|They /);
    const part = extendSegmentPrompt('She nods.', 'kitchen', { line: 'Then we go.' });
    assert.match(part, /stays exactly where she is, the same distance from the camera/);
    assert.doesNotMatch(extendSegmentPrompt('She nods.', 'kitchen'), /same distance/);
  });

  it('a part with a line says it while doing its beat; without one it stays wordless', () => {
    const talking = extendSegmentPrompt('She picks up her keys.', 'kitchen', { line: 'Wait — where are my keys?' });
    assert.match(talking, /As she does, she says clearly, "Wait — where are my keys\?" — her lips move/);
    assert.doesNotMatch(talking, /natural sound of/);
    assert.match(extendSegmentPrompt('He waves.', undefined, { line: 'See you tonight.', speaker: 'He' }), /As he does, he says clearly/);
    assert.match(
      extendSegmentPrompt('She waves.', 'a bright kitchen'),
      /Sound: the natural sound of the bright kitchen — soft room tone/
    );
    assert.doesNotMatch(extendSegmentPrompt('She waves.'), /nobody speaks/);
    const speaks = buildLtx25ExtendGraph({ lastFrame: 'f', tailVideo: 't', prompt: 'p', seed: 1, prefix: 'x', speaks: true });
    assert.doesNotMatch(String(speaks['3']!.inputs!.text), /speech/);
  });
});


describe('WAN start-frame sharpening', () => {
  it('laplacianVariance is zero on a flat frame and rises with edges', () => {
    const flat = new Uint8Array(16 * 16).fill(128);
    assert.equal(laplacianVariance(flat, 16, 16), 0);
    const checker = Uint8Array.from({ length: 16 * 16 }, (_, i) =>
      ((i % 16) + Math.floor(i / 16)) % 2 ? 255 : 0
    );
    assert.ok(laplacianVariance(checker, 16, 16) > 1000);
  });

  it('pickStartSharpenIndex takes the strongest step that does not pass the clip', () => {
    assert.equal(pickStartSharpenIndex(100, [60, 80, 95, 120]), 2);
    assert.equal(pickStartSharpenIndex(100, [130]), -1);
    assert.equal(pickStartSharpenIndex(500, [60, 80, 95, 120, 160]), 4);
  });
});
