import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMotionBrushGraph,
  cleanMotionStrokes,
  MOTION_BRUSH_FRAMES,
  MOTION_BRUSH_MODELS,
  motionBrushSize,
  motionTracks,
} from './motion-brush';

type Node = { class_type: string; inputs: Record<string, unknown> };
const ofType = (graph: Record<string, unknown>, type: string) =>
  Object.values(graph as Record<string, Node>).filter(node => node.class_type === type);

describe('Motion brush', () => {
  it('walks a drawn path at an even pace, start to end, and holds a pin', () => {
    const [path, pin] = motionTracks(
      [
        [
          { x: 0, y: 0.5 },
          { x: 0.5, y: 0.5 },
          { x: 1, y: 0.5 },
        ],
        [{ x: 0.25, y: 0.25 }],
      ],
      5,
      100,
      100
    );
    assert.deepEqual(
      path!.map(point => point.x),
      [0, 25, 50, 75, 100]
    );
    assert.ok(path!.every(point => point.y === 50));
    assert.ok(pin!.every(point => point.x === 25 && point.y === 25));
  });

  it('takes strokes from a request, clamped to the picture', () => {
    const strokes = cleanMotionStrokes([[{ x: -1, y: 2 }, { x: 'a' }], 'junk', []]);
    assert.deepEqual(strokes, [[{ x: 0, y: 1 }]]);
    assert.deepEqual(cleanMotionStrokes(null), []);
  });

  it('sizes the still to WAN 2.1 480p, its shape kept', () => {
    const portrait = motionBrushSize(768, 1024);
    assert.equal(portrait.width % 16, 0);
    assert.ok(portrait.height > portrait.width);
    assert.ok(Math.abs(portrait.width * portrait.height - 832 * 480) < 30_000);
  });

  it('builds WAN-Move with the tracks, the still and 4 LightX2V steps', () => {
    const tracks = motionTracks([[{ x: 0.5, y: 0.5 }]], MOTION_BRUSH_FRAMES, 480, 832);
    const graph = buildMotionBrushGraph({
      image: 'still.png',
      width: 480,
      height: 832,
      tracks,
      prompt: 'she waves',
      seed: 1,
      prefix: 'x',
    });
    const coords = JSON.parse(ofType(graph, 'WanMoveTracksFromCoords')[0]!.inputs.track_coords as string);
    assert.equal(coords[0].length, MOTION_BRUSH_FRAMES);
    const move = ofType(graph, 'WanMoveTrackToVideo')[0]!;
    assert.deepEqual(move.inputs.start_image, ['1', 0]);
    assert.equal(move.inputs.length, MOTION_BRUSH_FRAMES);
    assert.equal(ofType(graph, 'UNETLoader')[0]!.inputs.unet_name, MOTION_BRUSH_MODELS.unet);
    assert.equal(ofType(graph, 'KSampler')[0]!.inputs.steps, 4);
    assert.match(ofType(graph, 'CLIPTextEncode')[0]!.inputs.text as string, /^she waves\./);
  });
});
