import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLtx25DubGraph, dubPrompt, LTX25_DUB_SAVE_NODE, ltx25DubFrames } from './ltx25-renderer';
import { dubEncodeSize } from './clip-dub-server';

describe('Add voice (dub a silent clip)', () => {
  it('cuts to an LTX frame count (8k+1) without padding', () => {
    assert.equal(ltx25DubFrames(91), 89);
    assert.equal(ltx25DubFrames(89), 89);
    assert.equal(ltx25DubFrames(97), 97);
    assert.equal(ltx25DubFrames(3), 9);
  });

  it('freezes the clip and denoises only the audio; the output keeps the clip frames', () => {
    const graph = buildLtx25DubGraph({ video: 'clip.mp4', prompt: 'p', frames: 89, width: 416, height: 544, seed: 1, prefix: 'x' });
    const freeze = Object.entries(graph).find(([, node]) => node.class_type === 'LTXVFreezeLatent')!;
    assert.deepEqual(freeze[1].inputs!.latent, ['13', 0]);
    assert.equal(graph['13']!.class_type, 'VAEEncode');
    assert.deepEqual(graph['16']!.inputs!.video_latent, [freeze[0], 0]);
    // The saved video is the loaded frames (not a decode of the frozen latent) plus new audio.
    assert.deepEqual(graph['24']!.inputs!.images, ['11', 0]);
    assert.deepEqual(graph['24']!.inputs!.audio, ['23', 0]);
    assert.equal(graph[LTX25_DUB_SAVE_NODE]!.class_type, 'SaveVideo');
    assert.equal(graph['15']!.inputs!.frames_number, 89);
  });

  it('says the line the way the heat calls for, or just breathes', () => {
    assert.match(dubPrompt({ scene: 'She straddles him on the bed.', line: "Don't stop.", heat: 'explicit' }), /^She straddles him on the bed\. She moans softly and whispers breathlessly, "Don't stop\." Close, intimate sounds/);
    assert.match(dubPrompt({ scene: 'They dance', line: 'Hi', heat: 'clean', lead: 'man' }), /He says clearly, "Hi"/);
    assert.match(dubPrompt({ scene: 'x', heat: 'sensual' }), /breathes heavily and moans softly/);
  });

  it('encodes at a small size on the 32 grid, keeping the aspect', () => {
    assert.deepEqual(dubEncodeSize(672, 880), { width: 416, height: 544 });
    assert.deepEqual(dubEncodeSize(1280, 720), { width: 544, height: 320 });
  });
});

describe('implied nudity names its own cover', async () => {
  const { impliedNudityCoverageLine, IMPLIED_NUDITY_COVERAGE_LINE } = await import('./clothed-coverage');
  it('a shirt beat is covered by the shirt, hands empty (the generic line drew a towel)', () => {
    const shirt = impliedNudityCoverageLine('standing at a sunlit window in only an oversized white shirt, half-buttoned');
    assert.match(shirt, /the shirt itself covers her chest and her hands hold nothing/);
    assert.doesNotMatch(shirt, /towel|sheet/);
    assert.match(impliedNudityCoverageLine('wrapped in the sheet'), /the sheet covers her chest/);
    assert.match(impliedNudityCoverageLine('in a towel after a bath'), /the towel covers her chest/);
    assert.equal(impliedNudityCoverageLine('bare back on the bed'), IMPLIED_NUDITY_COVERAGE_LINE);
  });
});
