import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { lookupKnownComfyNodePack } from './comfyui-custom-node-registry';
import {
  PLAY_CHECK_HEAL_NODE_TYPES,
  PLAY_CHECK_INSTALL_NODE_TYPES,
} from './comfyui-manager-install-client';
import { sameServiceAddress } from './service-address';
import { allowedComfyCandidates, discoverComfyUi, discoverLlm } from './service-discovery';
import { autoVramThresholdGb, isVramTightForMax } from './vram-queue-guard';

const GB = 1e9;

describe('Play-check packs install through Heal and the readiness rows', () => {
  it('seeds DWPose and FaceAnalysis, and each maps to its ComfyUI-Manager pack', () => {
    assert.deepEqual([...PLAY_CHECK_HEAL_NODE_TYPES].sort(), [
      'DWPreprocessor',
      'FaceAnalysisModels',
      'FaceEmbedDistance',
    ]);
    assert.equal(lookupKnownComfyNodePack('DWPreprocessor')?.name, 'comfyui_controlnet_aux');
    for (const type of PLAY_CHECK_INSTALL_NODE_TYPES.face) {
      assert.match(lookupKnownComfyNodePack(type)?.files?.[0] ?? '', /ComfyUI_FaceAnalysis/);
    }
  });
});

describe('VRAM guard sized from the GPU', () => {
  it('takes about 30% of the card, in half-GB steps, kept to 4–12 GB', () => {
    assert.equal(autoVramThresholdGb(24 * GB), 7);
    assert.equal(autoVramThresholdGb(16 * GB), 5);
    assert.equal(autoVramThresholdGb(8 * GB), 4);
    assert.equal(autoVramThresholdGb(48 * GB), 12);
    assert.equal(autoVramThresholdGb(undefined), null);
    assert.equal(autoVramThresholdGb(0), null);
  });

  it('uses the auto value when on and the card is known, else the typed number', () => {
    const vram = { free: 6.5 * GB, total: 24 * GB };
    const base = { enabled: true, freeBytesThreshold: 6 * GB };
    assert.equal(isVramTightForMax(vram, { ...base, auto: true }), true, '6.5 < auto 7');
    assert.equal(isVramTightForMax(vram, { ...base, auto: false }), false, '6.5 ≥ typed 6');
    assert.equal(
      isVramTightForMax({ free: 5 * GB }, { ...base, auto: true }),
      true,
      'no total: typed number'
    );
    assert.equal(isVramTightForMax(vram, { ...base, enabled: false, auto: true }), false);
  });
});

describe('finding ComfyUI and the LLM', () => {
  const realFetch = globalThis.fetch;
  const savedAllow = process.env.COMFYUI_ALLOWED_HOSTS;
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (savedAllow === undefined) delete process.env.COMFYUI_ALLOWED_HOSTS;
    else process.env.COMFYUI_ALLOWED_HOSTS = savedAllow;
  });

  it('matches addresses loosely (localhost, trailing slash, /v1)', () => {
    assert.ok(sameServiceAddress('http://localhost:8188/', 'http://127.0.0.1:8188'));
    assert.ok(sameServiceAddress('http://127.0.0.1:11434/v1', 'http://localhost:11434'));
    assert.ok(!sameServiceAddress('http://127.0.0.1:8188', 'http://127.0.0.1:8000'));
    assert.ok(!sameServiceAddress('', ''));
  });

  it('never tries a ComfyUI host the allowlist blocks', () => {
    process.env.COMFYUI_ALLOWED_HOSTS = '127.0.0.1';
    const urls = allowedComfyCandidates().map(candidate => candidate.url);
    assert.ok(urls.some(url => url.includes('127.0.0.1:8188')));
    assert.ok(!urls.some(url => url.includes('host.docker.internal')));
  });

  it('reports the ComfyUI and LLM servers that answer', async () => {
    delete process.env.COMFYUI_ALLOWED_HOSTS;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('http://127.0.0.1:8000/system_stats')) {
        return new Response(
          JSON.stringify({ devices: [{ name: 'RTX 4090', vram_total: 24e9, vram_free: 20e9 }] }),
          { status: 200 }
        );
      }
      if (url.startsWith('http://127.0.0.1:11434/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }), { status: 200 });
      }
      throw new Error('connection refused');
    }) as typeof fetch;
    const comfy = await discoverComfyUi();
    assert.deepEqual(
      comfy.map(found => found.url.replace(/\/$/, '')),
      ['http://127.0.0.1:8000']
    );
    assert.match(comfy[0]!.label, /Desktop/);
    const llm = await discoverLlm();
    assert.deepEqual(llm, [{ baseUrl: 'http://127.0.0.1:11434/v1', label: 'Ollama', models: 2 }]);
  });
});
