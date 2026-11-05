import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildClipTrackGraph,
  buildClipVaceGraph,
  CLIP_STYLES,
  CLIP_TRACK_MODEL,
  CLIP_VACE_MODELS,
  cleanClipLook,
  normalizeClipStyle,
} from './vace';

type Node = { class_type: string; inputs: Record<string, unknown> };
const ofType = (graph: Record<string, unknown>, type: string) =>
  Object.values(graph as Record<string, Node>).filter(node => node.class_type === type);

const base = { video: 'chunk.mp4', width: 720, height: 960, fps: 24, frames: 81, seed: 3, prefix: 'x' };

describe('Restyle and Remove on VACE', () => {
  it('restyles from the clip’s depth, in the look’s words, on both experts', () => {
    const graph = buildClipVaceGraph({ ...base, mode: { kind: 'restyle', style: 'noir' } });
    const vace = ofType(graph, 'WanVaceToVideo')[0]!;
    assert.deepEqual(vace.inputs.control_video, ['30', 0]);
    assert.equal(vace.inputs.control_masks, undefined);
    assert.equal(vace.inputs.length, 81);
    assert.equal((graph['28'] as Node).class_type, 'DepthAnythingV2Preprocessor');
    // The depth smoothed (its steps came out as contour lines on skin).
    assert.equal((graph['30'] as Node).class_type, 'ImageBlur');
    assert.equal(vace.inputs.reference_image, undefined);
    // A later chunk: the chunk before's restyled frame as the reference.
    const later = buildClipVaceGraph({
      ...base,
      mode: { kind: 'restyle', style: 'noir' },
      reference: 'ref.png',
    });
    assert.deepEqual(ofType(later, 'WanVaceToVideo')[0]!.inputs.reference_image, ['27', 0]);
    const texts = ofType(graph, 'CLIPTextEncode').map(node => node.inputs.text as string);
    assert.match(texts[0]!, /Black-and-white film noir/);
    assert.match(texts[1]!, /colour/);
    const units = ofType(graph, 'UNETLoader').map(node => node.inputs.unet_name);
    assert.deepEqual(units, [CLIP_VACE_MODELS.high, CLIP_VACE_MODELS.low]);
    const [high, low] = ofType(graph, 'KSamplerAdvanced');
    assert.equal(high!.inputs.end_at_step, 2);
    assert.equal(low!.inputs.start_at_step, 2);
    assert.deepEqual(low!.inputs.latent_image, ['41', 0]);
    // VACE's reference frames are trimmed off before the decode.
    assert.deepEqual(ofType(graph, 'TrimVideoLatent')[0]!.inputs.trim_amount, ['38', 3]);
  });

  it('removes a painted area: the frames greyed there, the area as the mask, on every frame', () => {
    const graph = buildClipVaceGraph({ ...base, mode: { kind: 'remove', mask: 'mask.png' } });
    const vace = ofType(graph, 'WanVaceToVideo')[0]!;
    assert.deepEqual(vace.inputs.control_video, ['37', 0]);
    assert.deepEqual(vace.inputs.control_masks, ['35', 0]);
    assert.equal(ofType(graph, 'RepeatImageBatch')[0]!.inputs.amount, 81);
    assert.equal(ofType(graph, 'EmptyImage')[0]!.inputs.color, 0x7f7f7f);
    assert.equal(ofType(graph, 'LoadImage')[0]!.inputs.image, 'mask.png');
    assert.equal(ofType(graph, 'DepthAnythingV2Preprocessor').length, 0);
  });

  it('knows its looks', () => {
    assert.equal(normalizeClipStyle('anime'), 'anime');
    assert.equal(normalizeClipStyle('toString'), null);
    assert.equal(normalizeClipStyle(undefined), null);
    assert.equal(Object.keys(CLIP_STYLES).length, 6);
  });

  it('restyles in your own words, and replaces with yours', () => {
    const own = buildClipVaceGraph({ ...base, mode: { kind: 'restyle', look: ' 1980s VHS. ' } });
    const ownText = ofType(own, 'CLIPTextEncode')[0]!.inputs.text as string;
    assert.match(ownText, /redrawn in this look: 1980s VHS\./);
    const replace = buildClipVaceGraph({
      ...base,
      mode: { kind: 'remove', mask: 'mask.png', words: 'a vase of flowers' },
    });
    const text = ofType(replace, 'CLIPTextEncode')[0]!.inputs.text as string;
    assert.match(text, /^In the masked area: a vase of flowers/);
    assert.equal(cleanClipLook('  oil   painting.. '), 'oil painting');
  });

  it("follows a tracked mask: this chunk's mask video in place of one picture", () => {
    const graph = buildClipVaceGraph({
      ...base,
      mode: { kind: 'remove', mask: 'mask-0.mp4', maskIsVideo: true },
    });
    assert.equal(ofType(graph, 'RepeatImageBatch').length, 0);
    assert.equal(ofType(graph, 'LoadVideo').length, 2);
    assert.deepEqual(ofType(graph, 'WanVaceToVideo')[0]!.inputs.control_masks, ['35', 0]);
  });

  it('tracks what was painted through the clip with SAM 3', () => {
    const graph = buildClipTrackGraph({
      video: 'clip.mp4',
      mask: 'paint.png',
      width: 720,
      height: 960,
      fps: 24,
      prefix: 'x',
    });
    assert.equal(ofType(graph, 'CheckpointLoaderSimple')[0]!.inputs.ckpt_name, CLIP_TRACK_MODEL);
    const track = ofType(graph, 'SAM3_VideoTrack')[0]!;
    assert.equal(track.inputs.max_objects, 1);
    assert.deepEqual(track.inputs.initial_mask, ['5', 0]);
    assert.equal(ofType(graph, 'SaveVideo').length, 1);
  });

  it('runs on the low-noise expert alone when asked (one model in memory)', () => {
    const graph = buildClipVaceGraph({
      ...base,
      mode: { kind: 'restyle', style: 'anime' },
      lowOnly: true,
    });
    assert.deepEqual(
      ofType(graph, 'UNETLoader').map(node => node.inputs.unet_name),
      [CLIP_VACE_MODELS.low]
    );
    const [first, second] = ofType(graph, 'KSamplerAdvanced');
    assert.deepEqual(first!.inputs.model, ['22', 0]);
    assert.deepEqual(second!.inputs.model, ['22', 0]);
  });

  it('keeps noir free of colour words, and names the look for the whole frame', () => {
    const noir = buildClipVaceGraph({
      ...base,
      mode: { kind: 'restyle', style: 'noir' },
      scene: 'a woman in a red dress',
    });
    const text = ofType(noir, 'CLIPTextEncode')[0]!.inputs.text as string;
    assert.doesNotMatch(text, /red dress/);
    assert.match(text, /The whole frame — people, clothes and place — is a black-and-white film still/);
    const anime = buildClipVaceGraph({
      ...base,
      mode: { kind: 'restyle', style: 'anime' },
      scene: 'a woman in a red dress',
    });
    assert.match(ofType(anime, 'CLIPTextEncode')[0]!.inputs.text as string, /red dress/);
    assert.equal(CLIP_STYLES.anime.approximate, undefined);
    assert.equal(CLIP_STYLES.watercolour.approximate, true);
  });
});
