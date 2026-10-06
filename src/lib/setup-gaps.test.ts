import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPlayChecksReadiness, insightFaceInstallCommand } from './play-checks-readiness';
import { installedCheckPacks } from './play-checks-readiness-server';
import { describePrepareResult } from './play-checks-prepare-server';
import {
  parseVisionDownloadState,
  startVisionModelDownload,
  VISION_MODEL_CHOICES,
} from './vision-model-download-server';

const noFace = { models: false, distance: false, previewAny: true };
const ffmpeg = { available: true, drawtext: true, font: true };

describe('setup gaps: packs that are installed but do not load', () => {
  it('ComfyUI_FaceAnalysis without InsightFace gets the pip command, not "install the pack"', () => {
    const r = buildPlayChecksReadiness({
      comfyReachable: true,
      poseNode: 'DWPreprocessor',
      faceNodes: noFace,
      ffmpeg,
      installedPacks: { faceAnalysis: true, controlnetAux: true },
      system: { os: 'posix', embeddedPython: false },
    });
    assert.equal(r.face.ready, false);
    assert.match(r.face.detail, /installed but does not load.*InsightFace/);
    assert.equal(r.face.install, undefined);
    assert.equal(r.face.command, 'python -m pip install insightface onnxruntime');
    assert.match(r.face.note ?? '', /build-essential/);
  });

  it('not installed at all still offers the Manager install', () => {
    const r = buildPlayChecksReadiness({
      comfyReachable: true,
      poseNode: null,
      faceNodes: noFace,
      ffmpeg,
      installedPacks: { faceAnalysis: false, controlnetAux: false },
    });
    assert.equal(r.face.install?.name, 'ComfyUI_FaceAnalysis');
    assert.equal(r.pose.install?.name, 'comfyui_controlnet_aux');
  });

  it('controlnet_aux installed without DWPose nodes points at the ComfyUI log', () => {
    const r = buildPlayChecksReadiness({
      comfyReachable: true,
      poseNode: null,
      faceNodes: { models: true, distance: true, previewAny: true },
      ffmpeg,
      installedPacks: { faceAnalysis: true, controlnetAux: true },
    });
    assert.match(r.pose.detail, /installed but its nodes did not load/);
    assert.equal(r.pose.install, undefined);
  });

  it('names the right Python: portable Windows, a Windows venv, Linux', () => {
    assert.match(
      insightFaceInstallCommand({ os: 'nt', embeddedPython: true }).command,
      /^python_embeded\\python\.exe -m pip install insightface/
    );
    assert.match(insightFaceInstallCommand({ os: 'nt' }).note, /Visual C\+\+ Build Tools/);
    assert.match(insightFaceInstallCommand(null).note, /venv\/bin\/python/);
  });

  it("reads ComfyUI-Manager's installed list, skipping disabled packs", () => {
    assert.deepEqual(
      installedCheckPacks({
        comfyui_faceanalysis: { ver: '1.0.0', cnr_id: 'comfyui_faceanalysis', enabled: true },
        'some-fork': { cnr_id: '', aux_id: 'someone/comfyui_controlnet_aux', enabled: false },
      }),
      { faceAnalysis: true, controlnetAux: false }
    );
    assert.equal(installedCheckPacks(null), null);
    assert.equal(installedCheckPacks([]), null);
  });
});

describe('setup gaps: vision model in LM Studio', () => {
  it('offers the download only when the LLM server is LM Studio', () => {
    const base = { comfyReachable: true, poseNode: 'DWPreprocessor', faceNodes: noFace, ffmpeg };
    const lm = buildPlayChecksReadiness({ ...base, vision: { llmEnabled: true, lmStudio: true } });
    assert.equal(lm.review?.offerVisionDownload, true);
    const ollama = buildPlayChecksReadiness({ ...base, vision: { llmEnabled: true } });
    assert.equal(ollama.review?.offerVisionDownload, undefined);
    assert.match(ollama.review?.detail ?? '', /pull one/);
  });

  it('parses LM Studio download replies (job, progress, already downloaded)', () => {
    assert.deepEqual(
      parseVisionDownloadState({
        job_id: 'job_493c7c9ded',
        status: 'downloading',
        total_size_bytes: 100,
        downloaded_bytes: 25,
        bytes_per_second: 5,
      }),
      { jobId: 'job_493c7c9ded', status: 'downloading', downloadedBytes: 25, totalBytes: 100, bytesPerSecond: 5 }
    );
    assert.deepEqual(parseVisionDownloadState({ status: 'already_downloaded' }), {
      jobId: null,
      status: 'already_downloaded',
    });
    assert.equal(parseVisionDownloadState({ status: 'weird' }).status, 'unknown');
  });

  it('asks LM Studio for the curated model at Q4_K_M, and only curated ones', async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/api/v1/models')) return Response.json({ models: [] });
      return Response.json({ job_id: 'job_1', status: 'downloading', total_size_bytes: 6 });
    }) as never;
    const state = await startVisionModelDownload(VISION_MODEL_CHOICES[0]!.id, fetchImpl);
    assert.equal(state.jobId, 'job_1');
    assert.deepEqual(calls.at(-1)?.body, {
      model: 'https://huggingface.co/GitMylo/nsfwvision-qwen3-vl-8b-v3-gguf',
      quantization: 'Q4_K_M',
    });
    await assert.rejects(startVisionModelDownload('anything-else', fetchImpl), /Unknown vision model/);
  });

  it('says plainly when the LLM server is not LM Studio', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 404 })) as never;
    await assert.rejects(
      startVisionModelDownload(VISION_MODEL_CHOICES[0]!.id, fetchImpl),
      /not LM Studio/
    );
  });
});

describe('setup gaps: prepare checks', () => {
  it('one line per check, with the time it took', () => {
    assert.equal(
      describePrepareResult({
        face: { ready: true, detail: 'found the face on the sample', seconds: 0.9 },
        pose: { ready: false, detail: 'DWPose not installed in ComfyUI', seconds: 0.1 },
      }),
      'Face check ready (0.9 s) · Pose check: DWPose not installed in ComfyUI (0.1 s).'
    );
  });
});
