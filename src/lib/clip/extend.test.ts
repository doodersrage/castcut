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
  castReferencesForExtend,
  groupH3Blocks,
  loudestWindow,
  parseShotInventory,
  renumberH3Pictures,
  extendFacesNote,
  pickAnchorFrame,
  withPartAction,
} from './extend';
import { buildLtx25ExtendGraph, extendSegmentPrompt, LTX25_EXTEND_SAVE_NODE } from '../video/ltx25-renderer';
import { h3PartPrompt } from '../engine/h3-renderer';

describe('Make it 30 s', () => {
  it('counts the segments to about 30 s', () => {
    // A 5 s LTX clip, 5 s segments overlapping 17 frames: 6 more.
    assert.equal(extendSegmentCount({ currentSec: 5, segmentSec: 121 / 24, overlapSec: 17 / 24 }), 6);
    assert.equal(extendSegmentCount({ currentSec: 29.5, segmentSec: 5, overlapSec: 0.7 }), 0);
    assert.equal(extendSegmentCount({ currentSec: 1, segmentSec: 2, overlapSec: 1.9 }), 8);
  });

  // M11: written beats keep to what is in the shot — "picking something up" brought props.
  it('asks for beats with nothing new in the shot', () => {
    const [system] = buildExtendBeatsMessages({ scene: 'relaxing on the towel', count: 3 });
    assert.match(system!.content, /no new objects/);
    assert.doesNotMatch(system!.content, /picking something up/);
  });

  // M11 T4: the next part starts from the frame whose face is most the Cast's.
  it('picks the best face frame, the latest when near it, the last frame when none has a face', () => {
    assert.deepEqual(
      pickAnchorFrame(
        [
          { index: 123, similarity: 0.31 },
          { index: 119, similarity: 0.58 },
          { index: 115, similarity: 0.6 },
          { index: 111, similarity: null },
        ],
        123
      ),
      { index: 119, similarity: 0.58 }
    );
    assert.deepEqual(pickAnchorFrame([{ index: 123, similarity: null }], 123), {
      index: 123,
      similarity: null,
    });
  });

  // M11: the Cast's face and plate for H3's reference model, as tested.
  it('sends the face lock and the plate, her clothes left to the start frame', () => {
    assert.deepEqual(castReferencesForExtend({}), {});
    assert.deepEqual(
      castReferencesForExtend({ face: '/face.png', body: '/plate.png', look: 'Long blonde hair.' }),
      {
        references: [
          { url: '/face.png', shows: 'her face' },
          { url: '/plate.png', shows: 'her face, hair and build, not her clothes' },
        ],
        look: 'Long blonde hair. Her clothes are exactly as in <Picture 1>.',
      }
    );
    assert.equal(castReferencesForExtend({ body: '/plate.png' }).references?.length, 1);
    assert.deepEqual(castReferencesForExtend({ body: '/plate.png' }, 'man'), {
      references: [{ url: '/plate.png', shows: 'his face, hair and build, not his clothes' }],
      look: 'His clothes are exactly as in <Picture 1>.',
    });
    // The take's dressed plate shows the clothes too, in the look plate's place.
    assert.deepEqual(
      castReferencesForExtend({ face: '/face.png', body: '/plate.png', outfit: '/dressed.png' }),
      {
        references: [
          { url: '/face.png', shows: 'her face' },
          { url: '/dressed.png', shows: 'her face, hair, build and the clothes she is wearing' },
        ],
        look: 'Her clothes are exactly as in <Picture 3>: the same garment, colour and shoes.',
      }
    );
    assert.equal(
      castReferencesForExtend({ outfit: '/dressed.png' }).look,
      'Her clothes are exactly as in <Picture 2>: the same garment, colour and shoes.'
    );
  });

  it('renumbers the look when a reference is missing', () => {
    const look = 'Her clothes are exactly as in <Picture 3>.';
    assert.equal(renumberH3Pictures(look, [0, 1]), look);
    assert.equal(renumberH3Pictures(look, [1]), 'Her clothes are exactly as in <Picture 2>.');
    assert.equal(renumberH3Pictures(look, [0]), 'Her clothes are exactly as in <Picture 1>.');
    assert.equal(renumberH3Pictures(undefined, []), undefined);
  });

  it('says which parts may not look like her', () => {
    assert.equal(extendFacesNote([0.62, null, 0.55]), '');
    assert.equal(extendFacesNote(undefined), '');
    assert.match(extendFacesNote([0.62, 0.31]), /^Part 3 of the longer clip/);
    assert.match(extendFacesNote([0.2, 0.62, 0.31]), /^Parts 2 and 4 /);
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

  // M11 T1: a part does its own beat; the first clip's action stays in the first clip, and every
  // other line of its prompt is kept word for word.
  it('a part swaps in its own action and keeps the rest of the clip’s prompt', () => {
    const first =
      '4s clip, one continuous shot that starts on the first frame. Action: She stands up from the couch. Motion: she continues this moment. The place, light and clothes stay exactly as in the first frame. hyperrealistic photography.';
    const part = withPartAction(first, 'She walks to the window and looks out.')!;
    assert.doesNotMatch(part, /stands up/);
    assert.match(part, /Action: She walks to the window and looks out\. Motion:/);
    assert.match(part, /clothes stay exactly as in the first frame\. hyperrealistic photography\.$/);
    const intimate = 'Scene: on the couch at golden hour. Both are adults. Motion: slow.';
    assert.equal(
      withPartAction(intimate, 'they slow down'),
      'Scene: they slow down. Both are adults. Motion: slow.'
    );
    assert.equal(withPartAction('A plain prompt.', 'x'), null);
    // H3: the swapped prompt is what the part says, its framing held, no prop nouns.
    const h3 = h3PartPrompt(
      `${part} Camera: one fixed wide shot on a tripod for the whole clip. studio-grade lighting.`,
      { beat: 'She walks to the window and looks out.', place: 'living room' }
    );
    assert.doesNotMatch(h3, /stands up/);
    assert.match(h3, /hyperrealistic photography/);
    assert.match(h3, /The framing stays as in the first frame from start to end/);
    assert.doesNotMatch(h3, /tripod|studio-grade/);
    // WAN: the swap in the graph's text; a prompt without an action gets the beat in front.
    const wan = (text: string) => ({
      '1': { class_type: 'LoadImage', inputs: { image: 'still.png' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text } },
      '4': { class_type: 'WanImageToVideo', inputs: { start_image: ['1', 0], positive: ['2', 0] } },
      '6': { class_type: 'SaveAnimatedWEBP', inputs: { filename_prefix: 'x' } },
    });
    const swapped = patchWanReplayGraph(wan(first), { lastFrame: 'l.png', beat: 'She sits down.', seed: 1, prefix: 'p' })!;
    assert.match(String(swapped.graph['2']!.inputs!.text), /^4s clip.*Action: She sits down\. Motion:/);
    const front = patchWanReplayGraph(wan('locked camera'), { lastFrame: 'l.png', beat: 'She sits down.', seed: 1, prefix: 'p' })!;
    assert.equal(front.graph['2']!.inputs!.text, 'She sits down. locked camera');
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

describe('long H3 parts (M11 T13)', () => {
  it('groups wordless blocks into parts of up to 15 s', () => {
    const groups = groupH3Blocks(['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(
      groups.map(group => group.blocks.map(block => block.beat)),
      [['a', 'b', 'c'], ['d', 'e']]
    );
    assert.deepEqual(groups.map(group => group.seconds), [15, 10]);
    // A block asked shorter keeps its length (at most a block's).
    const short = groupH3Blocks(['a', 'b', 'c', 'd'], [3, 0, 2, 9]);
    assert.deepEqual(short.map(group => group.seconds), [15]);
    assert.deepEqual(short[0]!.blocks.map(block => block.seconds), [3, 5, 2, 5]);
  });
});

describe('what the shot holds stays in hand (live: a phone came and went)', () => {
  it('reads what the vision model says is held', () => {
    assert.deepEqual(
      parseShotInventory('<think>hmm</think>```json\n{"held":["a phone in her left hand."]}\n```'),
      { held: ['a phone in her left hand'] }
    );
    assert.deepEqual(parseShotInventory('{"shows":"a woman on a balcony.","held":[]}'), {
      held: [],
      shows: 'a woman on a balcony.',
    });
    assert.deepEqual(parseShotInventory('{"held":["nothing"]}'), { held: [] });
    assert.deepEqual(parseShotInventory('no idea'), { held: [] });
  });

  it('tells the beats to keep it, add nothing, and never says "steps"', () => {
    const [system] = buildExtendBeatsMessages({
      scene: 'She stands on a balcony at night.',
      count: 5,
      held: ['a phone in her left hand'],
    });
    assert.match(system!.content, /they hold a phone in her left hand: it stays in that hand in every beat/);
    assert.match(system!.content, /no smoke, breath, mist/);
    assert.doesNotMatch(system!.content, /\bsteps\b/i);
    const [, user] = buildExtendBeatsMessages({
      scene: 'climbing the stairs',
      count: 2,
      shows: 'A woman on a flat balcony.',
    });
    assert.match(user!.content, /actually shows: A woman on a flat balcony\. Where .* follow the picture/);
    const [bare] = buildExtendBeatsMessages({ scene: 'x', count: 2 });
    assert.doesNotMatch(bare!.content, /they hold/);
  });
});

describe('the voice a talking clip is anchored on (M11 T16)', () => {
  it('finds where the clip speaks most', () => {
    const rate = 1000;
    const samples = new Int16Array(5 * rate);
    for (let i = 2 * rate; i < 3.6 * rate; i += 1) samples[i] = i % 2 ? 8000 : -8000;
    const found = loudestWindow(samples, rate, 1.6);
    assert.ok(Math.abs(found.start - 2) < 0.15, `start ${found.start}`);
    assert.ok(found.db > -15 && found.db < -11, `db ${found.db}`);
    assert.equal(loudestWindow(new Int16Array(rate), rate, 1.6).db < -100, true);
  });
});
