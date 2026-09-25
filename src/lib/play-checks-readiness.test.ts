import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { buildPlayChecksReadiness, summarizePlayChecks } from './play-checks-readiness';
import { resolveComfyNode } from './comfy-utility-graph-server';

const allFace = { models: true, distance: true, previewAny: true };
const goodFfmpeg = { available: true, drawtext: true, font: true };

describe('Play checks readiness', () => {
  it('reports everything ready on a full setup', () => {
    const r = buildPlayChecksReadiness({
      comfyReachable: true,
      poseNode: 'DWPreprocessor',
      faceNodes: allFace,
      ffmpeg: goodFfmpeg,
    });
    assert.equal(r.pose.ready && r.face.ready && r.cutTitles.ready, true);
    assert.equal(summarizePlayChecks(r), 'Pose and face checks ready.');
  });

  it('names the pack to install for each missing check', () => {
    const r = buildPlayChecksReadiness({
      comfyReachable: true,
      poseNode: null,
      faceNodes: { models: false, distance: true, previewAny: true },
      ffmpeg: { available: true, drawtext: false, font: false },
    });
    assert.equal(r.pose.install?.name, 'comfyui_controlnet_aux');
    assert.equal(r.face.install?.name, 'ComfyUI_FaceAnalysis');
    assert.match(r.face.detail, /missing FaceAnalysisModels/);
    assert.match(r.cutTitles.detail, /lacks drawtext/);
    assert.match(
      summarizePlayChecks(r)!,
      /off: pose \(comfyui_controlnet_aux\), face \(ComfyUI_FaceAnalysis\)/
    );
  });

  it('says ComfyUI is unreachable instead of blaming node packs', () => {
    const r = buildPlayChecksReadiness({
      comfyReachable: false,
      poseNode: null,
      faceNodes: { models: false, distance: false, previewAny: false },
      ffmpeg: goodFfmpeg,
    });
    assert.equal(r.pose.install, undefined);
    assert.equal(summarizePlayChecks(r), 'Pose / face checks: ComfyUI unreachable.');
    assert.equal(summarizePlayChecks(null), null);
  });

  it('flags an old ComfyUI without PreviewAny', () => {
    const r = buildPlayChecksReadiness({
      comfyReachable: true,
      poseNode: 'DWPreprocessor',
      faceNodes: { models: true, distance: true, previewAny: false },
      ffmpeg: goodFfmpeg,
    });
    assert.equal(r.face.ready, false);
    assert.match(r.face.detail, /PreviewAny/);
  });
});

describe('resolveComfyNode fresh probe', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('re-probes past a cached "not installed" when asked for a fresh check', async () => {
    let installed = false;
    globalThis.fetch = (async () =>
      installed
        ? new Response(JSON.stringify({ TestNodeX: { input: { required: {} } } }))
        : new Response('{}')) as typeof fetch;
    const base = 'http://comfy.test';
    assert.equal(await resolveComfyNode(base, ['TestNodeX']), null);
    installed = true;
    // Cached miss without fresh…
    assert.equal(await resolveComfyNode(base, ['TestNodeX']), null);
    // …found with fresh, and the cache is updated for later checks.
    assert.equal((await resolveComfyNode(base, ['TestNodeX'], { fresh: true }))?.node, 'TestNodeX');
    assert.equal((await resolveComfyNode(base, ['TestNodeX']))?.node, 'TestNodeX');
  });
});
