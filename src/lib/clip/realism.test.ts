import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildClipRealismGraph,
  CLIP_REALISM_DENOISE,
  CLIP_REALISM_MIN_OVERLAP,
  CLIP_REALISM_MODELS,
  CLIP_REALISM_SAVE_NODE,
  CLIP_REALISM_WINDOW,
  clipRealismChunks,
  clipRealismJoinFilter,
  clipRealismSize,
  normalizeClipRealismStrength,
  wanFrameCount,
} from './realism';
import { readFrameCount } from './realism-server';

describe('clip realism', () => {
  it('pads frame counts to what WAN takes (4k + 1)', () => {
    assert.equal(wanFrameCount(81), 81);
    assert.equal(wanFrameCount(80), 81);
    assert.equal(wanFrameCount(82), 85);
    assert.equal(wanFrameCount(2), 5);
  });

  it('renders a short clip in one padded chunk', () => {
    assert.deepEqual(clipRealismChunks(50), [{ start: 0, frames: 50, rendered: 53 }]);
    assert.deepEqual(clipRealismChunks(81), [{ start: 0, frames: 81, rendered: 81 }]);
    assert.deepEqual(clipRealismChunks(1), []);
  });

  it('covers a long clip with window-long chunks that overlap enough to crossfade', () => {
    for (const total of [82, 125, 243, 721]) {
      const chunks = clipRealismChunks(total);
      assert.ok(chunks.length > 1);
      assert.equal(chunks[0]!.start, 0);
      const last = chunks.at(-1)!;
      assert.equal(last.start + last.frames, total, `${total}: ends on the last frame`);
      for (const chunk of chunks) assert.equal(chunk.frames, CLIP_REALISM_WINDOW);
      for (let i = 1; i < chunks.length; i++) {
        const shared = chunks[i - 1]!.start + CLIP_REALISM_WINDOW - chunks[i]!.start;
        assert.ok(shared >= CLIP_REALISM_MIN_OVERLAP, `${total}: chunk ${i} shares ${shared}`);
      }
    }
    // The 10 s, 24 fps clip from the report: four chunks.
    assert.deepEqual(
      clipRealismChunks(243).map(chunk => chunk.start),
      [0, 54, 108, 162]
    );
  });

  it('keeps a clip its own size up to 720p area, sides multiples of 16', () => {
    assert.deepEqual(clipRealismSize(768, 1024), { width: 768, height: 1024 });
    const big = clipRealismSize(1080, 1920);
    assert.ok(big.width * big.height <= 1280 * 736);
    assert.equal(big.width % 16, 0);
    assert.equal(big.height % 16, 0);
  });

  it('defaults an unknown strength to medium', () => {
    assert.equal(normalizeClipRealismStrength('strong'), 'strong');
    assert.equal(normalizeClipRealismStrength('nope'), 'medium');
    assert.ok(CLIP_REALISM_DENOISE.light < CLIP_REALISM_DENOISE.strong);
  });

  it('builds a low-noise WAN re-render of the chunk at the given strength', () => {
    const graph = buildClipRealismGraph({
      video: 'castcut-realism-0.mp4',
      width: 768,
      height: 1024,
      fps: 24,
      denoise: 0.3,
      seed: 7,
      prefix: 'Castcut-realism-part',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    assert.equal(graph['10']!.inputs.unet_name, CLIP_REALISM_MODELS.unet);
    assert.equal(graph['11']!.inputs.lora_name, CLIP_REALISM_MODELS.lora);
    assert.equal(graph['18']!.class_type, 'KSampler');
    assert.equal(graph['18']!.inputs.denoise, 0.3);
    assert.equal(graph['18']!.inputs.seed, 7);
    assert.equal(graph['39']!.inputs.fps, 24);
    assert.equal(graph[CLIP_REALISM_SAVE_NODE]!.class_type, 'SaveVideo');
    // Every node link points at a node in the graph.
    for (const node of Object.values(graph)) {
      for (const value of Object.values(node.inputs)) {
        if (Array.isArray(value)) assert.ok(graph[String(value[0])], `missing ${value[0]}`);
      }
    }
  });

  it('crossfades chunks over the frames they share', () => {
    const filter = clipRealismJoinFilter(clipRealismChunks(243), 24);
    assert.match(filter, /\[0:v\]trim=end_frame=81/);
    assert.match(filter, /xfade=transition=fade:duration=1\.1250:offset=2\.2500/);
    assert.match(filter, /\[out\]$/);
    assert.equal(clipRealismJoinFilter(clipRealismChunks(50), 24).endsWith('[v0]null[out]'), true);
  });

  it('reads the frame count from ffmpeg progress', () => {
    assert.equal(readFrameCount('frame=  120 fps=0\rframe=  243 fps=200 q=-0.0'), 243);
    assert.equal(readFrameCount('no frames'), null);
  });
});
